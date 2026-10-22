import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, supabaseRequest } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "This feature is temporarily unavailable. Please try again later." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { anonymous_id?: string };
  if (!UUID.test(body.anonymous_id ?? "")) return NextResponse.json({ error: "Valid user identifier required" }, { status: 400 });
  await supabaseRequest(`/rest/v1/users?anonymous_id=eq.${body.anonymous_id}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ is_internal: true })
  });
  return new NextResponse(null, { status: 204 });
}
