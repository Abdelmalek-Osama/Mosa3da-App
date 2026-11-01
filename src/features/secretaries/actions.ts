"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction } from "@/lib/action-result";
import { SecretaryService } from "@/server/application/secretaries/secretary-service";
import { requireDoctor } from "@/server/authorization/actor";
import { createSecretarySchema, resetPasswordSchema, setActiveSchema, type CreateSecretaryInput } from "./schemas";

export async function createSecretaryAction(input: CreateSecretaryInput) {
  return runAction("secretaries.create", async () => {
    const actor = await requireDoctor();
    const data = parseInput(createSecretarySchema, input);
    const result = await new SecretaryService(actor.supabase, actor.userId).create(data);
    revalidatePath("/admin/secretaries");
    return result;
  });
}

export async function setSecretaryActiveAction(input: { id: string; active: boolean }) {
  return runAction("secretaries.set_active", async () => {
    const actor = await requireDoctor();
    const data = parseInput(setActiveSchema, input);
    await new SecretaryService(actor.supabase, actor.userId).setActive(data.id, data.active);
    revalidatePath("/admin/secretaries");
    return { active: data.active };
  });
}

export async function resetSecretaryPasswordAction(input: { id: string; password: string }) {
  return runAction("secretaries.reset_password", async () => {
    const actor = await requireDoctor();
    const data = parseInput(resetPasswordSchema, input);
    await new SecretaryService(actor.supabase, actor.userId).resetPassword(data.id, data.password);
    return { reset: true };
  });
}
