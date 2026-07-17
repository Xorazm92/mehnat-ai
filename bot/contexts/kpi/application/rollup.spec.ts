import { describe, it, expect } from "vitest";
import { rollupLedger } from "./rollup";

describe("rollupLedger", () => {
  it("nets signed points and breaks them down by type", () => {
    const r = rollupLedger([
      { type: "response", points: 1 },
      { type: "response", points: 1 },
      { type: "response", points: -1 },
      { type: "manual", points: 2.5 },
      { type: "manual", points: -0.5 },
    ]);
    expect(r.net).toBe(3);
    expect(r.count).toBe(5);
    expect(r.byType.response).toBe(1);
    expect(r.byType.manual).toBe(2);
  });

  it("is float-safe and avoids -0", () => {
    const r = rollupLedger([
      { type: "manual", points: 0.1 },
      { type: "manual", points: 0.2 },
      { type: "response", points: -0.3 },
    ]);
    expect(r.byType.manual).toBe(0.3);
    expect(r.net).toBe(0);
  });

  it("handles an empty ledger", () => {
    expect(rollupLedger([])).toEqual({ net: 0, count: 0, byType: {} });
  });
});
