import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { PageHeader } from "@/components/shared/page-header";
import { LiveIndicator } from "@/components/shared/live-indicator";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BookAppointmentDialog } from "@/features/appointments/components/admin/book-appointment-dialog";
import { AppointmentRowActions } from "@/features/appointments/components/admin/appointment-row-actions";
import { DateJump } from "@/features/appointments/components/admin/date-jump";
import { AppointmentStatusPill } from "@/features/patients/components/appointment-card";
import { clinicDateOf, formatClinicDate, formatPhone, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AppointmentAdminService } from "@/server/application/appointments/appointment-admin-service";
import { getClinicSettings } from "@/server/application/settings/clinic-settings";
import { requireStaff } from "@/server/authorization/actor";
import { waMeLink, whatsAppConfig } from "@/server/integrations/whatsapp/config";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("appointments") };
}
export const dynamic = "force-dynamic";


function addDays(d: string, n: number) {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

export default async function AppointmentsPage({ searchParams }: { searchParams: { date?: string } }) {
  const actor = await requireStaff().catch(() => null);
  const autoSend = whatsAppConfig().autoSend;
  if (!actor) redirect("/login");

  const settings = await getClinicSettings(actor.supabase);
  const t = await getTranslations("appointments");
  const tReason = await getTranslations("visitReason");
  const tConfirm = await getTranslations("appointments.confirmWa");
  const locale = (await getLocale()) as Locale;
  const tz = settings.timezone;
  const today = clinicDateOf(Date.now(), tz);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? "") ? searchParams.date! : today;
  const week = Array.from({ length: 7 }, (_, i) => addDays(date, i - 3));

  const service = new AppointmentAdminService(actor.supabase);
  const [appointments, counts] = await Promise.all([service.listForDate(date), service.countsBetween(week[0]!, week[6]!)]);

  const summary = [
    ["booked", appointments.filter((a) => a.status === "scheduled").length],
    ["checkedIn", appointments.filter((a) => a.status === "checked_in").length],
    ["completed", appointments.filter((a) => a.status === "completed").length],
    ["cancelled", appointments.filter((a) => a.status === "cancelled").length],
  ] as const;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{formatClinicDate(date, {}, locale)}</span>
            {date === today ? <LiveIndicator channel="admin-appointments" /> : null}
          </span>
        }
        actions={<BookAppointmentDialog timezone={tz} today={today} defaultDate={date} />}
      />

      <Card className="mb-4 p-2 sm:p-3">
        <div className="flex items-center gap-1 sm:gap-2">
          <Button asChild variant="ghost" size="icon" className="shrink-0" aria-label={t("prevDay")}>
            <Link href={`/admin/appointments?date=${addDays(date, -1)}`}>
              <ChevronLeft className="rtl:-scale-x-100" />
            </Link>
          </Button>
          <ol className="grid min-w-0 flex-1 grid-cols-7 gap-0.5 sm:gap-1">
            {week.map((d) => {
              const selected = d === date;
              return (
                <li key={d}>
                  <Link
                    href={`/admin/appointments?date=${d}`}
                    aria-current={selected ? "date" : undefined}
                    className={cn(
                      "flex flex-col items-center rounded-lg px-0.5 py-1.5 text-center transition-colors",
                      selected ? "bg-navy-900 text-white" : "hover:bg-muted",
                      d === today && !selected && "ring-1 ring-inset ring-teal-300",
                    )}
                  >
                    <span className={cn("text-[10px] font-medium uppercase sm:text-xs", selected ? "text-navy-200" : "text-muted-foreground")}>
                      {formatClinicDate(d, { weekday: "short", day: undefined, month: undefined, year: undefined }, locale)}
                    </span>
                    <span className="tabular text-base font-semibold sm:text-lg">{Number(d.slice(8))}</span>
                    <span
                      className={cn(
                        "tabular mt-0.5 min-w-5 rounded-full px-1 text-[10px] font-semibold",
                        counts[d] ? (selected ? "bg-teal-400 text-navy-950" : "bg-teal-50 text-teal-800") : "text-transparent",
                      )}
                    >
                      {counts[d] ?? 0}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
          <Button asChild variant="ghost" size="icon" className="shrink-0" aria-label={t("nextDay")}>
            <Link href={`/admin/appointments?date=${addDays(date, 1)}`}>
              <ChevronRight className="rtl:-scale-x-100" />
            </Link>
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground sm:text-sm">
            {summary.map(([label, n]) => (
              <span key={label}>
                <span className="tabular font-semibold text-navy-900">{n}</span> {t(`summary.${label}`)}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {date !== today ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/appointments">{t("today")}</Link>
              </Button>
            ) : null}
            <DateJump value={date} />
          </div>
        </div>
      </Card>

      {appointments.length === 0 ? (
        <Card className="p-10 text-center">
          <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-2 font-medium text-navy-900">{t("emptyTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("emptyBody")}</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {appointments.map((a) => {
            const reason = a.visitReason === "other" && a.visitReasonDetails ? a.visitReasonDetails : tReason(a.visitReason);
            const canCancel = a.status === "scheduled";
            const canCheckIn = canCancel && a.clinicDate === today;
            // One-tap booking confirmation from the clinic phone (P1-12). Opens WhatsApp only.
            const confirmHref =
              canCancel && a.scheduledStart
                ? waMeLink(
                    a.patient.phone,
                    [
                      tConfirm("message", {
                        name: a.patient.fullName.split(" ")[0] ?? a.patient.fullName,
                        clinic: locale === "ar" ? settings.clinicNameAr : settings.clinicName,
                        day:
                          a.clinicDate === today
                            ? tConfirm("today")
                            : tConfirm("onDay", { date: formatClinicDate(a.clinicDate, { year: undefined }, locale) }),
                        time: formatTime(a.scheduledStart, tz, locale),
                      }),
                      settings.clinicAddress ? tConfirm("address", { address: settings.clinicAddress }) : null,
                      settings.clinicMapUrl ? tConfirm("map", { url: settings.clinicMapUrl }) : null,
                    ]
                      .filter(Boolean)
                      .join("\n"),
                  )
                : undefined;
            return (
              <li
                key={a.id}
                className={cn(
                  "grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-xl border bg-card p-3 shadow-soft sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:items-center sm:p-4",
                  a.status === "cancelled" && "opacity-60",
                )}
              >
                <div className="tabular flex flex-col">
                  <span className="text-base font-semibold text-navy-900">{a.scheduledStart ? formatTime(a.scheduledStart, tz, locale) : t("walkIn")}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" /> {t("min", { count: a.durationMinutes })}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/patients/${a.patient.id}`} dir="auto" className="truncate font-medium text-navy-900 hover:underline">
                      {a.patient.fullName}
                    </Link>
                    <AppointmentStatusPill status={a.status} />
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    <span className="tabular">{formatPhone(a.patient.phone)}</span> · {reason} · {t(`source.${a.source}`)}
                  </p>
                  {a.notes ? <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">“{a.notes}”</p> : null}
                  {a.status === "cancelled" && a.cancellationReason ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{t("cancelledReason", { reason: a.cancellationReason })}</p>
                  ) : null}
                </div>
                {canCancel ? (
                  <div className="col-span-2 sm:col-span-1">
                    <AppointmentRowActions appointmentId={a.id} patientName={a.patient.fullName} canCheckIn={canCheckIn} canCancel={canCancel} autoSend={autoSend} confirmHref={confirmHref} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {date === today && appointments.some((a) => a.status === "checked_in") ? (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {t("checkedInHint")}{" "}
          <Link href="/admin/queue" className="font-medium text-secondary hover:underline">
            {t("todaysQueue")}
          </Link>
        </p>
      ) : null}
    </>
  );
}
