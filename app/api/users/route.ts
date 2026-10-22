import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, supabaseRequest } from "../../../lib/supabase-server";
import { readRefreshedUser } from "../../../lib/user-stats-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UserPayload = {
  anonymous_id?: unknown;
  streak_count?: unknown;
  last_read_date?: unknown;
  total_stories_read?: unknown;
  /** Spot the Lean scored answers only. */
  game_correct_count?: unknown;
  /** Spot the Lean scored answers only. */
  game_total_count?: unknown;
};

function nonNegativeInteger(value: unknown, fallback = 0) {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : fallback;
}

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Progress is temporarily unavailable. Please try again later." }, { status: 503 });
  }

  const anonymousId = request.nextUrl.searchParams.get("anonymous_id") ?? "";
  if (!UUID_PATTERN.test(anonymousId)) {
    return NextResponse.json({ error: "A valid anonymous_id is required" }, { status: 400 });
  }

  try {
    const user = await readRefreshedUser(anonymousId);
    return user
      ? NextResponse.json({ user }, { headers: { "Cache-Control": "no-store" } })
      : NextResponse.json({ error: "User not found" }, { status: 404 });
  } catch (error) {
    console.error("Unable to load anonymous user:", error);
    return NextResponse.json({ error: "Unable to load user stats" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Progress is temporarily unavailable. Please try again later." }, { status: 503 });
  }

  try {
    const body = (await request.json()) as UserPayload;
    if (typeof body.anonymous_id !== "string" || !UUID_PATTERN.test(body.anonymous_id)) {
      return NextResponse.json({ error: "A valid anonymous_id is required" }, { status: 400 });
    }

    const total = nonNegativeInteger(body.game_total_count);
    const correct = Math.min(nonNegativeInteger(body.game_correct_count), total);
    const lastRead = typeof body.last_read_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.last_read_date)
      ? body.last_read_date
      : null;

    await supabaseRequest("/rest/v1/users?on_conflict=anonymous_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        anonymous_id: body.anonymous_id,
        streak_count: nonNegativeInteger(body.streak_count),
        last_read_date: lastRead,
        total_stories_read: nonNegativeInteger(body.total_stories_read),
        game_correct_count: correct,
        game_total_count: total
      })
    });

    const user = await readRefreshedUser(body.anonymous_id);
    return NextResponse.json({ ok: true, user });
  } catch (error) {
    console.error("Unable to sync anonymous user:", error);
    return NextResponse.json({ error: "Unable to sync user stats" }, { status: 500 });
  }
}
