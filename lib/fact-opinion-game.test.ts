import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateFactOpinionRounds } from "./fact-opinion-content.ts";
import {
  emptyPlacements,
  factOpinionAttemptRows,
  factOpinionCanCheck,
  factOpinionPracticeStorageKey,
  factOpinionScoredStorageKey,
  orderedFactOpinionResults,
  orderedFactOpinionStories,
  placeFactOpinionCard,
  scoreFactOpinionRound
} from "./fact-opinion-game.ts";

async function round() {
  const raw = JSON.parse(await readFile(new URL("../test-fixtures/fact-opinion-rounds.json", import.meta.url), "utf8"));
  return validateFactOpinionRounds(raw)[0];
}

test("Check stays unavailable until all six cards are placed and placements remain movable before lock", async () => {
  const content = await round();
  let placements = emptyPlacements(content);
  assert.equal(factOpinionCanCheck(content, placements), false);
  placements = placeFactOpinionCard(placements, content.items[0].id, "fact");
  placements = placeFactOpinionCard(placements, content.items[0].id, "opinion");
  assert.equal(placements[content.items[0].id], "opinion");
  for (const item of content.items) placements = placeFactOpinionCard(placements, item.id, item.answer);
  assert.equal(factOpinionCanCheck(content, placements), true);
  assert.equal(scoreFactOpinionRound(content, placements), 6);
  assert.equal(placeFactOpinionCard(placements, content.items[0].id, "opinion", true), placements);
});

test("drag and tap use the same placement transition", async () => {
  const content = await round();
  const initial = emptyPlacements(content);
  const id = content.items[0].id;
  const dragged = placeFactOpinionCard(initial, id, "fact");
  const tapped = placeFactOpinionCard(initial, id, "fact");
  assert.deepEqual(dragged, tapped);
});

test("scored and practice storage are isolated, and attempt rows carry the proper ids", async () => {
  const content = await round();
  const placements = Object.fromEntries(content.items.map((item) => [item.id, item.answer]));
  const order = content.items.map((item) => item.id);
  assert.notEqual(factOpinionScoredStorageKey("day1", "user"), factOpinionPracticeStorageKey("day1", "user"));
  assert.notEqual(factOpinionScoredStorageKey("day1", "user", "story-a"), factOpinionScoredStorageKey("day1", "user", "story-b"));
  const scored = factOpinionAttemptRows({ anonymousId: "user", round: content, order, placements, mode: "scored", roundId: "server", practiceRoundId: null });
  const practice = factOpinionAttemptRows({ anonymousId: "user", round: content, order, placements, mode: "practice", roundId: null, practiceRoundId: "practice" });
  assert.ok(scored.every((row) => row.round_id === "server" && row.practice_round_id === null && row.game_type === "fact_opinion"));
  assert.ok(scored.every((row) => row.story_id === null));
  assert.ok(practice.every((row) => row.round_id === null && row.practice_round_id === "practice"));
  assert.ok(scored.every((row) => !("game_total_count" in row) && !("game_correct_count" in row)));
});

test("Fact or Opinion migration isolates counters and scored uniqueness while keeping Spot the Lean increments", async () => {
  const sql = await readFile(new URL("../supabase/fact-or-opinion.sql", import.meta.url), "utf8");
  assert.match(sql, /where mode = 'scored' and content_id is not null/i);
  assert.match(sql, /if target_mode = 'scored' and target_game_type = 'lean_guess' then[\s\S]*game_total_count = game_total_count \+ 1/i);
  assert.doesNotMatch(sql, /target_game_type = 'fact_opinion'[\s\S]{0,200}game_total_count/i);
  assert.match(sql, /comment on column public\.users\.game_correct_count is 'Spot the Lean/i);
});

test("Fact or Opinion APIs filter scored accuracy and bypass shared counters and badge evaluation", async () => {
  const [attempts, rounds, badges] = await Promise.all([
    readFile(new URL("../app/api/fact-opinion/attempts/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/fact-opinion/rounds/route.ts", import.meta.url), "utf8"),
    readFile(new URL("./badges-server.ts", import.meta.url), "utf8")
  ]);
  assert.match(attempts, /game_type:\s*"eq\.fact_opinion"/);
  assert.match(attempts, /mode:\s*"eq\.scored"/);
  assert.doesNotMatch(attempts, /game_correct_count|game_total_count|evaluateBullseyeBadge|awardBadge|record_game_attempt_v2/);
  assert.match(rounds, /game_type:\s*"fact_opinion"/);
  assert.match(badges, /game_type:\s*"eq\.lean_guess"/);
});

test("component keeps feedback behind Check, restores state and includes reduced-motion styling", async () => {
  const [component, styles] = await Promise.all([
    readFile(new URL("../components/fact-opinion-game.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8")
  ]);
  assert.match(component, /!locked \? <div className="fact-opinion-play-layout" data-complete=/);
  assert.match(component, /expanded \? <div className="fact-opinion-result-detail"/);
  assert.match(component, /disabled=!canCheck|disabled=\{!canCheck/);
  assert.match(component, /localStorage : sessionStorage/);
  assert.match(component, /setPlacements\(restored\.placements\)/);
  assert.match(component, /setSelectedId\(restored\.selectedId\)/);
  assert.doesNotMatch(component, /3 of each|facts remaining|opinions remaining/i);
  assert.match(styles, /\.fact-opinion-card[\s\S]*touch-action: none/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.fact-opinion-card/);
});

test("picker orders unplayed stories first and exposes three at a time", () => {
  const stories = [
    { id: "played", headline: "Played", category: "sports_&_gaming", day: "day1", roundIds: ["round-played"] },
    { id: "new-a", headline: "New A", category: "technology", day: "day1", roundIds: ["round-a"] },
    { id: "new-b", headline: "New B", category: "technology", day: "day1", roundIds: ["round-b"] },
    { id: "new-c", headline: "New C", category: "technology", day: "day1", roundIds: ["round-c"] }
  ];
  const ordered = orderedFactOpinionStories(stories, new Set(["round-played"]));
  assert.deepEqual(ordered.slice(0, 3).map((story) => story.id), ["new-a", "new-b", "new-c"]);
  assert.equal(ordered.at(-1)?.id, "played");
});

test("result ordering puts wrong cards before correct cards", async () => {
  const content = await round();
  const placements = Object.fromEntries(content.items.map((item, index) => [item.id, index < 2 ? (item.answer === "fact" ? "opinion" : "fact") : item.answer]));
  const ordered = orderedFactOpinionResults(content, placements, content.items.map((item) => item.id));
  assert.deepEqual(ordered.slice(0, 2), content.items.slice(0, 2).map((item) => item.id));
});

test("placed-chip actions stay separate and reveal no correctness before Check", async () => {
  const component = await readFile(new URL("../components/fact-opinion-game.tsx", import.meta.url), "utf8");
  assert.match(component, /aria-label=\{`Move back to tray: \$\{item\.text\}`\}/);
  assert.match(component, /aria-label="View full sentence"/);
  assert.match(component, /\{!expanded && truncated \? <button/);
  assert.match(component, /onClick=\{onReturn\}/);
  assert.match(component, /onClick=\{\(\) => bodyRef\.current && onView\(bodyRef\.current\)\}/);
  assert.doesNotMatch(component.slice(component.indexOf("function PlacedCardChip"), component.indexOf("function SentenceSheet")), /is_correct|correct_answer|explanation/);
});

test("compact list shrinks in original order and the complete state grows the boxes without overlap", async () => {
  const [component, styles] = await Promise.all([
    readFile(new URL("../components/fact-opinion-game.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8")
  ]);
  const content = await round();
  const order = content.items.map((item) => item.id);
  let placements = emptyPlacements(content);
  assert.deepEqual(order.filter((id) => placements[id] == null), order);
  placements = placeFactOpinionCard(placements, order[2], "fact");
  placements = placeFactOpinionCard(placements, order[4], "opinion");
  assert.deepEqual(order.filter((id) => placements[id] == null), [order[0], order[1], order[3], order[5]]);
  placements = placeFactOpinionCard(placements, order[2], null);
  assert.deepEqual(order.filter((id) => placements[id] == null), [order[0], order[1], order[2], order[3], order[5]]);

  assert.match(styles, /\.fact-opinion-round-screen\s*\{[\s\S]*height:\s*100svh[\s\S]*height:\s*100dvh[\s\S]*overflow:\s*hidden/);
  assert.match(component, /data-complete=\{unplacedIds\.length === 0\}/);
  assert.match(component, /\{unplacedIds\.map\(\(id\) =>/);
  assert.doesNotMatch(component, /fact-opinion-card-selected-label|<h1 id="fact-opinion-round-title"/);
  assert.doesNotMatch(component, /Can be checked against a record|A judgment or a prediction/);
  assert.match(component, /expanded=\{unplacedIds\.length === 0\}/);
  assert.match(styles, /\.fact-opinion-play-layout\s*\{[\s\S]*height:\s*100%[\s\S]*flex-direction:\s*column[\s\S]*gap:\s*8px/);
  assert.match(styles, /\.fact-opinion-card-list\s*\{[\s\S]*grid-auto-rows:\s*max-content[\s\S]*gap:\s*8px[\s\S]*overflow-y:\s*auto/);
  assert.doesNotMatch(styles, /\.fact-opinion-card-list:has\([\s\S]*overflow:\s*visible/);
  assert.match(styles, /\.fact-opinion-active-area\s*\{[\s\S]*overflow:\s*hidden[\s\S]*isolation:\s*isolate/);
  assert.match(component, /className="fact-opinion-drag-overlay"/);
  assert.match(styles, /\.fact-opinion-drag-overlay\s*\{[\s\S]*position:\s*fixed[\s\S]*pointer-events:\s*none/);
  assert.doesNotMatch(styles, /\.fact-opinion-play-layout\s*\{[\s\S]*max-height:\s*640px/);
  assert.match(styles, /\.fact-opinion-list-card\s*\{[\s\S]*height:\s*auto[\s\S]*padding:\s*12px[\s\S]*font-size:\s*max\(1rem, 16px\)[\s\S]*overflow-wrap:\s*anywhere/);
  assert.match(styles, /\.fact-opinion-bins\s*\{[\s\S]*height:\s*clamp\(140px, 30dvh, 260px\)[\s\S]*min-height:\s*140px[\s\S]*max-height:\s*260px/);
  assert.match(styles, /\.fact-opinion-bin\s*\{[\s\S]*border:\s*1px solid var\(--ink\)/);
  assert.match(styles, /\.fact-opinion-play-layout\[data-complete="true"\] \.fact-opinion-active-area\s*\{[\s\S]*flex:\s*0 0 auto/);
  assert.match(styles, /\.fact-opinion-play-layout\[data-complete="true"\] \.fact-opinion-bins\s*\{[\s\S]*flex:\s*1 1 auto/);
  assert.match(styles, /\.fact-opinion-chip-list\s*\{[\s\S]*gap:\s*8px[\s\S]*overflow-y:\s*auto/);
  assert.match(styles, /\.fact-opinion-chip-body span\s*\{[\s\S]*-webkit-line-clamp:\s*3/);
  assert.match(styles, /\.fact-opinion-placed-chip\[data-full="true"\] \.fact-opinion-chip-body span\s*\{[\s\S]*-webkit-line-clamp:\s*unset/);
  assert.match(styles, /\.fact-opinion-chip-view\s*\{[\s\S]*width:\s*44px/);
  assert.match(styles, /\.fact-opinion-result-chevron\s*\{[\s\S]*place-items:\s*center[\s\S]*align-self:\s*center/);
  assert.match(styles, /\.fact-opinion-result-actions\s*\{[\s\S]*grid-template-columns:/);
});
