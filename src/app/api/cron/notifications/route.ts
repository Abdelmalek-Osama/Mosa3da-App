import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { serverEnv } from "@/lib/server-env";
import { processDueNotifications } from "@/server/application/notifications/process-notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(request: NextRequest): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${serverEnv("CRON_SECRET")}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Vercel Cron-compatible. Idempotent: safe to call any number of times. */
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await processDueNotifications({ includeAppointmentReminders: true });
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    logger.error("cron.notifications_failed", { error });
    return NextResponse.json({ ok: false, error: "Processing failed" }, { status: 500 });
  }
}
