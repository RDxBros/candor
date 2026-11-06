import { NextRequest, NextResponse } from "next/server";
import { loadPlaySchedule } from "../../../lib/play-schedule";
import { outletSlug, playFeedbackGate, PLAY_FEEDBACK_LIMIT_PER_HOUR, resolvePlayFeedbackCard, validatePlayFeedback } from "../../../lib/play-feedback";
import { isSupabaseConfigured, supabaseRequest } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Feedback is temporarily unavailable" }, { status: 503 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 2_048) return NextResponse.json({ error: "Feedback is too long" }, { status: 413 });
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid feedback" }, { status: 400 }); }
  const input = validatePlayFeedback(parsed);
  if (!input) return NextResponse.json({ error: "Invalid feedback" }, { status: 400 });

  try {
    const card = resolvePlayFeedbackCard(await loadPlaySchedule(), input.round, input.excerpt_index);
    if (!card || (input.suggested_lean && input.suggested_lean === card.biasLabel)) {
      return NextResponse.json({ error: "Invalid feedback" }, { status: 400 });
    }

    const duplicateQuery = new URLSearchParams({ device_id: `eq.${input.device_id}`, round: `eq.${input.round}`, excerpt_index: `eq.${input.excerpt_index}`, select: "id", limit: "1" });
    const duplicate = await supabaseRequest<Array<{ id: string }>>(`/rest/v1/play_feedback?${duplicateQuery}`);
    const recentQuery = new URLSearchParams({ device_id: `eq.${input.device_id}`, created_at: `gte.${new Date(Date.now() - 3_600_000).toISOString()}`, select: "id", limit: String(PLAY_FEEDBACK_LIMIT_PER_HOUR) });
    const recent = duplicate.length ? [] : await supabaseRequest<Array<{ id: string }>>(`/rest/v1/play_feedback?${recentQuery}`);
    const gate = playFeedbackGate(duplicate.length > 0, recent.length);
    if (gate !== "allowed") return NextResponse.json({ error: gate === "duplicate" ? "Feedback already sent" : "Please try again later" }, { status: gate === "duplicate" ? 409 : 429 });

    await supabaseRequest("/rest/v1/users?on_conflict=anonymous_id", {
      method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ anonymous_id: input.device_id })
    });
    await supabaseRequest("/rest/v1/play_feedback", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        round: input.round, excerpt_index: input.excerpt_index, outlet_slug: outletSlug(card.outlet),
        current_lean: card.biasLabel, suggested_lean: input.suggested_lean, reason: input.reason,
        note: input.note, device_id: input.device_id
      })
    });
    return NextResponse.json({ submitted: true }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes('"code":"23505"')) return NextResponse.json({ error: "Feedback already sent" }, { status: 409 });
    if (error instanceof Error && error.message.includes('"code":"P0001"')) return NextResponse.json({ error: "Please try again later" }, { status: 429 });
    console.error("Unable to save play feedback");
    return NextResponse.json({ error: "Feedback could not be saved" }, { status: 500 });
  }
}
