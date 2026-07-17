import { describe, it, expect } from "vitest";
import { ResponseWindow } from "./response-window";

describe("ResponseWindow", () => {
  it("is not breached at or under the limit", () => {
    const w = ResponseWindow.ofMinutes(10); // accountant
    expect(w.isBreached(9)).toBe(false);
    expect(w.isBreached(10)).toBe(false);
    expect(w.minutesOver(10)).toBe(0);
  });

  it("is breached past the limit and reports the overage", () => {
    const w = ResponseWindow.ofMinutes(5); // bank-client
    expect(w.isBreached(6)).toBe(true);
    expect(w.minutesOver(12.5)).toBe(7.5);
  });

  it("rejects non-positive limits", () => {
    expect(() => ResponseWindow.ofMinutes(0)).toThrow();
    expect(() => ResponseWindow.ofMinutes(-3)).toThrow();
  });
});
