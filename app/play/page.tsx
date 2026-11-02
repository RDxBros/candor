import { getPlayLaunchDate } from "../../lib/play-config";
import { countdownTarget, selectPlayRelease } from "../../lib/play-release";
import { loadPlaySchedule } from "../../lib/play-schedule";
import { sanitizePlayRef } from "../../lib/play-client";
import { DailyLeanGame } from "./play-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SearchParams = Promise<{ preview_round?: string | string[]; ref?: string | string[] }>;

export default async function PlayPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const schedule = await loadPlaySchedule();
  const launchDate = await getPlayLaunchDate();
  const now = new Date();
  const rawPreview = Array.isArray(query.preview_round) ? query.preview_round[0] : query.preview_round;
  const previewRound = Number(rawPreview);
  const allowPreview = process.env.ALLOW_PLAY_PREVIEW === "1";
  const ref = sanitizePlayRef(Array.isArray(query.ref) ? query.ref[0] : query.ref);

  const release = selectPlayRelease(schedule, launchDate, now, previewRound, allowPreview);
  const selected = release.selected;
  const nextUnlockAt = launchDate && release.next ? countdownTarget(launchDate, release.next.round) : null;
  const hasFutureScheduledRound = selected ? schedule.some((entry) => entry.round > selected.round) : schedule.length > 0;

  return <DailyLeanGame
    round={selected ?? null}
    refSource={ref}
    nextUnlockAt={nextUnlockAt}
    hasFutureScheduledRound={hasFutureScheduledRound}
    comingSoon={!selected}
  />;
}
