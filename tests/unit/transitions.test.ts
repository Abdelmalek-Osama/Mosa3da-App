import { describe, expect, it } from "vitest";
import { allowedActions } from "@/server/domain/queue/transitions";

describe("allowedActions", () => {
  it("Ready patient can start only when nobody is consulting", () => {
    expect(allowedActions({ status: "ready", isAbsent: false, hasCurrent: false })).toContain("start_consultation");
    expect(allowedActions({ status: "ready", isAbsent: false, hasCurrent: true })).not.toContain("start_consultation");
  });

  it("Ready patient can be marked absent", () => {
    expect(allowedActions({ status: "ready", isAbsent: false, hasCurrent: true })).toContain("mark_absent");
  });

  it("Current patient can only be finished", () => {
    expect(allowedActions({ status: "current", isAbsent: false, hasCurrent: true })).toEqual(["finish_consultation"]);
  });

  it("absent patient can be marked arrived but not started", () => {
    const actions = allowedActions({ status: "arrived", isAbsent: true, hasCurrent: false });
    expect(actions).toContain("mark_arrived");
    expect(actions).not.toContain("start_consultation");
  });

  it("terminal statuses have no actions", () => {
    expect(allowedActions({ status: "finished", isAbsent: false, hasCurrent: false })).toEqual([]);
    expect(allowedActions({ status: "cancelled", isAbsent: false, hasCurrent: false })).toEqual([]);
  });
});
