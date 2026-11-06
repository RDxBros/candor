import "server-only";
import { unstable_cache } from "next/cache";
import { isSupabaseConfigured, supabaseRequest } from "./supabase-server";
import { ISO_DATE_PATTERN } from "./play-release";

// Calendar date of round 1. The database row can override it without a redeploy.
export const PLAY_LAUNCH_DATE = "2026-11-06";

async function readPlayLaunchDateFromSource() {
  if (!isSupabaseConfigured()) return PLAY_LAUNCH_DATE;
  try {
    const query = new URLSearchParams({ key: "eq.play_launch_date", select: "value", limit: "1" });
    const rows = await supabaseRequest<Array<{ value: string }>>(`/rest/v1/app_config?${query}`, {
      signal: AbortSignal.timeout(2_000)
    });
    const value = rows[0]?.value?.trim();
    return value && ISO_DATE_PATTERN.test(value) ? value : PLAY_LAUNCH_DATE;
  } catch (error) {
    console.warn("[play] Unable to read play_launch_date.", error instanceof Error ? error.message : "unknown error");
    return PLAY_LAUNCH_DATE;
  }
}

const readPlayLaunchDate = unstable_cache(readPlayLaunchDateFromSource, ["candor-play-launch-date"], { revalidate: 60 });

export async function getPlayLaunchDate() {
  return readPlayLaunchDate();
}
