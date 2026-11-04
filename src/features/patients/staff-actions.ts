"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction } from "@/lib/action-result";
import { PatientAdminService } from "@/server/application/patients/patient-admin-service";
import { requireStaff } from "@/server/authorization/actor";
import { staffPatientSchema, type StaffPatientInput } from "./staff-schemas";
import { z } from "zod";
import { AppError } from "@/lib/errors/app-error";
import { fromPostgrestError } from "@/lib/errors/postgres";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function createPatientAction(input: StaffPatientInput) {
  return runAction("patients.create", async () => {
    const actor = await requireStaff();
    const data = parseInput(staffPatientSchema, input);
    const result = await new PatientAdminService(actor.supabase).create(data, actor.userId);
    revalidatePath("/admin/patients");
    revalidatePath("/admin/dashboard");
    return result;
  });
}

export async function updatePatientAction(id: string, input: StaffPatientInput) {
  return runAction("patients.update", async () => {
    const actor = await requireStaff();
    const patientId = parseInput(z.string().uuid(), id);
    const data = parseInput(staffPatientSchema, input);
    await new PatientAdminService(actor.supabase).update(patientId, data);
    revalidatePath("/admin/patients");
    revalidatePath(`/admin/patients/${patientId}`);
    return { updated: true };
  });
}

/**
 * Permanently deletes a visitor (refused while she is in today's queue), then
 * her portal login, if any, with the Admin API (server-only).
 */
export async function deletePatientAction(id: string) {
  return runAction("patients.delete", async () => {
    const actor = await requireStaff();
    const patientId = parseInput(z.string().uuid(), id);
    const { data, error } = await actor.supabase.rpc("delete_patient", { p_patient_id: patientId });
    if (error) throw fromPostgrestError(error);
    const result = z.object({ deleted: z.boolean(), auth_user_id: z.string().uuid().nullable(), full_name: z.string() }).parse(data);
    if (result.auth_user_id) {
      const { error: authError } = await createSupabaseAdminClient().auth.admin.deleteUser(result.auth_user_id);
      if (authError) {
        logger.error("patients.delete_auth_failed", { error: authError });
        throw new AppError("INTERNAL", "The visitor was deleted, but her portal login could not be removed.");
      }
    }
    revalidatePath("/admin/patients");
    revalidatePath("/admin/dashboard");
    return { deleted: true, fullName: result.full_name };
  });
}