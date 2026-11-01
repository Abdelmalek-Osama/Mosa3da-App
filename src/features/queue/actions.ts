"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction, type ActionResult } from "@/lib/action-result";
import { requirePatient, requireStaff } from "@/server/authorization/actor";
import { QueueService } from "@/server/application/queue/queue-service";
import {
  processDueNotifications,
  processDueNotificationsSafely,
  type NotificationRunSummary,
} from "@/server/application/notifications/process-notifications";
import type { QueueBoard } from "@/server/domain/queue/types";
import {
  durationSchema,
  patientSearchSchema,
  reorderSchema,
  transitionSchema,
  walkInSchema,
  type DurationInput,
  type MyQueueStatus,
  type ReorderInput,
  type TransitionInput,
  type WalkInInput,
} from "./schemas";

function revalidateQueueViews() {
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/queue");
  revalidatePath("/patient/dashboard");
}

async function afterMutation() {
  revalidateQueueViews();
  await processDueNotificationsSafely();
}

export async function getQueueBoardAction(): Promise<ActionResult<QueueBoard>> {
  return runAction("queue.board", async () => {
    const actor = await requireStaff();
    return new QueueService(actor.supabase).getBoard();
  });
}

export async function registerWalkInAction(input: WalkInInput) {
  return runAction("queue.walk_in", async () => {
    const actor = await requireStaff();
    const data = parseInput(walkInSchema, input);
    const result = await new QueueService(actor.supabase).registerWalkIn({
      patientId: data.mode === "existing" ? data.patientId : undefined,
      fullName: data.mode === "new" ? data.fullName : undefined,
      phone: data.mode === "new" ? data.phone : undefined,
      visitReason: data.visitReason,
      visitReasonDetails: data.visitReasonDetails,
      durationMinutes: data.durationMinutes,
      notes: data.notes,
    });
    await afterMutation();
    return result;
  });
}

export async function transitionQueueEntryAction(input: TransitionInput) {
  return runAction("queue.transition", async () => {
    const actor = await requireStaff();
    const data = parseInput(transitionSchema, input);
    const result = await new QueueService(actor.supabase).transition(
      data.entryId,
      data.action,
      data.expectedVersion,
      data.reason,
    );
    await afterMutation();
    return result;
  });
}

export async function reorderQueueEntryAction(input: ReorderInput) {
  return runAction("queue.reorder", async () => {
    const actor = await requireStaff();
    const data = parseInput(reorderSchema, input);
    const result = await new QueueService(actor.supabase).reorder(data.entryId, data.newIndex, data.expectedVersion);
    await afterMutation();
    return result;
  });
}

export async function updateQueueDurationAction(input: DurationInput) {
  return runAction("queue.duration", async () => {
    const actor = await requireStaff();
    const data = parseInput(durationSchema, input);
    const result = await new QueueService(actor.supabase).updateDuration(
      data.entryId,
      data.durationMinutes,
      data.expectedVersion,
    );
    await afterMutation();
    return result;
  });
}

export async function searchPatientsAction(query: string) {
  return runAction("patients.search", async () => {
    const actor = await requireStaff();
    const data = parseInput(patientSearchSchema, { query });
    return new QueueService(actor.supabase).searchPatients(data.query);
  });
}

export async function getMyQueueStatusAction(): Promise<ActionResult<MyQueueStatus>> {
  return runAction("queue.my_status", async () => {
    const actor = await requirePatient();
    return new QueueService(actor.supabase).getMyStatus();
  });
}

/** Demo button: run the WhatsApp simulation now instead of waiting for cron. */
export async function runNotificationSimulationAction(): Promise<ActionResult<NotificationRunSummary>> {
  return runAction("notifications.simulate", async () => {
    await requireStaff();
    const summary = await processDueNotifications({ includeAppointmentReminders: true });
    revalidatePath("/admin/dashboard");
    return summary;
  });
}
