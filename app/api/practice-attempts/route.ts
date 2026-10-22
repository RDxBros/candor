import { NextRequest, NextResponse } from "next/server";
import { buildLeanGamePool } from "../../../lib/lean-game-pool";
import { practiceAttemptInsert } from "../../../lib/practice-mode";
import { isSupabaseConfigured, supabaseRequest } from "../../../lib/supabase-server";
import { resolveContentDay } from "../../../lib/content-day";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEANS = new Set(["left", "center", "right"]);
const INPUT_METHODS = new Set(["swipe", "tap", "keyboard"]);

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "The game is temporarily unavailable. Please try again later." }, { status: 503 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const anonymousId = typeof body.anonymous_id === "string" ? body.anonymous_id : "";
    const storyId = typeof body.story_id === "string" ? body.story_id.trim() : "";
    const sourceId = typeof body.source_id === "string" ? body.source_id : "";
    const sourceKey = typeof body.source_key === "string" ? body.source_key.trim() : "";
    const practiceRoundId = typeof body.practice_round_id === "string" ? body.practice_round_id : "";
    const cardPosition = typeof body.card_position === "number" ? body.card_position : Number.NaN;
    const guessedLean = typeof body.guessed_lean === "string" ? body.guessed_lean.toLowerCase() : "";
    const requestedDay = await resolveContentDay(typeof body.day === "string" ? body.day : undefined);
    const inputMethod = typeof body.input_method === "string" ? body.input_method : "";
    const responseMs = typeof body.response_ms === "number" ? Math.round(body.response_ms) : Number.NaN;

    if (!UUID_PATTERN.test(anonymousId) || !UUID_PATTERN.test(sourceId) || !UUID_PATTERN.test(practiceRoundId) ||
      !storyId || storyId.length > 200 || !sourceKey || sourceKey.length > 200 ||
      !Number.isInteger(cardPosition) || cardPosition < 1 || cardPosition > 3 || !LEANS.has(guessedLean) ||
      !INPUT_METHODS.has(inputMethod) || !Number.isInteger(responseMs) || responseMs < 0 || responseMs > 300000) {
      return NextResponse.json({ error: "Invalid practice attempt" }, { status: 400 });
    }

    const pool = await buildLeanGamePool(requestedDay, { logIssues: false });
    const storyCards = pool.cards.filter((item) => item.storyId === storyId);
    const card = storyCards.find((item) => item.sourceId === sourceId);
    if (!card || cardPosition > storyCards.length) return NextResponse.json({ error: "Story source is not eligible for practice" }, { status: 400 });

    await supabaseRequest("/rest/v1/users?on_conflict=anonymous_id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({ anonymous_id: anonymousId })
    });

    const rows = await supabaseRequest<Array<{ id: string; is_correct: boolean }>>("/rest/v1/game_attempts", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(practiceAttemptInsert({
        anonymousId, storyId, sourceId, sourceKey, practiceRoundId, cardPosition,
        guessedLean: guessedLean as "left" | "center" | "right",
        correctLean: card.biasLabel,
        inputMethod: inputMethod as "swipe" | "tap" | "keyboard",
        responseMs
      }))
    });
    return NextResponse.json({ attempt: rows[0] ?? null }, { status: 201 });
  } catch (error) {
    console.error("Unable to save practice attempt:", error);
    return NextResponse.json({ error: "Unable to save practice attempt" }, { status: 500 });
  }
}
