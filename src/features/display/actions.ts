"use server";

import { z } from "zod";
import { parseInput, runAction } from "@/lib/action-result";
import { fromPostgrestError } from "@/lib/errors/postgres";
import { requireStaff } from "@/server/authorization/actor";

/** Switches the lobby TV between Arabic only and the Arabic + English split layout (P2-16). */
export async function setDisplayBilingualAction(on: boolean) {
  return runAction("display.set_bilingual", async () => {
    const actor = await requireStaff();
    const value = parseInput(z.boolean(), on);
    const { data, error } = await actor.supabase.rpc("set_display_bilingual", { p_on: value });
    if (error) throw fromPostgrestError(error);
    return { bilingual: z.boolean().parse(data) };
  });
}
