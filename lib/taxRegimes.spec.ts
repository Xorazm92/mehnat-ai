import { describe, it, expect } from "vitest";
import {
  TAX_REGIMES,
  TAX_REGIME_LABEL,
  TAX_REGIME_SHORT,
  legacyTaxType,
  normalizeTaxRegime,
  taxRegimeLabel,
} from "./taxRegimes";

describe("normalizeTaxRegime", () => {
  it("kanonik kodlarni o'zgartirmaydi", () => {
    for (const code of TAX_REGIMES) expect(normalizeTaxRegime(code)).toBe(code);
  });

  it("eski mijoz kalitini tushunadi", () => {
    expect(normalizeTaxRegime("nds_profit")).toBe("vat");
    expect(normalizeTaxRegime("nds")).toBe("vat");
  });

  it("registr va bo'shliq ahamiyatsiz", () => {
    expect(normalizeTaxRegime("  TURNOVER ")).toBe("turnover");
    expect(normalizeTaxRegime("YaTT")).toBe("yatt");
  });

  it("noma'lum qiymat vat ga tushadi", () => {
    for (const v of ["", null, undefined, "boshqa"]) {
      expect(normalizeTaxRegime(v)).toBe("vat");
    }
  });
});

describe("legacyTaxType — YO'QOTADIGAN o'girma", () => {
  it("vat va turnover to'g'ri o'giriladi", () => {
    expect(legacyTaxType("vat")).toBe("nds_profit");
    expect(legacyTaxType("turnover")).toBe("turnover");
  });

  /**
   * ILDIZ SABAB SHU: `taxType` uch qiymatli — `yatt` ham, `income` ham
   * "fixed" ga tushadi. Shuning uchun undan BAZAGA yozib bo'lmaydi:
   * tahrirlanmagan YaTT firma jimgina "qat'iy soliq" ga aylanardi.
   */
  it("yatt va income ikkalasi ham fixed ga tushadi — ma'lumot yo'qoladi", () => {
    expect(legacyTaxType("yatt")).toBe("fixed");
    expect(legacyTaxType("income")).toBe("fixed");
  });

  it("o'girma ortga QAYTMAYDI — shuning uchun kanonik maydon kerak", () => {
    for (const code of ["yatt", "income"] as const) {
      expect(normalizeTaxRegime(legacyTaxType(code))).not.toBe(code);
    }
  });

  it("vat va turnover uchun esa aylanma to'liq", () => {
    for (const code of ["vat", "turnover"] as const) {
      expect(normalizeTaxRegime(legacyTaxType(code))).toBe(code);
    }
  });
});

describe("yorliqlar", () => {
  it("har bir rejimda nom va qisqa belgi bor", () => {
    for (const code of TAX_REGIMES) {
      expect(TAX_REGIME_LABEL[code]).toBeTruthy();
      expect(TAX_REGIME_SHORT[code]).toBeTruthy();
    }
  });

  /** Foydalanuvchi so'radi: ekranda "VAT" emas, "NDS" turishi kerak. */
  it("QQS rejimi NDS deb ataladi, VAT deb emas", () => {
    expect(TAX_REGIME_LABEL.vat).toBe("NDS");
    expect(TAX_REGIME_SHORT.vat).toBe("NDS");
    for (const v of Object.values(TAX_REGIME_LABEL)) expect(v).not.toMatch(/VAT/i);
    for (const v of Object.values(TAX_REGIME_SHORT)) expect(v).not.toMatch(/VAT/i);
  });

  it("eski mijoz kaliti ham nom oladi", () => {
    expect(taxRegimeLabel("nds_profit")).toBe("NDS");
  });
});
