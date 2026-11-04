import { CalendarClock, Clock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { formatClinicDate, formatTime } from "@/lib/format";
import { visitReasonText } from "@/server/domain/queue/constants";
import type { PatientAppointment } from "@/server/application/appointments/booking-service";

const STATUS_CLASS: Record<PatientAppointment["status"], string> = {
  scheduled: "bg-teal-50 text-teal-800 ring-teal-200",
  checked_in: "bg-blue-50 text-blue-700 ring-blue-200",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  cancelled: "bg-slate-100 text-slate-500 ring-slate-200",
  no_show: "bg-orange-50 text-orange-700 ring-orange-200",
};

export function AppointmentStatusPill({ status }: { status: PatientAppointment["status"] }) {
  const t = useTranslations("appointmentStatus");
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", STATUS_CLASS[status])}>
      {t(status)}
    </span>
  );
}

export function AppointmentCard({
  appointment,
  timeZone,
  children,
  emphasis = false,
}: {
  appointment: PatientAppointment;
  timeZone?: string;
  children?: React.ReactNode;
  emphasis?: boolean;
}) {
  const t = useTranslations("common");
  const tReason = useTranslations("visitReason");
  const locale = useLocale() as Locale;
  return (
    <article
      className={cn(
        "rounded-2xl border bg-card p-4 shadow-soft",
        emphasis && "border-teal-200 bg-gradient-to-br from-teal-50/70 to-card",
        appointment.status === "cancelled" && "opacity-75",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-navy-900">
            <CalendarClock className="h-4 w-4 shrink-0 text-teal-600" aria-hidden />
            <span className="truncate">{formatClinicDate(appointment.clinicDate, { year: undefined }, locale)}</span>
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" aria-hidden />
            {appointment.scheduledStart ? formatTime(appointment.scheduledStart, timeZone, locale) : t("walkIn")}
            <span aria-hidden>·</span>
            {t("minutes", { count: appointment.durationMinutes })}
          </p>
        </div>
        <AppointmentStatusPill status={appointment.status} />
      </div>
      <div className="mt-3 rounded-xl bg-muted/60 px-3 py-2 text-sm">
        <span className="font-medium text-foreground">{visitReasonText(appointment.visitReason, appointment.visitReasonDetails, tReason)}</span>
        {appointment.visitReasonDetails ? <p className="mt-0.5 text-xs text-muted-foreground">{appointment.visitReasonDetails}</p> : null}
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </article>
  );
}
