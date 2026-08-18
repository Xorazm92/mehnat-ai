// Ledger yadrosining SOF testi (DB'siz — CI shuni yuritadi).
//
// Nima uchun muhim: CI integratsiya testlarini umuman yuritmaydi
// (.github/workflows/ci.yml → `npx vitest run bot/ lib/`). Ya'ni sof bo'la
// oladigan har bir qoida sof BO'LISHI KERAK, aks holda uni faqat lokalda
// eslab qolgan odam tekshiradi.
import { describe, it, expect } from "vitest";
import {
  ACCOUNTS,
  ACCOUNT_SPEC,
  assertBalancedLegs,
  assertLegDimensions,
  type LedgerLeg,
} from "@/lib/ledger";

const cash = (over: Partial<LedgerLeg> = {}): LedgerLeg => ({
  accountId: ACCOUNTS.CASH,
  debit: 1000,
  channelId: "kanal-1",
  ...over,
});

describe("assertBalancedLegs", () => {
  it("muvozanatli yozuvni qabul qiladi", () => {
    expect(() =>
      assertBalancedLegs([
        { accountId: ACCOUNTS.CASH, debit: 1000 },
        { accountId: ACCOUNTS.KASSA_INCOME, credit: 1000 },
      ])
    ).not.toThrow();
  });

  it("bitta oyoqni rad etadi", () => {
    expect(() => assertBalancedLegs([{ accountId: ACCOUNTS.CASH, debit: 1000 }])).toThrow(
      /kamida 2 oyoq/
    );
  });

  it("debit != credit bo'lsa rad etadi", () => {
    expect(() =>
      assertBalancedLegs([
        { accountId: ACCOUNTS.CASH, debit: 1000 },
        { accountId: ACCOUNTS.KASSA_INCOME, credit: 999 },
      ])
    ).toThrow(/balanslashmagan/);
  });

  it("bitta oyoqda ham debit ham credit bo'lsa rad etadi", () => {
    expect(() =>
      assertBalancedLegs([
        { accountId: ACCOUNTS.CASH, debit: 1000, credit: 1000 },
        { accountId: ACCOUNTS.KASSA_INCOME, credit: 1000 },
      ])
    ).toThrow(/faqat debit YOKI credit/);
  });

  it("manfiy summani rad etadi", () => {
    expect(() =>
      assertBalancedLegs([
        { accountId: ACCOUNTS.CASH, debit: -1000 },
        { accountId: ACCOUNTS.KASSA_INCOME, credit: -1000 },
      ])
    ).toThrow(/manfiy/);
  });

  // Kanal o'tkazmasi: ikkala oyoq ham CASH. Hisob darajasida netto nol —
  // umumiy balans o'zgarmaydi, faqat kesim ko'chadi.
  it("CASH→CASH o'tkazmasi muvozanatli", () => {
    expect(() =>
      assertBalancedLegs([
        cash({ debit: 5000, channelId: "karta" }),
        cash({ debit: undefined, credit: 5000, channelId: "bank" }),
      ])
    ).not.toThrow();
  });
});

describe("assertLegDimensions", () => {
  it("noma'lum hisobni rad etadi", () => {
    expect(() =>
      assertLegDimensions([{ accountId: "QANDAYDIR" as never, debit: 1 }])
    ).toThrow(/Noma'lum hisob/);
  });

  it("daromad/xarajat hisobida kanal bo'lmaydi", () => {
    expect(() =>
      assertLegDimensions([{ accountId: ACCOUNTS.KASSA_INCOME, credit: 1000, channelId: "kanal-1" }])
    ).toThrow(/kanal bo'lmaydi/);
  });

  it("kanalsiz CASH hozircha ruxsat (Faza 2 gacha)", () => {
    // Ataylab: `createPayout` va `upsertPayment` kanalni hali bilmaydi.
    // Faza 2 da ACCOUNT_SPEC.CASH.channel "required" bo'ladi va bu test
    // o'sha paytda teskarisiga o'zgaradi — shuning uchun qoida shu yerda
    // KO'RINIB turadi, kod ichida yashirin qolmaydi.
    expect(ACCOUNT_SPEC.CASH.channel).toBe("optional");
    expect(() => assertLegDimensions([{ accountId: ACCOUNTS.CASH, debit: 1000 }])).not.toThrow();
  });

  it("kanalli CASH qabul qilinadi", () => {
    expect(() => assertLegDimensions([cash()])).not.toThrow();
  });

  it("kontragent qabul qilmaydigan hisobda subjectId rad etiladi", () => {
    expect(() =>
      assertLegDimensions([{ accountId: ACCOUNTS.KASSA_INCOME, credit: 1000, subjectId: "u1" }])
    ).toThrow(/kontragent bo'lmaydi/);
  });

  it("ixtiyoriy kontragentli hisob ikkala holatda ham o'tadi", () => {
    expect(() =>
      assertLegDimensions([{ accountId: ACCOUNTS.SALARY_EXPENSE, debit: 1000, subjectId: "user-1" }])
    ).not.toThrow();
    expect(() =>
      assertLegDimensions([{ accountId: ACCOUNTS.SALARY_EXPENSE, debit: 1000 }])
    ).not.toThrow();
  });

  it("shartnoma daromadiga firma biriktirish mumkin", () => {
    expect(() =>
      assertLegDimensions([
        { accountId: ACCOUNTS.CONTRACT_INCOME, credit: 1000, subjectId: "company-1" },
      ])
    ).not.toThrow();
  });
});

describe("ACCOUNT_SPEC", () => {
  // Spetsifikatsiyasiz hisob qo'shilsa `postLedger` uni "Noma'lum hisob" deb
  // rad etadi — ya'ni yangi hisob qo'shgan odam o'lchov qoidasini ham
  // o'ylashga MAJBUR. Shu test buni eslatib turadi.
  it("har bir hisobning spetsifikatsiyasi bor", () => {
    for (const id of Object.values(ACCOUNTS)) {
      expect(ACCOUNT_SPEC[id], `${id} uchun ACCOUNT_SPEC yo'q`).toBeDefined();
    }
  });

  it("faqat CASH kanal qabul qiladi", () => {
    for (const [id, spec] of Object.entries(ACCOUNT_SPEC)) {
      if (id === ACCOUNTS.CASH) continue;
      expect(spec.channel, `${id} kanal qabul qilmasligi kerak`).toBe("forbidden");
    }
  });
});
