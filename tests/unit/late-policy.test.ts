import { describe, expect, it } from "vitest";
import { consultationsUntilLate, findLateTransitions, shouldBecomeLate } from "@/server/domain/queue/late-policy";
import type { QueueEntryState } from "@/server/domain/queue/types";

const base: QueueEntryState = {
  id: "b",
  status: "arrived",
  position: 2,
  createdAt: new Date("2026-11-01T12:00:00Z"),
  estimatedDurationMinutes: 20,
  startedAt: null,
  missedTurnAt: new Date("2026-11-01T12:50:00Z"),
  missedTurnBaseline: 1, // A finished (count = 1) before B was marked absent
};

describe("late patient policy", () => {
  it("does not count the consultation that caused the missed turn", () => {
    expect(shouldBecomeLate(base, 1)).toBe(false);
    expect(consultationsUntilLate(base, 1)).toBe(2);
  });

  it("waits for two subsequent consultations", () => {
    expect(shouldBecomeLate(base, 2)).toBe(false);
    expect(consultationsUntilLate(base, 2)).toBe(1);
    expect(shouldBecomeLate(base, 3)).toBe(true);
  });

  it("is cancelled once the patient returns (missed turn cleared)", () => {
    expect(shouldBecomeLate({ ...base, missedTurnAt: null, missedTurnBaseline: null }, 10)).toBe(false);
  });

  it("only applies to waiting patients", () => {
    expect(shouldBecomeLate({ ...base, status: "cancelled" }, 10)).toBe(false);
  });

  it("orders multiple late transitions by when the turn was missed", () => {
    const c = { ...base, id: "c", missedTurnAt: new Date("2026-11-01T12:40:00Z"), missedTurnBaseline: 0 };
    expect(findLateTransitions([base, c], 3)).toEqual(["c", "b"]);
  });

  it("respects a configured threshold", () => {
    expect(shouldBecomeLate(base, 2, 1)).toBe(true);
  });
});
