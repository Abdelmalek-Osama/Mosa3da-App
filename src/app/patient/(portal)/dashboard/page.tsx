import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requirePatient } from "@/server/authorization/actor";
import { QueueService } from "@/server/application/queue/queue-service";
import { BookingService, isUpcoming } from "@/server/application/appointments/booking-service";
import { getClinicSettings } from "@/server/application/settings/clinic-settings";
import { clinicDateOf } from "@/lib/format";
import { PatientDashboardView } from "@/features/patients/components/dashboard-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portal.dashboard");
  return { title: t("metaTitle") };
}
export const dynamic = "force-dynamic";

export default async function PatientDashboardPage({ searchParams }: { searchParams: { welcome?: string } }) {
  const actor = await requirePatient();
  const [status, appointments, settings] = await Promise.all([
    new QueueService(actor.supabase).getMyStatus(),
    new BookingService(actor.supabase).listMine(),
    getClinicSettings(actor.supabase),
  ]);

  const today = clinicDateOf(Date.now(), settings.timezone);
  const upcoming = appointments
    .filter((a) => isUpcoming(a, today))
    .sort((a, b) => (a.scheduledStart ?? a.clinicDate).localeCompare(b.scheduledStart ?? b.clinicDate));

  return (
    <PatientDashboardView
      fullName={actor.fullName}
      status={status}
      upcoming={upcoming}
      settings={settings}
      welcome={!!searchParams.welcome}
    />
  );
}
