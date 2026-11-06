import assert from "node:assert/strict";
import test from "node:test";
import { countdownTarget, dateInTimeZone, formatPlayDateLabel, isRoundUnlocked, midnightInTimeZone, selectPlayRelease, validPlayTimeZone } from "./play-release.ts";

const schedule = [
  { round: 1, reviewed_by_human: true },
  { round: 2, reviewed_by_human: true },
  { round: 3, reviewed_by_human: true }
];

test("rounds unlock at each player's local midnight, including DST changes", () => {
  assert.equal(midnightInTimeZone("2026-11-01", "America/New_York"), Date.parse("2026-11-01T04:00:00Z"));
  assert.equal(midnightInTimeZone("2026-11-02", "America/New_York"), Date.parse("2026-11-02T05:00:00Z"));
  assert.equal(countdownTarget("2026-10-31", 2, "America/New_York"), Date.parse("2026-11-01T04:00:00Z"));
  assert.equal(isRoundUnlocked("2026-10-31", 2, new Date("2026-11-01T03:59:59Z"), "America/New_York"), false);
  assert.equal(isRoundUnlocked("2026-10-31", 2, new Date("2026-11-01T04:00:00Z"), "America/New_York"), true);
  assert.equal(dateInTimeZone(new Date("2026-11-02T04:59:59Z"), "America/New_York"), "2026-11-01");
  assert.equal(dateInTimeZone(new Date("2026-11-02T05:00:00Z"), "America/New_York"), "2026-11-02");
  assert.equal(midnightInTimeZone("2026-11-07", "Asia/Tokyo"), Date.parse("2026-11-06T15:00:00Z"));
  assert.equal(midnightInTimeZone("2026-11-07", "America/Los_Angeles"), Date.parse("2026-11-07T08:00:00Z"));
  assert.equal(midnightInTimeZone("2026-09-06", "America/Santiago"), Date.parse("2026-09-06T04:00:00Z"));
  assert.equal(validPlayTimeZone("Asia%2FTokyo"), "Asia/Tokyo");
  assert.equal(validPlayTimeZone("not-a-time-zone"), null);
});

test("release selection covers pre-launch, active, preview, and post-last states", () => {
  const before = selectPlayRelease(schedule, "2026-11-01", new Date("2026-11-01T03:59:59Z"), "America/New_York");
  assert.equal(before.selected, undefined);
  assert.equal(before.beforeLaunch, true);

  const active = selectPlayRelease(schedule, "2026-11-01", new Date("2026-11-02T05:00:00Z"), "America/New_York");
  assert.equal(active.selected?.round, 2);
  assert.equal(active.next?.round, 3);
  assert.equal(active.postLastRound, false);

  const preview = selectPlayRelease(schedule, null, new Date(), "America/New_York", 3, true);
  assert.equal(preview.selected?.round, 3);

  const postLast = selectPlayRelease(schedule, "2026-11-01", new Date("2026-11-03T05:00:00Z"), "America/New_York");
  assert.equal(postLast.selected?.round, 3);
  assert.equal(postLast.postLastRound, true);
  assert.equal(postLast.next, undefined);
});

test("unreviewed rounds are never selected, including preview", () => {
  const mixed = [{ round: 1, reviewed_by_human: true }, { round: 2, reviewed_by_human: false }];
  assert.equal(selectPlayRelease(mixed, "2026-11-01", new Date("2026-11-03T12:00:00Z"), "America/New_York").selected?.round, 1);
  assert.equal(selectPlayRelease(mixed, null, new Date(), "America/New_York", 2, true).selected, undefined);
});

test("same instant can select different local rounds", () => {
  const now = new Date("2026-11-06T16:00:00Z");
  assert.equal(selectPlayRelease(schedule, "2026-11-06", now, "Asia/Tokyo").selected?.round, 2);
  assert.equal(selectPlayRelease(schedule, "2026-11-06", now, "America/Los_Angeles").selected?.round, 1);
});

test("play labels show the player's calendar date", () => {
  assert.equal(formatPlayDateLabel("2026-11-02"), "Nov 2, 2026");
});
