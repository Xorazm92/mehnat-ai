/**
 * Eksport — formula injection himoyasi.
 *
 * Bu himoya ilgari FAQAT CSV yo'lida bor edi, xlsx yo'lida yo'q — holbuki xavf
 * aynan Excel'da: `=`, `+`, `-`, `@` bilan boshlangan katak ochilganda formula
 * sifatida bajariladi. Mijoz nomi yoki izoh maydoniga shunday satr yozilsa,
 * eksport qilingan fayl boshqa xodimning mashinasida ishga tushardi.
 */
import { describe, it, expect } from "vitest";
import { neutralizeFormula } from "@/lib/exportTable";

describe("neutralizeFormula", () => {
  it("formula boshlaydigan belgilarni zararsizlantiradi", () => {
    for (const s of ["=1+1", "+ded", "-cmd", "@SUM(A1)"]) {
      expect(neutralizeFormula(s), s).toBe(`'${s}`);
    }
  });

  it("klassik hujum vektori", () => {
    // Excel bu qatorni ochilganda tashqi buyruq ishga tushirishga urinadi.
    const attack = '=cmd|\' /C calc\'!A0';
    expect(neutralizeFormula(attack).startsWith("'=")).toBe(true);
  });

  it("oddiy matnga tegmaydi", () => {
    for (const s of ["Artel MChJ", "301234567", "12.5%", "", "  bo'sh joy"]) {
      expect(neutralizeFormula(s), s).toBe(s);
    }
  });

  it("manfiy son ham himoyalanadi — bu qasddan", () => {
    // "-500" formula sifatida ham o'qilishi mumkin. Eksportda u MATN sifatida
    // ketadi; raqam kerak bo'lsa chaqiruvchi `number` uzatadi va writeSheet
    // uni zararsizlantirmaydi.
    expect(neutralizeFormula("-500")).toBe("'-500");
  });
});
