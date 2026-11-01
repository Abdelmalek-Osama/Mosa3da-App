"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";

/** Runs a Server Action, toasts the outcome and refreshes server data. */
export function useQueueMutation() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run<T>(action: () => Promise<ActionResult<T>>, successMessage: string | ((data: T) => string), onSuccess?: (data: T) => void) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(typeof successMessage === "function" ? successMessage(result.data) : successMessage);
        onSuccess?.(result.data);
        router.refresh();
      } else {
        toast.error(result.error.message);
        if (result.error.code === "STALE" || result.error.code === "CONFLICT") router.refresh();
      }
    });
  }

  return { pending, run };
}
