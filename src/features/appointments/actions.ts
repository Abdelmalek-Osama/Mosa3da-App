"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction } from "@/lib/action-result";
import { BookingService } from "@/server/application/appointments/booking-service";
import { getClinicSettings } from "@/server/application/settings/clinic-settings";
import { getShowFeesToAll, listClinicServices } from "@/server/application/settings/clinic-services";
import { requirePatient } from "@/server/authorization/actor";
import { bookAppointmentSchema, cancelAppointmentSchema, type BookAppointmentInput } from "./schemas";

export async function bookAppointmentAction(input: BookAppointmentInput) {
  return runAction("appointments.book", async () => {
    const actor = await requirePatient();
    const data = parseInput(bookAppointmentSchema, input);
    const booked = await new BookingService(actor.supabase).book(data);
    // Fees pop-up: after a first-ever booking, or after every booking when the
    // doctor turned on "Show to all visitors".
    const showAll = booked.isFirstBooking ? false : await getShowFeesToAll(actor.supabase);
    const fees =
      booked.isFirstBooking || showAll
        ? await Promise.all([listClinicServices(actor.supabase, { activeOnly: true }), getClinicSettings(actor.supabase)])
            .then(([services, settings]) =>
              // A returning visitor sees the pop-up only when there are prices to show.
              !booked.isFirstBooking && services.length === 0
                ? null
                : {
                    clinicName: settings.clinicName,
                    clinicNameAr: settings.clinicNameAr,
                    services: services.map((s) => ({ id: s.id, nameAr: s.nameAr, nameEn: s.nameEn, price: s.price })),
                  },
            )
            // The booking is already made; never fail it over the pop-up's data.
            .catch(() => null)
        : null;
    revalidatePath("/patient/dashboard");
    revalidatePath("/patient/my-appointments");
    revalidatePath("/admin/dashboard");
    revalidatePath("/admin/queue");
    return { ...booked, fees };
  });
}

export async function cancelMyAppointmentAction(input: { appointmentId: string; reason?: string }) {
  return runAction("appointments.cancel", async () => {
    const actor = await requirePatient();
    const data = parseInput(cancelAppointmentSchema, input);
    await new BookingService(actor.supabase).cancelMine(data.appointmentId, data.reason);
    revalidatePath("/patient/dashboard");
    revalidatePath("/patient/my-appointments");
    revalidatePath("/admin/queue");
    return { cancelled: true };
  });
}
