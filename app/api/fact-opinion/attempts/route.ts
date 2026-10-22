import { NextRequest, NextResponse } from "next/server";
import { loadFactOpinionRounds } from "../../../../lib/fact-opinion-content-server";
import { factOpinionAttemptRows, type FactOpinionPlacements } from "../../../../lib/fact-opinion-game";
import { isSupabaseConfigured, supabaseRequest } from "../../../../lib/supabase-server";
import { logServerEvent, type AnalyticsContext } from "../../../../lib/analytics-server";
import { resolveContentDay } from "../../../../lib/content-day";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type StoredAttempt = {
  id: string;
  content_id: string;
  content_round_id: string;
  round_id: string | null;
  practice_round_id: string | null;
  card_position: number;
  placement: "fact" | "opinion";
  correct_answer: "fact" | "opinion";
  is_correct: boolean;
};

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "The game is temporarily unavailable. Please try again later." }, { status: 503 });
  const anonymousId = request.nextUrl.searchParams.get("anonymous_id") ?? "";
  if (!UUID.test(anonymousId)) return NextResponse.json({ error: "Valid user identifier required" }, { status: 400 });
  try {
    const query = new URLSearchParams({
      anonymous_id: `eq.${anonymousId}`,
      game_type: "eq.fact_opinion",
      mode: "eq.scored",
      select: "id,content_id,content_round_id,round_id,practice_round_id,card_position,placement,correct_answer,is_correct,created_at",
      order: "created_at.asc"
    });
    const attempts = await supabaseRequest<StoredAttempt[]>(`/rest/v1/game_attempts?${query}`);
    return NextResponse.json({ attempts }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to load Fact or Opinion attempts:", error);
    return NextResponse.json({ error: "Unable to load progress" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "The game is temporarily unavailable. Please try again later." }, { status: 503 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const anonymousId = typeof body.anonymous_id === "string" ? body.anonymous_id : "";
    const currentDay = await resolveContentDay(typeof body.current_day === "string" ? body.current_day : undefined);
    const contentRoundId = typeof body.content_round_id === "string" ? body.content_round_id : "";
    const mode = body.mode === "practice" ? "practice" : body.mode === "scored" ? "scored" : null;
    const roundId = typeof body.round_id === "string" ? body.round_id : null;
    const practiceRoundId = typeof body.practice_round_id === "string" ? body.practice_round_id : null;
    const order = Array.isArray(body.item_order) ? body.item_order.filter((item): item is string => typeof item === "string") : [];
    const placements = body.placements && typeof body.placements === "object" ? body.placements as FactOpinionPlacements : {};
    const attemptMeta = body.attempt_meta && typeof body.attempt_meta === "object" ? body.attempt_meta as Record<string, { input_method: "tap" | "drag" | "keyboard"; response_ms: number }> : {};
    const analytics = body.analytics && typeof body.analytics === "object" ? body.analytics as AnalyticsContext : undefined;
    const durationMs = typeof body.duration_ms === "number" ? Math.max(0, Math.min(86_400_000, Math.round(body.duration_ms))) : 0;
    const moves = typeof body.moves === "number" ? Math.max(0, Math.min(10_000, Math.round(body.moves))) : 0;
    if (!UUID.test(anonymousId) || !contentRoundId || !mode ||
      (mode === "scored" && !UUID.test(roundId ?? "")) || (mode === "practice" && !UUID.test(practiceRoundId ?? ""))) {
      return NextResponse.json({ error: "Invalid attempt batch" }, { status: 400 });
    }
    const rounds = await loadFactOpinionRounds(currentDay);
    const round = rounds.find((candidate) => candidate.id === contentRoundId);
    if (!round || order.length !== round.items.length || new Set(order).size !== order.length ||
      order.some((id) => !round.items.some((item) => item.id === id))) {
      return NextResponse.json({ error: "Ineligible content round" }, { status: 400 });
    }
    if (mode === "scored") {
      const query = new URLSearchParams({ id: `eq.${roundId}`, anonymous_id: `eq.${anonymousId}`, game_type: "eq.fact_opinion", mode: "eq.scored", select: "card_pairs" });
      const serverRounds = await supabaseRequest<Array<{ card_pairs: Array<{ content_round_id: string; content_id: string }> }>>(`/rest/v1/game_rounds?${query}`);
      const savedOrder = serverRounds[0]?.card_pairs ?? [];
      if (savedOrder.length !== order.length || savedOrder.some((entry, index) => entry.content_round_id !== contentRoundId || entry.content_id !== order[index])) {
        return NextResponse.json({ error: "Attempts do not belong to this server-issued round" }, { status: 400 });
      }
    }
    await supabaseRequest("/rest/v1/users?on_conflict=anonymous_id", {
      method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ anonymous_id: anonymousId })
    });
    if (Object.values(attemptMeta).some((value) => !value || !["tap", "drag", "keyboard"].includes(value.input_method) || !Number.isInteger(value.response_ms) || value.response_ms < 0 || value.response_ms > 300000)) {
      return NextResponse.json({ error: "Invalid attempt timing" }, { status: 400 });
    }
    const rows = factOpinionAttemptRows({ anonymousId, round, order, placements, mode, roundId, practiceRoundId, attemptMeta });
    let inserted: StoredAttempt[] = [];
    let firstCompletion = true;
    if (mode === "scored") {
      const existingQuery = new URLSearchParams({
        anonymous_id: `eq.${anonymousId}`, game_type: "eq.fact_opinion", mode: "eq.scored",
        content_id: `in.(${order.join(",")})`, select: "content_id"
      });
      const existing = await supabaseRequest<Array<{ content_id: string }>>(`/rest/v1/game_attempts?${existingQuery}`);
      const existingIds = new Set(existing.map((attempt) => attempt.content_id));
      firstCompletion = existingIds.size === 0;
      const missing = rows.filter((row) => !existingIds.has(row.content_id));
      if (missing.length) inserted = await supabaseRequest<StoredAttempt[]>("/rest/v1/game_attempts", {
        method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(missing)
      });
      await supabaseRequest(`/rest/v1/game_rounds?id=eq.${roundId}&anonymous_id=eq.${anonymousId}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ completed_at: new Date().toISOString() })
      });
    } else {
      inserted = await supabaseRequest<StoredAttempt[]>("/rest/v1/game_attempts", {
        method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(rows)
      });
    }
    if (mode === "practice" || firstCompletion) logServerEvent({ anonymousId, eventName: "game_completed", properties: { game_type: "fact_opinion", mode, answers_count: rows.length, correct_count: rows.filter((row) => row.is_correct).length, duration_ms: durationMs, moves }, context: analytics });
    return NextResponse.json({ attempts: inserted }, { status: 201 });
  } catch (error) {
    console.error("Unable to save Fact or Opinion attempts:", error);
    return NextResponse.json({ error: "Unable to save answers" }, { status: 500 });
  }
}
