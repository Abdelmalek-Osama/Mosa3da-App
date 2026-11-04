"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCheck, Loader2, MessageCircle, UserCheck, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { checkInAppointmentAction, staffCancelAppointmentAction } from "@/features/appointments/staff-actions";
import { BookAppointmentDialog } from "./book-appointment-dialog";
import { sendAppointmentReminderAction } from "@/features/notifications/actions";

export function AppointmentRowActions({
  appointmentId,
  patientName,
  canCheckIn,
  canCancel,
  autoSend = false,
  confirmHref,
  reschedule,
}: {
  appointmentId: string;
  patientName: string;
  canCheckIn: boolean;
  canCancel: boolean;
  autoSend?: boolean;
  /** wa.me link with the booking confirmation ready (P1-12). */
  confirmHref?: string;
  /** Data for the Reschedule button (P1-08). */
  reschedule?: {
    timezone: string;
    today: string;
    clinicDate: string;
    scheduledStart: string;
    patient: { id: string; fullName: string; phone: string };
  };
}) {
  const router = useRouter();
  const t = useTranslations("appointments.row");
  const tr = useTranslations("reminders");
  const tc = useTranslations("appointments.confirmWa");
  const [reminding, startRemind] = useTransition();
  const [checking, startCheck] = useTransition();
  const [cancelling, startCancel] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!canCheckIn && !canCancel) return null;

  const checkIn = () =>
    startCheck(async () => {
      const res = await checkInAppointmentAction(appointmentId);
      if (res.ok) {
        toast.success(t("checkedIn", { name: patientName }), { description: t("checkedInBody") });
        router.refresh();
      } else toast.error(res.error.message);
    });

  // A scheduled (cancellable) appointment can get a WhatsApp reminder.
  const remind = () => {
    // Open the tab synchronously so mobile browsers don't block it, then point it at wa.me.
    const tab = autoSend ? null : window.open("about:blank", "_blank");
    startRemind(async () => {
      const res = await sendAppointmentReminderAction(appointmentId);
      if (!res.ok) {
        tab?.close();
        toast.error(res.error.message);
        return;
      }
      if (res.data.mode === "link") {
        if (tab) tab.location.href = res.data.url;
        else window.location.href = res.data.url;
        toast.info(tr("rowOpened"));
      } else {
        tab?.close();
        if (res.data.status === "sent") toast.success(tr("rowSent"));
        else if (res.data.status === "queued") toast.info(tr("rowQueued"));
        else toast.error(tr("rowFailed", { error: res.data.error ?? "" }));
      }
      router.refresh();
    });
  };

  const cancel = () =>
    startCancel(async () => {
      const res = await staffCancelAppointmentAction({ appointmentId, reason });
      if (res.ok) {
        toast.success(t("cancelled"));
        setOpen(false);
        setReason("");
        router.refresh();
      } else toast.error(res.error.message);
    });

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {canCheckIn ? (
        <Button size="sm" variant="secondary" onClick={checkIn} disabled={checking}>
          {checking ? <Loader2 className="animate-spin" /> : <UserCheck />} {t("checkIn")}
        </Button>
      ) : null}
      {canCancel && reschedule ? (
        <BookAppointmentDialog
          timezone={reschedule.timezone}
          today={reschedule.today}
          patient={reschedule.patient}
          reschedule={{ appointmentId, clinicDate: reschedule.clinicDate, currentStart: reschedule.scheduledStart }}
          trigger={
            <Button size="sm" variant="outline">
              <CalendarClock /> {t("reschedule")}
            </Button>
          }
        />
      ) : null}
      {confirmHref ? (
        <Button asChild size="sm" variant="outline">
          <a href={confirmHref} target="_blank" rel="noopener noreferrer">
            <CheckCheck className="text-[#1fa855]" /> {tc("button")}
          </a>
        </Button>
      ) : null}
      {canCancel ? (
        <Button size="sm" variant="outline" onClick={remind} disabled={reminding}>
          {reminding ? <Loader2 className="animate-spin" /> : <MessageCircle className="text-[#1fa855]" />} {tr("rowAction")}
        </Button>
      ) : null}
      {canCancel ? (
        <AlertDialog open={open} onOpenChange={(o) => !cancelling && setOpen(o)}>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/5 hover:text-destructive">
              <XCircle /> {t("cancel")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("title", { name: patientName })}</AlertDialogTitle>
              <AlertDialogDescription>{t("body")}</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor={`cr-${appointmentId}`}>{t("reason")}</Label>
              <Textarea id={`cr-${appointmentId}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={cancelling}>{t("keep")}</AlertDialogCancel>
              <Button variant="destructive" onClick={cancel} disabled={cancelling}>
                {cancelling ? <Loader2 className="animate-spin" /> : null} {t("confirm")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}
