import assert from "node:assert/strict";
import test from "node:test";
import { buildPracticeStoryRound, buildStoryRound, isLeanGameRound } from "./lean-game-rounds.ts";

function cards(storyId: string) {
  return ["left", "center", "right"].map((lean) => ({
    storyId,
    sourceId: `${storyId}-${lean}`,
    outlet: `${storyId} ${lean}`
  }));
}

test("a scored round draws all three usable excerpts from one story", () => {
  const result = buildStoryRound({
    cards: [...cards("one"), ...cards("two"), ...cards("three")],
    playedStoryIds: [],
    userSeed: "user",
    currentDay: "day2"
  });
  assert.equal(result.round.length, 3);
  assert.equal(new Set(result.round.map((card) => card.storyId)).size, 1);
  assert.equal(isLeanGameRound(result.round), true);
});

test("one story with two usable excerpts produces a two-card round", () => {
  const result = buildStoryRound({
    cards: cards("one").slice(0, 2),
    playedStoryIds: [],
    userSeed: "user",
    currentDay: "day1"
  });
  assert.equal(result.round.length, 2);
  assert.equal(isLeanGameRound(result.round), true);
});

test("any existing scored attempt marks the whole story played", () => {
  const result = buildStoryRound({
    cards: [...cards("played"), ...cards("new")],
    playedStoryIds: ["played"],
    userSeed: "user",
    currentDay: "day1"
  });
  assert.deepEqual(new Set(result.round.map((card) => card.storyId)), new Set(["new"]));
});

test("a persisted scored source order reuses every usable excerpt", () => {
  const result = buildStoryRound({
    cards: cards("one"),
    playedStoryIds: [],
    userSeed: "user",
    currentDay: "day1",
    storedOrders: { one: ["one-right", "one-left", "one-center"] }
  });
  assert.deepEqual(result.round.map((card) => card.sourceId), ["one-right", "one-left", "one-center"]);
});

test("practice draws every usable excerpt from one story", () => {
  const result = buildPracticeStoryRound({
    cards: [...cards("played"), ...cards("also-played")],
    previousStoryIds: [],
    random: () => 0.4
  });
  assert.equal(result.round.length, 3);
  assert.equal(new Set(result.round.map((card) => card.storyId)).size, 1);
  assert.equal(isLeanGameRound(result.round), true);
});

test("practice makes a two-card round with one eligible story", () => {
  const result = buildPracticeStoryRound({ cards: cards("one").slice(0, 2), random: () => 0.2 });
  assert.equal(result.round.length, 2);
  assert.equal(new Set(result.round.map((card) => card.sourceId)).size, 2);
});

test("practice avoids immediately previous stories when the pool allows", () => {
  const result = buildPracticeStoryRound({
    cards: [...cards("old-one"), ...cards("old-two"), ...cards("fresh-one"), ...cards("fresh-two")],
    previousStoryIds: ["old-one", "old-two"],
    random: () => 0.5
  });
  assert.equal(result.storyIds.length, 1);
  assert.equal(result.storyIds[0], "fresh-one");
});

test("practice includes the third source when it is usable", () => {
  const result = buildPracticeStoryRound({ cards: cards("one"), random: () => 0.8 });
  assert.equal(result.round.filter((card) => card.storyId === "one").length, 3);
});
