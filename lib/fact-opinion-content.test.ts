import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { eligibleFactOpinionRounds, factOpinionRoundsForStory, validateFactOpinionRounds } from "./fact-opinion-content.ts";

async function fixture() {
  return JSON.parse(await readFile(new URL("../test-fixtures/fact-opinion-rounds.json", import.meta.url), "utf8")) as unknown[];
}

test("valid Fact or Opinion fixture has six mixed-answer cards", async () => {
  const rounds = validateFactOpinionRounds(await fixture());
  assert.equal(rounds.length, 1);
  assert.equal(rounds[0].items.length, 6);
  assert.deepEqual(new Set(rounds[0].items.map((item) => item.answer)), new Set(["fact", "opinion"]));
});

test("loader validation rejects wrong count, missing answer class, invalid answers, duplicate ids and missing fields", async () => {
  const [base] = await fixture() as Array<Record<string, unknown>>;
  const items = base.items as Array<Record<string, unknown>>;
  assert.throws(() => validateFactOpinionRounds([{ ...base, items: items.slice(0, 5) }]), /exactly 6/i);
  assert.throws(() => validateFactOpinionRounds([{ ...base, items: items.map((item) => ({ ...item, answer: "fact" })) }]), /at least one fact and one opinion/i);
  assert.throws(() => validateFactOpinionRounds([{ ...base, items: items.map((item, index) => index ? item : { ...item, answer: "maybe" }) }]), /invalid answer/i);
  assert.throws(() => validateFactOpinionRounds([{ ...base, items: items.map((item, index) => index === 1 ? { ...item, id: items[0].id } : item) }]), /duplicate item id/i);
  assert.throws(() => validateFactOpinionRounds([{ ...base, topic: "" }]), /missing topic/i);
  assert.throws(() => validateFactOpinionRounds([{ ...base, story_id: "" }]), /missing story_id/i);
  assert.throws(() => validateFactOpinionRounds([base], new Set(["another_story"])), /unknown story_id/i);
  assert.equal(validateFactOpinionRounds([base], new Set(["fixture_story_001"]))[0].story_id, "fixture_story_001");
});

test("eligible pool excludes unreviewed rounds and days after CURRENT_DAY", async () => {
  const [base] = validateFactOpinionRounds(await fixture());
  const rounds = [
    base,
    { ...base, id: "unreviewed", story_id: "hidden-unreviewed", reviewed_by_human: false },
    { ...base, id: "future", story_id: "hidden-future", day: "day3" }
  ];
  assert.deepEqual(eligibleFactOpinionRounds(rounds, "day2").map((round) => round.id), [base.id]);
  assert.deepEqual([...new Set(eligibleFactOpinionRounds(rounds, "day2").map((round) => round.story_id))], [base.story_id]);
});

test("story selection keeps eligible rounds together and blocks played scored rounds only", async () => {
  const [base] = validateFactOpinionRounds(await fixture());
  const second = { ...base, id: "fixture_round_002" };
  const rounds = [base, second];
  assert.deepEqual(factOpinionRoundsForStory(rounds, base.story_id, "scored", new Set([base.id])).map((round) => round.id), [second.id]);
  assert.deepEqual(factOpinionRoundsForStory(rounds, base.story_id, "practice", new Set([base.id])).map((round) => round.id), [base.id, second.id]);
  assert.deepEqual(factOpinionRoundsForStory(rounds, "missing_story", "practice", new Set()), []);
});
