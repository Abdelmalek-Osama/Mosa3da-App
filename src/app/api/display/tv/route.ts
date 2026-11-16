import { logger } from "@/lib/logger";
import { createSupabasePublicClient } from "@/lib/supabase/server";
import { renderTvBoardHtml } from "@/features/display/components/tv-display-board";
import { tickNotifications } from "@/server/application/notifications/process-notifications";
import { QueueService } from "@/server/application/queue/queue-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * The TV board's changing part as HTML, polled by the TV board's script and
 * swapped in place (no page reload). Like /api/display it also drives the
 * time-based WhatsApp alerts. On failure: 503, and the TV keeps its last board.
 */
export async function GET() {
  try {
    const [board] = await Promise.all([new QueueService(createSupabasePublicClient()).getDisplayBoard(), tickNotifications()]);
    return new Response(renderTvBoardHtml(board, Date.now()), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    logger.error("display.tv_failed", { error });
    return new Response("unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
