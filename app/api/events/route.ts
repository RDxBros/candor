import { NextRequest, NextResponse } from "next/server";
import { prepareAnalyticsProperties, type AnalyticsEventName } from "../../../lib/analytics-schema";
import { existingAnalyticsUser, insertAnalyticsEvent } from "../../../lib/analytics-server";
import { isSupabaseConfigured } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BYTES = 2048;

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) return NextResponse.json({ error: "Event payload is too large" }, { status: 413 });
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid event" }, { status: 400 }); }

  const eventName = typeof body.event_name === "string" ? body.event_name : "";
  const anonymousId = typeof body.anonymous_id === "string" ? body.anonymous_id : "";
  const sessionId = typeof body.session_id === "string" ? body.session_id : null;
  const localDate = typeof body.client_local_date === "string" ? body.client_local_date : null;
  if (!UUID.test(anonymousId) || (sessionId !== null && (!UUID.test(sessionId) || sessionId.length > 36)) || (localDate !== null && !DATE.test(localDate))) {
    return NextResponse.json({ error: "Invalid event envelope" }, { status: 400 });
  }
  const environment = process.env.NODE_ENV === "production" ? "production" : process.env.NODE_ENV === "test" ? "test" : "development";
  const result = prepareAnalyticsProperties(eventName, body.properties ?? {}, environment, (name, key) => {
    console.warn(`[analytics] Dropped property for ${name}: ${key}`);
  });
  if (!result.ok) return NextResponse.json({ error: result.error, key: result.key }, { status: 400 });
  if (!isSupabaseConfigured()) return new NextResponse(null, { status: 204 });
  try {
    if (!await existingAnalyticsUser(anonymousId)) return NextResponse.json({ error: "Unknown user" }, { status: 400 });
    await insertAnalyticsEvent({ anonymousId, eventName: eventName as AnalyticsEventName, properties: result.properties, context: { session_id: sessionId, client_local_date: localDate } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Unable to store event" }, { status: 500 });
  }
}

