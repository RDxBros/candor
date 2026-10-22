import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, supabaseRequest } from "../../../../lib/supabase-server";
import { readRefreshedUser } from "../../../../lib/user-stats-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Progress is temporarily unavailable. Please try again later." }, { status: 503 });
  }

  try {
    const body = await request.json() as { anonymous_id?: unknown };
    if (typeof body.anonymous_id !== "string" || !UUID_PATTERN.test(body.anonymous_id)) {
      return NextResponse.json({ error: "A valid anonymous_id is required" }, { status: 400 });
    }

    const refreshed = await readRefreshedUser(body.anonymous_id);
    if (!refreshed?.freezes_available) {
      return NextResponse.json({ error: "No streak freeze is available" }, { status: 409 });
    }

    const rows = await supabaseRequest<Array<{ freezes_available: number; freezes_used_total: number }>>(
      "/rest/v1/rpc/consume_streak_freeze",
      { method: "POST", body: JSON.stringify({ target_id: body.anonymous_id }) }
    );
    const freeze = rows[0];
    if (!freeze) return NextResponse.json({ error: "No streak freeze is available" }, { status: 409 });
    return NextResponse.json({ freeze });
  } catch (error) {
    console.error("Unable to apply streak freeze:", error);
    return NextResponse.json({ error: "Unable to apply streak freeze" }, { status: 500 });
  }
}
