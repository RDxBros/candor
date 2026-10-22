import { NextRequest, NextResponse } from "next/server";
import { evaluateExplorerBadge } from "../../../lib/badges-server";
import { isExplorerClickEligible } from "../../../lib/badges";
import { getStory } from "../../../lib/stories";
import { isSupabaseConfigured, supabaseRequest } from "../../../lib/supabase-server";
import { logServerEvent, type AnalyticsContext } from "../../../lib/analytics-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Progress is temporarily unavailable. Please try again later." }, { status: 503 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const anonymousId = typeof body.anonymous_id === "string" ? body.anonymous_id : "";
    const storyId = typeof body.story_id === "string" ? body.story_id.trim() : "";
    const sourceId = typeof body.source_id === "string" ? body.source_id : "";
    const day = typeof body.day === "string" ? body.day : undefined;
    const analytics = body.analytics && typeof body.analytics === "object" ? body.analytics as AnalyticsContext : undefined;
    if (!UUID.test(anonymousId) || !UUID.test(sourceId) || !storyId) return NextResponse.json({ error: "Invalid source click" }, { status: 400 });

    const { story } = await getStory(storyId, day);
    const source = story?.sources.find((item) => item.source_id === sourceId);
    const lean = source?.bias_label?.toLowerCase();
    if (!source || !isExplorerClickEligible(story?.lean_comparison ?? false, lean)) {
      return NextResponse.json({ error: "Only political source clicks are tracked" }, { status: 400 });
    }

    await supabaseRequest("/rest/v1/users?on_conflict=anonymous_id", {
      method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ anonymous_id: anonymousId })
    });
    await supabaseRequest("/rest/v1/source_link_clicks?on_conflict=anonymous_id,story_id,source_id", {
      method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({ anonymous_id: anonymousId, story_id: storyId, source_id: sourceId, lean })
    });
    const result = await evaluateExplorerBadge(anonymousId);
    if (result.newlyEarned) logServerEvent({ anonymousId, eventName: "badge_earned", properties: { badge_id: result.newlyEarned.badge_id }, context: analytics });
    return NextResponse.json({ newlyEarned: result.newlyEarned, progress: result.progress });
  } catch (error) {
    console.error("Unable to record source click or award badge:", error);
    return NextResponse.json({ error: "Unable to record source click" }, { status: 500 });
  }
}
