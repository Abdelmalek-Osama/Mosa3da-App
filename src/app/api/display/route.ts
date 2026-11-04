import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { createSupabasePublicClient } from "@/lib/supabase/server";
import { tickNotifications } from "@/server/application/notifications/process-notifications";
import { QueueService } from "@/server/application/queue/queue-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Public, read-only, anonymized waiting-room board. Polled by /display. */
export async function GET() {
  try {
    const [board] = await Promise.all([new QueueService(createSupabasePublicClient()).getDisplayBoard(), tickNotifications()]);
    return NextResponse.json(board, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    logger.error("display.failed", { error });
    return NextResponse.json({ error: "Display temporarily unavailable" }, { status: 503 });
  }
}
