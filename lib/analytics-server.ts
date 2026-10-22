import { supabaseRequest } from "./supabase-server";
import type { AnalyticsEventName } from "./analytics-schema";
import { after } from "next/server";

export type AnalyticsContext = { session_id?: string | null; client_local_date?: string | null };

export async function existingAnalyticsUser(anonymousId: string) {
  const query = new URLSearchParams({ anonymous_id: `eq.${anonymousId}`, select: "anonymous_id,is_internal", limit: "1" });
  const users = await supabaseRequest<Array<{ anonymous_id: string; is_internal: boolean | null }>>(`/rest/v1/users?${query}`);
  return users[0] ?? null;
}

export async function insertAnalyticsEvent(input: {
  anonymousId: string;
  eventName: AnalyticsEventName;
  properties: Record<string, string | number | boolean>;
  context?: AnalyticsContext;
}) {
  const user = await existingAnalyticsUser(input.anonymousId);
  if (!user) throw new Error("analytics_user_missing");
  await supabaseRequest("/rest/v1/events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      anonymous_id: input.anonymousId,
      event_name: input.eventName,
      properties: { ...input.properties, internal: user.is_internal === true },
      client_local_date: input.context?.client_local_date ?? null,
      session_id: input.context?.session_id ?? null
    })
  });
}

const warnedServerEvents = new Set<string>();
export function logServerEvent(input: Parameters<typeof insertAnalyticsEvent>[0]) {
  after(async () => {
    await insertAnalyticsEvent(input).catch((error) => {
      if (process.env.NODE_ENV === "production" || warnedServerEvents.has(input.eventName)) return;
      warnedServerEvents.add(input.eventName);
      console.warn(`[analytics] Failed to store ${input.eventName}`, error instanceof Error ? error.message : "unknown");
    });
  });
}

