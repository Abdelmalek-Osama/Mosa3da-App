import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { createSupabasePublicClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { QueueService } from "@/server/application/queue/queue-service";
import type { DisplayBoard } from "@/features/queue/schemas";
import { DisplayBoardView } from "@/features/display/components/display-board";
import { TvDisplayBoard } from "@/features/display/components/tv-display-board";
import { wantsTvBoard } from "@/features/display/tv-detect";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("display"), robots: { index: false, follow: false } };
}
export const viewport: Viewport = { themeColor: "#111c33" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
