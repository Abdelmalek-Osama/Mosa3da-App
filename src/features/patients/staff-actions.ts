"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction } from "@/lib/action-result";
import { PatientAdminService } from "@/server/application/patients/patient-admin-service";
import { requireStaff } from "@/server/authorization/actor";
import { staffPatientSchema, type StaffPatientInput } from "./staff-schemas";
import { z } from "zod";

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
