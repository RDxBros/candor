import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { FACT_OPINION_CONFIG } from "./config.ts";
import { orderedGameCatalog } from "./game-catalog.ts";

test("Fact or Opinion home reuses the shared game shell and configured copy", async () => {
  const source = await readFile(new URL("../components/fact-opinion-entry.tsx", import.meta.url), "utf8");
  assert.equal(FACT_OPINION_CONFIG.title, "Fact or Opinion");
  assert.equal(FACT_OPINION_CONFIG.hook, "Sort each sentence into fact or opinion.");
  assert.match(source, /<GameEntryShell/);
  assert.match(source, /Just practicing\? Try an unscored round\./);
  assert.match(source, /Read a sentence/);
  assert.match(source, /Drag or tap Fact or Opinion/);
  assert.match(source, /Check your answers/);
  assert.doesNotMatch(source, /see what could be checked/);
});

test("picker starts with three stories, adds three and disappears at the end", async () => {
  const source = await readFile(new URL("../components/fact-opinion-entry.tsx", import.meta.url), "utf8");
  assert.equal(FACT_OPINION_CONFIG.picker_page_size, 3);
  assert.match(source, /orderedStories\.slice\(0, visibleCount\)/);
  assert.match(source, /visibleCount < orderedStories\.length \? <button/);
  assert.match(source, /count \+ FACT_OPINION_CONFIG\.picker_page_size/);
  assert.match(source, />Show more<\/button>/);
});

test("played stories remain listed but scored entry switches them to practice", async () => {
  const source = await readFile(new URL("../components/fact-opinion-entry.tsx", import.meta.url), "utf8");
  assert.match(source, /requestedMode === "scored" && storyPlayed\(story\) \? "practice" : requestedMode/);
  assert.match(source, /isPlayed \? <><CheckIcon \/>Played<\/> : "New"/);
});

test("games hub order and labels come from level-based config", async () => {
  const source = await readFile(new URL("../app/game/page.tsx", import.meta.url), "utf8");
  const games = orderedGameCatalog();
  assert.deepEqual(games.map((game) => game.level), [1, 2, 3]);
  assert.match(source, /orderedGameCatalog\(\)\.map/);
  assert.doesNotMatch(source, /<strong>Spot the Lean<\/strong>|<strong>Fact or Opinion<\/strong>/);
});

test("a replayed scored round returns to the story picker instead of reopening an exhausted story", async () => {
  const [game, page, entry] = await Promise.all([
    readFile(new URL("../components/fact-opinion-game.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/fact-or-opinion/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/fact-opinion-entry.tsx", import.meta.url), "utf8")
  ]);
  assert.match(game, /mode === "scored"[\s\S]*router\.push\(pickerHref\("scored"\)\)/);
  assert.match(game, />Choose another story<\/button>/);
  assert.match(game, />All games<\/button>/);
  assert.match(page, /initialPickerMode=\{initialPickerMode\}/);
  assert.match(entry, /useState<PickerMode \| null>\(initialPickerMode \?\? null\)/);
});
