"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type LiveStatus = "connecting" | "live" | "polling";

const LIVE_TICK_MS = 60_000;

/**
 * Subscribes to Postgres changes (RLS-filtered) and refreshes the Server
 * Components on change. Falls back to polling while the socket is down and
 * refreshes when the tab regains focus. Server data is always re-fetched, so
 * a stale client can never overwrite newer state.
 */
export function useRealtimeRefresh({
  channel,
  tables,
  pollMs = 20_000,
}: {
  channel: string;
  tables: string[];
  pollMs?: number;
}): LiveStatus {
  const router = useRouter();
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const tablesKey = tables.join(",");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const refresh = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 350);
    };

    let sub = supabase.channel(channel);
    for (const table of tablesKey.split(",")) {
      sub = sub.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    }
    sub.subscribe((state) => {
      if (state === "SUBSCRIBED") setStatus("live");
      else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") setStatus("polling");
    });

    const onFocus = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onFocus);
      void supabase.removeChannel(sub);
    };
  }, [channel, tablesKey, router]);

  // Polling while the socket is down; a slow tick while live so time-based values
  // (expected times, countdowns) keep moving even when no row changes.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), status === "live" ? LIVE_TICK_MS : pollMs);
    return () => clearInterval(id);
  }, [status, pollMs, router]);

  return status;
}
