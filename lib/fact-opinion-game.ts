import type { FactOpinionAnswer, FactOpinionRound, FactOpinionStoryOption } from "./fact-opinion-content.ts";

export type FactOpinionPlacements = Record<string, FactOpinionAnswer | null>;

export function emptyPlacements(round: FactOpinionRound): FactOpinionPlacements {
  return Object.fromEntries(round.items.map((item) => [item.id, null]));
}

export function placeFactOpinionCard(placements: FactOpinionPlacements, itemId: string, destination: FactOpinionAnswer | null, locked = false) {
  if (locked || !(itemId in placements)) return placements;
  return { ...placements, [itemId]: destination };
}

export function factOpinionCanCheck(round: FactOpinionRound, placements: FactOpinionPlacements) {
  return round.items.every((item) => placements[item.id] === "fact" || placements[item.id] === "opinion");
}

export function scoreFactOpinionRound(round: FactOpinionRound, placements: FactOpinionPlacements) {
  return round.items.reduce((total, item) => total + (placements[item.id] === item.answer ? 1 : 0), 0);
}

export function orderedFactOpinionStories(stories: FactOpinionStoryOption[], playedRoundIds: ReadonlySet<string>) {
  return [...stories].sort((left, right) => {
    const leftPlayed = left.roundIds.every((roundId) => playedRoundIds.has(roundId));
    const rightPlayed = right.roundIds.every((roundId) => playedRoundIds.has(roundId));
    return Number(leftPlayed) - Number(rightPlayed);
  });
}

export function orderedFactOpinionResults(round: FactOpinionRound, placements: FactOpinionPlacements, order: string[]) {
  const answers = new Map(round.items.map((item) => [item.id, item.answer]));
  return [...order].sort((left, right) => Number(placements[left] === answers.get(left)) - Number(placements[right] === answers.get(right)));
}

export function factOpinionScoredStorageKey(day: string, anonymousId: string, storyId = "any") {
  return `candor:fact-opinion:scored:${day}:${anonymousId}:${storyId}`;
}

export function factOpinionPracticeStorageKey(day: string, anonymousId: string, storyId = "any") {
  return `candor:fact-opinion:practice:${day}:${anonymousId}:${storyId}`;
}

export function factOpinionAttemptRows(input: {
  anonymousId: string;
  round: FactOpinionRound;
  order: string[];
  placements: FactOpinionPlacements;
  mode: "scored" | "practice";
  roundId: string | null;
  practiceRoundId: string | null;
  attemptMeta?: Record<string, { input_method: "tap" | "drag" | "keyboard"; response_ms: number }>;
}) {
  const itemMap = new Map(input.round.items.map((item) => [item.id, item]));
  return input.order.map((contentId, index) => {
    const item = itemMap.get(contentId);
    const placement = input.placements[contentId];
    if (!item || (placement !== "fact" && placement !== "opinion")) throw new Error("Fact or Opinion round is incomplete");
    return {
      anonymous_id: input.anonymousId,
      story_id: null,
      source_id: null,
      source_key: null,
      content_id: item.id,
      content_round_id: input.round.id,
      round_id: input.mode === "scored" ? input.roundId : null,
      practice_round_id: input.mode === "practice" ? input.practiceRoundId : null,
      card_position: index + 1,
      mode: input.mode,
      game_type: "fact_opinion",
      difficulty: null,
      guessed_lean: null,
      correct_lean: null,
      placement,
      correct_answer: item.answer,
      is_correct: placement === item.answer
      ,input_method: input.attemptMeta?.[item.id]?.input_method ?? null,
      response_ms: input.attemptMeta?.[item.id]?.response_ms ?? null
    };
  });
}
