import { describe, it, expect } from "vitest";
import { parseChecksRows } from "./parseChecksList";
import { FiscalReportParseError } from "./types";

// Qatorlar REAL eksport shakli: sarlavha + chekning mahsulot satrlari.
const HEADER = {
  __EMPTY: "Махсулот \r\nИдси",
  "Чеклар рўйхати": "СТИР/\r\nЖИШШР",
  __EMPTY_1: "ФМ рақами",
  __EMPTY_2: "Чек санаси",
  __EMPTY_3: "Чек рақами",
  __EMPTY_10: "Жами нақд пул",
  __EMPTY_11: "Жами банк карта",
  __EMPTY_18: "Чек тури",
};
const line = (no: number, dt: string, cash: number, card: number, type = "Сотув") => ({
  "Чеклар рўйхати": 313002495,
  __EMPTY_1: "LG420211605702",
  __EMPTY_2: dt,
  __EMPTY_3: no,
  __EMPTY_10: cash,
  __EMPTY_11: card,
  __EMPTY_18: type,
});

describe("ko'p mahsulotli chek BIR MARTA sanaladi", () => {
  // Aynan shu tuzoq: chek summasi har bir mahsulot satrida takrorlanadi.
  const p = parseChecksRows([
    HEADER,
    line(850, "17.05.2026 20:31:05", 0, 50000),
    line(850, "17.05.2026 20:31:05", 0, 50000),
    line(851, "17.05.2026 20:40:00", 12000, 0),
  ]);
  it("bitta kun", () => expect(p.rows).toHaveLength(1));
  it("karta summasi ikki barobar sanalmaydi", () => expect(p.rows[0].cardAmount).toBe(50000));
  it("naqd alohida", () => expect(p.rows[0].cashAmount).toBe(12000));
  it("chek soni — satr soni emas", () => expect(p.rows[0].receiptCount).toBe(2));
  it("FM raqami olinadi", () => expect(p.rows[0].fmNumber).toBe("LG420211605702"));
});

describe("kunlar bo'yicha ajratiladi", () => {
  const p = parseChecksRows([
    HEADER,
    line(1, "01.06.2026 09:00:00", 0, 10000),
    line(2, "02.06.2026 09:00:00", 0, 20000),
  ]);
  it("ikki kun", () => expect(p.rows).toHaveLength(2));
  it("davr chegaralari", () => {
    expect(p.periodFrom).toEqual(new Date(Date.UTC(2026, 5, 1)));
    expect(p.periodTo).toEqual(new Date(Date.UTC(2026, 5, 2)));
  });
});

describe("qaytarish cheki summani kamaytiradi", () => {
  const p = parseChecksRows([
    HEADER,
    line(1, "01.06.2026 09:00:00", 0, 100000),
    line(2, "01.06.2026 10:00:00", 0, 30000, "Қайтариш"),
  ]);
  it("netto summa", () => expect(p.rows[0].cardAmount).toBe(70000));
  it("qaytarilgan alohida qayd etiladi", () => expect(p.rows[0].returnedAmount).toBe(30000));
});

describe("nomuvofiqlik va tanilmagan fayl", () => {
  it("bir chekning satrlarida summa har xil bo'lsa ogohlantiradi", () => {
    const p = parseChecksRows([
      HEADER,
      line(5, "01.06.2026 09:00:00", 0, 50000),
      line(5, "01.06.2026 09:00:00", 0, 60000),
    ]);
    expect(p.warnings[0]).toContain("karta summasi har xil");
  });
  it("tanilmagan fayl jim yutilmaydi", () => {
    expect(() => parseChecksRows([{ a: "boshqa", b: "fayl" }])).toThrow(FiscalReportParseError);
  });
});
