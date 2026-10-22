import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { eligibleFactOpinionRounds, validateFactOpinionRounds, type FactOpinionStoryOption } from "./fact-opinion-content";
import { getAllStories } from "./stories";

function dayNumber(day: string) {
  const match = /^day(\d+)$/i.exec(day);
  return match ? Number(match[1]) : 0;
}

export async function loadFactOpinionContent(currentDay: string) {
  const allStories = await getAllStories({ requestBound: false });
  const storyIds = new Set(allStories.map(({ story }) => story.id));
  const file = path.join(process.cwd(), "game-content", "fact-opinion.json");
  const raw = JSON.parse(await readFile(file, "utf8")) as unknown;
  const rounds = eligibleFactOpinionRounds(validateFactOpinionRounds(raw, storyIds), currentDay);
  const maximumDay = dayNumber(currentDay);
  const storyByKey = new Map(
    allStories
      .filter(({ day }) => dayNumber(day) <= maximumDay)
      .map(({ day, story }) => [`${day}:${story.id}`, { day, story }] as const)
  );
  const grouped = new Map<string, FactOpinionStoryOption>();
  for (const round of rounds) {
    const match = storyByKey.get(`${round.day}:${round.story_id}`) ??
      [...storyByKey.values()].find(({ story }) => story.id === round.story_id);
    if (!match) throw new Error(`[fact-opinion] ${round.id} references a story unavailable by ${currentDay}: ${round.story_id}`);
    const existing = grouped.get(round.story_id);
    if (existing) existing.roundIds.push(round.id);
    else grouped.set(round.story_id, {
      id: round.story_id,
      headline: match.story.headline,
      category: match.story.category,
      day: match.day,
      roundIds: [round.id]
    });
  }
  return { rounds, stories: [...grouped.values()] };
}

export async function loadFactOpinionRounds(currentDay: string) {
  return (await loadFactOpinionContent(currentDay)).rounds;
}
