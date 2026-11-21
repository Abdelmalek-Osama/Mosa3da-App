import { NextResponse, type NextRequest } from "next/server";
import { clinicDateOf } from "@/lib/format";
import { getClinicSettings } from "@/server/application/settings/clinic-settings";
import { readHeartbeats } from "@/server/application/display/tv-heartbeat";
import { getActor } from "@/server/authorization/actor";

export const dynamic = "force-dynamic";

/**
 * Lobby TV "last seen" report for one clinic day (?date=YYYY-MM-DD, default
 * today): minutes the TV reached the server, gaps of 3+ minutes, and which
 * update method it used. Doctor only.
 */
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
  if (actor.role !== "doctor") return NextResponse.json({ error: "You are not allowed to perform this action." }, { status: 403 });

  const settings = await getClinicSettings(actor.supabase);
  const param = request.nextUrl.searchParams.get("date") ?? "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : clinicDateOf(Date.now(), settings.timezone);
  const report = await readHeartbeats(date, settings.timezone);
  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
