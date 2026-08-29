import { describe, it, expect } from "vitest";
import { canTransition, permissionForTransition, timingPatch } from "@/lib/engines/workflow/obligationWorkflow";

describe("canTransition", () => {
  it("qonuniy o'tishlar", () => {
    expect(canTransition("planned", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "ready")).toBe(true);
    expect(canTransition("ready", "sent")).toBe(true);
    expect(canTransition("sent", "accepted")).toBe(true);
    expect(canTransition("sent", "rejected")).toBe(true);
    expect(canTransition("rejected", "ready")).toBe(true); // qayta ishlash
  });
  it("noqonuniy o'tishlar bloklanadi", () => {
    expect(canTransition("planned", "accepted")).toBe(false); // sakrash yo'q
    expect(canTransition("accepted", "in_progress")).toBe(false); // terminal
    expect(canTransition("cancelled", "planned")).toBe(false); // terminal
    expect(canTransition("sent", "ready")).toBe(false);
  });
});

describe("permissionForTransition", () => {
  it("accept/reject/cancel → senior permission", () => {
    expect(permissionForTransition("accepted")).toBe("obligation:accept");
    expect(permissionForTransition("rejected")).toBe("obligation:reject");
    expect(permissionForTransition("cancelled")).toBe("obligation:cancel");
  });
  it("oddiy o'tishlar → change-status", () => {
    expect(permissionForTransition("in_progress")).toBe("obligation:change-status");
    expect(permissionForTransition("ready")).toBe("obligation:change-status");
    expect(permissionForTransition("sent")).toBe("obligation:change-status");
  });
});

describe("timingPatch", () => {
  const now = new Date(Date.UTC(2026, 6, 1));
  it("sent → sentAt", () => {
    expect(timingPatch("sent", now)).toEqual({ sentAt: now });
  });
  it("accepted → acceptedAt + completedAt", () => {
    expect(timingPatch("accepted", now)).toEqual({ acceptedAt: now, completedAt: now });
  });
  it("cancelled → completedAt", () => {
    expect(timingPatch("cancelled", now)).toEqual({ completedAt: now });
  });
  it("oddiy o'tish → bo'sh", () => {
    expect(timingPatch("in_progress", now)).toEqual({});
  });
});
