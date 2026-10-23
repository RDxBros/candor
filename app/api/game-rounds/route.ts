import { NextRequest, NextResponse } from "next/server";
import { buildLeanGamePool } from "../../../lib/lean-game-pool";
import { roundUsesEveryAvailableExcerpt } from "../../../lib/lean-game-rounds";
import { LEAN_GAME_CONFIG } from "../../../lib/config";
import { isSupabaseConfigured, supabaseRequest } from "../../../lib/supabase-server";
import { logServerEvent, type AnalyticsContext } from "../../../lib/analytics-server";
import { resolveContentDay } from "../../../lib/content-day";
import { filterStoriesForTopics, normalizeGameTopics } from "../../../lib/game-topic-scope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type CardPair = { day: string; story_id: string; source_id: string };

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "The game is temporarily unavailable. Please try again later." }, { status: 503 });
  try {
    const body = await request.json() as { anonymous_id?: string; card_pairs?: CardPair[]; current_day?: string; selected_topics?: unknown; topic_fallback?: boolean; analytics?: AnalyticsContext };
    const anonymousId = body.anonymous_id ?? "";
    const pairs = body.card_pairs ?? [];
    const currentDay = await resolveContentDay(body.current_day);
    const selectedTopics = normalizeGameTopics(body.selected_topics);
    const topicFallback = body.topic_fallback === true;
    if (!UUID.test(anonymousId) || !Array.isArray(pairs) || pairs.length < LEAN_GAME_CONFIG.min_excerpts_per_story ||
      pairs.length > 3 * LEAN_GAME_CONFIG.stories_per_round) {
      return NextResponse.json({ error: "Invalid round" }, { status: 400 });
    }
    if (new Set(pairs.map((pair) => `${pair.story_id}:${pair.source_id}`)).size !== pairs.length) {
      return NextResponse.json({ error: "A round cannot contain duplicate cards" }, { status: 400 });
    }
    const pool = await buildLeanGamePool(currentDay, { logIssues: false });
    const scopedCards = filterStoriesForTopics(pool.cards.map((card) => ({ ...card, id: card.storyId })), selectedTopics, topicFallback);
    const eligibleCards = new Map(scopedCards.map((card) => [`${card.storyId}:${card.sourceId}`, card]));
    const storyGroups = new Map<string, Array<{ sourceId: string; outlet: string }>>();
    for (const pair of pairs) {
      if (!UUID.test(pair.source_id) || !pair.story_id || !/^day\d+$/i.test(pair.day)) return NextResponse.json({ error: "Invalid round card" }, { status: 400 });
      const card = eligibleCards.get(`${pair.story_id}:${pair.source_id}`);
      if (!card || card.day !== pair.day) {
        return NextResponse.json({ error: "Round contains an ineligible source" }, { status: 400 });
      }
      storyGroups.set(pair.story_id, [...(storyGroups.get(pair.story_id) ?? []), { sourceId: pair.source_id, outlet: card.outlet }]);
    }
    const roundCards = pairs.map((pair) => ({ storyId: pair.story_id, sourceId: pair.source_id, outlet: eligibleCards.get(`${pair.story_id}:${pair.source_id}`)!.outlet }));
    if (storyGroups.size !== LEAN_GAME_CONFIG.stories_per_round || [...storyGroups.values()].some((group) =>
      (group.length !== 2 && group.length !== 3) || new Set(group.map((item) => item.outlet.trim().toLowerCase())).size !== group.length) ||
      !roundUsesEveryAvailableExcerpt(roundCards, scopedCards)) {
      return NextResponse.json({ error: "Each story must contribute every usable excerpt from a different outlet" }, { status: 400 });
    }
    await supabaseRequest("/rest/v1/users?on_conflict=anonymous_id", {
      method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ anonymous_id: anonymousId })
    });
    const rows = await supabaseRequest<Array<{ id: string }>>("/rest/v1/game_rounds", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ anonymous_id: anonymousId, game_type: "lean_guess", mode: "scored", card_pairs: pairs })
    });
    logServerEvent({ anonymousId, eventName: "round_selected", properties: { game_type: "lean_guess", story_id: pairs[0].story_id, mode: "scored", topic_fallback: topicFallback }, context: body.analytics });
    logServerEvent({ anonymousId, eventName: "game_started", properties: { game_type: "lean_guess", mode: "scored" }, context: body.analytics });
    return NextResponse.json({ round_id: rows[0]?.id }, { status: 201 });
  } catch (error) {
    console.error("Unable to start game round:", error);
    return NextResponse.json({ error: "Unable to start round" }, { status: 500 });
  }
}
