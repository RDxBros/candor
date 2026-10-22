import { NextRequest, NextResponse } from "next/server";
import { resolveContentDay } from "../../../lib/content-day";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const day = await resolveContentDay(request.nextUrl.searchParams.get("day"));
  return NextResponse.json({ day }, { headers: { "Cache-Control": "no-store" } });
}
