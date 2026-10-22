import assert from "node:assert/strict";
import test from "node:test";
import { createAnalyticsSessionId, track, VisibleTimer } from "./analytics.ts";

test("track never throws when browser APIs are unavailable", () => {
  assert.doesNotThrow(() => track("landing_viewed"));
});

test("analytics session ids fall back when randomUUID is unavailable", () => {
  let next = 0;
  const cryptoWithoutRandomUuid = {
    randomUUID: undefined,
    getRandomValues(array: Uint8Array) {
      for (let index = 0; index < array.length; index += 1) array[index] = next++;
      return array;
    }
  } as unknown as Pick<Crypto, "randomUUID" | "getRandomValues">;
  assert.match(createAnalyticsSessionId(cryptoWithoutRandomUuid), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("response timer excludes hidden time and caps at five minutes", () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  let now = 0;
  Object.defineProperty(globalThis, "document", { configurable: true, value: { hidden: false } });
  try {
    const timer = new VisibleTimer(300_000, () => now);
    now = 1_000; timer.pause();
    now = 101_000; timer.resume();
    now = 501_000;
    assert.equal(timer.value(), 300_000);
    const short = new VisibleTimer(300_000, () => now);
    now = 501_100; short.pause();
    now = 601_100; short.resume();
    now = 601_200;
    assert.equal(short.value(), 200);
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else delete (globalThis as { document?: unknown }).document;
  }
});
