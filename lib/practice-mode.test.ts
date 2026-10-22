import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gameModeEffects, practiceAttemptInsert, practiceResultPresentation, practiceRoundStorageKey, practiceStoryBreakdown, scoredRoundStorageKey } from "./practice-mode.ts";

test("practice has no stat, badge, server-resume or scored-round effects", () => {
  assert.deepEqual(gameModeEffects("practice"), {
    requiresServerRoundId: false,
    updatesStats: false,
    evaluatesBadges: false,
    persistsServerResume: false
  });
  assert.deepEqual(gameModeEffects("scored"), {
    requiresServerRoundId: true,
    updatesStats: true,
    evaluatesBadges: true,
    persistsServerResume: true
  });
});

test("practice attempt rows have no scored round id and are grouped separately", () => {
  const row = practiceAttemptInsert({
    anonymousId: "00000000-0000-4000-8000-000000000000",
    storyId: "story",
    sourceId: "00000000-0000-4000-8000-000000000001",
    sourceKey: "outlet",
    practiceRoundId: "00000000-0000-4000-8000-000000000002",
    cardPosition: 2,
    guessedLean: "left",
    correctLean: "center"
  });
  assert.equal(row.mode, "practice");
  assert.equal(row.round_id, null);
  assert.equal(row.practice_round_id, "00000000-0000-4000-8000-000000000002");
  assert.equal(row.card_position, 2);
  assert.equal(row.is_correct, false);
  assert.equal("game_total_count" in row, false);
  assert.equal("badge_id" in row, false);
});

test("practice and scored in-progress storage cannot overwrite each other", () => {
  const practice = practiceRoundStorageKey("day2", "user");
  const scored = scoredRoundStorageKey("day2", "user");
  assert.notEqual(practice, scored);
  assert.match(practice, /practice/);
});

test("practice result presentation contains no badge UI", () => {
  const result = practiceResultPresentation();
  assert.equal(result.label, "Practice");
  assert.equal(result.showBadgeUi, false);
  assert.deepEqual(result.actions, ["Practice again", "Done"]);
});

test("practice result groups the existing recap by story", () => {
  const cards = [
    { storyId: "one", headline: "One", correct: true },
    { storyId: "one", headline: "One", correct: false },
    { storyId: "two", headline: "Two", correct: true },
    { storyId: "two", headline: "Two", correct: true }
  ];
  assert.deepEqual(practiceStoryBreakdown(cards, (card) => card.correct), [
    { storyId: "one", headline: "One", correct: 1, total: 2 },
    { storyId: "two", headline: "Two", correct: 2, total: 2 }
  ]);
});

test("migration keeps scored uniqueness partial and permits repeated practice rows", async () => {
  const sql = await readFile(new URL("../supabase/practice-mode.sql", import.meta.url), "utf8");
  assert.match(sql, /update public\.game_attempts\s+set mode = 'scored'/is);
  assert.match(sql, /unique index game_attempts_scored_source_unique[\s\S]*where mode = 'scored'/i);
  assert.doesNotMatch(sql, /unique index[^;]*practice_round_id/i);
});

test("the final round migration stores a required card position", async () => {
  const sql = await readFile(new URL("../supabase/final-lean-round.sql", import.meta.url), "utf8");
  assert.match(sql, /add column if not exists card_position integer/i);
  assert.match(sql, /alter column card_position set not null/i);
  assert.match(sql, /target_card_position integer/i);
});

test("practice save endpoint bypasses stat RPCs and badge evaluation", async () => {
  const source = await readFile(new URL("../app/api/practice-attempts/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /record_game_attempt/i);
  assert.doesNotMatch(source, /evaluateSharpEyeBadge|awardBadge|game_correct_count|game_total_count|streak_count|total_stories_read/);
});

test("all accuracy, resume and badge attempt reads explicitly select scored mode", async () => {
  const attemptRoute = await readFile(new URL("../app/api/game-attempts/route.ts", import.meta.url), "utf8");
  const badges = await readFile(new URL("./badges-server.ts", import.meta.url), "utf8");
  const clientStorage = await readFile(new URL("./client-storage.ts", import.meta.url), "utf8");
  assert.match(attemptRoute, /mode:\s*"eq\.scored"/);
  assert.match(badges, /mode:\s*"eq\.scored"/);
  assert.match(clientStorage, /attempt\.mode !== "practice"/);
  assert.match(clientStorage, /if \(attempt\.mode === "practice"\) return/);
});

test("the game has no manual answer-showing button or redundant second-excerpt note", async () => {
  const source = await readFile(new URL("../components/lean-guessing-game.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Reveal answers|Next reveal|Revealing answers|Outlet revealed/);
  assert.doesNotMatch(source, /From a different outlet than excerpt 1/);
});

test("the game uses swipe directions, removes the repeated label and offers a follow-up result action", async () => {
  const source = await readFile(new URL("../components/lean-guessing-game.tsx", import.meta.url), "utf8");
  assert.match(source, />← Left</);
  assert.match(source, />↑ Center</);
  assert.match(source, />Right →</);
  assert.doesNotMatch(source, /<p className="eyebrow">Spot the lean<\/p>/i);
  assert.match(source, />Another story<\/button>/);
  assert.match(source, />Practice<\/button>/);
  assert.doesNotMatch(source, /Excerpts from this story, each from a different outlet\./);
  assert.match(source, /typeof crypto\.randomUUID === "function"/);
});

test("outlet and correctness details are conditional on the answer phase", async () => {
  const source = await readFile(new URL("../components/lean-guessing-game.tsx", import.meta.url), "utf8");
  assert.match(source, /revealed \? <div className="revealed-outlet"/);
  assert.match(source, /\{revealed && attempt \? <div className="swipe-card-reveal">/);
  assert.match(source, /currentAttempt \? `You picked \$\{titleCase\(currentAttempt\.guessed_lean\)\}`/);
});

test("scored and practice submissions carry card position while scored also carries round id", async () => {
  const [game, clientStorage, scoredRoute, practiceRoute] = await Promise.all([
    readFile(new URL("../components/lean-guessing-game.tsx", import.meta.url), "utf8"),
    readFile(new URL("./client-storage.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/game-attempts/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/practice-attempts/route.ts", import.meta.url), "utf8")
  ]);
  assert.match(game, /card_position: cardPosition/);
  assert.match(game, /roundId: roundId!/);
  assert.match(clientStorage, /round_id: input\.roundId/);
  assert.match(clientStorage, /card_position: input\.cardPosition/);
  assert.match(scoredRoute, /target_card_position: cardPosition/);
  assert.match(practiceRoute, /cardPosition/);
});

test("Explorer and Bullseye use the same unlock celebration component", async () => {
  const [sources, game] = await Promise.all([
    readFile(new URL("../components/tracked-source-link.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/lean-guessing-game.tsx", import.meta.url), "utf8")
  ]);
  assert.match(sources, /<BadgeUnlockCelebration badgeId="explorer"/);
  assert.match(game, /<BadgeUnlockCelebration badgeId="sharp_eye"/);
});
