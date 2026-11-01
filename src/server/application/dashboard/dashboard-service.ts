import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromPostgrestError } from "@/lib/errors/postgres";
import { QueueService } from "@/server/application/queue/queue-service";
import type { QueueBoard } from "@/server/domain/queue/types";
import { waMeLink } from "@/server/integrations/whatsapp/config";

const notificationSchema = z.object({
  id: z.string().uuid(),
  message_body: z.string(),
  status: z.enum(["pending", "sent", "failed", "skipped"]),
  channel: z.enum(["whatsapp_simulated", "whatsapp", "whatsapp_link"]),
  template_key: z.string(),
  recipient_phone: z.string(),
  created_at: z.string(),
  sent_at: z.string().nullable(),
  opened_at: z.string().nullable(),
  patient: z.object({ full_name: z.string() }).nullable(),
});

export interface NotificationItem {
  id: string;
  patientName: string;
  message: string;
  status: "pending" | "sent" | "failed" | "skipped";
  channel: "whatsapp_simulated" | "whatsapp" | "whatsapp_link";
  kind: "turn" | "appointment";
  createdAt: string;
  sentAt: string | null;
  openedAt: string | null;
  /** One-tap wa.me link with the message ready (free mode only). */
  waLink: string | null;
}

export interface DashboardData {
  board: QueueBoard;
  totals: { patients: number; appointmentsToday: number };
  notifications: NotificationItem[];
}

export async function getDashboardData(db: SupabaseClient): Promise<DashboardData> {
  const board = await new QueueService(db).getBoard();

  const [patients, appointments, notifications] = await Promise.all([
    db.from("patients").select("id", { count: "exact", head: true }).eq("is_active", true),
    db
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("clinic_date", board.session.clinicDate)
      .neq("status", "cancelled"),
    db
      .from("notification_logs")
      .select("id, message_body, status, channel, template_key, recipient_phone, created_at, sent_at, opened_at, patient:patients(full_name)")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  if (patients.error) throw fromPostgrestError(patients.error);
  if (appointments.error) throw fromPostgrestError(appointments.error);
  if (notifications.error) throw fromPostgrestError(notifications.error);

  return {
    board,
    totals: { patients: patients.count ?? 0, appointmentsToday: appointments.count ?? 0 },
    notifications: z
      .array(notificationSchema)
      .parse(notifications.data)
      .map((n) => ({
        id: n.id,
        patientName: n.patient?.full_name ?? "Patient",
        message: n.message_body,
        status: n.status,
        channel: n.channel,
        kind: n.template_key === "appointment_reminder" ? ("appointment" as const) : ("turn" as const),
        createdAt: n.created_at,
        sentAt: n.sent_at,
        openedAt: n.opened_at,
        waLink: n.channel === "whatsapp_link" ? waMeLink(n.recipient_phone, n.message_body) : null,
      })),
  };
}
