import type { Lean } from "./lean-game-pool";

export type GameMode = "scored" | "practice";

export function scoredRoundStorageKey(currentDay: string, anonymousId: string) {
  return `candor:lean-round:v2:${currentDay}:${anonymousId}`;
}

export function practiceRoundStorageKey(currentDay: string, anonymousId: string) {
  return `candor:lean-practice-round:v1:${currentDay}:${anonymousId}`;
}

export function previousPracticeStoriesKey(currentDay: string, anonymousId: string) {
  return `candor:lean-practice-previous:v1:${currentDay}:${anonymousId}`;
}

export function gameModeEffects(mode: GameMode) {
  const scored = mode === "scored";
  return {
    requiresServerRoundId: scored,
    updatesStats: scored,
    evaluatesBadges: scored,
    persistsServerResume: scored
  };
}

export function practiceAttemptInsert(input: {
  anonymousId: string;
  storyId: string;
  sourceId: string;
  sourceKey: string;
  practiceRoundId: string;
  cardPosition: number;
  guessedLean: Lean;
  correctLean: Lean;
  inputMethod?: "swipe" | "tap" | "keyboard";
  responseMs?: number;
}) {
  return {
    anonymous_id: input.anonymousId,
    story_id: input.storyId,
    source_id: input.sourceId,
    source_key: input.sourceKey,
    round_id: null,
    practice_round_id: input.practiceRoundId,
    card_position: input.cardPosition,
    mode: "practice" as const,
    game_type: "lean_guess" as const,
    difficulty: null,
    guessed_lean: input.guessedLean,
    correct_lean: input.correctLean,
    is_correct: input.guessedLean === input.correctLean
    ,input_method: input.inputMethod ?? null,
    response_ms: input.responseMs ?? null
  };
}

export function practiceResultPresentation() {
  return {
    label: "Practice",
    note: "Practice rounds don’t count toward your stats.",
    showBadgeUi: false,
    actions: ["Practice again", "Done"] as const
  };
}

export function practiceStoryBreakdown<T extends { storyId: string; headline: string }>(
  cards: T[],
  isCorrect: (card: T) => boolean
) {
  const stories = new Map<string, { storyId: string; headline: string; correct: number; total: number }>();
  for (const card of cards) {
    const current = stories.get(card.storyId) ?? { storyId: card.storyId, headline: card.headline, correct: 0, total: 0 };
    current.total += 1;
    if (isCorrect(card)) current.correct += 1;
    stories.set(card.storyId, current);
  }
  return [...stories.values()];
}
