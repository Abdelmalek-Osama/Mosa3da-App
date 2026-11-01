"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction } from "@/lib/action-result";
import { BookingService } from "@/server/application/appointments/booking-service";
import { requirePatient } from "@/server/authorization/actor";
import { bookAppointmentSchema, cancelAppointmentSchema, dateSchema, type BookAppointmentInput } from "./schemas";

export async function getSlotsAction(date: string) {
  return runAction("appointments.slots", async () => {
    const actor = await requirePatient();
    return new BookingService(actor.supabase).getSlots(parseInput(dateSchema, date));
  });
}

export async function bookAppointmentAction(input: BookAppointmentInput) {
  return runAction("appointments.book", async () => {
    const actor = await requirePatient();
    const data = parseInput(bookAppointmentSchema, input);
    const result = await new BookingService(actor.supabase).book(data);
    revalidatePath("/patient/dashboard");
    revalidatePath("/patient/my-appointments");
    revalidatePath("/admin/dashboard");
    revalidatePath("/admin/queue");
    return result;
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
