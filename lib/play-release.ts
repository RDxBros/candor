export const PLAY_TIME_ZONE_COOKIE = "candor_play_time_zone";
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function validPlayTimeZone(value: string | null | undefined) {
  if (!value || value.length > 100) return null;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.length > 100) return null;
    return new Intl.DateTimeFormat("en-US", { timeZone: decoded }).resolvedOptions().timeZone;
  } catch { return null; }
}

function parseIsoDate(value: string) {
  if (!ISO_DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? { year, month, day }
    : null;
}

export function addCalendarDays(isoDate: string, days: number) {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) throw new Error(`Invalid ISO date: ${isoDate}`);
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function dateInTimeZone(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

export function midnightInTimeZone(isoDate: string, timeZone: string) {
  const target = parseIsoDate(isoDate);
  if (!target) throw new Error(`Invalid ISO date: ${isoDate}`);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit"
  });
  const localDate = (instant: number) => {
    const parts = formatter.formatToParts(new Date(instant));
    const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
    return `${read("year")}-${read("month")}-${read("day")}`;
  };
  const targetAsUtc = Date.UTC(target.year, target.month - 1, target.day);
  const step = 15 * 60 * 1_000;
  let previous = targetAsUtc - 48 * 3_600_000;
  for (let instant = previous + step; instant <= targetAsUtc + 48 * 3_600_000; instant += step) {
    if (localDate(instant) >= isoDate) {
      let low = previous;
      let high = instant;
      while (high - low > 1_000) {
        const middle = Math.floor((low + high) / 2_000) * 1_000;
        if (localDate(middle) >= isoDate) high = middle;
        else low = middle;
      }
      return high;
    }
    previous = instant;
  }
  throw new Error(`Unable to find local release date: ${isoDate}`);
}

export function unlockDate(launchDate: string, round: number) {
  return addCalendarDays(launchDate, round - 1);
}

export function formatPlayDateLabel(releaseDate: string) {
  if (!parseIsoDate(releaseDate)) throw new Error("Invalid play date");
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC"
  }).format(new Date(`${releaseDate}T12:00:00Z`));
}

export function isRoundUnlocked(launchDate: string, round: number, now: Date, timeZone: string) {
  return dateInTimeZone(now, timeZone) >= unlockDate(launchDate, round);
}

export function countdownTarget(launchDate: string, round: number, timeZone: string) {
  return midnightInTimeZone(unlockDate(launchDate, round), timeZone);
}

export function selectPlayRelease<T extends { round: number; reviewed_by_human: boolean }>(
  schedule: T[],
  launchDate: string | null,
  now: Date,
  timeZone: string,
  previewRound?: number,
  allowPreview = false
) {
  const reviewed = schedule.filter((entry) => entry.reviewed_by_human);
  let selected = allowPreview && Number.isInteger(previewRound)
    ? reviewed.find((entry) => entry.round === previewRound)
    : undefined;
  if (!selected && launchDate) selected = reviewed.filter((entry) => isRoundUnlocked(launchDate, entry.round, now, timeZone)).at(-1);
  const next = selected ? reviewed.find((entry) => entry.round > selected.round) : reviewed[0];
  const lastRound = schedule.at(-1)?.round ?? null;
  return {
    selected,
    next,
    beforeLaunch: !selected,
    postLastRound: Boolean(selected && lastRound === selected.round && launchDate && isRoundUnlocked(launchDate, selected.round, now, timeZone))
  };
}
