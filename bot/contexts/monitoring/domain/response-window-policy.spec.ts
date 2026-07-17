import { describe, it, expect } from "vitest";
import { responseWindowForRole } from "./response-window-policy";

describe("responseWindowForRole", () => {
  it("maps roles to their regulament windows", () => {
    expect(responseWindowForRole("accountant").limitMinutes).toBe(10);
    expect(responseWindowForRole("bank_client").limitMinutes).toBe(5);
    expect(responseWindowForRole("controller").limitMinutes).toBe(10);
  });

  it("falls back to the accountant default for unknown/null roles", () => {
    expect(responseWindowForRole("supervisor").limitMinutes).toBe(10);
    expect(responseWindowForRole(null).limitMinutes).toBe(10);
    expect(responseWindowForRole(undefined).limitMinutes).toBe(10);
  });
});
