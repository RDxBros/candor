import assert from "node:assert/strict";
import test from "node:test";
import { automaticGuessTransition, resumeLockedStory, storySegment } from "./lean-game-flow.ts";

const cards = [{ storyId: "one" }, { storyId: "one" }, { storyId: "one" }];

test("a three-card story uses its actual position and total", () => {
  assert.deepEqual(storySegment(cards, 1), { start: 0, end: 2, position: 1, total: 3 });
});

test("auto-reveal fires after the last answer and not before", () => {
  assert.deepEqual(automaticGuessTransition(cards, 1, false), { index: 2, phase: "guess", delay: 420 });
  assert.deepEqual(automaticGuessTransition(cards, 2, false), { index: 0, phase: "reveal", delay: 300 });
  assert.deepEqual(automaticGuessTransition(cards, 2, true), { index: 0, phase: "reveal", delay: 0 });
});

test("resume stays on the first unanswered card and goes to answers after the final card", () => {
  assert.deepEqual(resumeLockedStory(cards, 0, () => false), { index: 0, phase: "guess" });
  assert.deepEqual(resumeLockedStory(cards, 1, (index) => index === 0), { index: 1, phase: "guess" });
  assert.deepEqual(resumeLockedStory(cards, 2, (index) => index < 2), { index: 2, phase: "guess" });
  assert.deepEqual(resumeLockedStory(cards, 2, (index) => index <= 2), { index: 0, phase: "reveal" });
});
