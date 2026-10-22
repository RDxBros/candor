import assert from "node:assert/strict";
import test from "node:test";
import { bullseyeQualifies, explorerProgress, isExplorerClickEligible } from "./badges.ts";

test("Explorer requires all three distinct leans and repeat clicks do not help", () => {
  assert.equal(explorerProgress(["left", "left", "right"]).qualifies, false);
  assert.deepEqual(explorerProgress(["left", "right"]).remaining, ["center"]);
  assert.equal(explorerProgress(["left", "center", "right"]).qualifies, true);
});

test("Bullseye awards for perfect scored rounds and not after one miss", () => {
  assert.equal(bullseyeQualifies({ correct: 3, total: 3, mode: "scored" }), true);
  assert.equal(bullseyeQualifies({ correct: 2, total: 2, mode: "scored" }), true);
  assert.equal(bullseyeQualifies({ correct: 2, total: 3, mode: "scored" }), false);
});

test("practice never qualifies for Bullseye", () => {
  assert.equal(bullseyeQualifies({ correct: 3, total: 3, mode: "practice" }), false);
});

test("non-political source clicks are never eligible for Explorer", () => {
  assert.equal(isExplorerClickEligible(false, "left"), false);
  assert.equal(isExplorerClickEligible(true, "left"), true);
  assert.equal(isExplorerClickEligible(true, undefined), false);
});
