import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, supabaseRequest } from "../../../../lib/supabase-server";
import { parsePushSubscription, validAnonymousId } from "../../../../lib/push-reminders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Reminders are temporarily unavailable." }, { status: 503 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid subscription." }, { status: 400 }); }
  const subscription = parsePushSubscription(body.subscription);
  if (!validAnonymousId(body.anonymous_id) || !subscription) return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  try {
    const query = new URLSearchParams({ anonymous_id: `eq.${body.anonymous_id}`, endpoint: `eq.${subscription.endpoint}` });
    await supabaseRequest(`/rest/v1/push_subscriptions?${query}`, { method: "DELETE" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unable to remove push subscription:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Unable to disable reminders right now." }, { status: 500 });
  }
}

