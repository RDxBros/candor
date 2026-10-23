import assert from "node:assert/strict";
import test from "node:test";
import { isAvailableGameDay, isGameStoryEligible, qualifyingStoryExcerpts } from "./lean-game-pool-rules.ts";

test("the shared game pool never includes folders after the active day", () => {
  assert.equal(isAvailableGameDay("day2", "day1"), false);
  assert.equal(isAvailableGameDay("day1", "day2"), true);
  assert.equal(isAvailableGameDay("day2", "day2"), true);
  assert.equal(isAvailableGameDay("day3", "day2"), false);
});

test("the shared pool excludes non-comparison, opted-out and non-political stories", () => {
  const valid = { category: "news_&_society", leanComparison: true, sourceCount: 3 };
  assert.equal(isGameStoryEligible(valid), true);
  assert.equal(isGameStoryEligible({ ...valid, leanComparison: false }), false);
  assert.equal(isGameStoryEligible({ ...valid, gameEligible: false }), false);
  assert.equal(isGameStoryEligible({ ...valid, category: "technology" }), false);
  assert.equal(isGameStoryEligible({ ...valid, sourceCount: 2 }), false);
});

test("stories qualify with three or two usable excerpts but not one", () => {
  assert.equal(qualifyingStoryExcerpts([1, 2, 3]).length, 3);
  assert.equal(qualifyingStoryExcerpts([1, 2]).length, 2);
  assert.equal(qualifyingStoryExcerpts([1]).length, 0);
});
