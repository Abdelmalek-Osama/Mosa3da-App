"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/lib/action-result";
import { AppError } from "@/lib/errors/app-error";
import { requireDoctor } from "@/server/authorization/actor";
import {
  addClinicService,
  deleteClinicService,
  setClinicServiceActive,
  updateClinicService,
} from "@/server/application/settings/clinic-services";

const serviceSchema = z.object({
  nameAr: z.string().trim().min(2, "Enter the service name in Arabic").max(80),
  nameEn: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => v || undefined),
  price: z.coerce.number({ invalid_type_error: "Enter a valid price" }).min(0, "Enter a valid price").max(1_000_000, "Enter a valid price"),
  isActive: z.boolean().default(true),
});
export type ServiceInput = z.input<typeof serviceSchema>;

const idSchema = z.string().uuid();
const FORBIDDEN = "Only the doctor can change clinic settings.";

function refresh() {
  revalidatePath("/admin/settings");
  revalidatePath("/patient/book-appointment");
}

export async function addServiceAction(input: ServiceInput) {
  return runAction("services.add", async () => {
    const actor = await requireDoctor();
    const data = parseInput(serviceSchema, input);
    const created = await addClinicService(actor.supabase, data, actor.userId);
    refresh();
    return created;
  });
}

export async function updateServiceAction(id: string, input: ServiceInput) {
  return runAction("services.update", async () => {
    const actor = await requireDoctor();
    const data = parseInput(serviceSchema, input);
    const updated = await updateClinicService(actor.supabase, parseInput(idSchema, id), data, actor.userId);
    if (!updated) throw new AppError("NOT_FOUND", "Service not found");
    refresh();
    return updated;
  });
}

export async function setServiceActiveAction(id: string, isActive: boolean) {
  return runAction("services.toggle", async () => {
    const actor = await requireDoctor();
    const ok = await setClinicServiceActive(actor.supabase, parseInput(idSchema, id), isActive, actor.userId);
    if (!ok) throw new AppError("FORBIDDEN", FORBIDDEN);
    refresh();
    return { isActive };
  });
}

export async function deleteServiceAction(id: string) {
  return runAction("services.delete", async () => {
    const actor = await requireDoctor();
    const ok = await deleteClinicService(actor.supabase, parseInput(idSchema, id));
    if (!ok) throw new AppError("FORBIDDEN", FORBIDDEN);
    refresh();
    return { deleted: true };
  });
}
