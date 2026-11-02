import type { Lean } from "./lean-game-pool";

export type PlayStoredRound = {
  answers: Lean[];
  completed: boolean;
  score: number;
  completedAt?: string;
};

export const PLAY_REF_PATTERN = /^[a-z0-9_-]{1,32}$/;

export function sanitizePlayRef(value: string | null | undefined) {
  return value && PLAY_REF_PATTERN.test(value) ? value : "direct";
}

export function playRoundStorageKey(round: number) {
  return `candor:play:round:${round}`;
}

export function normalizeStoredRound(value: unknown): PlayStoredRound | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const answers = Array.isArray(candidate.answers) ? candidate.answers : [];
  if (!answers.every((answer) => answer === "left" || answer === "center" || answer === "right") || answers.length > 3) return null;
  const completed = candidate.completed === true;
  const score = Number(candidate.score);
  if (!Number.isInteger(score) || score < 0 || score > 3 || (completed && answers.length !== 3)) return null;
  return {
    answers: answers as Lean[], completed, score,
    completedAt: typeof candidate.completedAt === "string" ? candidate.completedAt : undefined
  };
}

export function applyPlayAnswer(state: PlayStoredRound, answer: Lean, correctLean: Lean, now = new Date()) {
  if (state.completed || state.answers.length >= 3) return state;
  const answers = [...state.answers, answer];
  const score = state.score + Number(answer === correctLean);
  return answers.length === 3
    ? { answers, score, completed: true, completedAt: now.toISOString() }
    : { answers, score, completed: false };
}

export function buildPlayShareText(round: number, answers: Lean[], correctLeans: Lean[], origin: string) {
  const grid = correctLeans.map((lean, index) => answers[index] === lean ? "⬛" : "⬜").join("");
  const score = correctLeans.reduce((total, lean, index) => total + Number(answers[index] === lean), 0);
  return `Spot the Lean #${round} ${grid} ${score}/3\n${origin.replace(/\/$/, "")}/play?ref=share`;
}

export function consecutivePlayStreak(completedRounds: number[], currentRound: number) {
  const complete = new Set(completedRounds);
  let streak = 0;
  for (let round = currentRound; round >= 1 && complete.has(round); round -= 1) streak += 1;
  return streak;
}

export function daysBetween(firstIsoDate: string, currentIsoDate: string) {
  const first = Date.parse(`${firstIsoDate}T00:00:00Z`);
  const current = Date.parse(`${currentIsoDate}T00:00:00Z`);
  if (!Number.isFinite(first) || !Number.isFinite(current)) return 0;
  return Math.max(0, Math.floor((current - first) / 86_400_000));
}
