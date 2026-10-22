import { LEAN_GAME_CONFIG } from "./config.ts";

export const BADGE_DEFINITIONS = {
  explorer: {
    id: "explorer",
    name: "Explorer",
    shortDescription: "You've opened sources from the left, center and right.",
    requirementText: "Open at least one Left, Center, and Right source.",
    thresholds: { requiredLeans: ["left", "center", "right"] as const }
  },
  sharp_eye: {
    id: "sharp_eye",
    name: "Bullseye",
    shortDescription: "You got every excerpt right in one scored Spot the Lean round.",
    requirementText: "Get every excerpt right in one scored Spot the Lean round.",
    thresholds: {
      minimumAccuracy: LEAN_GAME_CONFIG.bullseye_min_accuracy,
      minimumAnswers: LEAN_GAME_CONFIG.bullseye_min_answers
    }
  }
} as const;

export type BadgeId = keyof typeof BADGE_DEFINITIONS;
export type Lean = "left" | "center" | "right";

export function explorerProgress(completedLeans: Iterable<string>) {
  const completed = new Set([...completedLeans].map((lean) => lean.toLowerCase()));
  const required = BADGE_DEFINITIONS.explorer.thresholds.requiredLeans;
  return {
    completed: required.filter((lean) => completed.has(lean)),
    remaining: required.filter((lean) => !completed.has(lean)),
    qualifies: required.every((lean) => completed.has(lean))
  };
}

export function bullseyeQualifies(input: { correct: number; total: number; mode: "scored" | "practice" }) {
  const { minimumAccuracy, minimumAnswers } = BADGE_DEFINITIONS.sharp_eye.thresholds;
  return input.mode === "scored" && input.total >= minimumAnswers && input.correct / input.total >= minimumAccuracy;
}

export function isExplorerClickEligible(leanComparison: boolean, lean?: string) {
  return leanComparison && BADGE_DEFINITIONS.explorer.thresholds.requiredLeans.includes(lean?.toLowerCase() as Lean);
}

