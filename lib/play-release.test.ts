import assert from "node:assert/strict";
import test from "node:test";
import { countdownTarget, dateInTimeZone, isRoundUnlocked, midnightInTimeZone, selectPlayRelease } from "./play-release.ts";

const schedule = [
  { round: 1, reviewed_by_human: true },
  { round: 2, reviewed_by_human: true },
  { round: 3, reviewed_by_human: true }
];

test("rounds unlock at New York midnight, including the Nov 1 DST change", () => {
  assert.equal(midnightInTimeZone("2026-11-01"), Date.parse("2026-11-01T04:00:00Z"));
  assert.equal(midnightInTimeZone("2026-11-02"), Date.parse("2026-11-02T05:00:00Z"));
  assert.equal(countdownTarget("2026-10-31", 2), Date.parse("2026-11-01T04:00:00Z"));
  assert.equal(isRoundUnlocked("2026-10-31", 2, new Date("2026-11-01T03:59:59Z")), false);
  assert.equal(isRoundUnlocked("2026-10-31", 2, new Date("2026-11-01T04:00:00Z")), true);
  assert.equal(dateInTimeZone(new Date("2026-11-02T04:59:59Z")), "2026-11-01");
  assert.equal(dateInTimeZone(new Date("2026-11-02T05:00:00Z")), "2026-11-02");
});

test("release selection covers pre-launch, active, preview, and post-last states", () => {
  const before = selectPlayRelease(schedule, "2026-11-01", new Date("2026-11-01T03:59:59Z"));
  assert.equal(before.selected, undefined);
  assert.equal(before.beforeLaunch, true);

  const active = selectPlayRelease(schedule, "2026-11-01", new Date("2026-11-02T05:00:00Z"));
  assert.equal(active.selected?.round, 2);
  assert.equal(active.next?.round, 3);
  assert.equal(active.postLastRound, false);

  const preview = selectPlayRelease(schedule, null, new Date(), 3, true);
  assert.equal(preview.selected?.round, 3);

  const postLast = selectPlayRelease(schedule, "2026-11-01", new Date("2026-11-03T05:00:00Z"));
  assert.equal(postLast.selected?.round, 3);
  assert.equal(postLast.postLastRound, true);
  assert.equal(postLast.next, undefined);
});

test("unreviewed rounds are never selected, including preview", () => {
  const mixed = [{ round: 1, reviewed_by_human: true }, { round: 2, reviewed_by_human: false }];
  assert.equal(selectPlayRelease(mixed, "2026-11-01", new Date("2026-11-03T12:00:00Z")).selected?.round, 1);
  assert.equal(selectPlayRelease(mixed, null, new Date(), 2, true).selected, undefined);
});
