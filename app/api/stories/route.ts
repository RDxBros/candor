import { NextRequest, NextResponse } from "next/server";
import { getStories } from "../../../lib/stories";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const day = request.nextUrl.searchParams.get("day") ?? undefined;
  const result = await getStories(day);
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" }
  });
}
