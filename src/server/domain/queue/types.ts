import type { QueueStatus, VisitReason } from "./constants";

/** Minimal shape the pure domain rules need. Dates are JS Date in UTC. */
export interface QueueEntryState {
  id: string;
  status: QueueStatus;
  position: number | null;
  createdAt: Date;
  estimatedDurationMinutes: number;
  startedAt: Date | null;
  missedTurnAt: Date | null;
  missedTurnBaseline: number | null;
}

export interface QueueEntryView {
  id: string;
  version: number;
  sessionId: string;
  clinicDate: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  appointmentId: string | null;
  queueNumber: number | null;
  position: number | null;
  visitReason: VisitReason;
  estimatedDurationMinutes: number;
  expectedStartAt: string | null;
  status: QueueStatus;
  isAbsent: boolean;
  missedTurnBaseline: number | null;
  arrivedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  staffNotes: string | null;
}

export interface QueueBoard {
  session: {
    id: string;
    clinicDate: string;
    opensAt: string;
    closesAt: string;
    status: "planned" | "open" | "closed";
    finishedConsultationsCount: number;
  };
  current: QueueEntryView | null;
  ready: QueueEntryView | null;
  waiting: QueueEntryView[];
  scheduled: QueueEntryView[];
  absent: QueueEntryView[];
  done: QueueEntryView[];
  stats: { waiting: number; late: number; finished: number; cancelled: number; scheduled: number };
}
