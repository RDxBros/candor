import { BADGE_DEFINITIONS, bullseyeQualifies, explorerProgress, type BadgeId } from "./badges";
import { supabaseRequest } from "./supabase-server";

type EarnedBadge = { badge_id: BadgeId; earned_at: string };

export async function awardBadge(anonymousId: string, badgeId: BadgeId) {
  const rows = await supabaseRequest<EarnedBadge[]>("/rest/v1/badges?on_conflict=anonymous_id,badge_id", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({ anonymous_id: anonymousId, badge_id: badgeId })
  });
  return rows[0] ?? null;
}

export async function evaluateExplorerBadge(anonymousId: string) {
  const query = new URLSearchParams({ anonymous_id: `eq.${anonymousId}`, select: "lean" });
  const clicks = await supabaseRequest<Array<{ lean: string }>>(`/rest/v1/source_link_clicks?${query}`);
  const progress = explorerProgress(clicks.map((click) => click.lean));
  const newlyEarned = progress.qualifies ? await awardBadge(anonymousId, "explorer") : null;
  return { progress, newlyEarned };
}

export async function evaluateBullseyeBadge(anonymousId: string, roundId: string) {
  const roundQuery = new URLSearchParams({ id: `eq.${roundId}`, anonymous_id: `eq.${anonymousId}`, game_type: "eq.lean_guess", select: "id,mode,game_type" });
  const rounds = await supabaseRequest<Array<{ id: string; mode: "scored" | "practice"; game_type: string }>>(`/rest/v1/game_rounds?${roundQuery}`);
  if (!rounds[0] || rounds[0].mode !== "scored") return { qualifies: false, newlyEarned: null, correct: 0, total: 0 };

  const attemptQuery = new URLSearchParams({ round_id: `eq.${roundId}`, game_type: "eq.lean_guess", mode: "eq.scored", select: "is_correct" });
  const attempts = await supabaseRequest<Array<{ is_correct: boolean }>>(`/rest/v1/game_attempts?${attemptQuery}`);
  const correct = attempts.filter((attempt) => attempt.is_correct).length;
  const qualifies = bullseyeQualifies({ correct, total: attempts.length, mode: "scored" });
  const newlyEarned = qualifies ? await awardBadge(anonymousId, "sharp_eye") : null;
  return { qualifies, newlyEarned, correct, total: attempts.length };
}

export async function badgeOverview(anonymousId: string) {
  const [badges, clicks] = await Promise.all([
    supabaseRequest<EarnedBadge[]>(`/rest/v1/badges?${new URLSearchParams({ anonymous_id: `eq.${anonymousId}`, select: "badge_id,earned_at" })}`),
    supabaseRequest<Array<{ lean: string }>>(`/rest/v1/source_link_clicks?${new URLSearchParams({ anonymous_id: `eq.${anonymousId}`, select: "lean" })}`)
  ]);
  return { badges, explorer: explorerProgress(clicks.map((click) => click.lean)), definitions: BADGE_DEFINITIONS };
}
