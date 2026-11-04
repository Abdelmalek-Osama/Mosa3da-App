"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/lib/action-result";
import { AppError } from "@/lib/errors/app-error";
import { getActor, requireDoctor } from "@/server/authorization/actor";
import {
  addCustomVisitReason,
  deleteCustomVisitReason,
  listCustomVisitReasons,
  listVisitReasons,
  saveVisitReasons,
} from "@/server/application/settings/visit-reasons";
import { VISIT_REASONS } from "@/server/domain/queue/constants";

const minutes = z.coerce.number().int("Whole minutes only").min(5, "Minimum 5").max(180, "Maximum 180");

const saveSchema = z
  .object({
    builtin: z.array(z.object({ reason: z.enum(VISIT_REASONS), durationMinutes: minutes, isActive: z.boolean(), sortOrder: z.number().int().min(0).max(1000) })),
    custom: z
      .array(z.object({ id: z.string().uuid(), durationMinutes: minutes, isActive: z.boolean(), sortOrder: z.number().int().min(0).max(1000) }))
      .default([]),
  })
  .refine((v) => v.builtin.some((r) => r.isActive) || v.custom.some((r) => r.isActive), "Keep at least one reason available");

const addSchema = z.object({
  labelAr: z.string().trim().min(2, "Enter the reason name in Arabic").max(80),
  labelEn: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => v || undefined),
  durationMinutes: minutes,
});

/** Reasons offered to staff and visitors, in the doctor's order (signed-in users only). */
export async function listVisitReasonsAction() {
  return runAction("visit_reasons.list", async () => {
    const actor = await getActor();
    if (!actor) throw new AppError("UNAUTHENTICATED", "Please sign in to continue.");
    const [builtin, custom] = await Promise.all([listVisitReasons(actor.supabase), listCustomVisitReasons(actor.supabase)]);
    return { builtin, custom };
  });
}

export async function saveVisitReasonsAction(input: z.input<typeof saveSchema>) {
  return runAction("visit_reasons.save", async () => {
    const actor = await requireDoctor();
    const data = parseInput(saveSchema, input);
    const ok = await saveVisitReasons(actor.supabase, data.builtin, data.custom, actor.userId);
    if (!ok) throw new AppError("FORBIDDEN", "Only the doctor can change clinic settings.");
    revalidatePath("/admin/settings");
    return { saved: data.builtin.length + data.custom.length };
  });
}

export async function addVisitReasonAction(input: z.input<typeof addSchema>) {
  return runAction("visit_reasons.add", async () => {
    const actor = await requireDoctor();
    const data = parseInput(addSchema, input);
    const created = await addCustomVisitReason(actor.supabase, data, actor.userId);
    revalidatePath("/admin/settings");
    return created;
  });
}

export async function deleteVisitReasonAction(id: string) {
  return runAction("visit_reasons.delete", async () => {
    const actor = await requireDoctor();
    const ok = await deleteCustomVisitReason(actor.supabase, parseInput(z.string().uuid(), id));
    if (!ok) throw new AppError("FORBIDDEN", "Only the doctor can change clinic settings.");
    revalidatePath("/admin/settings");
    return { deleted: true };
  });
}
