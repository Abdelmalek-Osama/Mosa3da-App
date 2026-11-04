"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction } from "@/lib/action-result";
import { AppError } from "@/lib/errors/app-error";
import { SettingsAdminService } from "@/server/application/settings/settings-admin-service";
import { requireDoctor } from "@/server/authorization/actor";
import { clinicSettingsSchema, workingDaysSchema, type ClinicSettingsInput, type WorkingDaysInput } from "./schemas";

export async function updateClinicSettingsAction(input: ClinicSettingsInput) {
  return runAction("settings.update", async () => {
    const actor = await requireDoctor();
    const data = parseInput(clinicSettingsSchema, input);
    const ok = await new SettingsAdminService(actor.supabase).update(data, actor.userId);
    if (!ok) throw new AppError("FORBIDDEN", "Only the doctor can change clinic settings.");
    revalidatePath("/", "layout");
    return { saved: true };
  });
}

export async function saveWorkingDaysAction(input: WorkingDaysInput, force = false) {
  return runAction("settings.working_days", async () => {
    const actor = await requireDoctor();
    const periods = parseInput(workingDaysSchema, input);
    const result = await new SettingsAdminService(actor.supabase).saveWorkingDays(periods, force);
    if (result.saved) revalidatePath("/", "layout");
    return result;
  });
}
