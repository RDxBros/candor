import { NextRequest, NextResponse } from "next/server";
import { COMMENT_FLAG_THRESHOLD, isSupabaseConfigured, supabaseRequest } from "../../../../../lib/supabase-server";
import { logServerEvent, type AnalyticsContext } from "../../../../../lib/analytics-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Reporting is temporarily unavailable. Please try again later." }, { status: 503 });
  }

  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid comment id" }, { status: 400 });
  }

  try {
    const body = await _request.json() as { anonymous_id?: unknown; analytics?: AnalyticsContext };
    if (typeof body.anonymous_id !== "string" || !UUID_PATTERN.test(body.anonymous_id)) {
      return NextResponse.json({ error: "A valid anonymous_id is required" }, { status: 400 });
    }
    await supabaseRequest("/rest/v1/users?on_conflict=anonymous_id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({ anonymous_id: body.anonymous_id })
    });
    const rows = await supabaseRequest<Array<{ flag_count: number; already_reported: boolean }>>(
      "/rest/v1/rpc/report_comment_once",
      {
      method: "POST",
      body: JSON.stringify({ target_comment_id: id, target_anonymous_id: body.anonymous_id })
      }
    );
    const result = rows[0];
    if (!result) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }
    if (!result.already_reported) {
      const query = new URLSearchParams({ id: `eq.${id}`, select: "story_id", limit: "1" });
      const comments = await supabaseRequest<Array<{ story_id: string }>>(`/rest/v1/comments?${query}`);
      if (comments[0]) logServerEvent({ anonymousId: body.anonymous_id, eventName: "comment_flagged", properties: { story_id: comments[0].story_id }, context: body.analytics });
    }
    return NextResponse.json({
      ok: true,
      alreadyReported: result.already_reported,
      hidden: result.flag_count >= COMMENT_FLAG_THRESHOLD
    });
  } catch (error) {
    console.error("Unable to flag comment:", error);
    return NextResponse.json({ error: "Unable to report comment" }, { status: 500 });
  }
}
