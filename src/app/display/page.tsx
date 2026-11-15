import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { createSupabasePublicClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { QueueService } from "@/server/application/queue/queue-service";
import type { DisplayBoard } from "@/features/queue/schemas";
import { DisplayBoardView } from "@/features/display/components/display-board";
import { TvDisplayBoard } from "@/features/display/components/tv-display-board";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("display"), robots: { index: false, follow: false } };
}
export const viewport: Viewport = { themeColor: "#111c33" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Smart-TV and other old browsers cannot run the live board (modern CSS and
 * JavaScript), so they get the server-rendered TV board that reloads itself.
 * ?mode=tv / ?mode=live override the detection.
 */
function wantsTvBoard(userAgent: string, mode: string | undefined): boolean {
  if (mode === "tv") return true;
  if (mode === "live") return false;
  if (/Web0S|webOS|NetCast|Tizen|SMART-TV|SmartTV|HbbTV|BRAVIA|VIDAA|Opera TV|Presto|AFT[A-Z]|CrKey|Roku|Hisense|Philips|NETTV|Viera|TOSHIBA|TSBNetTV|Panasonic|Sharp|TCL|NetFront|Espial|Maple/i.test(userAgent))
    return true;
  const chrome = /(?:Chrome|Chromium|CriOS)\/(\d+)/.exec(userAgent);
  if (chrome) return Number(chrome[1]) < 84; // flex gap, clamp(), min()
  const firefox = /Firefox\/(\d+)/.exec(userAgent);
  if (firefox) return Number(firefox[1]) < 75;
  const safari = /Version\/(\d+)[\d.]*\s.*Safari/.exec(userAgent);
  if (safari) return Number(safari[1]) < 14;
  // Anything not clearly a modern browser (unknown TV engines) gets the TV board: it works everywhere.
  return true;
}

export default async function DisplayPage({ searchParams }: { searchParams: { mode?: string } }) {
  let initial: DisplayBoard | null = null;
  try {
    initial = await new QueueService(createSupabasePublicClient()).getDisplayBoard();
  } catch (error) {
    logger.error("display.initial_failed", { error });
  }
  if (wantsTvBoard(headers().get("user-agent") ?? "", searchParams.mode)) {
    return <TvDisplayBoard board={initial} now={Date.now()} />;
  }
  return <DisplayBoardView initial={initial} />;
}
