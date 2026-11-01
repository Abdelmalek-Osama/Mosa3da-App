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
  const calendar = await service.getCalendar();
  const firstFree = calendar.dates.find((d) => d.free > 0)?.date;
  const initialSlots = firstFree ? { date: firstFree, slots: await service.getSlots(firstFree) } : null;
  return <BookingFlow calendar={calendar} initialSlots={initialSlots} />;
}
