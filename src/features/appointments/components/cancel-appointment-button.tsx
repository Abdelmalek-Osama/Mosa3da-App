"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cancelMyAppointmentAction } from "@/features/appointments/actions";

export function CancelAppointmentButton({ appointmentId }: { appointmentId: string }) {
  const t = useTranslations("portal.cancel");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const confirm = () =>
    start(async () => {
      const res = await cancelMyAppointmentAction({ appointmentId, reason });
      if (res.ok) {
        toast.success(t("done"), { description: t("doneBody") });
        setOpen(false);
      } else {
        toast.error(t("failed"), { description: res.error.message });
      }
    });

  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full rounded-lg text-destructive hover:bg-destructive/5 hover:text-destructive">
          {t("button")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-[calc(100%-2rem)] rounded-2xl sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("body")}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={`reason-${appointmentId}`}>
            {t("reason")} <span className="font-normal text-muted-foreground">{t("optional")}</span>
          </Label>
          <Textarea id={`reason-${appointmentId}`} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("keep")}</AlertDialogCancel>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {t("confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
