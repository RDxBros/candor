import { NextRequest, NextResponse } from "next/server";
import { evaluateBullseyeBadge } from "../../../../../lib/badges-server";
import { supabaseRequest } from "../../../../../lib/supabase-server";
import { logServerEvent, type AnalyticsContext } from "../../../../../lib/analytics-server";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, body] = await Promise.all([context.params, request.json() as Promise<{ anonymous_id?: string; duration_ms?: number; analytics?: AnalyticsContext }>]);
    const anonymousId = body.anonymous_id ?? "";
    if (!UUID.test(id) || !UUID.test(anonymousId)) return NextResponse.json({ error: "Invalid round" }, { status: 400 });
    const roundQuery = new URLSearchParams({ id: `eq.${id}`, anonymous_id: `eq.${anonymousId}`, game_type: "eq.lean_guess", mode: "eq.scored", select: "id,card_pairs,completed_at" });
    const rounds = await supabaseRequest<Array<{ id: string; card_pairs: unknown[]; completed_at: string | null }>>(`/rest/v1/game_rounds?${roundQuery}`);
    const expectedAnswers = Array.isArray(rounds[0]?.card_pairs) ? rounds[0].card_pairs.length : 0;
    if (!rounds[0] || expectedAnswers < 2) return NextResponse.json({ error: "Scored round not found" }, { status: 404 });
    const attemptQuery = new URLSearchParams({ round_id: `eq.${id}`, game_type: "eq.lean_guess", mode: "eq.scored", select: "id,is_correct" });
    const attempts = await supabaseRequest<Array<{ id: string; is_correct: boolean }>>(`/rest/v1/game_attempts?${attemptQuery}`);
    if (attempts.length < expectedAnswers) {
      return NextResponse.json({ error: "Round answers are not complete" }, { status: 409 });
    }
    await supabaseRequest(`/rest/v1/game_rounds?id=eq.${id}&anonymous_id=eq.${anonymousId}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ completed_at: new Date().toISOString() })
    });
    const result = await evaluateBullseyeBadge(anonymousId, id);
    if (!rounds[0].completed_at) {
      logServerEvent({ anonymousId, eventName: "game_completed", properties: { game_type: "lean_guess", mode: "scored", answers_count: attempts.length, correct_count: attempts.filter((attempt) => attempt.is_correct).length, duration_ms: Math.max(0, Math.min(86_400_000, Math.round(body.duration_ms ?? 0))) }, context: body.analytics });
      if (result.newlyEarned) logServerEvent({ anonymousId, eventName: "badge_earned", properties: { badge_id: result.newlyEarned.badge_id }, context: body.analytics });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Unable to complete game round or award badge:", error);
    return NextResponse.json({ error: "Unable to complete round" }, { status: 500 });
  }
}
