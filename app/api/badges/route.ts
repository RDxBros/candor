import { NextRequest, NextResponse } from "next/server";
import { badgeOverview } from "../../../lib/badges-server";
import { isSupabaseConfigured } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const anonymousId = request.nextUrl.searchParams.get("anonymous_id") ?? "";
  if (!UUID.test(anonymousId)) return NextResponse.json({ error: "Invalid user" }, { status: 400 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "This feature is temporarily unavailable. Please try again later." }, { status: 503 });
  try {
    return NextResponse.json(await badgeOverview(anonymousId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to load badges:", error);
    return NextResponse.json({ error: "Unable to load badges" }, { status: 500 });
  }
}
