import { NextRequest, NextResponse } from "next/server";
import { existingAnalyticsUser } from "../../../../lib/analytics-server";
import { isSupabaseConfigured, supabaseRequest } from "../../../../lib/supabase-server";
import { parsePushSubscription, validAnonymousId } from "../../../../lib/push-reminders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const MAX_BYTES = 4096;

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Reminders are temporarily unavailable." }, { status: 503 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) return NextResponse.json({ error: "Subscription is too large." }, { status: 413 });
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid subscription." }, { status: 400 }); }
  const subscription = parsePushSubscription(body.subscription);
  if (!validAnonymousId(body.anonymous_id) || !subscription) return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  try {
    if (!await existingAnalyticsUser(body.anonymous_id)) return NextResponse.json({ error: "User is not ready yet." }, { status: 400 });
    await supabaseRequest("/rest/v1/push_subscriptions?on_conflict=endpoint", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ anonymous_id: body.anonymous_id, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, failure_count: 0 })
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unable to save push subscription:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Unable to enable reminders right now." }, { status: 500 });
  }
}

