export const STANDARD_STORY_MINIMUM_MS = 10_000;
export const COMPARISON_STORY_MINIMUM_MS = 15_000;

export function minimumStoryTimeMs(hasWhatsDifferentSection: boolean) {
  return hasWhatsDifferentSection
    ? COMPARISON_STORY_MINIMUM_MS
    : STANDARD_STORY_MINIMUM_MS;
}
