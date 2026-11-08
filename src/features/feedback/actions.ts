"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/lib/action-result";
import { saveVisitFeedback } from "@/server/application/feedback/visit-feedback";
import { requirePatient } from "@/server/authorization/actor";

const submitSchema = z.object({
  appointmentId: z.string().uuid(),
  rating: z.number().int().min(1, "Choose a rating from 1 to 5 stars").max(5, "Choose a rating from 1 to 5 stars"),
  comment: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => v || undefined),
});

export async function submitFeedbackAction(input: z.input<typeof submitSchema>) {
  return runAction("feedback.submit", async () => {
    const actor = await requirePatient();
    const data = parseInput(submitSchema, input);
    const saved = await saveVisitFeedback(actor.supabase, data.appointmentId, data.rating, data.comment);
    revalidatePath("/patient/dashboard");
    revalidatePath("/admin/reviews");
    return { saved };
  });
}

/** "Later / Close": this visit is not asked about again. */
export async function dismissFeedbackAction(appointmentId: string) {
  return runAction("feedback.dismiss", async () => {
    const actor = await requirePatient();
    const id = parseInput(z.string().uuid(), appointmentId);
    const saved = await saveVisitFeedback(actor.supabase, id, null);
    revalidatePath("/patient/dashboard");
    return { saved };
  });
}
