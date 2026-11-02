import type { LeanGameCard } from "./lean-game-pool";

export type PlayScheduleItem = {
  round: number;
  story_path: string;
  reviewed_by_human: boolean;
};

export type PlayRound = PlayScheduleItem & {
  storyId: string;
  headline: string;
  originalDate: string;
  cards: LeanGameCard[];
};

type LoadedStory = Omit<PlayRound, keyof PlayScheduleItem>;
type StoryLoader = (storyPath: string) => Promise<LoadedStory | null>;

function fail(message: string): never {
  throw new Error(`[play-schedule] ${message}`);
}

export async function validatePlaySchedule(raw: unknown, loadStory: StoryLoader): Promise<PlayRound[]> {
  if (!Array.isArray(raw)) fail("schedule.json must contain an array.");
  const seenRounds = new Set<number>();
  const seenStories = new Set<string>();
  const rounds: PlayRound[] = [];

  for (const [index, value] of raw.entries()) {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail(`entry ${index + 1} must be an object.`);
    const entry = value as Record<string, unknown>;
    if (!Number.isInteger(entry.round) || Number(entry.round) < 1) fail(`entry ${index + 1} has an invalid round.`);
    if (typeof entry.story_path !== "string" || !entry.story_path.startsWith("stories/") || !entry.story_path.endsWith(".json")) {
      fail(`round ${entry.round} has an invalid story_path.`);
    }
    if (typeof entry.reviewed_by_human !== "boolean") fail(`round ${entry.round} is missing reviewed_by_human.`);
    const round = Number(entry.round);
    if (seenRounds.has(round)) fail(`duplicate round ${round}.`);
    if (rounds.length && round <= rounds[rounds.length - 1].round) fail(`round ${round} is out of order.`);
    seenRounds.add(round);

    const storyPath = entry.story_path;
    if (seenStories.has(storyPath)) fail(`story ${storyPath} is scheduled more than once.`);
    seenStories.add(storyPath);
    const story = await loadStory(storyPath);
    if (!story) fail(`round ${round} references a missing or malformed story: ${storyPath}.`);
    if (story.cards.length !== 3) fail(`round ${round} must have exactly 3 usable excerpts; found ${story.cards.length}.`);

    rounds.push({ round, story_path: storyPath, reviewed_by_human: entry.reviewed_by_human, ...story });
  }

  return rounds;
}
