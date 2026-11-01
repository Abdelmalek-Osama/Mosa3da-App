import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requirePatient } from "@/server/authorization/actor";
import { BookingService, isUpcoming } from "@/server/application/appointments/booking-service";
import { clinicDateOf } from "@/lib/format";
import { MyAppointmentsView } from "@/features/appointments/components/my-appointments-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portal.visits");
  return { title: t("metaTitle") };
}
export const dynamic = "force-dynamic";

export default async function MyAppointmentsPage() {
  const actor = await requirePatient();
  const service = new BookingService(actor.supabase);
  const [appointments, calendar] = await Promise.all([service.listMine(), service.getCalendar()]);

  const today = clinicDateOf(Date.now(), calendar.timezone);
  const upcoming = appointments
    .filter((a) => isUpcoming(a, today))
    .sort((a, b) => (a.scheduledStart ?? a.clinicDate).localeCompare(b.scheduledStart ?? b.clinicDate));
  const past = appointments.filter((a) => !isUpcoming(a, today));

  return (
    <MyAppointmentsView
      upcoming={upcoming}
      past={past}
      timeZone={calendar.timezone}
      cancellationCutoffMinutes={calendar.cancellationCutoffMinutes}
      now={Date.now()}
    />
  );
}
