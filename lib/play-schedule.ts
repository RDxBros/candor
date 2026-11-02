import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { cardsForGameStory } from "./lean-game-pool";
import { getStoryEntryByPath } from "./stories";
import { validatePlaySchedule } from "./play-schedule-shared";
export type { PlayRound, PlayScheduleItem } from "./play-schedule-shared";

export async function loadPlaySchedule() {
  const schedulePath = path.join(process.cwd(), "game-content", "daily-lean", "schedule.json");
  const raw = JSON.parse(await fs.readFile(schedulePath, "utf8")) as unknown;
  return validatePlaySchedule(raw, async (storyPath) => {
    const entry = await getStoryEntryByPath(storyPath);
    if (!entry) return null;
    const { cards } = cardsForGameStory(entry, false);
    return { storyId: entry.story.id, headline: entry.story.headline, originalDate: entry.story.date, cards };
  });
}
