import { describe, it, expect } from "vitest";
import { computeObligation, computeRemaining, type ObligationRow } from "./payrollObligation";

const row = (
  adjustmentType: string,
  amount: unknown,
  isApproved: boolean | null = true
): ObligationRow => ({ adjustmentType, amount, isApproved });

describe("computeObligation", () => {
  it("bo'sh ro'yxatda nol", () => {
    expect(computeObligation([])).toBe(0);
  });

  it("tasdiqlangan oylikni qo'shadi", () => {
    expect(computeObligation([row("payment", 2_000_000)])).toBe(2_000_000);
  });

  // Bu regressiya testi: avans MAJBURIYAT emas, TO'LOV. Ilgari server uni
  // majburiyatga qo'shar va shu bilan birga avans payoutini "berilgan" deb
  // sanardi — natijada avans hech qachon ayirilmasdi.
  it("avansni majburiyatga QO'SHMAYDI", () => {
    const rows = [row("payment", 2_000_000), row("avans", -500_000)];
    expect(computeObligation(rows)).toBe(2_000_000);
  });

  it("qo'lda bonusni qo'shadi", () => {
    expect(computeObligation([row("payment", 2_000_000), row("bonus", 300_000)])).toBe(2_300_000);
  });

  it("qo'lda jarimani ayiradi", () => {
    expect(computeObligation([row("payment", 2_000_000), row("jarima", -400_000)])).toBe(1_600_000);
  });

  // `lib/adjustments.ts`: bazadagi qatorlar aralash ishorada saqlangan —
  // yo'nalishni ishora emas, TUR belgilaydi.
  it("ishoradan qat'i nazar bir xil natija beradi", () => {
    expect(computeObligation([row("jarima", 400_000)])).toBe(-400_000);
    expect(computeObligation([row("jarima", -400_000)])).toBe(-400_000);
    expect(computeObligation([row("payment", -2_000_000)])).toBe(2_000_000);
  });

  it("tasdiqlanmagan qatorni sanamaydi", () => {
    const rows = [row("payment", 2_000_000), row("bonus", 500_000, false)];
    expect(computeObligation(rows)).toBe(2_000_000);
  });

  // Chaqiruvchi `isApproved` ni tanlashni unutsa, jim ravishda noto'g'ri
  // (kattaroq) chegara chiqmasin — hech narsa sanalmasin.
  it("isApproved berilmasa qatorni sanamaydi", () => {
    expect(computeObligation([{ adjustmentType: "payment", amount: 2_000_000 }])).toBe(0);
  });

  it("manual va other pul chegarasiga ta'sir qilmaydi", () => {
    const rows = [row("payment", 1_000_000), row("manual", 900_000), row("other", 900_000)];
    expect(computeObligation(rows)).toBe(1_000_000);
  });

  it("noma'lum turni e'tiborsiz qoldiradi", () => {
    expect(computeObligation([row("payment", 1_000_000), row("qandaydir", 500_000)])).toBe(1_000_000);
  });

  it("Decimal/satr summani o'qiydi", () => {
    expect(computeObligation([row("payment", "2000000.50")])).toBe(2_000_000.5);
  });

  it("buzuq summani nol deb oladi", () => {
    expect(computeObligation([row("payment", null), row("payment", "salom")])).toBe(0);
  });
});

describe("computeRemaining", () => {
  it("berilganini ayiradi", () => {
    expect(computeRemaining(2_000_000, 800_000)).toBe(1_200_000);
  });

  // To'liq stsenariy: oylik 2 mln, avans 500k berilgan (payout sifatida).
  // Qolgan 1.5 mln bo'lishi kerak — ilgari server 2 mln ga ruxsat berardi.
  it("avans berilgan oyda qolgan qismni to'g'ri beradi", () => {
    const obligation = computeObligation([row("payment", 2_000_000), row("avans", -500_000)]);
    expect(computeRemaining(obligation, 500_000)).toBe(1_500_000);
  });

  // Ortiqcha to'lov nolga QISILMAYDI — aks holda u ko'rinmay ketardi.
  it("ortiqcha to'lovda manfiy qaytaradi", () => {
    expect(computeRemaining(1_000_000, 1_200_000)).toBe(-200_000);
  });
});
