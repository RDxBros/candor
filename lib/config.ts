export const FALLBACK_CURRENT_DAY = "day1";

export const FIRST_LAUNCH_CONFIG = {
  tagline: "Gamify your news",
  supportingLine: "Free, no account needed"
} as const;

export const LEAN_GAME_CONFIG = {
  stories_per_round: 1,
  min_excerpts_per_story: 2,
  stats_min_answers: 5,
  bullseye_min_accuracy: 1,
  bullseye_min_answers: 2
} as const;

export const FACT_OPINION_CONFIG = {
  items_per_round: 6,
  stats_min_answers: 12,
  title: "Fact or Opinion",
  hook: "Sort each sentence into fact or opinion.",
  picker_page_size: 3
} as const;

