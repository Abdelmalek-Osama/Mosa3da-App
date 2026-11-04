import "server-only";
import { z } from "zod";
import { fromPostgrestError } from "@/lib/errors/postgres";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getWhatsAppProvider, reminderChannel } from "@/server/integrations/whatsapp";

const pendingSchema = z.object({
  id: z.string().uuid(),
  idempotency_key: z.string(),
  recipient_phone: z.string(),
  message_body: z.string(),
  template_key: z.string(),
  template_params: z.array(z.unknown()).catch([]),
  locale: z.enum(["ar", "en"]).catch("ar"),
  attempts: z.number().int(),
});

const MAX_ATTEMPTS = 3;

export interface NotificationRunSummary {
  enqueued: number;
  sent: number;
  failed: number;
  /** "whatsapp_link": staff send each one from the clinic phone. "whatsapp": sent automatically. */
  channel: "whatsapp" | "whatsapp_link";
}

/**
 * 1. Enqueue "turn approaching" rows (and, from cron, tomorrow's appointment
 *    reminders). The unique idempotency_key means a row is never duplicated.
 * 2. Paid mode only: pending rows on the "whatsapp" channel are claimed with a
 *    conditional update (status still pending, attempts unchanged) so
 *    overlapping runs cannot send the same row twice, then sent.
 *    Free mode rows ("whatsapp_link") wait for a staff member to tap Send.
 */
export async function processDueNotifications(
  { includeAppointmentReminders = false }: { includeAppointmentReminders?: boolean } = {},
): Promise<NotificationRunSummary> {
  const db = createSupabaseAdminClient();
  const channel = reminderChannel();

  const turn = await db.rpc("enqueue_due_notifications", { p_channel: channel });
  if (turn.error) throw fromPostgrestError(turn.error);
  let enqueued = Array.isArray(turn.data) ? turn.data.length : 0;

  // 30 minutes before a booking that has not checked in yet (P2-18).
  const soon = await db.rpc("enqueue_pre_appointment_alerts", { p_channel: channel });
  if (soon.error) throw fromPostgrestError(soon.error);
  enqueued += Array.isArray(soon.data) ? soon.data.length : 0;

  if (includeAppointmentReminders) {
    const appts = await db.rpc("enqueue_appointment_reminders", { p_channel: channel });
    if (appts.error) throw fromPostgrestError(appts.error);
    enqueued += Array.isArray(appts.data) ? appts.data.length : 0;
  }

  const { sent, failed } = channel === "whatsapp" ? await sendPending(db) : { sent: 0, failed: 0 };
  const summary: NotificationRunSummary = { enqueued, sent, failed, channel };
  logger.info("notifications.run", { ...summary });
  return summary;
}

async function sendPending(db: ReturnType<typeof createSupabaseAdminClient>, onlyId?: string) {
  const provider = getWhatsAppProvider();
  let query = db
    .from("notification_logs")
    .select("id, idempotency_key, recipient_phone, message_body, template_key, template_params, locale, attempts")
    .eq("status", "pending")
    .eq("channel", "whatsapp")
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at")
    .limit(50);
  if (onlyId) query = query.eq("id", onlyId);
  const pending = await query;
  if (pending.error) throw fromPostgrestError(pending.error);

  let sent = 0;
  let failed = 0;

  for (const row of z.array(pendingSchema).parse(pending.data)) {
    const claim = await db
      .from("notification_logs")
      .update({ attempts: row.attempts + 1 })
      .eq("id", row.id)
      .eq("status", "pending")
      .eq("attempts", row.attempts)
      .select("id")
      .maybeSingle();
    if (claim.error || !claim.data) continue; // claimed by another run

    const result = await provider.send({
      to: row.recipient_phone,
      body: row.message_body,
      templateKey: row.template_key,
      params: row.template_params.map(String),
      locale: row.locale,
      idempotencyKey: row.idempotency_key,
    });

    const now = new Date().toISOString();
    const update = result.ok
      ? { status: "sent" as const, sent_at: now, provider_message_id: result.providerMessageId, error_message: null }
      : row.attempts + 1 >= MAX_ATTEMPTS || !result.retryable
        ? { status: "failed" as const, failed_at: now, error_message: result.error }
        : { error_message: result.error };

    const { error } = await db.from("notification_logs").update(update).eq("id", row.id);
    if (error) logger.error("notifications.update_failed", { id: row.id, error });
    if (result.ok) sent += 1;
    else failed += 1;
  }
  return { sent, failed };
}

/** Paid mode: send one row right away (staff "WhatsApp reminder" button). */
export async function sendNotificationNow(id: string): Promise<{ status: string; error: string | null }> {
  const db = createSupabaseAdminClient();
  await sendPending(db, id);
  const { data, error } = await db.from("notification_logs").select("status, error_message").eq("id", id).single();
  if (error) throw fromPostgrestError(error);
  return { status: data.status as string, error: (data.error_message as string | null) ?? null };
}

/** Best-effort trigger after queue mutations; never fails the user's action. */
export async function processDueNotificationsSafely(): Promise<void> {
  try {
    await processDueNotifications();
  } catch (error) {
    logger.warn("notifications.run_failed", { error });
  }
}

const TICK_MS = 60_000;
let lastTick = 0;

/**
 * Time-based alerts (turn approaching, 30 minutes before a booking) need a
 * frequent trigger, but Vercel Hobby cron runs once a day. The lobby TV polls
 * /api/display every few seconds all day, so it doubles as the ticker: at most
 * one run per minute per server instance. Every run is idempotent.
 */
export async function tickNotifications(): Promise<void> {
  const now = Date.now();
  if (now - lastTick < TICK_MS) return;
  lastTick = now;
  await processDueNotificationsSafely();
}
