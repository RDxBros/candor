import assert from "node:assert/strict";
import test from "node:test";
import { applyPlayAnswer, buildPlayShareText, consecutivePlayStreak, sanitizePlayRef, type PlayStoredRound } from "./play-client.ts";

test("a completed round is permanently locked on the device", () => {
  const complete: PlayStoredRound = { answers: ["left", "center", "right"], completed: true, score: 3, completedAt: "2026-11-01T12:00:00Z" };
  assert.equal(applyPlayAnswer(complete, "right", "left"), complete);
});

test("share text is neutral and contains the share referral", () => {
  assert.equal(
    buildPlayShareText(12, ["left", "right", "center"], ["left", "center", "center"], "https://candor.test/"),
    "Spot the Lean #12 ⬛⬜⬛ 2/3\nhttps://candor.test/play?ref=share"
  );
});

test("play referral and streak helpers are deterministic", () => {
  assert.equal(sanitizePlayRef("share_2"), "share_2");
  assert.equal(sanitizePlayRef("NO SPACES"), "direct");
  assert.equal(consecutivePlayStreak([1, 2, 3, 5], 5), 1);
  assert.equal(consecutivePlayStreak([1, 2, 3], 3), 3);
});
