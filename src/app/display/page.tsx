import type { Metadata, Viewport } from "next";
import { getTranslations } from "next-intl/server";
import { createSupabasePublicClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { QueueService } from "@/server/application/queue/queue-service";
import type { DisplayBoard } from "@/features/queue/schemas";
import { DisplayBoardView } from "@/features/display/components/display-board";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("display"), robots: { index: false, follow: false } };
}
export const viewport: Viewport = { themeColor: "#111c33" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DisplayPage() {
  let initial: DisplayBoard | null = null;
  try {
    initial = await new QueueService(createSupabasePublicClient()).getDisplayBoard();
  } catch (error) {
    logger.error("display.initial_failed", { error });
  }
  return <DisplayBoardView initial={initial} />;
}
