import { LEAN_GAME_CONFIG } from "./config.ts";

export type StoryRoundCard = {
  storyId: string;
  sourceId: string;
  outlet: string;
};

export type StoredSourceOrders = Record<string, string[]>;

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  }
  return result >>> 0;
}

function shuffled<T>(items: T[], seed: number) {
  const copy = [...items];
  let state = seed || 1;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const target = state % (index + 1);
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function randomlyShuffled<T>(items: T[], random: () => number) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function validStoredSelection<T extends StoryRoundCard>(cards: T[], sourceIds: string[] | undefined) {
  if (!sourceIds || sourceIds.length !== cards.length || new Set(sourceIds).size !== sourceIds.length) return null;
  const byId = new Map(cards.map((card) => [card.sourceId, card]));
  const selection = sourceIds.flatMap((sourceId) => byId.get(sourceId) ?? []);
  return selection.length === cards.length && new Set(selection.map((card) => card.outlet.trim().toLowerCase())).size === cards.length
    ? selection
    : null;
}

export function isLeanGameRound(cards: StoryRoundCard[]) {
  if (cards.length < LEAN_GAME_CONFIG.min_excerpts_per_story || cards.length > 3 * LEAN_GAME_CONFIG.stories_per_round) return false;
  const groups = new Map<string, StoryRoundCard[]>();
  for (const card of cards) groups.set(card.storyId, [...(groups.get(card.storyId) ?? []), card]);
  if (groups.size !== LEAN_GAME_CONFIG.stories_per_round) return false;
  return [...groups.values()].every((group) => (group.length === 2 || group.length === 3) &&
    new Set(group.map((card) => card.sourceId)).size === group.length &&
    new Set(group.map((card) => card.outlet.trim().toLowerCase())).size === group.length);
}

export function roundUsesEveryAvailableExcerpt(round: StoryRoundCard[], pool: StoryRoundCard[]) {
  if (!isLeanGameRound(round)) return false;
  const availableByStory = new Map<string, Set<string>>();
  for (const card of pool) availableByStory.set(card.storyId, new Set([...(availableByStory.get(card.storyId) ?? []), card.sourceId]));
  const roundByStory = new Map<string, Set<string>>();
  for (const card of round) roundByStory.set(card.storyId, new Set([...(roundByStory.get(card.storyId) ?? []), card.sourceId]));
  return [...roundByStory].every(([storyId, sourceIds]) => {
    const available = availableByStory.get(storyId);
    return Boolean(available && available.size === sourceIds.size && [...sourceIds].every((sourceId) => available.has(sourceId)));
  });
}

export function buildStoryRound<T extends StoryRoundCard>(input: {
  cards: T[];
  playedStoryIds: Iterable<string>;
  userSeed: string;
  currentDay: string;
  preferredStoryId?: string;
  storedOrders?: StoredSourceOrders;
}) {
  const played = new Set(input.playedStoryIds);
  const groups = new Map<string, T[]>();
  for (const card of input.cards) {
    if (played.has(card.storyId)) continue;
    groups.set(card.storyId, [...(groups.get(card.storyId) ?? []), card]);
  }

  let eligible = [...groups.entries()].filter(([, storyCards]) =>
    storyCards.length >= 2 && new Set(storyCards.map((card) => card.outlet.trim().toLowerCase())).size >= 2);
  eligible = shuffled(eligible, hash(`${input.userSeed}:${input.currentDay}:story-round`));
  if (input.preferredStoryId) {
    const preferredIndex = eligible.findIndex(([storyId]) => storyId === input.preferredStoryId);
    if (preferredIndex > 0) eligible.unshift(...eligible.splice(preferredIndex, 1));
  }

  const selectedOrders: StoredSourceOrders = {};
  const round = eligible.slice(0, LEAN_GAME_CONFIG.stories_per_round).flatMap(([storyId, storyCards]) => {
    const stored = validStoredSelection(storyCards, input.storedOrders?.[storyId]);
    const selection = stored ?? shuffled(storyCards, hash(`${input.userSeed}:${storyId}:source-order`));
    selectedOrders[storyId] = selection.map((card) => card.sourceId);
    return selection;
  });

  return { round, selectedOrders };
}

export function buildPracticeStoryRound<T extends StoryRoundCard>(input: {
  cards: T[];
  previousStoryIds?: Iterable<string>;
  random?: () => number;
}) {
  const random = input.random ?? Math.random;
  const previous = new Set(input.previousStoryIds ?? []);
  const groups = new Map<string, T[]>();
  for (const card of input.cards) groups.set(card.storyId, [...(groups.get(card.storyId) ?? []), card]);

  const eligible = [...groups.entries()].filter(([, storyCards]) =>
    storyCards.length >= 2 &&
    new Set(storyCards.map((card) => card.sourceId)).size >= 2 &&
    new Set(storyCards.map((card) => card.outlet.trim().toLowerCase())).size >= 2);
  const desiredStories = Math.min(LEAN_GAME_CONFIG.stories_per_round, eligible.length);
  const fresh = randomlyShuffled(eligible.filter(([storyId]) => !previous.has(storyId)), random);
  const recent = randomlyShuffled(eligible.filter(([storyId]) => previous.has(storyId)), random);
  const selected = [...fresh, ...recent].slice(0, desiredStories);

  const round = selected.flatMap(([, storyCards]) => randomlyShuffled(storyCards, random));
  return { round, storyIds: selected.map(([storyId]) => storyId) };
}

