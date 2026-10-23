import { NextRequest, NextResponse } from "next/server";
import { loadFactOpinionRounds } from "../../../../lib/fact-opinion-content-server";
import { isSupabaseConfigured, supabaseRequest } from "../../../../lib/supabase-server";
import { logServerEvent, type AnalyticsContext } from "../../../../lib/analytics-server";
import { resolveContentDay } from "../../../../lib/content-day";
import { filterStoriesForTopics, normalizeGameTopics } from "../../../../lib/game-topic-scope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "The game is temporarily unavailable. Please try again later." }, { status: 503 });
  try {
    const body = await request.json() as { anonymous_id?: string; content_round_id?: string; item_order?: string[]; current_day?: string; selected_topics?: unknown; topic_fallback?: boolean; analytics?: AnalyticsContext };
    const anonymousId = body.anonymous_id ?? "";
    const contentRoundId = body.content_round_id?.trim() ?? "";
    const currentDay = await resolveContentDay(body.current_day);
    const selectedTopics = normalizeGameTopics(body.selected_topics);
    const topicFallback = body.topic_fallback === true;
    const order = body.item_order ?? [];
    if (!UUID.test(anonymousId) || !contentRoundId || !Array.isArray(order)) {
      return NextResponse.json({ error: "Invalid round" }, { status: 400 });
    }
    const rounds = await loadFactOpinionRounds(currentDay);
    const scopedRounds = filterStoriesForTopics(rounds, selectedTopics, topicFallback);
    const round = scopedRounds.find((candidate) => candidate.id === contentRoundId);
    const expected = new Set(round?.items.map((item) => item.id));
    if (!round || order.length !== round.items.length || new Set(order).size !== order.length || order.some((id) => !expected.has(id))) {
      return NextResponse.json({ error: "Round contains ineligible content" }, { status: 400 });
    }
    const playedQuery = new URLSearchParams({
      anonymous_id: `eq.${anonymousId}`,
      game_type: "eq.fact_opinion",
      mode: "eq.scored",
      content_round_id: `eq.${round.id}`,
      select: "id",
      limit: "1"
    });
    const played = await supabaseRequest<Array<{ id: string }>>(`/rest/v1/game_attempts?${playedQuery}`);
    if (played.length) return NextResponse.json({ error: "This scored round has already been played" }, { status: 409 });
    await supabaseRequest("/rest/v1/users?on_conflict=anonymous_id", {
      method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ anonymous_id: anonymousId })
    });
    const rows = await supabaseRequest<Array<{ id: string }>>("/rest/v1/game_rounds", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        anonymous_id: anonymousId,
        game_type: "fact_opinion",
        mode: "scored",
        card_pairs: order.map((contentId) => ({ content_round_id: round.id, content_id: contentId }))
      })
    });
    logServerEvent({ anonymousId, eventName: "round_selected", properties: { game_type: "fact_opinion", story_id: round.story_id, mode: "scored", topic_fallback: topicFallback }, context: body.analytics });
    logServerEvent({ anonymousId, eventName: "game_started", properties: { game_type: "fact_opinion", mode: "scored" }, context: body.analytics });
    return NextResponse.json({ round_id: rows[0]?.id }, { status: 201 });
  } catch (error) {
    console.error("Unable to start Fact or Opinion round:", error);
    return NextResponse.json({ error: "Unable to start round" }, { status: 500 });
  }
}
