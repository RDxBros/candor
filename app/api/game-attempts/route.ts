import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, supabaseRequest } from "../../../lib/supabase-server";
import { readRefreshedUser } from "../../../lib/user-stats-server";
import { getStory } from "../../../lib/stories";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEANS = new Set(["left", "center", "right"]);
const INPUT_METHODS = new Set(["swipe", "tap", "keyboard"]);

export type GameAttemptRecord = {
  id: string;
  story_id: string;
  source_id: string;
  source_key: string;
  round_id: string | null;
  card_position: number;
  mode: "scored" | "practice";
  game_type: string;
  difficulty: string | null;
  guessed_lean: string;
  correct_lean: string;
  is_correct: boolean;
  created_at: string;
  was_created?: boolean;
};

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "The game is temporarily unavailable. Please try again later." }, { status: 503 });
  }
  const anonymousId = request.nextUrl.searchParams.get("anonymous_id") ?? "";
  const playedOnly = request.nextUrl.searchParams.get("played") === "1";
  const storyId = request.nextUrl.searchParams.get("story_id")?.trim() ?? "";
  if (!UUID_PATTERN.test(anonymousId)) {
    return NextResponse.json({ error: "A valid user identifier is required" }, { status: 400 });
  }

  try {
    if (playedOnly) {
      const playedQuery = new URLSearchParams({
        anonymous_id: `eq.${anonymousId}`,
        game_type: "eq.lean_guess",
        select: "id",
        limit: "1"
      });
      const attempts = await supabaseRequest<Array<{ id: string }>>(`/rest/v1/game_attempts?${playedQuery}`);
      return NextResponse.json({ played: attempts.length > 0 }, { headers: { "Cache-Control": "no-store" } });
    }

    if (!storyId || storyId.length > 200) {
      return NextResponse.json({ error: "A valid story identifier is required" }, { status: 400 });
    }

    const query = new URLSearchParams({
      anonymous_id: `eq.${anonymousId}`,
      story_id: `eq.${storyId}`,
      game_type: "eq.lean_guess",
      mode: "eq.scored",
      select: "id,story_id,source_id,source_key,round_id,card_position,mode,game_type,difficulty,guessed_lean,correct_lean,is_correct,created_at",
      order: "created_at.asc"
    });
    const attempts = await supabaseRequest<GameAttemptRecord[]>(`/rest/v1/game_attempts?${query}`);
    return NextResponse.json({ attempts }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to load game attempts:", error);
    return NextResponse.json({ error: "Unable to load game progress" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "The game is temporarily unavailable. Please try again later." }, { status: 503 });
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const anonymousId = typeof body.anonymous_id === "string" ? body.anonymous_id : "";
    const storyId = typeof body.story_id === "string" ? body.story_id.trim() : "";
    const sourceId = typeof body.source_id === "string" ? body.source_id : "";
    const sourceKey = typeof body.source_key === "string" ? body.source_key.trim() : "";
    const roundId = typeof body.round_id === "string" ? body.round_id : "";
    const cardPosition = typeof body.card_position === "number" ? body.card_position : Number.NaN;
    const guessedLean = typeof body.guessed_lean === "string" ? body.guessed_lean.toLowerCase() : "";
    const requestedDay = typeof body.day === "string" ? body.day : undefined;
    const inputMethod = typeof body.input_method === "string" ? body.input_method : "";
    const responseMs = typeof body.response_ms === "number" ? Math.round(body.response_ms) : Number.NaN;
    if (!UUID_PATTERN.test(anonymousId) || !UUID_PATTERN.test(sourceId) || !UUID_PATTERN.test(roundId) || !storyId || storyId.length > 200 ||
      !sourceKey || sourceKey.length > 200 || !Number.isInteger(cardPosition) || cardPosition < 1 || cardPosition > 3 || !LEANS.has(guessedLean) ||
      !INPUT_METHODS.has(inputMethod) || !Number.isInteger(responseMs) || responseMs < 0 || responseMs > 300000) {
      return NextResponse.json({ error: "Invalid game attempt" }, { status: 400 });
    }

    const { story } = await getStory(storyId, requestedDay);
    const source = story?.sources.find((item) => item.source_id === sourceId);
    const correctLean = source?.bias_label?.toLowerCase() ?? "";
    if (!story?.lean_comparison || !LEANS.has(correctLean)) {
      return NextResponse.json({ error: "Story source is not eligible for this game" }, { status: 400 });
    }

    await supabaseRequest("/rest/v1/users?on_conflict=anonymous_id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({ anonymous_id: anonymousId })
    });

    const roundQuery = new URLSearchParams({ id: `eq.${roundId}`, anonymous_id: `eq.${anonymousId}`, game_type: "eq.lean_guess", mode: "eq.scored", select: "card_pairs" });
    const rounds = await supabaseRequest<Array<{ card_pairs: Array<{ story_id: string; source_id: string }> }>>(`/rest/v1/game_rounds?${roundQuery}`);
    const positionedCard = rounds[0]?.card_pairs[cardPosition - 1];
    const belongsToRound = positionedCard?.story_id === storyId && positionedCard.source_id === sourceId;
    if (!belongsToRound) return NextResponse.json({ error: "Attempt does not belong to this server-issued round" }, { status: 400 });

    const rows = await supabaseRequest<GameAttemptRecord[]>("/rest/v1/rpc/record_game_attempt_v2", {
      method: "POST",
      body: JSON.stringify({
        target_anonymous_id: anonymousId,
        target_story_id: storyId,
        target_source_id: sourceId,
        target_source_key: sourceKey,
        target_round_id: roundId,
        target_card_position: cardPosition,
        target_mode: "scored",
        target_game_type: "lean_guess",
        target_difficulty: null,
        target_guessed_lean: guessedLean,
        target_correct_lean: correctLean,
        target_input_method: inputMethod,
        target_response_ms: responseMs
      })
    });
    const attempt = rows[0];
    if (!attempt) return NextResponse.json({ error: "Unable to save attempt" }, { status: 500 });
    const user = await readRefreshedUser(anonymousId);
    return NextResponse.json({ attempt, user }, { status: attempt.was_created === false ? 200 : 201 });
  } catch (error) {
    console.error("Unable to record game attempt:", error);
    return NextResponse.json({ error: "Unable to record game attempt" }, { status: 500 });
  }
}
