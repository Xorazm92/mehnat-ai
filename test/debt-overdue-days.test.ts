/**
 * QARZ YOSHI KUNDA — `overdueDays`.
 *
 * NIMA UCHUN BU TEST BOR: aging matritsasi ("1-10 / 11-30 / 31-60 / 60+ kun")
 * dastlab `monthsOverdue × 30` dan hisoblanardi. `monthsOverdue` esa VAQT emas,
 * PUL NISBATI (qarz / oylik summa) — ya'ni ikki oy oldin yarim to'lagan mijoz
 * "15 kun" deb ko'rinardi, hech qachon to'lamagan kichik firma esa "30 kun".
 * Bosqichlar mijozni chaqirish tartibini belgilagani uchun bu yolg'on sonlar
 * to'g'ridan-to'g'ri noto'g'ri qarorga olib borardi.
 *
 * Endi kun ENG ESKI to'lanmagan hisobning to'lov oynasi yopilganidan beri
 * sanaladi (FIFO). Sof funksiya — DB kerak emas.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { computeCompanyDebt } = await import("@/lib/debt");

const MONTHLY = 3_000_000;

/** Ish oyi P uchun pul P+1 oyi davomida to'lanadi (PAYMENT_TERM_MONTHS = 1). */
const debt = (opts: {
  billingStart: string;
  currentPeriod: string;
  paid?: number;
  opening?: number;
  now: Date;
  contractAmount?: number;
}) =>
  computeCompanyDebt({
    contractAmount: opts.contractAmount ?? MONTHLY,
    billingStart: opts.billingStart,
    currentPeriod: opts.currentPeriod,
    payments: opts.paid ? [{ amount: opts.paid, status: "paid" }] : [],
    openingDebt: opts.opening ?? 0,
    now: opts.now,
  });

describe("overdueDays — qarzning haqiqiy yoshi", () => {
  it("muddati o'tmagan bo'lsa 0", () => {
    // 2099-08 ishi 2099-09 davomida to'lanadi — 2099-09-15 da hali muddat ichida.
    const r = debt({
      billingStart: "2099-08",
      currentPeriod: "2099-09",
      now: new Date(Date.UTC(2099, 8, 15)),
    });
    expect(r.overdue).toBe(0);
    expect(r.overdueDays).toBe(0);
  });

  it("to'lov oynasi yopilgan kundan sanaydi", () => {
    // 2099-08 ishining muddati 2099-09 tugaganda o'tadi, ya'ni 2099-10-01 dan.
    // 2099-10-11 → 10 kun.
    const r = debt({
      billingStart: "2099-08",
      currentPeriod: "2099-10",
      now: new Date(Date.UTC(2099, 9, 11)),
    });
    expect(r.overdue).toBeGreaterThan(0);
    expect(r.overdueDays).toBe(10);
  });

  it("to'lov ENG ESKI hisobni yopadi va yosh kichrayadi (FIFO)", () => {
    const args = { billingStart: "2099-08", currentPeriod: "2099-11", now: new Date(Date.UTC(2099, 10, 11)) };

    // Hech narsa to'lamagan: eng eski qarz 2099-08, muddati 2099-10-01 dan.
    const unpaid = debt(args);
    expect(unpaid.overdueDays).toBe(41);

    // Bir oylik to'lagan: 2099-08 yopildi, eng eski endi 2099-09
    // (muddati 2099-11-01 dan) → 10 kun.
    const partly = debt({ ...args, paid: MONTHLY });
    expect(partly.overdueDays).toBe(10);
  });

  it("PUL NISBATI bilan adashtirmaydi — yarim to'lov yoshni o'zgartirmaydi", () => {
    const args = { billingStart: "2099-08", currentPeriod: "2099-11", now: new Date(Date.UTC(2099, 10, 11)) };

    // Eng eski oyning yarmi to'langan → u hali YOPILMAGAN, yosh o'sha-o'sha.
    const half = debt({ ...args, paid: MONTHLY / 2 });
    expect(half.overdueDays).toBe(41);

    // Eski formula (monthsOverdue × 30) bu ikkisini turlicha ko'rsatardi.
    expect(half.monthsOverdue).not.toBe(debt(args).monthsOverdue);
    expect(half.overdueDays).toBe(debt(args).overdueDays);
  });

  it("boshlang'ich (1C) qarz birinchi ASRO oyi oxiridan sanaladi", () => {
    // billingStart 2099-08 → boshlang'ich qarz 2099-09-01 dan kechikkan.
    const r = debt({
      billingStart: "2099-08",
      currentPeriod: "2099-09",
      opening: 5_000_000,
      now: new Date(Date.UTC(2099, 8, 21)),
    });
    expect(r.overdueDays).toBe(20);
  });

  it("shartnoma summasi yo'q, faqat boshlang'ich qarz bo'lsa ham ishlaydi", () => {
    const r = debt({
      billingStart: "2099-08",
      currentPeriod: "2099-09",
      contractAmount: 0,
      opening: 5_000_000,
      now: new Date(Date.UTC(2099, 8, 21)),
    });
    expect(r.overdue).toBe(5_000_000);
    expect(r.overdueDays).toBe(20);
  });
});
