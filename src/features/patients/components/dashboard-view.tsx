import Link from "next/link";
import { CalendarPlus, ChevronRight, PartyPopper } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { PatientAppointment } from "@/server/application/appointments/booking-service";
import type { MyQueueStatus } from "@/features/queue/schemas";
import { AppointmentCard } from "./appointment-card";
import { AppointmentCountdown } from "./appointment-countdown";
import { LiveQueueStatus, QueueRefreshWatcher } from "./live-queue-status";

export interface PatientDashboardViewProps {
  fullName: string;
  status: MyQueueStatus;
  upcoming: PatientAppointment[];
  settings: { clinicName: string; clinicNameAr: string; doctorName: string; timezone: string };
  welcome?: boolean;
}

export function PatientDashboardView({ fullName, status, upcoming, settings, welcome }: PatientDashboardViewProps) {
  const t = useTranslations("portal.dashboard");
  const locale = useLocale();
  const tz = settings.timezone;
  const next = upcoming[0];
  const firstName = fullName.split(/\s+/)[0] ?? "";
  const clinicName = locale === "ar" ? settings.clinicNameAr || settings.clinicName : settings.clinicName;

  return (
    <div className="space-y-5">
      {welcome ? (
        <div className="flex items-start gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">
          <PartyPopper className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>
            <span className="font-semibold">{t("verified")}</span> {t("welcome", { clinic: clinicName })}
          </p>
        </div>
      ) : null}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900">{t("hello", { name: firstName })}</h1>
        <p className="text-sm text-muted-foreground">
          {settings.doctorName} · {clinicName}
        </p>
      </div>

      {status.in_queue && status.status !== "cancelled" ? <LiveQueueStatus status={status} timeZone={tz} /> : <QueueRefreshWatcher />}

      <section aria-labelledby="next-visit" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="next-visit" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("nextAppointment")}
          </h2>
          {upcoming.length > 1 ? (
            <Link href="/patient/my-appointments" className="text-sm font-medium text-teal-700 hover:underline">
              {t("all", { count: upcoming.length })}
            </Link>
          ) : null}
        </div>
        {next ? (
          <AppointmentCard appointment={next} timeZone={tz} emphasis>
            {next.scheduledStart && next.status === "scheduled" ? <AppointmentCountdown at={next.scheduledStart} /> : null}
            <Link
              href="/patient/my-appointments"
              className="flex items-center justify-between rounded-lg text-sm font-medium text-teal-700 hover:underline"
            >
              {t("manage")} <ChevronRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
            </Link>
          </AppointmentCard>
        ) : (
          <div className="rounded-2xl border border-dashed bg-card p-6 text-center">
            <p className="font-medium text-navy-900">{t("noneTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("noneBody")}</p>
          </div>
        )}
      </section>

      <Button asChild size="lg" className="h-14 w-full rounded-2xl text-base">
        <Link href="/patient/book-appointment">
          <CalendarPlus className="h-5 w-5" aria-hidden />
          {t("book")}
        </Link>
      </Button>

      <p className="text-center text-xs text-muted-foreground">{t("urgent")}</p>
    </div>
  );
}
