import { LEAN_GAME_CONFIG } from "./config.ts";

export function dayNumber(day: string) {
  const match = /^day(\d+)$/i.exec(day);
  return match ? Number(match[1]) : null;
}

export function isAvailableGameDay(day: string, currentDay: string) {
  const candidate = dayNumber(day);
  const current = dayNumber(currentDay);
  return candidate !== null && current !== null ? candidate <= current : day === currentDay;
}

export function isGameStoryEligible(input: {
  category: string;
  leanComparison: boolean;
  gameEligible?: boolean;
  sourceCount: number;
}) {
  return input.category === "news_&_society" && input.leanComparison && input.gameEligible !== false && input.sourceCount === 3;
}

export function qualifyingStoryExcerpts<T>(cards: T[]) {
  return cards.length >= LEAN_GAME_CONFIG.min_excerpts_per_story ? cards : [];
}
