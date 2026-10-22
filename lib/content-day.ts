import "server-only";
import { unstable_cache } from "next/cache";
import { FALLBACK_CURRENT_DAY } from "./config";
import { CONTENT_DAY_PATTERN, selectContentDay } from "./content-day-shared";
import { isSupabaseConfigured, supabaseRequest } from "./supabase-server";

function fallbackCurrentDay() {
  const configured = process.env.CURRENT_DAY?.trim();
  return configured && CONTENT_DAY_PATTERN.test(configured) ? configured : FALLBACK_CURRENT_DAY;
}

const readCurrentDay = unstable_cache(async () => {
  const fallback = fallbackCurrentDay();
  if (!isSupabaseConfigured()) return fallback;

  try {
    const query = new URLSearchParams({ key: "eq.current_day", select: "value", limit: "1" });
    const rows = await supabaseRequest<Array<{ value: string }>>(`/rest/v1/app_config?${query}`, {
      signal: AbortSignal.timeout(2_000)
    });
    const configured = rows[0]?.value?.trim();
    return configured && CONTENT_DAY_PATTERN.test(configured) ? configured : fallback;
  } catch (error) {
    console.warn("[config] Unable to read current_day; using the deployment fallback.", error instanceof Error ? error.message : "unknown error");
    return fallback;
  }
}, ["candor-current-day"], { revalidate: 60 });

export function isDayOverrideAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_DAY_OVERRIDE === "1";
}

export async function getCurrentDay() {
  return readCurrentDay();
}

export async function resolveContentDay(requestedDay?: string | null) {
  return selectContentDay(requestedDay, await getCurrentDay(), isDayOverrideAllowed());
}
