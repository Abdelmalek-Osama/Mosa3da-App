"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/lib/action-result";
import { AppointmentAdminService } from "@/server/application/appointments/appointment-admin-service";
import { BookingService } from "@/server/application/appointments/booking-service";
import { bookingConfirmationLink } from "@/server/application/appointments/confirmation-message";
import { getClinicSettings } from "@/server/application/settings/clinic-settings";
import { requireStaff } from "@/server/authorization/actor";
import { cancelAppointmentSchema, dateSchema, rescheduleSchema, staffBookSchema, type StaffBookInput } from "./schemas";

/** wa.me confirmation link with the assigned arrival time; null if it can't be built. */
async function confirmationFor(
  db: Parameters<typeof getClinicSettings>[0],
  service: AppointmentAdminService,
  patientId: string,
  booked: { clinic_date: string; scheduled_start: string },
): Promise<string | null> {
  try {
    const [settings, patient] = await Promise.all([getClinicSettings(db), service.contact(patientId)]);
    if (!patient) return null;
    return await bookingConfirmationLink({ clinicDate: booked.clinic_date, scheduledStart: booked.scheduled_start }, patient, settings);
  } catch {
    return null;
  }
}

function revalidateAll() {
  revalidatePath("/admin/appointments");
  revalidatePath("/admin/queue");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/patients", "layout");
}

export async function staffGetSlotsAction(date: string) {
  return runAction("appointments.staff_slots", async () => {
    const actor = await requireStaff();
    const day = parseInput(dateSchema, date);
    const [slots, occupants] = await Promise.all([
      new BookingService(actor.supabase).getSlots(day),
      new AppointmentAdminService(actor.supabase).occupants(day),
    ]);
    // Booked slots show who holds them, so reception sees why they are locked.
    return slots.map((s) => {
      if (s.available) return s;
      const from = Date.parse(s.start);
      const to = Date.parse(s.end);
      const holder = occupants.find((o) => o.start < to && o.end > from);
      return { ...s, bookedBy: holder?.name ?? null };
    });
  });
}

export async function staffBookAppointmentAction(input: StaffBookInput) {
  return runAction("appointments.staff_book", async () => {
    const actor = await requireStaff();
    const data = parseInput(staffBookSchema, input);
    const service = new AppointmentAdminService(actor.supabase);
    const result = await service.book(data);
    revalidateAll();
    return { ...result, whatsappUrl: await confirmationFor(actor.supabase, service, data.patientId, result) };
  });
}

export async function staffRescheduleAppointmentAction(input: { appointmentId: string; date: string }) {
  return runAction("appointments.staff_reschedule", async () => {
    const actor = await requireStaff();
    const data = parseInput(rescheduleSchema, input);
    const service = new AppointmentAdminService(actor.supabase);
    const result = await service.reschedule(data.appointmentId, data.date);
    revalidateAll();
    const patientId = await service.patientOf(data.appointmentId);
    return { ...result, whatsappUrl: patientId ? await confirmationFor(actor.supabase, service, patientId, result) : null };
  });
}

export async function staffCancelAppointmentAction(input: { appointmentId: string; reason?: string }) {
  return runAction("appointments.staff_cancel", async () => {
    const actor = await requireStaff();
    const data = parseInput(cancelAppointmentSchema, input);
    await new AppointmentAdminService(actor.supabase).cancel(data.appointmentId, data.reason);
    revalidateAll();
    return { cancelled: true };
  });
}

export async function checkInAppointmentAction(appointmentId: string) {
  return runAction("appointments.check_in", async () => {
    const actor = await requireStaff();
    const id = parseInput(z.string().uuid(), appointmentId);
    const result = await new AppointmentAdminService(actor.supabase).checkIn(id);
    revalidateAll();
    return result;
  });
}
