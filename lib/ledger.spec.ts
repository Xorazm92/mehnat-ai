// Ledger qoidalari va yozishga tayyorlangan qiymatlar DB'siz tekshiriladi.
// Tranzaksiya va haqiqiy DB invariantlari test/ledger-core.test.ts da.
import { describe, it, expect, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  ACCOUNTS,
  ACCOUNT_SPEC,
  assertBalancedLegs,
  assertLegDimensions,
  postLedger,
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

describe("ledger pul aniqligi", () => {
  it.each([NaN, Infinity, -Infinity])("chekli bo'lmagan %s summani rad etadi", (amount) => {
    expect(() => assertBalancedLegs([
      cash({ debit: amount }),
      { accountId: ACCOUNTS.KASSA_INCOME, credit: amount },
    ])).toThrow(/chekli son/);
  });

  it("yaxlitlanganda nolga tushadigan oyoqni rad etadi", () => {
    expect(() => assertBalancedLegs([
      cash({ debit: 0.004 }),
      cash({ debit: 0.004 }),
      { accountId: ACCOUNTS.KASSA_INCOME, credit: 0.008 },
    ])).toThrow(/kamida 0.01/);
  });

  it("jami emas, yoziladigan oyoqlar yig'indisini tekshiradi", () => {
    expect(() => assertBalancedLegs([
      cash({ debit: 0.104 }),
      cash({ debit: 0.104 }),
      { accountId: ACCOUNTS.KASSA_INCOME, credit: 0.208 },
    ])).toThrow(/balanslashmagan/);
  });

  it("suzuvchi nuqta qoldig'ini muvozanatsizlik deb hisoblamaydi", () => {
    expect(() => assertBalancedLegs([
      cash({ debit: 0.1 }),
      cash({ debit: 0.2 }),
      { accountId: ACCOUNTS.KASSA_INCOME, credit: 0.1 + 0.2 },
    ])).not.toThrow();
  });

  it("ikki tomonli oyoqni yaxlitlash orqali yashirmaydi", () => {
    expect(() => assertBalancedLegs([
      cash({ debit: 1, credit: 0.001 }),
      { accountId: ACCOUNTS.KASSA_INCOME, credit: 1 },
    ])).toThrow(/faqat debit YOKI credit/);
  });
});

function ledgerDb() {
  const findMany = vi.fn().mockResolvedValue([]);
  const createMany = vi.fn(async ({ data }: { data: Prisma.LedgerEntryCreateManyInput[] }) => ({ count: data.length }));
  const db = { ledgerEntry: { findMany, createMany } } as unknown as Prisma.TransactionClient;
  return { db, findMany, createMany };
}

describe("postLedger — yoziladigan qiymatlar", () => {
  it.each([
    [0.005, "0.01"], [1.005, "1.01"], [2.675, "2.68"], [1000.01, "1000.01"],
  ] as const)("%s ni decimal yarim-yuqoriga qoidasi bilan yozadi", async (amount, expected) => {
    const { db, createMany } = ledgerDb();
    const legs: LedgerLeg[] = [
      cash({ debit: amount }),
      { accountId: ACCOUNTS.CONTRACT_INCOME, credit: amount, subjectId: "firma-1" },
    ];
    const before = legs.map((leg) => ({ ...leg }));
    const transactionId = await postLedger(db, {
      legs, period: "2026-09", sourceTable: "Payment", sourceId: "payment-1",
    });
    expect(createMany).toHaveBeenCalledOnce();
    const rows = createMany.mock.calls[0][0].data;
    expect(rows[0].debit?.toString()).toBe(expected);
    expect(rows[1].credit?.toString()).toBe(expected);
    expect(Number(rows[0].credit)).toBe(0);
    expect(Number(rows[1].debit)).toBe(0);
    expect(rows.every((row) => row.transactionId === transactionId)).toBe(true);
    expect(rows[0].channelId).toBe("kanal-1");
    expect(rows[1].subjectId).toBe("firma-1");
    expect(rows[1].subjectType).toBe("company");
    expect(legs).toEqual(before);
  });

  it("yaxlitlashda balans buzilsa DB'ga tegmaydi", async () => {
    const { db, findMany, createMany } = ledgerDb();
    await expect(postLedger(db, {
      legs: [cash({ debit: 0.104 }), cash({ debit: 0.104 }),
        { accountId: ACCOUNTS.KASSA_INCOME, credit: 0.208 }],
      period: "2026-09", sourceTable: "Payment", sourceId: "payment-1",
    })).rejects.toThrow(/balanslashmagan/);
    expect(findMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it.each(["2026-00", "2026-13", "2026-99", "2026-01\n", "0000-01"])(
    "noto'g'ri %s davrda DB'ga tegmaydi", async (period) => {
      const { db, findMany, createMany } = ledgerDb();
      await expect(postLedger(db, {
        legs: [cash(), { accountId: ACCOUNTS.KASSA_INCOME, credit: 1000 }],
        period, sourceTable: "Payment", sourceId: "payment-1",
      })).rejects.toThrow(/Ledger davri/);
      expect(findMany).not.toHaveBeenCalled();
      expect(createMany).not.toHaveBeenCalled();
    }
  );
});

describe("postLedger — yozishdan oldingi rad etishlar", () => {
  const invalidCases: { name: string; legs: LedgerLeg[]; error: RegExp }[] = [
    { name: "bo'sh yozuv", legs: [], error: /kamida 2 oyoq/ },
    { name: "bitta oyoq", legs: [cash()], error: /kamida 2 oyoq/ },
    ...[0, -0, 0.004, -0.001, NaN, Infinity, -Infinity].map((amount) => ({
      name: `yaroqsiz summa ${amount}`,
      legs: [cash({ debit: amount }), { accountId: ACCOUNTS.KASSA_INCOME, credit: amount }],
      error: /faqat debit YOKI credit|kamida 0.01|manfiy|chekli son/,
    })),
    {
      name: "faqat kreditda NaN",
      legs: [cash(), { accountId: ACCOUNTS.KASSA_INCOME, credit: NaN }],
      error: /chekli son/,
    },
    {
      name: "ikkala tomon musbat",
      legs: [cash({ credit: 0.001 }), { accountId: ACCOUNTS.KASSA_INCOME, credit: 1000 }],
      error: /faqat debit YOKI credit/,
    },
    {
      name: "daromad hisobida kanal",
      legs: [cash(), { accountId: ACCOUNTS.KASSA_INCOME, credit: 1000, channelId: "kanal-1" }],
      error: /kanal bo'lmaydi/,
    },
  ];

  it.each(invalidCases)("$name bo'lsa DB'ga tegmaydi", async ({ legs, error }) => {
    const { db, findMany, createMany } = ledgerDb();
    await expect(postLedger(db, {
      legs, period: "2026-09", sourceTable: "Payment", sourceId: "payment-1",
    })).rejects.toThrow(error);
    expect(findMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it("ochiq jurnal izi bor manbani qayta yozmaydi", async () => {
    const { db, findMany, createMany } = ledgerDb();
    findMany.mockResolvedValue([
      { accountId: ACCOUNTS.CASH, debit: 1000, credit: 0, period: "2026-09",
        channelId: "kanal-1", subjectType: null, subjectId: null },
      { accountId: ACCOUNTS.KASSA_INCOME, debit: 0, credit: 1000, period: "2026-09",
        channelId: null, subjectType: null, subjectId: null },
    ]);
    await expect(postLedger(db, {
      legs: [cash(), { accountId: ACCOUNTS.KASSA_INCOME, credit: 1000 }],
      period: "2026-09", sourceTable: "Payment", sourceId: "payment-1",
    })).rejects.toThrow(/dublikat post bloklandi/);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { sourceId: "payment-1", sourceTable: { in: ["Payment", "Payment-reversal"] } },
    }));
    expect(createMany).not.toHaveBeenCalled();
  });

  it.each(["read", "write"] as const)("DB %s xatosini yashirmaydi", async (stage) => {
    const { db, findMany, createMany } = ledgerDb();
    const error = new Error("DB amali bajarilmadi");
    if (stage === "read") findMany.mockRejectedValue(error);
    else createMany.mockRejectedValue(error);
    await expect(postLedger(db, {
      legs: [cash(), { accountId: ACCOUNTS.KASSA_INCOME, credit: 1000 }],
      period: "2026-09", sourceTable: "Payment", sourceId: "payment-1",
    })).rejects.toBe(error);
    expect(createMany).toHaveBeenCalledTimes(stage === "read" ? 0 : 1);
  });

  it("bir necha oyoqning yozilgan summasi balansli qoladi", async () => {
    const { db, createMany } = ledgerDb();
    await postLedger(db, {
      legs: [cash({ debit: 0.1 }), cash({ debit: 0.2 }),
        { accountId: ACCOUNTS.KASSA_INCOME, credit: 0.1 + 0.2 }],
      period: "2026-09", sourceTable: "Payment", sourceId: "payment-1",
    });
    const rows = createMany.mock.calls[0][0].data;
    expect(rows.map((row) => [row.debit?.toString(), row.credit?.toString()])).toEqual([
      ["0.1", "0"], ["0.2", "0"], ["0", "0.3"],
    ]);
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
