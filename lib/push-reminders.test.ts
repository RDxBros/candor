import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  constantTimeSecretMatches, deliverReminderPush, easternClock, isReminderRecipient,
  isReminderSendWindow, parsePushSubscription
} from "./push-reminders.ts";

const subscription = { endpoint: "https://push.example/subscription", keys: { p256dh: "abc_DEF-123", auth: "auth_123" } };

test("recipient rule requires an existing read from an earlier content day", () => {
  assert.equal(isReminderRecipient({ totalStoriesRead: 0, latestReadContentDay: "day1", currentContentDay: "day2" }), false);
  assert.equal(isReminderRecipient({ totalStoriesRead: 1, latestReadContentDay: "day2", currentContentDay: "day2" }), false);
  assert.equal(isReminderRecipient({ totalStoriesRead: 1, latestReadContentDay: "day1", currentContentDay: "day2" }), true);
});

test("11 AM Eastern window is DST safe every day", () => {
  const sundayBeforeFallback = new Date("2026-10-25T15:00:00.000Z");
  const sundayAfterFallback = new Date("2026-11-01T16:00:00.000Z");
  assert.equal(easternClock(sundayBeforeFallback).hour, 11);
  assert.equal(easternClock(sundayAfterFallback).hour, 11);
  assert.equal(isReminderSendWindow(sundayBeforeFallback), true);
  assert.equal(isReminderSendWindow(sundayAfterFallback), true);
  assert.equal(isReminderSendWindow(new Date("2026-10-25T16:00:00.000Z")), false);
  assert.equal(isReminderSendWindow(new Date("2026-11-01T15:00:00.000Z")), false);
  assert.equal(isReminderSendWindow(new Date("2026-10-31T15:00:00.000Z")), true);
});

test("cron authorization is exact and constant-time compatible", () => {
  assert.equal(constantTimeSecretMatches("Bearer secret-value", "secret-value"), true);
  assert.equal(constantTimeSecretMatches("Bearer wrong", "secret-value"), false);
  assert.equal(constantTimeSecretMatches(null, "secret-value"), false);
});

test("subscribe and unsubscribe payload parsing rejects malformed data", () => {
  assert.deepEqual(parsePushSubscription(subscription), subscription);
  assert.equal(parsePushSubscription({ ...subscription, endpoint: "http://insecure.example" }), null);
  assert.equal(parsePushSubscription({ endpoint: subscription.endpoint, keys: { p256dh: "", auth: "ok" } }), null);
});

test("a mocked 410 push response cleans up the expired subscription", async () => {
  let cleaned = 0;
  const result = await deliverReminderPush({
    send: async () => { throw Object.assign(new Error("gone"), { statusCode: 410 }); },
    onSent: async () => undefined,
    onExpired: async () => { cleaned += 1; },
    onFailed: async () => undefined
  });
  assert.equal(result, "expired");
  assert.equal(cleaned, 1);
});

test("a successful mocked push records success without cleanup", async () => {
  let sent = 0;
  let cleaned = 0;
  const result = await deliverReminderPush({
    send: async () => undefined,
    onSent: async () => { sent += 1; },
    onExpired: async () => { cleaned += 1; },
    onFailed: async () => undefined
  });
  assert.equal(result, "sent");
  assert.equal(sent, 1);
  assert.equal(cleaned, 0);
});
test("subscription routes upsert and remove the validated endpoint server-side", () => {
  const subscribeRoute = readFileSync("app/api/push/subscribe/route.ts", "utf8");
  const unsubscribeRoute = readFileSync("app/api/push/unsubscribe/route.ts", "utf8");
  assert.match(subscribeRoute, /MAX_BYTES = 4096/);
  assert.match(subscribeRoute, /on_conflict=endpoint/);
  assert.match(subscribeRoute, /resolution=merge-duplicates/);
  assert.match(unsubscribeRoute, /anonymous_id: `eq\.\$\{body\.anonymous_id\}`/);
  assert.match(unsubscribeRoute, /endpoint: `eq\.\$\{subscription\.endpoint\}`/);
  assert.match(unsubscribeRoute, /method: "DELETE"/);
});

test("subscription bookkeeping failures do not turn a delivered push into a failed push", async () => {
  const result = await deliverReminderPush({
    send: async () => undefined,
    onSent: async () => { throw new Error("database unavailable"); },
    onExpired: async () => undefined,
    onFailed: async () => undefined
  });
  assert.equal(result, "sent");
});
test("toggle flows unsubscribe, avoid denied re-prompts and gate iOS browser mode", () => {
  const component = readFileSync("components/push-reminder-toggle.tsx", "utf8");
  const inspectStart = component.indexOf("async function inspect()");
  const iosGate = component.indexOf("if (isIos() && !isStandalone())", inspectStart);
  const supportGate = component.indexOf("if (!supported()", inspectStart);
  assert.ok(iosGate > inspectStart && iosGate < supportGate);

  const enableStart = component.indexOf("async function enable()");
  const deniedGate = component.indexOf('Notification.permission === "denied"', enableStart);
  const prompt = component.indexOf("Notification.requestPermission()", enableStart);
  assert.ok(deniedGate > enableStart && deniedGate < prompt);
  assert.match(component, /Notifications are blocked\. Re-enable them in your browser or device settings\./);
  assert.match(component, /Add Candor to your Home Screen first/);

  const disableStart = component.indexOf("async function disable()");
  const browserUnsubscribe = component.indexOf("subscription.unsubscribe()", disableStart);
  const serverUnsubscribe = component.indexOf('fetch("/api/push/unsubscribe"', disableStart);
  assert.ok(browserUnsubscribe > disableStart && browserUnsubscribe < serverUnsubscribe);
});

test("dry run bypasses only the clock and keeps recipient selection plus the daily ledger", () => {
  const route = readFileSync("app/api/cron/reminders/route.ts", "utf8");
  assert.match(route, /if \(!force && !dryRun && !isReminderSendWindow\(now\)\)/);
  assert.match(route, /rpc\/eligible_reminder_subscriptions/);
  assert.match(route, /const pending = subscriptions\.filter\(\(candidate\) => !alreadySent\.has/);
  const dryRunReturn = route.indexOf("if (dryRun) return NextResponse.json");
  const sendStart = route.indexOf("const results = await mapWithConcurrency");
  assert.ok(dryRunReturn > 0 && dryRunReturn < sendStart);
});
