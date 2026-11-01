import Link from "next/link";
import { CalendarPlus, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { canCancelOnline, type PatientAppointment } from "@/server/application/appointments/booking-service";
import { AppointmentCard } from "@/features/patients/components/appointment-card";
import { CancelAppointmentButton } from "./cancel-appointment-button";

export interface MyAppointmentsViewProps {
  upcoming: PatientAppointment[];
  past: PatientAppointment[];
  timeZone: string;
  cancellationCutoffMinutes: number;
  now: number;
}

export function MyAppointmentsView({ upcoming, past, timeZone: tz, cancellationCutoffMinutes, now }: MyAppointmentsViewProps) {
  const t = useTranslations("portal.visits");
  const cutoffHours = Math.round((cancellationCutoffMinutes / 60) * 10) / 10;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-navy-900">{t("title")}</h1>
        <Button asChild size="sm" className="rounded-lg">
          <Link href="/patient/book-appointment">
            <CalendarPlus /> {t("book")}
          </Link>
        </Button>
      </div>

      <section aria-labelledby="upcoming" className="space-y-3">
        <h2 id="upcoming" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("upcoming")}
        </h2>
        {upcoming.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">{t("none")}</div>
        ) : (
          upcoming.map((a, i) => (
            <AppointmentCard key={a.id} appointment={a} timeZone={tz} emphasis={i === 0}>
              {canCancelOnline(a, cancellationCutoffMinutes, now) ? (
                <CancelAppointmentButton appointmentId={a.id} />
              ) : a.status === "scheduled" ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {t("tooLate", { hours: cutoffHours })}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">{t("checkedIn")}</p>
              )}
            </AppointmentCard>
          ))
        )}
      </section>

      {past.length > 0 ? (
        <section aria-labelledby="past" className="space-y-3">
          <h2 id="past" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("past")}
          </h2>
          {past.map((a) => (
            <AppointmentCard key={a.id} appointment={a} timeZone={tz} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
