"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/lib/action-result";
import { AppError } from "@/lib/errors/app-error";
import { getActor, requireDoctor } from "@/server/authorization/actor";
import { listVisitReasons, saveVisitReasons } from "@/server/application/settings/visit-reasons";
import { VISIT_REASONS } from "@/server/domain/queue/constants";

const rowsSchema = z
  .array(
    z.object({
      reason: z.enum(VISIT_REASONS),
      durationMinutes: z.coerce.number().int("Whole minutes only").min(5, "Minimum 5").max(180, "Maximum 180"),
      isActive: z.boolean(),
      sortOrder: z.number().int().min(0).max(100),
    }),
  )
  .min(1)
  .refine((rows) => rows.some((r) => r.isActive), "Keep at least one reason available");

/** Reasons offered to staff and visitors, in the doctor's order (signed-in users only). */
export async function listVisitReasonsAction() {
  return runAction("visit_reasons.list", async () => {
    const actor = await getActor();
    if (!actor) throw new AppError("UNAUTHENTICATED", "Please sign in to continue.");
    return listVisitReasons(actor.supabase);
  });
}

export async function saveVisitReasonsAction(input: z.input<typeof rowsSchema>) {
  return runAction("visit_reasons.save", async () => {
    const actor = await requireDoctor();
    const rows = parseInput(rowsSchema, input);
    const ok = await saveVisitReasons(actor.supabase, rows, actor.userId);
    if (!ok) throw new AppError("FORBIDDEN", "Only the doctor can change clinic settings.");
    revalidatePath("/admin/settings");
    return { saved: rows.length };
  });
}
