import { getPlayLaunchDate } from "../../lib/play-config";
import { countdownTarget, dateInTimeZone, formatPlayDateLabel, selectPlayRelease } from "../../lib/play-release";
import { loadPlaySchedule } from "../../lib/play-schedule";
import { sanitizePlayRef } from "../../lib/play-client";
import { DailyLeanGame } from "./play-client";
import { cookies } from "next/headers";
import { PLAY_TIME_ZONE_COOKIE, validPlayTimeZone } from "../../lib/play-release";
import { PlayTimeZoneGate } from "./play-time-zone-gate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SearchParams = Promise<{ preview_round?: string | string[]; ref?: string | string[] }>;

export default async function PlayPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const timeZone = validPlayTimeZone((await cookies()).get(PLAY_TIME_ZONE_COOKIE)?.value);
  if (!timeZone) return <PlayTimeZoneGate serverTimeZone={null} />;
  const schedule = await loadPlaySchedule();
  const launchDate = await getPlayLaunchDate();
  const now = new Date();
  const rawPreview = Array.isArray(query.preview_round) ? query.preview_round[0] : query.preview_round;
  const previewRound = Number(rawPreview);
  const allowPreview = process.env.ALLOW_PLAY_PREVIEW === "1";
  const ref = sanitizePlayRef(Array.isArray(query.ref) ? query.ref[0] : query.ref);

  const release = selectPlayRelease(schedule, launchDate, now, timeZone, previewRound, allowPreview);
  const selected = release.selected;
  const currentPlayDate = dateInTimeZone(now, timeZone);
  const nextUnlockAt = launchDate && release.next ? countdownTarget(launchDate, release.next.round, timeZone) : null;
  const hasFutureScheduledRound = selected ? schedule.some((entry) => entry.round > selected.round) : schedule.length > 0;

  return <PlayTimeZoneGate key={timeZone} serverTimeZone={timeZone}><DailyLeanGame
    key={selected?.round ?? "coming-soon"}
    round={selected ?? null}
    roundDateLabel={selected ? formatPlayDateLabel(currentPlayDate) : null}
    refSource={ref}
    nextUnlockAt={nextUnlockAt}
    nextRoundNumber={release.next?.round ?? null}
    hasFutureScheduledRound={hasFutureScheduledRound}
    comingSoon={!selected}
  /></PlayTimeZoneGate>;
}
