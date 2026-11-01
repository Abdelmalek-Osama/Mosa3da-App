"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LOCALE_COOKIE, isLocale } from "./config";

export async function setLocaleAction(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  cookies().set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });

  // A signed-in patient also gets her WhatsApp messages in this language.
  // RLS limits the update to her own row; staff and visitors match no rows.
  try {
    const supabase = createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await supabase.from("patients").update({ preferred_locale: locale }).eq("auth_user_id", data.user.id);
    }
  } catch (error) {
    logger.warn("locale.patient_update_failed", { error });
  }
  revalidatePath("/", "layout");
}
