import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { PageHeader } from "@/components/shared/page-header";
import { LiveIndicator } from "@/components/shared/live-indicator";
import { QueueBoardView } from "@/features/queue/components/queue-board-view";
import { WalkInDialog } from "@/features/queue/components/walk-in-dialog";
import { formatClinicDate, formatTime } from "@/lib/format";
import { QueueService } from "@/server/application/queue/queue-service";
import { getClinicSettings } from "@/server/application/settings/clinic-settings";
import { requireStaff } from "@/server/authorization/actor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("queue") };
}
export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const actor = await requireStaff().catch(() => null);
  if (!actor) redirect("/login");

  const [board, settings] = await Promise.all([
    new QueueService(actor.supabase).getBoard(),
    getClinicSettings(actor.supabase),
  ]);

  const t = await getTranslations("nav");
  const locale = (await getLocale()) as Locale;

  return (
    <>
      <PageHeader
        title={t("queue")}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{formatClinicDate(board.session.clinicDate, {}, locale)}</span>
            <span className="tabular">
              {formatTime(board.session.opensAt, settings.timezone, locale)} – {formatTime(board.session.closesAt, settings.timezone, locale)}
            </span>
            <LiveIndicator channel="admin-queue" />
          </span>
        }
        actions={<WalkInDialog defaultDuration={settings.defaultConsultationMinutes} timezone={settings.timezone} />}
      />
      <QueueBoardView board={board} timezone={settings.timezone} latePolicyConsultations={settings.latePolicyConsultations} />
    </>
  );
}
