"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, parseInput, type ActionResult } from "@/lib/action-result";
import { AppError } from "@/lib/errors/app-error";
import { fromPostgrestError } from "@/lib/errors/postgres";
import { sendNotificationNow } from "@/server/application/notifications/process-notifications";
import { requireStaff } from "@/server/authorization/actor";
import { reminderChannel, waMeLink } from "@/server/integrations/whatsapp";

const idSchema = z.object({ id: z.string().uuid() });

/** Records that staff opened the wa.me link. This is NOT proof that the message was sent. */
export async function markNotificationOpenedAction(id: string): Promise<ActionResult<{ openedAt: string }>> {
  return runAction("notifications.mark_opened", async () => {
    const actor = await requireStaff();
    const data = parseInput(idSchema, { id });
    const { data: row, error } = await actor.supabase.rpc("mark_notification_opened", { p_id: data.id });
    if (error) throw fromPostgrestError(error);
    revalidatePath("/admin/dashboard");
    return { openedAt: (row as { opened_at: string }).opened_at };
  });
}

export type AppointmentReminderResult =
  | { mode: "link"; url: string; notificationId: string }
  | { mode: "auto"; status: "sent" | "queued" | "failed"; error: string | null };

/** Staff "WhatsApp reminder" button on an appointment. */
export async function sendAppointmentReminderAction(appointmentId: string): Promise<ActionResult<AppointmentReminderResult>> {
  return runAction("notifications.appointment_reminder", async () => {
    const actor = await requireStaff();
    const data = parseInput(idSchema, { id: appointmentId });
    const channel = reminderChannel();
    const { data: row, error } = await actor.supabase.rpc("queue_appointment_reminder", {
      p_appointment_id: data.id,
      p_channel: channel,
    });
    if (error) throw fromPostgrestError(error);
    const n = row as { id: string; channel: string; recipient_phone: string; message_body: string; status: string } | null;
    if (!n?.id) throw new AppError("INTERNAL", "Could not prepare the reminder");

    revalidatePath("/admin/dashboard");
    if (n.channel === "whatsapp_link") {
      await actor.supabase.rpc("mark_notification_opened", { p_id: n.id });
      return { mode: "link", url: waMeLink(n.recipient_phone, n.message_body), notificationId: n.id };
    }
    if (n.channel !== "whatsapp") {
      // A legacy simulated row exists for this appointment; never claim it was sent.
      return { mode: "auto", status: "failed", error: "WhatsApp is not configured." };
    }
    const sent = n.status === "pending" ? await sendNotificationNow(n.id) : { status: n.status, error: null };
    return {
      mode: "auto",
      status: sent.status === "sent" ? "sent" : sent.status === "failed" ? "failed" : "queued",
      error: sent.error,
    };
  });
}
