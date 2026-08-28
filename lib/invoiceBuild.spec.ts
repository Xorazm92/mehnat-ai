import { describe, it, expect } from "vitest";
import { buildInvoiceLines, nextInvoiceNumber } from "@/lib/invoiceBuild";

describe("buildInvoiceLines", () => {
  it("xizmat biriktirilmagan firmada bitta yig'ma satr yozadi", () => {
    const r = buildInvoiceLines({ services: [], termTotal: 2_500_000 });
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].amount).toBe(2_500_000);
    expect(r.total).toBe(2_500_000);
  });

  it("xizmatlardan satr yasaydi va miqdorni ko'paytiradi", () => {
    const r = buildInvoiceLines({
      services: [
        { serviceId: "s1", name: "Buxgalteriya", price: 2_000_000, qty: 1 },
        { serviceId: "s2", name: "Kadrlar", price: 250_000, qty: 2 },
      ],
      termTotal: 2_500_000,
    });
    expect(r.lines.map((l) => l.amount)).toEqual([2_000_000, 500_000]);
    expect(r.adjustment).toBe(0);
    expect(r.total).toBe(2_500_000);
  });

  it("xizmatlar yig'indisi shartnomadan kam bo'lsa farq satri qo'shiladi", () => {
    // Jami HAR DOIM shartnoma summasiga teng qoladi — mijoz bir summa
    // ko'rib, boshqasini to'lamasligi kerak.
    const r = buildInvoiceLines({
      services: [{ serviceId: "s1", name: "Buxgalteriya", price: 2_000_000, qty: 1 }],
      termTotal: 2_500_000,
    });
    expect(r.lines).toHaveLength(2);
    expect(r.lines[1].amount).toBe(500_000);
    expect(r.total).toBe(2_500_000);
  });

  it("xizmatlar shartnomadan ko'p bo'lsa chegirma satri qo'shiladi", () => {
    const r = buildInvoiceLines({
      services: [{ serviceId: "s1", name: "Buxgalteriya", price: 3_000_000, qty: 1 }],
      termTotal: 2_500_000,
    });
    expect(r.lines[1].amount).toBe(-500_000);
    expect(r.total).toBe(2_500_000);
  });

  it("narxsiz xizmat satr bermaydi", () => {
    const r = buildInvoiceLines({
      services: [{ serviceId: "s1", name: "Maslahat", price: 0, qty: 1 }],
      termTotal: 1_000_000,
    });
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].serviceId).toBeNull();
  });
});

describe("nextInvoiceNumber", () => {
  it("yilning birinchi schyoti 0001 bo'ladi", () => {
    expect(nextInvoiceNumber(2026, null)).toBe("2026-0001");
  });

  it("oxirgi raqamdan davom etadi", () => {
    expect(nextInvoiceNumber(2026, "2026-0041")).toBe("2026-0042");
  });

  it("yil almashganda hisob noldan boshlanadi", () => {
    expect(nextInvoiceNumber(2027, "2026-0142")).toBe("2027-0001");
  });
});
