/**
 * 1C «Задолженность покупателей» KESIM hisobotini o'qish.
 *
 * Eng muhim tekshiruv — POG'ONALARNING ADASHMASLIGI. Hisobot uch pog'onali
 * daraxt (mijoz → shartnoma → bizning firma) bo'lib, tekis qatorlarga
 * yoyilgan va pog'ona belgisi faylda YO'Q. Bir pog'ona adashsa, o'z
 * firmalarimiz mijoz bo'lib qarzdorlar ro'yxatiga tushadi yoki bitta mijoz
 * ikki marta sanaladi.
 *
 * Nazorat qoidasi: SHARTNOMA jamilari MIJOZ jamilariga teng bo'lishi shart.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { parseDebtSnapshot, contractKindOf } = await import("@/lib/debtReport");

const TITLE = "Задолженность покупателей за 31 июля 2026 г.";
const row = (name: string, debt?: number, advance?: number) => ({
  [TITLE]: name,
  ...(debt !== undefined ? { Column3: debt } : {}),
  ...(advance !== undefined ? { Column4: advance } : {}),
});

const header = [
  { [TITLE]: "Сортировка:", Column2: "Документ По возрастанию" },
  { [TITLE]: "Покупатель", Column3: "Расчеты на 31.07.26" },
  { [TITLE]: "Договор", Column3: "Долг", Column4: "Аванс" },
  { [TITLE]: "Организация" },
];

describe("parseDebtSnapshot", () => {
  it("uch pog'onani ajratadi va sanani oladi", () => {
    const p = parseDebtSnapshot([
      ...header,
      row("Mijoz A", 1_500_000),
      row("№25/26БК от 05.01.2026", 900_000),
      row('"Seven`S Up" Mchj', 900_000),
      row("№29/БК от 12.08.2025", 600_000),
      row('"Seven`S Up" Mchj', 600_000),
    ]);

    expect(p.asOf?.toISOString().slice(0, 10)).toBe("2026-07-31");
    expect(p.lines).toHaveLength(2);
    expect(p.lines[0]).toMatchObject({
      customerName: "Mijoz A",
      contractNumber: "25/26БК",
      ownFirmName: '"Seven`S Up" Mchj',
      debt: 900_000,
    });
    expect(p.customersWithoutContract).toEqual([]);
  });

  it("shartnoma jami mijoz jamiga teng bo'ladi", () => {
    const p = parseDebtSnapshot([
      ...header,
      row("Mijoz A", 1_500_000),
      row("№25/26БК от 05.01.2026", 900_000),
      row('"Seven`S Up" Mchj', 900_000),
      row("№29/БК от 12.08.2025", 600_000),
      row('"Seven`S Up" Mchj', 600_000),
      row("Mijoz B", 8_000_000, 20_000_000),
      row("№11/РК от 20.03.2026", undefined, 20_000_000),
      row('"Sardorbek House" Mchj', undefined, 20_000_000),
      row("№14/26БК от 01.03.2026", 8_000_000),
      row('"Fininfo Best" Mchj', 8_000_000),
    ]);

    const debt = p.lines.reduce((s, l) => s + l.debt, 0);
    const adv = p.lines.reduce((s, l) => s + l.advance, 0);
    expect(debt).toBe(p.customerTotals.debt);
    expect(adv).toBe(p.customerTotals.advance);
  });

  it("bitta mijozda bir shartnomada qarz, boshqasida avans bo'lishi mumkin", () => {
    const p = parseDebtSnapshot([
      ...header,
      row("Mijoz B", 8_000_000, 20_000_000),
      row("№11/РК от 20.03.2026", undefined, 20_000_000),
      row('"Sardorbek House" Mchj', undefined, 20_000_000),
      row("№14/26БК от 01.03.2026", 8_000_000),
      row('"Fininfo Best" Mchj', 8_000_000),
    ]);
    expect(p.lines.map((l) => [l.debt, l.advance])).toEqual([
      [0, 20_000_000],
      [8_000_000, 0],
    ]);
  });

  it('"Без договора" shartnoma pog\'onasida o\'qiladi, mijoz emas', () => {
    const p = parseDebtSnapshot([
      ...header,
      row("Mijoz C", 700_000),
      row("Без договора", 700_000),
      row("Plastik", 700_000),
    ]);
    expect(p.lines).toHaveLength(1);
    expect(p.lines[0].contractNumber).toBeNull();
    expect(p.lines[0].customerName).toBe("Mijoz C");
    expect(p.lines[0].ownFirmName).toBe("Plastik");
    expect(p.customersWithoutContract).toEqual([]);
  });

  it('sarlavhadagi "Организация" mijoz bo\'lib o\'qilmaydi', () => {
    const p = parseDebtSnapshot([...header, row("Mijoz A", 100), row("№1/26БК", 100), row("Firma", 100)]);
    expect(p.lines.map((l) => l.customerName)).toEqual(["Mijoz A"]);
  });

  it("bo'sh hisobot xato beradi", () => {
    expect(() => parseDebtSnapshot([])).toThrow();
  });
});

describe("STIRli variant (Покупатель.ИНН o'lchovi bilan)", () => {
  // 1C ikki xil eksport beradi: STIRsiz (uch pog'ona) va STIRli (to'rt).
  // Ikkalasi ham o'qilishi kerak — eski fayllar arxivda qoladi.
  const innHeader = [
    { [TITLE]: "Сортировка:", Column2: "Документ По возрастанию" },
    { [TITLE]: "Покупатель", Column3: "Расчеты на 31.07.26" },
    { [TITLE]: "Покупатель.ИНН", Column3: "Долг", Column4: "Аванс" },
    { [TITLE]: "Договор" },
    { [TITLE]: "Организация" },
  ];

  it("STIRni mijozga bog'laydi va uni yangi mijoz deb qabul qilmaydi", () => {
    const p = parseDebtSnapshot([
      ...innHeader,
      row("Mijoz A", 1_500_000),
      row("312351055", 1_500_000),
      row("№25/26БК от 05.01.2026", 900_000),
      row('"Seven`S Up" Mchj', 900_000),
      row("№29/БК от 12.08.2025", 600_000),
      row('"Seven`S Up" Mchj', 600_000),
    ]);

    expect(p.lines).toHaveLength(2);
    expect(p.lines.every((l) => l.customerName === "Mijoz A")).toBe(true);
    expect(p.lines.every((l) => l.customerInn === "312351055")).toBe(true);
    expect(p.customerTotals.debt).toBe(1_500_000);
  });

  it("har mijozning STIRi keyingisiga o'tib ketmaydi", () => {
    const p = parseDebtSnapshot([
      ...innHeader,
      row("Mijoz A", 100),
      row("312351055", 100),
      row("№1/26БК", 100),
      row("Firma", 100),
      // Ikkinchi mijozda STIR yo'q — birinchisiniki qolib ketmasligi kerak.
      row("Mijoz B", 200),
      row("Без договора", 200),
      row("Plastik", 200),
    ]);
    expect(p.lines[0].customerInn).toBe("312351055");
    expect(p.lines[1].customerInn).toBeNull();
  });

  it("STIRsiz variant ham ishlashda davom etadi", () => {
    const p = parseDebtSnapshot([...header, row("Mijoz A", 100), row("№1/26БК", 100), row("Firma", 100)]);
    expect(p.lines[0].customerInn).toBeNull();
    expect(p.lines[0].customerName).toBe("Mijoz A");
  });
});

describe("contractKindOf", () => {
  it("BK — doimiy xizmat", () => {
    for (const n of ["25/26БК", "29/БК", "25/26BK"]) expect(contractKindOf(n), n).toBe("BK");
  });

  it("RK — bir martalik", () => {
    for (const n of ["11/РК", "08/РК", "11/RK"]) expect(contractKindOf(n), n).toBe("RK");
  });

  it("belgi raqam OXIRIDA bo'lmasa ham topiladi", () => {
    // "13/06/РК/25" — oxiri "25", lekin shartnoma bir martalik.
    expect(contractKindOf("13/06/РК/25")).toBe("RK");
  });

  it("shartnomasiz qator aniqlanmagan bo'ladi", () => {
    expect(contractKindOf(null)).toBe("unknown");
    expect(contractKindOf("123/45")).toBe("unknown");
  });
});
