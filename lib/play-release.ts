export const PLAY_TIME_ZONE = "America/New_York";
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

export function dateInTimeZone(now: Date, timeZone = PLAY_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

function zonedParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: read("year"), month: read("month"), day: read("day"), hour: read("hour"), minute: read("minute"), second: read("second") };
}

export function midnightInTimeZone(isoDate: string, timeZone = PLAY_TIME_ZONE) {
  const target = parseIsoDate(isoDate);
  if (!target) throw new Error(`Invalid ISO date: ${isoDate}`);
  const targetAsUtc = Date.UTC(target.year, target.month - 1, target.day, 0, 0, 0);
  let guess = targetAsUtc;
  for (let index = 0; index < 4; index += 1) {
    const parts = zonedParts(new Date(guess), timeZone);
    const renderedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    guess += targetAsUtc - renderedAsUtc;
  }
  return guess;
}

export function unlockDate(launchDate: string, round: number) {
  return addCalendarDays(launchDate, round - 1);
}

export function isRoundUnlocked(launchDate: string, round: number, now: Date) {
  return dateInTimeZone(now) >= unlockDate(launchDate, round);
}

export function countdownTarget(launchDate: string, round: number) {
  return midnightInTimeZone(unlockDate(launchDate, round));
}

export function selectPlayRelease<T extends { round: number; reviewed_by_human: boolean }>(
  schedule: T[],
  launchDate: string | null,
  now: Date,
  previewRound?: number,
  allowPreview = false
) {
  const reviewed = schedule.filter((entry) => entry.reviewed_by_human);
  let selected = allowPreview && Number.isInteger(previewRound)
    ? reviewed.find((entry) => entry.round === previewRound)
    : undefined;
  if (!selected && launchDate) selected = reviewed.filter((entry) => isRoundUnlocked(launchDate, entry.round, now)).at(-1);
  const next = selected ? reviewed.find((entry) => entry.round > selected.round) : reviewed[0];
  const lastRound = schedule.at(-1)?.round ?? null;
  return {
    selected,
    next,
    beforeLaunch: !selected,
    postLastRound: Boolean(selected && lastRound === selected.round && launchDate && isRoundUnlocked(launchDate, selected.round, now))
  };
}
