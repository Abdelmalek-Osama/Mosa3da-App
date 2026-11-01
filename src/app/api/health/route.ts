import { NextResponse } from "next/server";
import { createSupabasePublicClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  const { error } = await createSupabasePublicClient().rpc("get_display_board");
  return NextResponse.json(
    { ok: !error, database: error ? "unreachable" : "ok", latencyMs: Date.now() - started },
    { status: error ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
