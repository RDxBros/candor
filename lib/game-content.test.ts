import assert from "node:assert/strict";
import test from "node:test";
import { resolveGameContent } from "./game-content.ts";

test("game content requires every highlighted phrase in the source and explanation", () => {
  const valid = resolveGameContent({
    outlet: "Example Daily",
    sourceExcerpt: "Officials called the plan a costly mandate. A separate sentence follows.",
    keyword: {
      source_name: "Example Daily",
      terms: ["costly mandate"],
      explanation: "The phrase costly mandate frames the plan around its burden."
    }
  });
  assert.equal(valid.ok, true);
  if (valid.ok) assert.equal(valid.gameExcerpt, "Officials called the plan a costly mandate.");

  const invalid = resolveGameContent({
    outlet: "Example Daily",
    sourceExcerpt: "Officials described the plan.",
    keyword: {
      source_name: "Example Daily",
      terms: ["missing phrase"],
      explanation: "The phrase missing phrase emphasizes conflict."
    }
  });
  assert.deepEqual(invalid, { ok: false, issue: "term-missing-from-source" });
});

test("game content rejects obvious outlet leaks", () => {
  const result = resolveGameContent({
    outlet: "Example Daily",
    sourceExcerpt: "Example Daily called it a costly mandate.",
    keyword: {
      source_name: "Example Daily",
      terms: ["costly mandate"],
      explanation: "The phrase costly mandate frames the plan around its burden."
    }
  });
  assert.deepEqual(result, { ok: false, issue: "snippet-leaks-outlet" });
});

test("fallback uses one complete sentence and excludes sentences over 40 words", () => {
  const longSentence = `${Array.from({ length: 40 }, (_, index) => `word${index}`).join(" ")} costly mandate.`;
  const result = resolveGameContent({
    outlet: "Example Daily",
    sourceExcerpt: `${longSentence} Another sentence.`,
    keyword: {
      source_name: "Example Daily",
      terms: ["costly mandate"],
      explanation: "The phrase costly mandate frames the plan around its burden."
    }
  });
  assert.deepEqual(result, { ok: false, issue: "snippet-exceeds-40-words" });
});

test("a manual snippet must be verbatim", () => {
  const result = resolveGameContent({
    outlet: "Example Daily",
    sourceExcerpt: "Officials called the plan a costly mandate.",
    gameSnippet: "Officials paraphrased the costly mandate.",
    keyword: {
      source_name: "Example Daily",
      terms: ["costly mandate"],
      explanation: "The phrase costly mandate frames the plan around its burden."
    }
  });
  assert.deepEqual(result, { ok: false, issue: "snippet-is-not-verbatim" });
});
