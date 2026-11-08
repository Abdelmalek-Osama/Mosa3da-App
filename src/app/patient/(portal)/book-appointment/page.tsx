import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requirePatient } from "@/server/authorization/actor";
import { BookingService } from "@/server/application/appointments/booking-service";
import { BookingFlow } from "@/features/appointments/components/booking-flow";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portal.booking");
  return { title: t("metaTitle") };
}
export const dynamic = "force-dynamic";

export default async function BookAppointmentPage() {
  const actor = await requirePatient();
  const service = new BookingService(actor.supabase);
  const [calendar, mine] = await Promise.all([service.getCalendar(), service.listMine().catch(() => [])]);
  // Days she already holds an active booking on (one booking per day).
  const bookedDays = mine.filter((a) => a.status === "scheduled" || a.status === "checked_in").map((a) => a.clinicDate);
  return <BookingFlow calendar={calendar} bookedDays={bookedDays} />;
}
