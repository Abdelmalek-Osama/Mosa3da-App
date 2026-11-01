"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function getSupabaseBrowserClient() {
  browserClient ??= createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseKey);
  return browserClient;
}
