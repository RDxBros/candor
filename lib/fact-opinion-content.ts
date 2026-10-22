import { FACT_OPINION_CONFIG } from "./config.ts";

export type FactOpinionAnswer = "fact" | "opinion";

export type FactOpinionItem = {
  id: string;
  text: string;
  answer: FactOpinionAnswer;
  explanation: string;
  story_id?: string;
};

export type FactOpinionRound = {
  id: string;
  story_id: string;
  topic: string;
  category: string;
  day: string;
  reviewed_by_human: boolean;
  items: FactOpinionItem[];
};

export type FactOpinionStoryOption = {
  id: string;
  headline: string;
  category: string;
  day: string;
  roundIds: string[];
};

function requiredText(value: unknown, field: string, owner: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`[fact-opinion] ${owner} is missing ${field}`);
  return value.trim();
}

function dayNumber(day: string) {
  const match = /^day(\d+)$/i.exec(day);
  if (!match) throw new Error(`[fact-opinion] Invalid day: ${day}`);
  return Number(match[1]);
}

export function validateFactOpinionRounds(value: unknown, existingStoryIds?: ReadonlySet<string>): FactOpinionRound[] {
  if (!Array.isArray(value)) throw new Error("[fact-opinion] Content must be an array of rounds");
  const roundIds = new Set<string>();
  const itemIds = new Set<string>();

  return value.map((candidate, roundIndex) => {
    if (!candidate || typeof candidate !== "object") throw new Error(`[fact-opinion] Round ${roundIndex + 1} must be an object`);
    const raw = candidate as Record<string, unknown>;
    const id = requiredText(raw.id, "id", `round ${roundIndex + 1}`);
    if (roundIds.has(id)) throw new Error(`[fact-opinion] Duplicate round id: ${id}`);
    roundIds.add(id);
    const storyId = requiredText(raw.story_id, "story_id", id);
    if (existingStoryIds && !existingStoryIds.has(storyId)) {
      throw new Error(`[fact-opinion] ${id} references unknown story_id: ${storyId}`);
    }
    const topic = requiredText(raw.topic, "topic", id);
    const category = requiredText(raw.category, "category", id);
    const day = requiredText(raw.day, "day", id);
    dayNumber(day);
    if (typeof raw.reviewed_by_human !== "boolean") throw new Error(`[fact-opinion] ${id} is missing reviewed_by_human`);
    if (!Array.isArray(raw.items) || raw.items.length !== FACT_OPINION_CONFIG.items_per_round) {
      throw new Error(`[fact-opinion] ${id} must contain exactly ${FACT_OPINION_CONFIG.items_per_round} items`);
    }

    const items = raw.items.map((candidateItem, itemIndex) => {
      if (!candidateItem || typeof candidateItem !== "object") throw new Error(`[fact-opinion] ${id} item ${itemIndex + 1} must be an object`);
      const item = candidateItem as Record<string, unknown>;
      const itemId = requiredText(item.id, "id", `${id} item ${itemIndex + 1}`);
      if (itemIds.has(itemId)) throw new Error(`[fact-opinion] Duplicate item id: ${itemId}`);
      itemIds.add(itemId);
      const text = requiredText(item.text, "text", itemId);
      if (text.split(/\s+/).length > 25) throw new Error(`[fact-opinion] ${itemId} exceeds 25 words`);
      const answer = requiredText(item.answer, "answer", itemId);
      if (answer !== "fact" && answer !== "opinion") throw new Error(`[fact-opinion] ${itemId} has invalid answer: ${answer}`);
      const explanation = requiredText(item.explanation, "explanation", itemId);
      const storyId = item.story_id === undefined ? undefined : requiredText(item.story_id, "story_id", itemId);
      return { id: itemId, text, answer, explanation, ...(storyId ? { story_id: storyId } : {}) } as FactOpinionItem;
    });

    const answers = new Set(items.map((item) => item.answer));
    if (!answers.has("fact") || !answers.has("opinion")) throw new Error(`[fact-opinion] ${id} must include at least one fact and one opinion`);
    return { id, story_id: storyId, topic, category, day, reviewed_by_human: raw.reviewed_by_human, items };
  });
}

export function eligibleFactOpinionRounds(rounds: FactOpinionRound[], currentDay: string) {
  const maximumDay = dayNumber(currentDay);
  return rounds.filter((round) => round.reviewed_by_human && dayNumber(round.day) <= maximumDay);
}

export function shuffledFactOpinionItems<T>(items: T[], random = Math.random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

export function factOpinionRoundsForStory(
  rounds: FactOpinionRound[],
  storyId: string,
  mode: "scored" | "practice",
  playedRoundIds: ReadonlySet<string>
) {
  return rounds.filter((round) => round.story_id === storyId && (mode === "practice" || !playedRoundIds.has(round.id)));
}
