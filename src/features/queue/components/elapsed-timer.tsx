"use client";

import { useEffect, useState } from "react";
import { elapsedSince } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ElapsedTimer({ startedAt, plannedMinutes, className }: { startedAt: string | null; plannedMinutes: number; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const { minutes, label } = elapsedSince(startedAt, now);
  const over = minutes >= plannedMinutes;
  return (
    <span className={cn("tabular font-semibold", over ? "text-destructive" : "text-teal-700", className)} suppressHydrationWarning>
      {label}
    </span>
  );
}
