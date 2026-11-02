import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { resolveGameContent } from "./game-content.ts";
import { validatePlaySchedule } from "./play-schedule-shared.ts";

function fakeStory(cardCount = 3) {
  return {
    storyId: "story-1", headline: "Headline", originalDate: "2026-09-18",
    cards: Array.from({ length: cardCount }, (_, index) => ({ sourceId: `source-${index}` })) as never[]
  };
}

test("schedule validation rejects missing stories, duplicate rounds, and ineligible stories", async () => {
  const base = { round: 1, story_path: "stories/day1/news_&_society/001.json", reviewed_by_human: false };
  await assert.rejects(() => validatePlaySchedule([base], async () => null), /missing or malformed story/);
  await assert.rejects(() => validatePlaySchedule([base, { ...base, story_path: "stories/day1/news_&_society/002.json" }], async () => fakeStory()), /duplicate round/);
  await assert.rejects(() => validatePlaySchedule([base], async () => fakeStory(2)), /exactly 3 usable excerpts/);
});

test("the checked-in schedule resolves to three eligible excerpts per story", async () => {
  const schedule = JSON.parse(await readFile(new URL("../game-content/daily-lean/schedule.json", import.meta.url), "utf8")) as unknown;
  const rounds = await validatePlaySchedule(schedule, async (storyPath) => {
    const inputPath = path.resolve(process.cwd(), storyPath);
    let story: Record<string, unknown>;
    let output: Record<string, unknown>;
    try {
      story = JSON.parse(await readFile(inputPath, "utf8")) as Record<string, unknown>;
      const parsed = path.parse(inputPath);
      output = JSON.parse(await readFile(path.join(parsed.dir, `${parsed.name}_output.json`), "utf8")) as Record<string, unknown>;
    } catch { return null; }
    const generated = (output.generated ?? output) as { keywords?: Array<{ source_name: string; terms?: string[]; explanation?: string }> };
    const sources = Array.isArray(story.sources) ? story.sources as Array<Record<string, unknown>> : [];
    if (story.lean_comparison !== true || story.game_eligible === false || sources.length !== 3 || path.basename(path.dirname(inputPath)) !== "news_&_society") return { ...fakeStory(0), storyId: String(story.id) };
    const cards = sources.flatMap((source) => {
      const keyword = generated.keywords?.find((item) => item.source_name.trim().toLowerCase() === String(source.outlet).trim().toLowerCase());
      const lean = String(source.bias_label).toLowerCase();
      const result = keyword ? resolveGameContent({ keyword, outlet: String(source.outlet), sourceExcerpt: String(source.excerpt), gameSnippet: typeof source.game_snippet === "string" ? source.game_snippet : undefined }) : null;
      return source.source_id && ["left", "center", "right"].includes(lean) && result?.ok ? [{ sourceId: source.source_id }] : [];
    });
    return { storyId: String(story.id), headline: String(story.headline), originalDate: String(story.date), cards: cards as never[] };
  });
  assert.ok(rounds.length > 0);
  assert.ok(rounds.every((round) => round.cards.length === 3));
});
