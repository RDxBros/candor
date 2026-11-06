export const PLAY_FEEDBACK_REASONS = ["different_lean", "unrepresentative_excerpt", "other"] as const;
export type PlayFeedbackReason = typeof PLAY_FEEDBACK_REASONS[number];
export type PlayFeedbackLean = "left" | "center" | "right";
export const PLAY_FEEDBACK_LIMIT_PER_HOUR = 12;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEYS = new Set(["round", "excerpt_index", "device_id", "reason", "suggested_lean", "note", "website"]);

export function validatePlayFeedback(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some((key) => !KEYS.has(key)) || body.website !== "") return null;
  if (!Number.isInteger(body.round) || Number(body.round) < 1 || Number(body.round) > 10_000) return null;
  if (!Number.isInteger(body.excerpt_index) || Number(body.excerpt_index) < 0 || Number(body.excerpt_index) > 2) return null;
  if (typeof body.device_id !== "string" || !UUID.test(body.device_id)) return null;
  if (!PLAY_FEEDBACK_REASONS.includes(body.reason as PlayFeedbackReason)) return null;
  if (body.note !== undefined && body.note !== null && typeof body.note !== "string") return null;
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length > 280) return null;
  const suggestedLean = body.suggested_lean ?? null;
  if (body.reason === "different_lean") {
    if (suggestedLean !== "left" && suggestedLean !== "center" && suggestedLean !== "right") return null;
  } else if (suggestedLean !== null) return null;
  return {
    round: body.round as number,
    excerpt_index: body.excerpt_index as number,
    device_id: body.device_id,
    reason: body.reason as PlayFeedbackReason,
    suggested_lean: suggestedLean as PlayFeedbackLean | null,
    note: note || null
  };
}

export function playFeedbackGate(alreadySubmitted: boolean, recentCount: number) {
  if (alreadySubmitted) return "duplicate";
  if (recentCount >= PLAY_FEEDBACK_LIMIT_PER_HOUR) return "rate_limited";
  return "allowed";
}

export function resolvePlayFeedbackCard<T extends { round: number; reviewed_by_human: boolean; cards: Array<{ outlet: string; biasLabel: PlayFeedbackLean }> }>(
  rounds: T[], round: number, excerptIndex: number
) {
  return rounds.find((candidate) => candidate.round === round && candidate.reviewed_by_human)?.cards[excerptIndex] ?? null;
}

export function playFeedbackStorageKey(round: number, excerptIndex: number) {
  return `candor:play:feedback:${round}:${excerptIndex}`;
}

export function outletSlug(outlet: string) {
  return outlet.normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
}
