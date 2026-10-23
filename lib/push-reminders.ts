import { timingSafeEqual } from "node:crypto";

export const REMINDER_TIME_ZONE = "America/New_York";
export const REMINDER_TTL_SECONDS = 3 * 60 * 60;
export const REMINDER_CONCURRENCY = 10;
export const REMINDER_TIME_BUDGET_MS = 45_000;

export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

export function validAnonymousId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function parsePushSubscription(value: unknown): PushSubscriptionInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = record.keys;
  if (typeof record.endpoint !== "string" || record.endpoint.length > 2048 || !/^https:\/\//i.test(record.endpoint)) return null;
  if (!keys || typeof keys !== "object" || Array.isArray(keys)) return null;
  const keyRecord = keys as Record<string, unknown>;
  if (typeof keyRecord.p256dh !== "string" || keyRecord.p256dh.length > 512 || !BASE64URL.test(keyRecord.p256dh)) return null;
  if (typeof keyRecord.auth !== "string" || keyRecord.auth.length > 256 || !BASE64URL.test(keyRecord.auth)) return null;
  return { endpoint: record.endpoint, keys: { p256dh: keyRecord.p256dh, auth: keyRecord.auth } };
}

export function constantTimeSecretMatches(received: string | null, expected: string | undefined) {
  if (!received?.startsWith("Bearer ") || !expected) return false;
  const provided = Buffer.from(received.slice(7));
  const wanted = Buffer.from(expected);
  return provided.length === wanted.length && timingSafeEqual(provided, wanted);
}

export function easternClock(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: REMINDER_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    localDate: `${value("year")}-${value("month")}-${value("day")}`,
    hour: Number(value("hour"))
  };
}

export function isReminderSendWindow(date: Date) {
  const clock = easternClock(date);
  return clock.hour === 11;
}

function dayNumber(day: string) {
  const match = /^day(\d+)$/.exec(day);
  return match ? Number(match[1]) : null;
}

export function readContentDay(properties: unknown) {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return null;
  const contentDay = (properties as Record<string, unknown>).content_day;
  return typeof contentDay === "string" && dayNumber(contentDay) !== null ? contentDay : null;
}

export function contentDayIsEarlier(readDay: string | null, currentDay: string) {
  const read = readDay ? dayNumber(readDay) : null;
  const current = dayNumber(currentDay);
  return read !== null && current !== null && read < current;
}

export function isReminderRecipient(input: {
  totalStoriesRead: number;
  latestReadContentDay: string | null;
  currentContentDay: string;
}) {
  return input.totalStoriesRead > 0 && contentDayIsEarlier(input.latestReadContentDay, input.currentContentDay);
}

export function pushFailureResult(statusCode: number | undefined): "expired" | "failed" {
  return statusCode === 404 || statusCode === 410 ? "expired" : "failed";
}

export async function deliverReminderPush(input: {
  send: () => Promise<unknown>;
  onSent: () => Promise<unknown>;
  onExpired: () => Promise<unknown>;
  onFailed: () => Promise<unknown>;
}): Promise<"sent" | "expired" | "failed"> {
  try {
    await input.send();
    await input.onSent().catch(() => undefined);
    return "sent";
  } catch (error) {
    const statusCode = typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number"
      ? error.statusCode : undefined;
    const result = pushFailureResult(statusCode);
    if (result === "expired") await input.onExpired().catch(() => undefined);
    else await input.onFailed().catch(() => undefined);
    return result;
  }
}
export async function mapWithConcurrency<T, R>(items: T[], concurrency: number, task: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, worker));
  return results;
}
