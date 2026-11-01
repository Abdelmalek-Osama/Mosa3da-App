import { describe, expect, it } from "vitest";
import { minutesUntil, projectQueue } from "@/server/domain/queue/projection";
import type { QueueEntryState } from "@/server/domain/queue/types";

const at = (hhmm: string) => new Date(`2026-11-01T${hhmm}:00Z`);
let seq = 0;
function entry(partial: Partial<QueueEntryState>): QueueEntryState {
  seq += 1;
  return {
    id: `00000000-0000-0000-0000-${String(seq).padStart(12, "0")}`,
    status: "arrived",
    position: seq,
    createdAt: at("10:00"),
    estimatedDurationMinutes: 20,
    startedAt: null,
    missedTurnAt: null,
    missedTurnBaseline: null,
    ...partial,
  };
}
const hhmm = (d: Date | null | undefined) => d?.toISOString().slice(11, 16) ?? null;

describe("projectQueue — ExpectedStart(N) = ExpectedStart(N-1) + Duration(N-1)", () => {
  it("matches the specification example (14:30 / 14:45 / 15:05)", () => {
    const a = entry({ status: "ready", position: 1, estimatedDurationMinutes: 15 });
    const b = entry({ position: 2, estimatedDurationMinutes: 20 });
    const c = entry({ position: 3, estimatedDurationMinutes: 20 });
    const { expectedStart, projectedEnd } = projectQueue({ entries: [a, b, c], opensAt: at("14:30"), now: at("12:00") });
    expect([a, b, c].map((e) => hhmm(expectedStart.get(e.id)))).toEqual(["14:30", "14:45", "15:05"]);
    expect(hhmm(projectedEnd)).toBe("15:25");
  });

  it("anchors at now when the clinic is already open and nobody is consulting", () => {
    const a = entry({ status: "ready", estimatedDurationMinutes: 10 });
    const b = entry({});
    const { expectedStart } = projectQueue({ entries: [a, b], opensAt: at("14:30"), now: at("15:00") });
    expect(hhmm(expectedStart.get(a.id))).toBe("15:00");
    expect(hhmm(expectedStart.get(b.id))).toBe("15:10");
  });

  it("adds the remaining time of the running consultation", () => {
    const cur = entry({ status: "current", startedAt: at("14:30"), estimatedDurationMinutes: 20 });
    const next = entry({ status: "ready" });
    const { expectedStart } = projectQueue({ entries: [cur, next], opensAt: at("14:30"), now: at("14:40") });
    expect(hhmm(expectedStart.get(cur.id))).toBe("14:30");
    expect(hhmm(expectedStart.get(next.id))).toBe("14:50");
  });

  it("anchors at now when the running consultation overruns", () => {
    const cur = entry({ status: "current", startedAt: at("14:30"), estimatedDurationMinutes: 20 });
    const next = entry({ status: "ready" });
    const { expectedStart } = projectQueue({ entries: [cur, next], opensAt: at("14:30"), now: at("15:05") });
    expect(hhmm(expectedStart.get(next.id))).toBe("15:05");
  });

  it("excludes finished, cancelled, scheduled and absent patients", () => {
    const done = entry({ status: "finished" });
    const cancelled = entry({ status: "cancelled" });
    const scheduled = entry({ status: "scheduled", position: null });
    const absent = entry({ missedTurnAt: at("14:00"), missedTurnBaseline: 1 });
    const waiting = entry({ status: "ready", estimatedDurationMinutes: 15 });
    const late = entry({ status: "late", position: 99 });
    const { expectedStart, order } = projectQueue({
      entries: [done, cancelled, scheduled, absent, waiting, late],
      opensAt: at("14:30"),
      now: at("12:00"),
    });
    expect(order).toEqual([waiting.id, late.id]);
    expect(expectedStart.get(done.id)).toBeNull();
    expect(expectedStart.get(absent.id)).toBeNull();
    expect(hhmm(expectedStart.get(late.id))).toBe("14:45");
  });

  it("puts the Ready patient first and is deterministic on ties", () => {
    const a = entry({ position: 1 });
    const b = entry({ position: 2, status: "ready" });
    const { order } = projectQueue({ entries: [a, b], opensAt: at("14:30"), now: at("12:00") });
    expect(order).toEqual([b.id, a.id]);
  });

  it("minutesUntil never goes negative", () => {
    expect(minutesUntil(at("14:30"), at("14:00"))).toBe(30);
    expect(minutesUntil(at("14:30"), at("15:00"))).toBe(0);
    expect(minutesUntil(null, at("15:00"))).toBeNull();
  });
});
