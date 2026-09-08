import { describe, it, expect } from "vitest";
import { reconcile, dayKey, type DeviceDay, type SettlementDay, type KassaChannelDay } from "./reconcile";
import type { PosChannel } from "./types";

const dev = (deviceId: string, date: string, cardAmount: number, cashAmount = 0): DeviceDay => ({
  deviceId, date, cardAmount, cashAmount,
});
const set = (
  terminalId: string, date: string, gross: number, commission = 0, fromDocumentDate = false,
  channel: PosChannel = "uzcard",
): SettlementDay => ({
  terminalId, channel, date, grossAmount: gross, factAmount: gross - commission, commissionAmount: commission, fromDocumentDate,
});
const kas = (date: string, channel: PosChannel, amount: number): KassaChannelDay => ({ date, channel, amount });

describe("kunlik yig'ish", () => {
  const r = reconcile(
    [dev("k1", "2026-08-01", 100), dev("k2", "2026-08-01", 50), dev("k1", "2026-08-02", 70)],
    [set("t1", "2026-08-01", 140, 1), set("t2", "2026-08-02", 70)],
  );
  it("kunlar tartiblangan", () => expect(r.days.map((d) => d.date)).toEqual(["2026-08-01", "2026-08-02"]));
  it("apparatlar kesimi saqlanadi", () => expect(r.days[0].byDevice).toEqual({ k1: 100, k2: 50 }));
  it("kassa kunlik yig'indisi", () => expect(r.days[0].kassaCard).toBe(150));
  it("farq YALPI bilan hisoblanadi", () => expect(r.days[0].diff).toBe(10));
  it("fakt bo'yicha farq alohida", () => expect(r.days[0].diffFact).toBe(11));
  it("komissiya yig'iladi", () => expect(r.totals.commission).toBe(1));
});

describe("davr chegarasi", () => {
  it("oraliqdan tashqaridagi hisob-kitob yig'indiga kirmaydi", () => {
    const r = reconcile(
      [dev("k1", "2026-08-01", 100)],
      [set("t1", "2026-07-30", 999), set("t1", "2026-08-01", 100)],
      { from: "2026-08-01", to: "2026-08-31" },
    );
    expect(r.days).toHaveLength(1);
    expect(r.totals.bankGross).toBe(100);
    expect(r.totals.diff).toBe(0);
  });
});

describe("sanasi hujjatdan olingan tushum belgilanadi", () => {
  const r = reconcile([dev("k1", "2026-08-01", 100)], [set("t1", "2026-08-01", 100, 0, true)]);
  it("kun belgilanadi", () => expect(r.days[0].approximateDate).toBe(true));
  it("summasi yig'iladi — ekranda ogohlantirish uchun", () =>
    expect(r.totals.approximateAmount).toBe(100));
});

describe("oylik yakun", () => {
  const r = reconcile(
    [dev("k1", "2026-07-31", 10), dev("k1", "2026-08-01", 100)],
    [set("t1", "2026-07-31", 10), set("t1", "2026-08-01", 90)],
  );
  it("ikkita oy", () => expect(r.months.map((m) => m.month)).toEqual(["2026-07", "2026-08"]));
  it("avgust farqi", () => expect(r.months[1].totals.diff).toBe(10));
  it("umumiy farq oylar yig'indisiga teng", () =>
    expect(r.totals.diff).toBe(r.months.reduce((s, m) => s + m.totals.diff, 0)));
});

describe("faqat bir tomonda bo'lgan kun ham ko'rinadi", () => {
  it("bankda bor, kassada yo'q", () => {
    const r = reconcile([], [set("t1", "2026-08-09", 500)]);
    expect(r.days[0].kassaCard).toBe(0);
    expect(r.days[0].diff).toBe(-500);
  });
});

describe("dayKey", () => {
  it("UTC kun kaliti", () => expect(dayKey(new Date(Date.UTC(2026, 7, 1)))).toBe("2026-08-01"));
});

// ── OY × KANAL KESIMI ───────────────────────────────────────────────────
//
// Kesim ikki mustaqil manbadan yig'iladi: kassa tomoni apparatning to'lov
// turi hisobotidan, bank tomoni esa o'sha kanalning ekvayring tushumidan.
// Bir tomonda bo'lib, ikkinchisida yo'q kanal — bu XATO emas, aynan shu
// modul ko'rsatishi kerak bo'lgan holat.

describe("kanal kesimi", () => {
  const r = reconcile(
    [dev("k1", "2026-08-01", 300), dev("k1", "2026-09-01", 100)],
    [
      set("t1", "2026-08-01", 100, 1, false, "click"),
      set("t2", "2026-08-01", 200, 0, false, "payme"),
      set("t1", "2026-09-01", 100, 2, false, "click"),
    ],
    undefined,
    [kas("2026-08-01", "click", 100), kas("2026-08-01", "payme", 190), kas("2026-09-01", "click", 100)],
  );

  it("kanal bo'yicha ikki tomon ham yig'iladi", () => {
    expect(r.totals.byChannel.click).toMatchObject({ kassa: 200, bankGross: 200, commission: 3 });
  });
  it("mos kelgan kanalda farq nol", () => expect(r.totals.byChannel.click!.diff).toBe(0));
  it("farq ISHORASI asosiy jadval bilan bir xil (kassa − bank)", () => {
    // Payme: kassa 190, bank 200 → bankda ORTIQCHA, ya'ni manfiy farq.
    expect(r.totals.byChannel.payme!.diff).toBe(-10);
  });
  it("oyma-oy ajratiladi", () => {
    expect(r.months.map((m) => m.month)).toEqual(["2026-08", "2026-09"]);
    expect(r.months[0].totals.byChannel.click!.kassa).toBe(100);
    expect(r.months[1].totals.byChannel.click!.kassa).toBe(100);
    expect(r.months[1].totals.byChannel.payme).toBeUndefined();
  });
  it("kanal kesimi kassa JAMISIGA qo'shilmaydi", () => {
    // Kesim `cardAmount` ning ichida — qo'shilsa savdo ikki marta sanaladi.
    expect(r.totals.kassaCard).toBe(400);
  });
  it("kunlik kesim ham to'ladi", () => {
    expect(r.days[0].byChannel.payme).toMatchObject({ kassa: 190, bankGross: 200, diff: -10 });
  });
});

describe("bir tomonda yo'q kanal", () => {
  it("faqat bankda ko'ringan kanal kassa 0 bilan turadi", () => {
    const r = reconcile([dev("k1", "2026-08-01", 50)], [set("t9", "2026-08-01", 50, 0, false, "uzum")]);
    expect(r.totals.byChannel.uzum).toMatchObject({ kassa: 0, bankGross: 50, diff: -50 });
  });
  it("faqat kassada ko'ringan kanal bank 0 bilan turadi", () => {
    const r = reconcile([dev("k1", "2026-08-01", 50)], [], undefined, [kas("2026-08-01", "uzum", 50)]);
    expect(r.totals.byChannel.uzum).toMatchObject({ kassa: 50, bankGross: 0, diff: 50 });
  });
  it("davrdan tashqaridagi kesim kirmaydi", () => {
    const r = reconcile(
      [dev("k1", "2026-08-01", 50)],
      [],
      { from: "2026-08-01", to: "2026-08-31" },
      [kas("2026-07-30", "uzum", 999), kas("2026-08-01", "uzum", 50)],
    );
    expect(r.totals.byChannel.uzum!.kassa).toBe(50);
  });
});
