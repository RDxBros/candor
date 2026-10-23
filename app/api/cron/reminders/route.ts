import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { getCurrentDay } from "../../../../lib/content-day";
import { insertAnalyticsEvent } from "../../../../lib/analytics-server";
import { isSupabaseConfigured, supabaseRequest } from "../../../../lib/supabase-server";
import {
  constantTimeSecretMatches, deliverReminderPush, easternClock, isReminderSendWindow,
  mapWithConcurrency, REMINDER_CONCURRENCY, REMINDER_TIME_BUDGET_MS,
  REMINDER_TTL_SECONDS, validAnonymousId
} from "../../../../lib/push-reminders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type SubscriptionRow = {
  id: string;
  anonymous_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
  failure_count: number;
};
type SentRow = { anonymous_id: string };
type CronBody = { only_anonymous_id?: unknown; force?: unknown; reset?: unknown; dry_run?: unknown };

function newestSubscriptionPerUser(rows: SubscriptionRow[]) {
  const found = new Map<string, SubscriptionRow>();
  for (const row of rows) if (!found.has(row.anonymous_id)) found.set(row.anonymous_id, row);
  return [...found.values()];
}

async function updateAttempt(anonymousId: string, localDate: string, result: "sent" | "expired" | "failed") {
  const query = new URLSearchParams({ anonymous_id: `eq.${anonymousId}`, local_date: `eq.${localDate}` });
  await supabaseRequest(`/rest/v1/reminders_sent?${query}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ result, sent_at: new Date().toISOString() })
  });
}

export async function POST(request: NextRequest) {
  if (!constantTimeSecretMatches(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Reminder service unavailable" }, { status: 503 });
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return NextResponse.json({ error: "Reminder service is not configured" }, { status: 503 });
  try { webpush.setVapidDetails(subject, publicKey, privateKey); }
  catch { return NextResponse.json({ error: "Reminder service is not configured" }, { status: 503 }); }

  let body: CronBody = {};
  try { body = await request.json() as CronBody; } catch { /* An empty cron body is valid. */ }
  const onlyAnonymousId = typeof body.only_anonymous_id === "string" ? body.only_anonymous_id : null;
  const force = body.force === true;
  const reset = body.reset === true;
  const dryRun = body.dry_run === true;
  if (onlyAnonymousId && !validAnonymousId(onlyAnonymousId)) return NextResponse.json({ error: "Invalid test user" }, { status: 400 });
  if ((force || reset) && !onlyAnonymousId) return NextResponse.json({ error: "Test mode requires only_anonymous_id" }, { status: 400 });
  if (reset && !force) return NextResponse.json({ error: "reset requires force" }, { status: 400 });

  const now = new Date();
  const { localDate } = easternClock(now);
  if (!force && !dryRun && !isReminderSendWindow(now)) return NextResponse.json({ ok: true, skipped: "outside_window" });
  const contentDay = await getCurrentDay();

  if (reset && onlyAnonymousId && !dryRun) {
    const resetQuery = new URLSearchParams({ anonymous_id: `eq.${onlyAnonymousId}`, local_date: `eq.${localDate}` });
    await supabaseRequest(`/rest/v1/reminders_sent?${resetQuery}`, { method: "DELETE" });
  }

  let subscriptions: SubscriptionRow[];
  if (force) {
    const query = new URLSearchParams({ select: "id,anonymous_id,endpoint,p256dh,auth,created_at,failure_count", order: "created_at.desc" });
    if (onlyAnonymousId) query.set("anonymous_id", `eq.${onlyAnonymousId}`);
    subscriptions = newestSubscriptionPerUser(await supabaseRequest<SubscriptionRow[]>(`/rest/v1/push_subscriptions?${query}`));
  } else {
    subscriptions = await supabaseRequest<SubscriptionRow[]>("/rest/v1/rpc/eligible_reminder_subscriptions", {
      method: "POST",
      body: JSON.stringify({ target_content_day: contentDay, target_anonymous_id: onlyAnonymousId })
    });
  }

  const sentQuery = new URLSearchParams({ local_date: `eq.${localDate}`, select: "anonymous_id" });
  const alreadySent = new Set((await supabaseRequest<SentRow[]>(`/rest/v1/reminders_sent?${sentQuery}`)).map((row) => row.anonymous_id));
  const pending = subscriptions.filter((candidate) => !alreadySent.has(candidate.anonymous_id));
  if (dryRun) return NextResponse.json({ ok: true, dry_run: true, subscriptions: subscriptions.length, eligible: subscriptions.length, already_sent: subscriptions.length - pending.length, would_send: pending.length, content_day: contentDay, local_date: localDate });

  const started = Date.now();
  const payload = JSON.stringify({ title: "Candor", body: "Today's drop is ready." });
  const vapidDetails = { subject, publicKey, privateKey };
  const results = await mapWithConcurrency(pending, REMINDER_CONCURRENCY, async (subscription) => {
    if (Date.now() - started > REMINDER_TIME_BUDGET_MS) return "budget_skipped" as const;
    const claim = await supabaseRequest<Array<{ anonymous_id: string }>>("/rest/v1/reminders_sent?on_conflict=anonymous_id,local_date", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({ anonymous_id: subscription.anonymous_id, local_date: localDate, content_day: contentDay, result: "pending" })
    });
    if (!claim.length) return "duplicate" as const;

    const subscriptionQuery = new URLSearchParams({ id: `eq.${subscription.id}` });
    const result = await deliverReminderPush({
      send: () => webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, {
        TTL: REMINDER_TTL_SECONDS, timeout: 8_000, urgency: "normal", vapidDetails
      }),
      onSent: () => supabaseRequest(`/rest/v1/push_subscriptions?${subscriptionQuery}`, { method: "PATCH", body: JSON.stringify({ last_success_at: new Date().toISOString(), failure_count: 0 }) }),
      onExpired: () => supabaseRequest(`/rest/v1/push_subscriptions?${subscriptionQuery}`, { method: "DELETE" }),
      onFailed: () => supabaseRequest(`/rest/v1/push_subscriptions?${subscriptionQuery}`, { method: "PATCH", body: JSON.stringify({ failure_count: (subscription.failure_count ?? 0) + 1, last_failure_at: new Date().toISOString() }) })
    });
    await updateAttempt(subscription.anonymous_id, localDate, result).catch(() => undefined);
    await insertAnalyticsEvent({ anonymousId: subscription.anonymous_id, eventName: "reminder_sent", properties: { content_day: contentDay, result } }).catch(() => undefined);
    return result;
  });

  return NextResponse.json({
    ok: true,
    content_day: contentDay,
    local_date: localDate,
    eligible: subscriptions.length,
    sent: results.filter((result) => result === "sent").length,
    expired: results.filter((result) => result === "expired").length,
    failed: results.filter((result) => result === "failed").length,
    skipped: results.filter((result) => result === "duplicate" || result === "budget_skipped").length
  });
}


