import { describe, it, expect } from "vitest";
import { assessDebt, type DebtInput } from "./debt";

const base: DebtInput = {
  contractAmount: 1_000_000,
  paidAmount: 0,
  status: "pending",
  paymentDay: 5,
  dayOfMonth: 5,
  monthsPast: 0,
};

describe("assessDebt", () => {
  it("reports no debt when paid or fully covered", () => {
    expect(assessDebt({ ...base, status: "paid" }).hasDebt).toBe(false);
    expect(assessDebt({ ...base, paidAmount: 1_000_000 }).hasDebt).toBe(false);
  });

  it("has debt but no level before the due day", () => {
    const r = assessDebt({ ...base, dayOfMonth: 3 }); // paymentDay 5
    expect(r.hasDebt).toBe(true);
    expect(r.level).toBeNull();
    expect(r.amountDue).toBe(1_000_000);
  });

  it("escalates yellow → orange → red by days past the due day", () => {
    expect(assessDebt({ ...base, dayOfMonth: 5 }).level).toBe("yellow"); // 0 days
    expect(assessDebt({ ...base, dayOfMonth: 8 }).level).toBe("orange"); // 3 days
    expect(assessDebt({ ...base, dayOfMonth: 12 }).level).toBe("red"); // 7 days
  });

  it("treats a partial payment as remaining debt", () => {
    const r = assessDebt({ ...base, paidAmount: 400_000, status: "partial", dayOfMonth: 8 });
    expect(r.amountDue).toBe(600_000);
    expect(r.level).toBe("orange");
  });

  it("marks any prior unpaid period red regardless of day", () => {
    expect(assessDebt({ ...base, monthsPast: 1, dayOfMonth: 1 }).level).toBe("red");
  });

  it("honours custom escalation thresholds", () => {
    const cfg = { orangeAfterDays: 1, redAfterDays: 2 };
    expect(assessDebt({ ...base, dayOfMonth: 7 }, cfg).level).toBe("red");
  });
});
