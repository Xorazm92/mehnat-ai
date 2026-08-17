import { describe, it, expect } from "vitest";
import { columnAppliesToRegime, regimeBlockReason } from "./reportApplicability";

describe("columnAppliesToRegime", () => {
  it("QQS ustuni faqat QQS to'lovchida", () => {
    expect(columnAppliesToRegime("qqs", "vat")).toBe(true);
    expect(columnAppliesToRegime("qqs", "turnover")).toBe(false);
    expect(columnAppliesToRegime("qqs_tolov", "turnover")).toBe(false);
  });

  it("Aylanma ustuni faqat aylanma rejimida", () => {
    expect(columnAppliesToRegime("aylanma", "turnover")).toBe(true);
    expect(columnAppliesToRegime("aylanma", "vat")).toBe(false);
    expect(columnAppliesToRegime("aylanma_tolov", "vat")).toBe(false);
  });

  it("ikkalasi bir-birini istisno qiladi", () => {
    for (const regime of ["vat", "turnover"]) {
      const qqs = columnAppliesToRegime("qqs", regime);
      const ayl = columnAppliesToRegime("aylanma", regime);
      expect(qqs).not.toBe(ayl);
    }
  });

  it("boshqa rejimlarda ikkalasi ham yopiq", () => {
    // Qat'iy soliq / YaTT — na QQS, na aylanma deklaratsiyasi.
    for (const regime of ["fixed", "yatt", "income"]) {
      expect(columnAppliesToRegime("qqs", regime)).toBe(false);
      expect(columnAppliesToRegime("aylanma", regime)).toBe(false);
    }
  });

  it("qolgan ustunlar hamma rejimga tegishli", () => {
    for (const col of ["didox", "inps", "inps_tolov", "yer_soligi", "one_c"]) {
      expect(columnAppliesToRegime(col, "vat")).toBe(true);
      expect(columnAppliesToRegime(col, "turnover")).toBe(true);
      expect(columnAppliesToRegime(col, "fixed")).toBe(true);
    }
  });

  /**
   * Xavfsiz taraf: noma'lum rejim tufayli katak qulflansa, buxgalter
   * hisobotni topshira olmay qolardi.
   */
  it("rejim noma'lum bo'lsa katak OCHIQ qoladi", () => {
    for (const regime of ["", "   ", null, undefined]) {
      expect(columnAppliesToRegime("qqs", regime)).toBe(true);
      expect(columnAppliesToRegime("aylanma", regime)).toBe(true);
    }
  });

  it("registr ahamiyatsiz", () => {
    expect(columnAppliesToRegime("qqs", "VAT")).toBe(true);
    expect(columnAppliesToRegime("aylanma", "  Turnover  ")).toBe(true);
  });
});

describe("regimeBlockReason", () => {
  it("ochiq katakda sabab yo'q", () => {
    expect(regimeBlockReason("qqs", "vat")).toBeNull();
    expect(regimeBlockReason("didox", "turnover")).toBeNull();
  });

  it("yopiq katakda sabab tushunarli", () => {
    expect(regimeBlockReason("qqs", "turnover")).toMatch(/QQS to'lovchi/);
    expect(regimeBlockReason("aylanma", "vat")).toMatch(/aylanma rejimidagi/);
  });
});
