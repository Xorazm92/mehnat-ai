import { describe, it, expect } from "vitest";
import { canTransitionTask, taskTimingPatch } from "@/lib/taskWorkflow";

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

