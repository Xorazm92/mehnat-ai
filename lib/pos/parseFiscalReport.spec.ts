import { describe, it, expect } from "vitest";
import { parseFiscalRows, fmHintFromFileName, matchDeviceByHint } from "./parseFiscalReport";
import { FiscalReportParseError } from "./types";

// Qatorlar REAL eksport shakli: birinchi qator — sarlavha, keyingilari — kunlar.
// Kalitlar `sheet_to_json` bergani kabi (`__EMPTY_n`).
const HEADER = {
  "Кунлик ҳисобот": "№",
  __EMPTY: "СТИР",
  __EMPTY_1: "Сана",
  __EMPTY_2: "Сумма (нақд пул)",
  __EMPTY_3: "Сумма (тўлов терминали)",
  __EMPTY_4: "Жами сумма ҚҚС билан",
  __EMPTY_7: "Қайтарилган",
  __EMPTY_11: "Чеклар сони",
};
const day = (n: number, date: string, cash: number, card: number, receipts: number) => ({
  "Кунлик ҳисобот": n,
  __EMPTY: "307058508",
  __EMPTY_1: date,
  __EMPTY_2: cash,
  __EMPTY_3: card,
  __EMPTY_4: cash + card,
  __EMPTY_7: 0,
  __EMPTY_11: receipts,
});

describe("kunlik hisobot", () => {
  const parsed = parseFiscalRows(
    [HEADER, day(1, "01.08.2026", 12930000, 24030000, 42), day(2, "03.08.2026", 15080000, 37120000, 61)],
    "0718",
  );
  it("ikkita kun o'qildi", () => expect(parsed.rows).toHaveLength(2));
  it("karta ustuni aynan \"тўлов терминали\"", () => expect(parsed.rows[0].cardAmount).toBe(24030000));
  it("naqd ustuni", () => expect(parsed.rows[0].cashAmount).toBe(12930000));
  it("FM fayl nomidan to'ldiriladi", () => expect(parsed.rows[0].fmNumber).toBe("0718"));
  it("davr chegaralari", () => {
    expect(parsed.periodFrom).toEqual(new Date(Date.UTC(2026, 7, 1)));
    expect(parsed.periodTo).toEqual(new Date(Date.UTC(2026, 7, 3)));
  });
  it("ogohlantirishsiz", () => expect(parsed.warnings).toHaveLength(0));
});

describe("yakun qatori va nomuvofiqlik", () => {
  it("\"Jami\" qatori jim tashlab ketiladi", () => {
    const p = parseFiscalRows([HEADER, day(1, "01.08.2026", 100, 200, 3), { ...day(2, "", 0, 0, 0), __EMPTY_1: "Jami" }], "0718");
    expect(p.rows).toHaveLength(1);
    expect(p.warnings).toHaveLength(0);
  });
  it("naqd + karta ≠ jami bo'lsa ogohlantiradi", () => {
    const bad = { ...day(1, "01.08.2026", 100, 200, 3), __EMPTY_4: 999 };
    expect(parseFiscalRows([HEADER, bad], "0718").warnings[0]).toContain("naqd + karta");
  });
});

describe("oylik hisobot rad etiladi", () => {
  it("\"Сана\" o'rniga \"Фискал модул рақами\" bo'lsa aniq xato", () => {
    const monthly = {
      "Кунлик ҳисобот": "№",
      __EMPTY: "СТИР",
      __EMPTY_1: "Фискал модул рақами",
      __EMPTY_2: "Сумма (нақд пул)",
      __EMPTY_3: "Сумма (тўлов терминали)",
    };
    expect(() => parseFiscalRows([monthly, { __EMPTY_1: "VG343420023218", __EMPTY_2: 1, __EMPTY_3: 2 }])).toThrow(
      FiscalReportParseError,
    );
    expect(() => parseFiscalRows([monthly, { __EMPTY_1: "VG343420023218" }])).toThrow(/OYLIK/);
  });
  it("tanilmagan fayl jim yutilmaydi", () => {
    expect(() => parseFiscalRows([{ a: "boshqa", b: "fayl" }])).toThrow(/tanilmadi/);
  });
});

describe("fayl nomi bo'yicha apparatni topish", () => {
  const devices = [{ fmNumber: "VG343420020718" }, { fmNumber: "VG343420021518" }];
  it("fayl nomidan qisqartma", () => expect(fmHintFromFileName("0718.xlsx")).toBe("0718"));
  it("oxiri bo'yicha topiladi", () => expect(matchDeviceByHint(devices, "0718")?.fmNumber).toBe("VG343420020718"));
  it("to'liq raqam ham ishlaydi", () =>
    expect(matchDeviceByHint(devices, "VG343420021518")?.fmNumber).toBe("VG343420021518"));
  it("ikki apparat bir xil oxir bilan tugasa — taxmin qilinmaydi", () =>
    expect(matchDeviceByHint([{ fmNumber: "AA0718" }, { fmNumber: "BB0718" }], "0718")).toBeNull());
});
