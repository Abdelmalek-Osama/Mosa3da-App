"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { QueueAction } from "@/server/domain/queue/constants";
import type { QueueEntryView } from "@/server/domain/queue/types";

const COPY: Partial<Record<QueueAction, { destructive?: boolean; reason?: boolean }>> = {
  start_consultation: {},
  finish_consultation: {},
  mark_absent: { reason: true },
  mark_late: {},
  cancel: { destructive: true, reason: true },
};

interface ConfirmActionDialogProps {
  entry: QueueEntryView | null;
  action: QueueAction | null;
  latePolicyConsultations: number;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason?: string) => void;
}

export function ConfirmActionDialog({ entry, action, latePolicyConsultations, pending, onOpenChange, onConfirm }: ConfirmActionDialogProps) {
  const t = useTranslations("queue.confirm");
  const [reason, setReason] = useState("");
  const open = !!entry && !!action;

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const meta = action ? COPY[action] : undefined;
  const values = {
    name: entry ? (entry.patientName.split(" ")[0] ?? entry.patientName) : "",
    number: entry?.queueNumber ? `#${entry.queueNumber}` : "",
    lateAfter: latePolicyConsultations,
  };
  const copy =
    entry && action && meta
      ? {
          ...meta,
          title: t(`${action}.title`, values),
          body: t(`${action}.body`, values),
          confirm: t(`${action}.confirm`, values),
        }
      : undefined;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {copy ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{copy.title}</AlertDialogTitle>
              <AlertDialogDescription>{copy.body}</AlertDialogDescription>
            </AlertDialogHeader>
            {copy.reason ? (
              <div className="space-y-2">
                <Label htmlFor="action-reason">{t("note")}</Label>
                <Textarea id="action-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder={t("notePlaceholder")} />
              </div>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>{t("back")}</AlertDialogCancel>
              <Button
                variant={copy.destructive ? "destructive" : action === "start_consultation" ? "secondary" : "default"}
                disabled={pending}
                onClick={() => onConfirm(reason.trim() || undefined)}
              >
                {pending ? <Loader2 className="animate-spin" /> : null}
                {copy.confirm}
              </Button>
            </AlertDialogFooter>
          </>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}
