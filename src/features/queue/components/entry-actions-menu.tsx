"use client";

import {
  ArrowDown,
  ArrowUp,
  Ban,
  CheckCircle2,
  Clock3,
  DoorOpen,
  MoreHorizontal,
  Play,
  Square,
  Timer,
  UserCheck,
  UserX,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { allowedActions } from "@/server/domain/queue/transitions";
import type { QueueAction } from "@/server/domain/queue/constants";
import type { QueueEntryView } from "@/server/domain/queue/types";
import { useQueueController } from "./queue-controller";

const ICONS: Record<QueueAction, LucideIcon> = {
  mark_arrived: UserCheck,
  mark_ready: CheckCircle2,
  mark_absent: UserX,
  start_consultation: Play,
  finish_consultation: Square,
  mark_late: Clock3,
  cancel: Ban,
};

export function EntryActionsMenu({
  entry,
  index,
  total,
}: {
  entry: QueueEntryView;
  /** 1-based position among waiting patients; omit to hide move actions */
  index?: number;
  total?: number;
}) {
  const { request, editDuration, move, hasCurrent, pending } = useQueueController();
  const t = useTranslations("queue");
  const actions = allowedActions({ status: entry.status, isAbsent: entry.isAbsent, hasCurrent });
  const canMove = index !== undefined && total !== undefined && !entry.isAbsent && entry.status !== "scheduled";
  const editable = entry.status !== "finished" && entry.status !== "cancelled";

  if (!actions.length && !editable) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-9 w-9" disabled={pending} aria-label={t("actionsFor", { name: entry.patientName })}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{entry.patientName}</DropdownMenuLabel>
        {actions
          .filter((a) => a !== "cancel")
          .map((action) => {
            const Icon = ICONS[action];
            return (
              <DropdownMenuItem key={action} onSelect={() => request(entry, action)}>
                <Icon /> {t(`actions.${action}`)}
              </DropdownMenuItem>
            );
          })}
        {editable ? (
          <DropdownMenuItem onSelect={() => editDuration(entry)}>
            <Timer /> {t("menu.duration")}
          </DropdownMenuItem>
        ) : null}
        {canMove ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={index! <= 1} onSelect={() => move(entry, index! - 1)}>
              <ArrowUp /> {t("menu.up")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={index! >= total!} onSelect={() => move(entry, index! + 1)}>
              <ArrowDown /> {t("menu.down")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={index! >= total!} onSelect={() => move(entry, total!)}>
              <DoorOpen /> {t("menu.end")}
            </DropdownMenuItem>
          </>
        ) : null}
        {actions.includes("cancel") ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => request(entry, "cancel")}>
              <Ban /> {t("actions.cancel")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
