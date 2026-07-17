import { describe, it, expect } from "vitest";
import { buildReminderMessage, formatSom } from "./message";

describe("formatSom", () => {
  it("groups thousands with a space", () => {
    expect(formatSom(1_000_000)).toBe("1 000 000");
    expect(formatSom(999)).toBe("999");
    expect(formatSom(1234.6)).toBe("1 235");
  });
});

describe("buildReminderMessage", () => {
  const base = { companyName: "ACME MChJ", period: "2026-07", amountDue: 2_500_000 };

  it("yellow: friendly, includes company/period/amount", () => {
    const m = buildReminderMessage({ ...base, level: "yellow" });
    expect(m).toContain("🟡");
    expect(m).toContain("ACME MChJ");
    expect(m).toContain("2026-07");
    expect(m).toContain("2 500 000 so'm");
    expect(m).toContain("Iltimos to'lovni amalga oshiring.");
  });

  it("orange: second warning, mentions 3 days", () => {
    const m = buildReminderMessage({ ...base, level: "orange" });
    expect(m).toContain("⚠️ Ikkinchi ogohlantirish");
    expect(m).toContain("3 kundan beri");
  });

  it("red: urgent, mentions 7 days and that accountant + director are notified", () => {
    const m = buildReminderMessage({ ...base, level: "red" });
    expect(m).toContain("🚨 Oxirgi ogohlantirish");
    expect(m).toContain("7 kundan ortiq");
    expect(m).toContain("Mas'ul buxgalter va direktor xabardor qilindi.");
  });
});
