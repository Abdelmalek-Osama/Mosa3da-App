"use client";

import type { QueueBoard } from "@/server/domain/queue/types";
import { CurrentPanel } from "./current-panel";
import { NextPanel } from "./next-panel";
import { QueueController } from "./queue-controller";
import { AbsentList, DoneList, ScheduledList } from "./side-lists";
import { WaitingQueue } from "./waiting-queue";

export function QueueBoardView({
  board,
  timezone,
  latePolicyConsultations,
}: {
  board: QueueBoard;
  timezone: string;
  latePolicyConsultations: number;
}) {
  const waiting = board.ready ? [board.ready, ...board.waiting] : board.waiting;

  return (
    <QueueController
      timezone={timezone}
      latePolicyConsultations={latePolicyConsultations}
      finishedCount={board.session.finishedConsultationsCount}
      hasCurrent={!!board.current}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <CurrentPanel current={board.current} ready={board.ready} />
        <NextPanel ready={board.ready} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px] [&>*]:min-w-0">
        <div className="min-w-0 space-y-4">
          <AbsentList entries={board.absent} />
          <WaitingQueue entries={waiting} />
        </div>
        <div className="space-y-4">
          <ScheduledList entries={board.scheduled} />
          <DoneList entries={board.done} />
        </div>
      </div>
    </QueueController>
  );
}
