"use client";

import { useEffect, useState } from "react";
import { VISIT_REASONS, type VisitReason } from "@/server/domain/queue/constants";
import { listVisitReasonsAction } from "./visit-reason-actions";

export interface ReasonOption {
  reason: VisitReason;
  durationMinutes: number | null;
}

/**
 * Active visit reasons in the doctor's order, with their default duration
 * (P3-19). Falls back to the fixed list until (or if) the settings load.
 */
export function useVisitReasons(enabled = true): ReasonOption[] {
  const [options, setOptions] = useState<ReasonOption[]>(() => VISIT_REASONS.map((reason) => ({ reason, durationMinutes: null })));

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    listVisitReasonsAction().then((res) => {
      if (cancelled || !res.ok || res.data.length === 0) return;
      setOptions(res.data.filter((r) => r.isActive).map((r) => ({ reason: r.reason, durationMinutes: r.durationMinutes })));
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return options;
}
