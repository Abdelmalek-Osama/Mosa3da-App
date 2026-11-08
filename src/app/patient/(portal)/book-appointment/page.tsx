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
  const calendar = await new BookingService(actor.supabase).getCalendar();
  return <BookingFlow calendar={calendar} />;
}
