import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { LogsView } from "@/features/logs/components/logs-view";
import { clinicDateOf } from "@/lib/format";
import {
  filterLogs,
  listConsultationLogs,
  resolveLogFilter,
  summarizeLogs,
  type ConsultationLog,
} from "@/server/application/logs/consultation-logs";
import { getClinicSettings } from "@/server/application/settings/clinic-settings";
import { getActor } from "@/server/authorization/actor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("logs") };
}
export const dynamic = "force-dynamic";


type SearchParams = { range?: string; from?: string; to?: string; q?: string; page?: string };

export default async function ConsultationLogsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  // Doctor only: secretaries are sent back to the dashboard.
  if (actor.role !== "doctor") redirect("/admin/dashboard");

  const settings = await getClinicSettings(actor.supabase);
  const tz = settings.timezone;
  const tReason = await getTranslations("visitReason");
  const locale = (await getLocale()) as Locale;
  const today = clinicDateOf(Date.now(), tz);
  const filter = resolveLogFilter(searchParams, today);

  const reasonLabel = (l: ConsultationLog) => (l.visitReason === "other" && l.visitReasonDetails ? l.visitReasonDetails : tReason(l.visitReason));
  const all = filterLogs(await listConsultationLogs(actor.supabase, filter.from, filter.to), filter.q, reasonLabel);
  const summary = summarizeLogs(all);

  return (
    <LogsView
      filter={filter}
      all={all}
      summary={summary}
      requestedPage={Number.parseInt(searchParams.page ?? "1", 10) || 1}
      timeZone={tz}
      locale={locale}
    />
  );
}
