import { NextRequest, NextResponse } from "next/server";
import { COMMENT_FLAG_THRESHOLD, isSupabaseConfigured, supabaseRequest } from "../../../lib/supabase-server";
import { logServerEvent, type AnalyticsContext } from "../../../lib/analytics-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CommentRecord = {
  id: string;
  story_id: string;
  anonymous_id: string;
  display_text: string;
  created_at: string;
  flag_count: number;
  reported_by_user?: boolean;
};

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Comments are temporarily unavailable. Please try again later." }, { status: 503 });
  }

  const storyId = request.nextUrl.searchParams.get("storyId")?.trim();
  const anonymousId = request.nextUrl.searchParams.get("anonymous_id") ?? "";
  if (!storyId || storyId.length > 200 || !UUID_PATTERN.test(anonymousId)) {
    return NextResponse.json({ error: "Valid story and user identifiers are required" }, { status: 400 });
  }

  try {
    const query = new URLSearchParams({
      story_id: `eq.${storyId}`,
      flag_count: `lt.${COMMENT_FLAG_THRESHOLD}`,
      select: "id,story_id,anonymous_id,display_text,created_at,flag_count",
      order: "created_at.desc"
    });
    const comments = await supabaseRequest<CommentRecord[]>(`/rest/v1/comments?${query}`);
    const reportQuery = new URLSearchParams({
      anonymous_id: `eq.${anonymousId}`,
      select: "comment_id"
    });
    const reports = await supabaseRequest<Array<{ comment_id: string }>>(`/rest/v1/comment_reports?${reportQuery}`);
    const reportedIds = new Set(reports.map((report) => report.comment_id));
    return NextResponse.json({
      comments: comments.map((comment) => ({ ...comment, reported_by_user: reportedIds.has(comment.id) }))
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to load comments:", error);
    return NextResponse.json({ error: "Unable to load comments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Comments are temporarily unavailable. Please try again later." }, { status: 503 });
  }

  try {
    const body = await request.json() as { story_id?: unknown; anonymous_id?: unknown; display_text?: unknown; analytics?: AnalyticsContext };
    const storyId = typeof body.story_id === "string" ? body.story_id.trim() : "";
    const anonymousId = typeof body.anonymous_id === "string" ? body.anonymous_id : "";
    const displayText = typeof body.display_text === "string" ? body.display_text.trim() : "";

    if (!storyId || storyId.length > 200 || !UUID_PATTERN.test(anonymousId)) {
      return NextResponse.json({ error: "Invalid comment details" }, { status: 400 });
    }
    if (!displayText || displayText.length > 500) {
      return NextResponse.json({ error: "Comments must be between 1 and 500 characters" }, { status: 400 });
    }

    await supabaseRequest("/rest/v1/users?on_conflict=anonymous_id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({ anonymous_id: anonymousId })
    });

    const [comment] = await supabaseRequest<CommentRecord[]>("/rest/v1/comments", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ story_id: storyId, anonymous_id: anonymousId, display_text: displayText })
    });
    logServerEvent({ anonymousId, eventName: "comment_posted", properties: { story_id: storyId }, context: body.analytics });
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    console.error("Unable to add comment:", error);
    return NextResponse.json({ error: "Unable to add comment" }, { status: 500 });
  }
}
