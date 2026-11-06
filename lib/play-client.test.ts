import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyPlayAnswer, buildPlayShareText, consecutivePlayStreak, formatPlayCountdown, initialPlayScreen, playResultMarks, playStreakLabel, sanitizePlayRef, type PlayStoredRound } from "./play-client.ts";
import { PLAY_FINAL_ROUND_MESSAGE, PLAY_SCORE_LINES } from "./play-copy.ts";

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

test("result tiles follow excerpt order for every score", () => {
  const correct = ["left", "center", "right"] as const;
  for (const [answers, expected] of [
    [["right", "left", "center"], [false, false, false]],
    [["left", "left", "center"], [true, false, false]],
    [["left", "center", "center"], [true, true, false]],
    [["left", "center", "right"], [true, true, true]]
  ] as const) {
    assert.deepEqual(playResultMarks([...answers], [...correct]), correct.map((lean, index) => ({ lean, correct: expected[index] })));
  }
});

test("result pill says Day 1 on the first round and streak length afterward", () => {
  assert.equal(playStreakLabel(1, 1), "Day 1");
  assert.equal(playStreakLabel(2, 2), "2-day streak");
  assert.equal(playStreakLabel(3, 1), "1-day streak");
});

test("result copy is editable in one constants file for all four scores", () => {
  assert.deepEqual([...PLAY_SCORE_LINES], ["Tricky one.", "They're sneaky.", "Sharp eye.", "Bullseye."]);
  assert.equal(PLAY_FINAL_ROUND_MESSAGE, "New rounds coming soon");
});

test("countdown includes the next round number and ticks to the second", () => {
  const now = Date.UTC(2026, 10, 5, 10, 0, 0);
  assert.equal(formatPlayCountdown(2, now + 3_661_000, now), "Round #2 drops in 01:01:01.");
  assert.equal(formatPlayCountdown(2, now + 3_661_000, now + 1_000), "Round #2 drops in 01:01:00.");
  assert.equal(formatPlayCountdown(2, now, now), "Round #2 drops in 00:00:00.");
});

test("a returning device opens its saved result instead of the landing", () => {
  assert.equal(initialPlayScreen({ answers: [], completed: false, score: 0 }), "landing");
  assert.equal(initialPlayScreen({ answers: ["left"], completed: false, score: 1 }), "round");
  assert.equal(initialPlayScreen({ answers: ["left", "center", "right"], completed: true, score: 2 }), "result");
  const component = readFileSync("app/play/play-client.tsx", "utf8");
  assert.match(component, /if \(stored\.completed\) \{ setScreen\("result"\); return; \}/);
  assert.match(component, /completed \? "See your result" : "Play today’s round"/);
  assert.match(component, /router\.refresh\(\)/);
  assert.match(component, /aria-live="off"/);
  assert.match(readFileSync("app/play/page.tsx", "utf8"), /key=\{selected\?\.round \?\? "coming-soon"\}/);
});

test("explanation says only the player's answer on one line", () => {
  const component = readFileSync("app/play/play-client.tsx", "utf8");
  const styles = readFileSync("app/play/play.module.css", "utf8");
  assert.match(component, /You said \{titleCase\(stored\.answers\[index\]\)\}/);
  assert.doesNotMatch(component, /You chose|This source is|You got it right/);
  assert.match(styles, /\.explanationOutcome \{[^}]*white-space: nowrap/);
});

test("result screen follows the requested reading order", () => {
  const component = readFileSync("app/play/play-client.tsx", "utf8");
  const styles = readFileSync("app/play/play.module.css", "utf8");
  const result = component.slice(component.indexOf("function Result("), component.indexOf("function ComingSoon()"));
  const markers = ["styles.resultHeader", "Round complete", "<h1 aria-live", "styles.resultTile", "styles.resultMarks", "styles.resultBreakdown", "View explanations", "styles.resultShare", "styles.countdown", "styles.fullAppLink"];
  let previous = -1;
  for (const marker of markers) {
    const index = result.indexOf(marker);
    assert.ok(index > previous, `${marker} must follow the previous result element`);
    previous = index;
  }
  assert.doesNotMatch(result, /streakWeek|Streak goes to|Spot the Lean #/);
  assert.match(result, /Round #2 tomorrow\./);
  assert.match(styles, /\.resultMarks span \{[^}]*border: 3px solid var\(--play-ink\)[^}]*background: var\(--play-card\)/);
  for (const lean of ["left", "center", "right"]) {
    assert.match(styles, new RegExp(`\\.resultMarks span\\[data-correct="true"\\]\\[data-lean="${lean}"\\] \\{ background: var\\(--play-${lean}\\)`));
  }
  assert.match(styles, /\.resultIntro h1, \.comingSoon h1 \{ font-family: var\(--font-play\)[^}]*font-weight: 800/);
});

test("play landing uses the concise subtitle and lets the story card grow", () => {
  const component = readFileSync("app/play/play-client.tsx", "utf8");
  const styles = readFileSync("app/play/play.module.css", "utf8");
  assert.match(component, /<p>One story\. Three outlets\.<\/p>/);
  assert.doesNotMatch(component, /Can you tell who leans which way/);
  assert.match(component, /Play today’s round/);
  assert.match(component, />No account needed<\/p>/);
  assert.doesNotMatch(component, /Published \{formatStoryDate/);
  assert.match(styles, /\.cardFan > div[\s\S]*width: fit-content/);
  assert.doesNotMatch(styles, /\.cardFan strong \{[^}]*max-height/);
  assert.match(styles, /\.hero h1 \{[^}]*white-space: nowrap/);
  assert.match(styles, /\.roundIntro h1 \{[^}]*font-family: var\(--font-play\)[^}]*white-space: nowrap/);
  assert.match(styles, /\.candorLink \{[^}]*text-decoration: underline/);
  assert.match(styles, /\.playRoot \{[\s\S]*font-family: var\(--font-play\)/);
  assert.match(styles, /\.landingActions \{[^}]*margin-top: auto/);
  assert.match(styles, /@media \(hover: hover\) and \(pointer: fine\)/);
});
