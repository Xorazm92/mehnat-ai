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

// ── KESIM (to'lov turi bo'yicha filtrlangan) HISOBOT ────────────────────
//
// Bu fayl asosiy hisobot bilan BIR XIL ustunlarga ega, farqi — naqd va
// terminal nol, summa "Жами" da. Uni oddiy hisobot deb qabul qilish
// savdoni ikki marta sanaydi, shuning uchun tanish qoidasi testda qotiriladi.

/** Kesim qatori: naqd va terminal nol, savdo esa "Жами" ustunida. */
const breakdownDay = (n: number, date: string, total: number) => ({
  ...day(n, date, 0, 0, 0),
  __EMPTY_4: total,
});

describe("kanal kesimi hisoboti", () => {
  const TITLE = { "Кунлик ҳисобот": "Тўлов тури: CLICK" };

  it("kanal varaq MAZMUNIDAN topiladi", () => {
    const p = parseFiscalRows([TITLE, HEADER, breakdownDay(1, "01.08.2026", 1_200_000)], "0718");
    expect(p.isBreakdown).toBe(true);
    expect(p.channel).toBe("click");
  });

  it("kesim summasi karta ustuniga TUSHMAYDI — kassa jamisi shishmaydi", () => {
    const p = parseFiscalRows([TITLE, HEADER, breakdownDay(1, "01.08.2026", 1_200_000)], "0718");
    expect(p.rows.reduce((s, r) => s + r.cardAmount, 0)).toBe(0);
    expect(p.rows.reduce((s, r) => s + r.cashAmount, 0)).toBe(0);
    expect(p.rows[0].totalAmount).toBe(1_200_000);
  });

  it("kesimda \"naqd + karta ≠ jami\" ogohlantirishi chiqmaydi", () => {
    const p = parseFiscalRows([TITLE, HEADER, breakdownDay(1, "01.08.2026", 1_200_000)], "0718");
    expect(p.warnings).toHaveLength(0);
  });

  it("savdosiz kun kesimni buzmaydi", () => {
    const p = parseFiscalRows(
      [TITLE, HEADER, breakdownDay(1, "01.08.2026", 0), breakdownDay(2, "02.08.2026", 500)],
      "0718",
    );
    expect(p.isBreakdown).toBe(true);
    expect(p.channel).toBe("click");
  });

  it("kanal topilmasa fayl JIM QABUL QILINMAYDI", () => {
    const rows = [HEADER, breakdownDay(1, "01.08.2026", 1_200_000)];
    expect(() => parseFiscalRows(rows, "0718")).toThrow(FiscalReportParseError);
    expect(() => parseFiscalRows(rows, "0718")).toThrow(/kanal aniqlanmadi/);
  });

  it("fayl nomi faqat OXIRGI chora sifatida ishlaydi", () => {
    const rows = [HEADER, breakdownDay(1, "01.08.2026", 1_200_000)];
    expect(parseFiscalRows(rows, "0718", "payme_avgust.xlsx").channel).toBe("payme");
  });

  it("mazmun fayl nomidan USTUN", () => {
    const rows = [TITLE, HEADER, breakdownDay(1, "01.08.2026", 1_200_000)];
    expect(parseFiscalRows(rows, "0718", "payme_avgust.xlsx").channel).toBe("click");
  });

  it("EPOS \"HUMO\" bilan chalkashmaydi", () => {
    const rows = [{ "Кунлик ҳисобот": "HUMO EPOS" }, HEADER, breakdownDay(1, "01.08.2026", 10)];
    expect(parseFiscalRows(rows, "0718").channel).toBe("humo_epos");
  });

  it("oddiy hisobot kesim deb belgilanmaydi", () => {
    const p = parseFiscalRows([HEADER, day(1, "01.08.2026", 12930000, 24030000, 42)], "0718");
    expect(p.isBreakdown).toBe(false);
    expect(p.channel).toBeNull();
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
