"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { reorderQueueEntryAction, transitionQueueEntryAction, updateQueueDurationAction } from "@/features/queue/actions";
import { CONFIRM_ACTIONS } from "@/server/domain/queue/transitions";
import type { QueueAction } from "@/server/domain/queue/constants";
import type { QueueEntryView } from "@/server/domain/queue/types";
import { ConfirmActionDialog } from "./confirm-action-dialog";
import { DurationDialog } from "./duration-dialog";
import { useQueueMutation } from "./use-queue-mutation";

interface QueueControllerValue {
  pending: boolean;
  timezone: string;
  latePolicyConsultations: number;
  finishedCount: number;
  hasCurrent: boolean;
  request: (entry: QueueEntryView, action: QueueAction) => void;
  editDuration: (entry: QueueEntryView) => void;
  move: (entry: QueueEntryView, newIndex: number) => void;
}

const QueueControllerContext = createContext<QueueControllerValue | null>(null);

export function useQueueController() {
  const ctx = useContext(QueueControllerContext);
  if (!ctx) throw new Error("useQueueController must be used inside <QueueController>");
  return ctx;
}

export function QueueController({
  children,
  timezone,
  latePolicyConsultations,
  finishedCount,
  hasCurrent,
}: {
  children: React.ReactNode;
  timezone: string;
  latePolicyConsultations: number;
  finishedCount: number;
  hasCurrent: boolean;
}) {
  const t = useTranslations("queue.toast");
  const { pending, run } = useQueueMutation();
  const [confirm, setConfirm] = useState<{ entry: QueueEntryView; action: QueueAction } | null>(null);
  const [durationEntry, setDurationEntry] = useState<QueueEntryView | null>(null);

  const execute = useCallback(
    (entry: QueueEntryView, action: QueueAction, reason?: string) => {
      const first = entry.patientName.split(" ")[0] ?? entry.patientName;
      run(
        () => transitionQueueEntryAction({ entryId: entry.id, action, expectedVersion: entry.version, reason }),
        (data) =>
          data.late_transitions > 0
            ? `${t(action, { name: first })} · ${t("movedLate", { count: data.late_transitions })}`
            : t(action, { name: first }),
        () => setConfirm(null),
      );
    },
    [run, t],
  );

  const value = useMemo<QueueControllerValue>(
    () => ({
      pending,
      timezone,
      latePolicyConsultations,
      finishedCount,
      hasCurrent,
      request: (entry, action) => (CONFIRM_ACTIONS.has(action) ? setConfirm({ entry, action }) : execute(entry, action)),
      editDuration: setDurationEntry,
      move: (entry, newIndex) =>
        run(() => reorderQueueEntryAction({ entryId: entry.id, newIndex, expectedVersion: entry.version }), t("moved", { name: entry.patientName })),
    }),
    [pending, timezone, latePolicyConsultations, finishedCount, hasCurrent, execute, run, t],
  );

  return (
    <QueueControllerContext.Provider value={value}>
      {children}
      <ConfirmActionDialog
        entry={confirm?.entry ?? null}
        action={confirm?.action ?? null}
        latePolicyConsultations={latePolicyConsultations}
        pending={pending}
        onOpenChange={(open) => !open && !pending && setConfirm(null)}
        onConfirm={(reason) => confirm && execute(confirm.entry, confirm.action, reason)}
      />
      <DurationDialog
        entry={durationEntry}
        pending={pending}
        onOpenChange={(open) => !open && setDurationEntry(null)}
        onSave={(minutes) =>
          durationEntry &&
          run(
            () => updateQueueDurationAction({ entryId: durationEntry.id, durationMinutes: minutes, expectedVersion: durationEntry.version }),
            t("duration"),
            () => setDurationEntry(null),
          )
        }
      />
    </QueueControllerContext.Provider>
  );
}

