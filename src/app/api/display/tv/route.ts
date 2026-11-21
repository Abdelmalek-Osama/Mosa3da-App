import type { NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { createSupabasePublicClient } from "@/lib/supabase/server";
import { renderTvBoardHtml } from "@/features/display/components/tv-display-board";
import { tickNotifications } from "@/server/application/notifications/process-notifications";
import { QueueService } from "@/server/application/queue/queue-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CALLBACK = /^__tvUpdate\d{1,9}$/;

/**
 * The TV board's changing part as HTML, polled by the TV board's script and
 * swapped in place (no page reload). Two transports for old TV engines:
 * plain HTML (XMLHttpRequest) or, with ?cb=__tvUpdateN, a script that calls
 * that function with the HTML (works where XHR does not). Like /api/display
 * it also drives the time-based WhatsApp alerts. On failure: 503, and the TV
 * keeps its last board.
 */
export async function GET(request: NextRequest) {
  const cb = request.nextUrl.searchParams.get("cb");
  const callback = cb && CALLBACK.test(cb) ? cb : null;
  try {
    const [board] = await Promise.all([new QueueService(createSupabasePublicClient()).getDisplayBoard(), tickNotifications()]);
    const html = renderTvBoardHtml(board, Date.now());
    if (callback) {
      // U+2028/2029 are valid in JSON but not in old JavaScript string literals.
      const payload = JSON.stringify(html).replace(/\u2028/g, "\u2028").replace(/\u2029/g, "\u2029");
      return new Response(`${callback}(${payload});`, {
        headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" },
      });
    }
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    logger.error("display.tv_failed", { error });
    return new Response(callback ? "/* unavailable */" : "unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
