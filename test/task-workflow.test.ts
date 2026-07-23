import { describe, it, expect } from "vitest";
import { canTransitionTask, taskTimingPatch, computeSlaDue } from "@/lib/taskWorkflow";

describe("canTransitionTask", () => {
  it("legal transitions", () => {
    expect(canTransitionTask("open", "in_progress")).toBe(true);
    expect(canTransitionTask("in_progress", "blocked")).toBe(true);
    expect(canTransitionTask("in_progress", "done")).toBe(true);
    expect(canTransitionTask("blocked", "in_progress")).toBe(true);
    expect(canTransitionTask("done", "in_progress")).toBe(true); // reopen
  });
  it("illegal transitions blocked", () => {
    expect(canTransitionTask("open", "done")).toBe(false);
    expect(canTransitionTask("cancelled", "open")).toBe(false);
    expect(canTransitionTask("done", "done")).toBe(false);
  });
});

describe("taskTimingPatch", () => {
  const now = new Date(Date.UTC(2026, 6, 1, 10));
  it("in_progress → startedAt", () => {
    expect(taskTimingPatch("in_progress", now)).toEqual({ startedAt: now });
  });
  it("done/cancelled → completedAt", () => {
    expect(taskTimingPatch("done", now)).toEqual({ completedAt: now });
    expect(taskTimingPatch("cancelled", now)).toEqual({ completedAt: now });
  });
  it("blocked → empty", () => {
    expect(taskTimingPatch("blocked", now)).toEqual({});
  });
});

describe("computeSlaDue", () => {
  const from = new Date(Date.UTC(2026, 6, 1, 10, 0, 0));
  it("computes response + resolution due from minutes", () => {
    const r = computeSlaDue({ responseMinutes: 60, resolutionMinutes: 480 }, from);
    expect(r.responseDueAt!.toISOString()).toBe("2026-07-01T11:00:00.000Z"); // +60m
    expect(r.resolutionDueAt!.toISOString()).toBe("2026-07-01T18:00:00.000Z"); // +8h
  });
  it("null policy / null minutes → null", () => {
    expect(computeSlaDue(null, from)).toEqual({ responseDueAt: null, resolutionDueAt: null });
    expect(computeSlaDue({ responseMinutes: null, resolutionMinutes: 0 }, from)).toEqual({ responseDueAt: null, resolutionDueAt: null });
  });
});
