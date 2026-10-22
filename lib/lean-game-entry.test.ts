import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { LEAN_GAME_CONFIG } from "./config.ts";

const componentUrl = new URL("../components/lean-game-entry.tsx", import.meta.url);
const stylesUrl = new URL("../app/globals.css", import.meta.url);

test("Spot the Lean entry uses the final title, hook and one primary scored action", async () => {
  const [source, shell] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(new URL("../components/game-entry-shell.tsx", import.meta.url), "utf8")
  ]);
  assert.match(source, /title="Spot the Lean"/);
  assert.match(source, /Read the excerpts, guess the outlet's lean, then see what gave it away\./);
  assert.match(shell, /lean-entry-intro/);
  assert.match(source, /className="primary-button"[^>]*href=\{scoredHref\}>Play</);
  assert.match(source, /Just practicing\? Try an unscored round\./);
  assert.doesNotMatch(source, /Choose how to play|two outlets|game-mode-card|About practice mode|InfoTooltip/);
});

test("entry covers exhausted, empty and how-it-works states", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /You&apos;ve played every scored story/);
  assert.match(source, /Practice rounds don&apos;t count toward stats\./);
  assert.match(source, /No eligible stories yet/);
  assert.match(source, /Read an excerpt/);
  assert.match(source, /Swipe or tap Left, Center or Right/);
  assert.match(source, /See which outlets they were and what gave them away/);
});

test("entry stats wait for five scored Spot the Lean answers", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.equal(LEAN_GAME_CONFIG.stats_min_answers, 5);
  assert.match(source, /game-attempts\?anonymous_id=/);
  assert.match(source, /scoreSummary\.total >= LEAN_GAME_CONFIG\.stats_min_answers/);
});

test("entry actions retain touch-sized targets and visible global focus", async () => {
  const styles = await readFile(stylesUrl, "utf8");
  assert.match(styles, /\.primary-button\s*\{[\s\S]*?min-height:\s*52px/);
  assert.match(styles, /\.lean-practice-link\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(styles, /:focus-visible\s*\{[\s\S]*?outline:/);
});
