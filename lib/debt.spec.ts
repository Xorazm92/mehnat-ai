// Sof (DB'siz) test: shartnoma qarzining YAGONA formulasi.
//
// Auditda bu formula uch joyda mustaqil yozilgani aniqlandi. Endi bitta
// joyda — va shu test uni qulflaydi.
import { describe, it, expect } from "vitest";
import {
  computeCompanyDebt,
  isSettledPayment,
  periodKeyOf,
  monthsInclusive,
  previousPeriod,
  billingStartFor,
  BILLING_START_PERIOD,
} from "@/lib/debt";

describe("isSettledPayment", () => {
  it("faqat haqiqatan tushgan pul qarzni kamaytiradi", () => {
    expect(isSettledPayment("paid")).toBe(true);
    expect(isSettledPayment("partial")).toBe(true);
    // "pending" — bu REJA qatori, pul emas. Uni sanash qarzni yashirardi.
    expect(isSettledPayment("pending")).toBe(false);
    expect(isSettledPayment("overdue")).toBe(false);
    expect(isSettledPayment(null)).toBe(false);
  });
});

describe("davr arifmetikasi", () => {
  it("oylar sonini ikkala chetini qo'shib sanaydi", () => {
    expect(monthsInclusive("2026-07", "2026-07")).toBe(1);
    expect(monthsInclusive("2026-07", "2026-08")).toBe(2);
    expect(monthsInclusive("2025-11", "2026-02")).toBe(4);
  });

  it("teskari oraliqda 0 (kelajakdagi shartnoma qarz bermaydi)", () => {
    expect(monthsInclusive("2026-09", "2026-08")).toBe(0);
  });

  it("buzuq davrda 0", () => {
    expect(monthsInclusive("salom", "2026-08")).toBe(0);
    expect(monthsInclusive("2026-13", "2026-14")).toBe(0);
  });

  it("yil chegarasidan o'tadi", () => {
    expect(previousPeriod("2026-01")).toBe("2025-12");
    expect(previousPeriod("2026-08")).toBe("2026-07");
  });
});

describe("billingStartFor", () => {
  it("shartnoma sanasi bo'lmasa global chegara", () => {
    expect(billingStartFor(null)).toBe(BILLING_START_PERIOD);
  });

  it("keyin kelgan firmaga o'z sanasidan hisob qo'yiladi", () => {
    expect(billingStartFor(new Date(2026, 8, 10))).toBe("2026-09");
  });

  // Eski shartnoma global chegarani ORQAGA SURMAYDI — aks holda 2019-yilgi
  // shartnomaga 80 oylik soxta qarz yozilardi.
  it("chegaradan oldingi shartnoma sanasi e'tiborsiz qoladi", () => {
    expect(billingStartFor(new Date(2019, 2, 1))).toBe(BILLING_START_PERIOD);
  });
});

describe("computeCompanyDebt", () => {
  // 2026-07 dan hisob, joriy davr 2026-08, to'lov muddati 1 oy.
  // Ya'ni: iyul ishi AVGUSTDA to'lanadi, iyun ishi iyulda to'lanishi kerak edi.
  const base = { billingStart: "2026-07", currentPeriod: "2026-08" };

  // ASOSIY QOIDA: "iyulning puli avgustda olinadi". 18-avgustda iyul qarzi
  // MUDDATI O'TGAN emas — u aynan hozir yig'ilishi kerak bo'lgan pul.
  it("hech to'lamagan firma: iyul — shu oy yig'iladi, muddati o'tmagan", () => {
    const r = computeCompanyDebt({ ...base, contractAmount: 5_000_000, payments: [] });
    expect(r.charged).toBe(10_000_000); // iyul + avgust
    expect(r.paid).toBe(0);
    expect(r.outstanding).toBe(10_000_000);
    expect(r.overdue).toBe(0); // iyul oynasi avgust oxirigacha ochiq
    expect(r.dueNow).toBe(5_000_000); // iyul uchun — shu oy yig'iladi
    expect(r.monthsOverdue).toBe(0);
  });

  it("iyun ishi to'lanmagan bo'lsa — muddati o'tgan", () => {
    // Iyundan hisob: iyun iyulda to'lanishi kerak edi, to'lanmagan.
    const r = computeCompanyDebt({
      billingStart: "2026-06",
      currentPeriod: "2026-08",
      contractAmount: 5_000_000,
      payments: [],
    });
    expect(r.charged).toBe(15_000_000); // iyun + iyul + avgust
    expect(r.overdue).toBe(5_000_000); // faqat iyun
    expect(r.dueNow).toBe(5_000_000); // iyul
    expect(r.monthsOverdue).toBe(1);
  });

  // ASOSIY REGRESSIYA. Iyulni to'lagan firma 15-avgustda QARZDOR EMAS.
  // Ilgari u "umuman to'lamagan" ro'yxatiga tushardi, chunki hisob faqat
  // joriy oyni ko'rardi va avgust to'lovi hali kelmagandi.
  it("o'tgan oyni to'lagan firmada muddati o'tgan qarz yo'q", () => {
    const r = computeCompanyDebt({
      ...base,
      contractAmount: 5_000_000,
      payments: [{ amount: 5_000_000, status: "paid" }],
    });
    expect(r.overdue).toBe(0);
    expect(r.monthsOverdue).toBe(0);
    // Joriy oy qoldig'i saqlanadi — u hali muddati o'tmagan.
    expect(r.outstanding).toBe(5_000_000);
  });

  it("qisman to'lov shu oy yig'iladigan qismni kamaytiradi", () => {
    const r = computeCompanyDebt({
      ...base,
      contractAmount: 5_000_000,
      payments: [{ amount: 2_000_000, status: "partial" }],
    });
    expect(r.overdue).toBe(0);
    expect(r.dueNow).toBe(3_000_000); // iyuldan qolgani
    expect(r.outstanding).toBe(8_000_000);
  });

  it("bir necha to'lov qo'shiladi (bank + plastik)", () => {
    // Real holat: iyulda 4 firma ham bankdan, ham plastikdan to'lagan.
    const r = computeCompanyDebt({
      ...base,
      contractAmount: 12_000_000,
      payments: [
        { amount: 5_000_000, status: "paid" },
        { amount: 5_000_000, status: "partial" },
      ],
    });
    expect(r.paid).toBe(10_000_000);
    expect(r.overdue).toBe(0);
    expect(r.dueNow).toBe(2_000_000);
  });

  it("'pending' qator qarzni YASHIRMAYDI", () => {
    const r = computeCompanyDebt({
      ...base,
      contractAmount: 5_000_000,
      payments: [{ amount: 5_000_000, status: "pending" }],
    });
    expect(r.paid).toBe(0);
    expect(r.dueNow).toBe(5_000_000);
  });

  // Ortiqcha to'lov endi YO'QOLMAYDI — u avans, ya'ni manfiy qoldiq.
  // Ilgari `Math.max(0, ...)` uni tashlab yuborardi va oldindan to'lagan
  // mijoz keyingi oyda yana qarzdor bo'lib chiqardi.
  it("ortiqcha to'lov avans sifatida manfiy qoldiqda qoladi", () => {
    const r = computeCompanyDebt({
      ...base,
      contractAmount: 1_000_000,
      payments: [{ amount: 5_000_000, status: "paid" }],
    });
    expect(r.charged).toBe(2_000_000);
    expect(r.outstanding).toBe(-3_000_000);
    expect(r.overdue).toBe(0);
  });

  it("kechikkan to'lov eski oyni YOPADI (davrga bog'lanmaydi)", () => {
    // Mijoz iyul hisobini avgustda to'lagan — Payment avgust davriga tushgan.
    // Jamg'arilgan hisobda bu farq qilmaydi: qarz yopiladi.
    const r = computeCompanyDebt({
      ...base,
      contractAmount: 5_000_000,
      payments: [{ amount: 5_000_000, status: "paid" }],
    });
    expect(r.overdue).toBe(0);
  });

  it("shartnoma summasi yo'q firmada hisob qo'yilmaydi", () => {
    const r = computeCompanyDebt({ ...base, contractAmount: null, payments: [] });
    expect(r.charged).toBe(0);
    expect(r.overdue).toBe(0);
  });

  it("shartnoma summasi yo'q, lekin pul tushgan — avans", () => {
    const r = computeCompanyDebt({
      ...base,
      contractAmount: 0,
      payments: [{ amount: 700_000, status: "paid" }],
    });
    expect(r.outstanding).toBe(-700_000);
    expect(r.overdue).toBe(0);
  });

  it("birinchi oyda muddati o'tgan qarz bo'lmaydi", () => {
    const r = computeCompanyDebt({
      billingStart: "2026-08",
      currentPeriod: "2026-08",
      contractAmount: 5_000_000,
      payments: [],
    });
    expect(r.charged).toBe(5_000_000);
    expect(r.overdue).toBe(0);
  });

  it("uch oylik hisobda muddat va inkasso ajraladi", () => {
    const r = computeCompanyDebt({
      billingStart: "2026-06",
      currentPeriod: "2026-08",
      contractAmount: 4_000_000,
      payments: [],
    });
    expect(r.charged).toBe(12_000_000); // iyun + iyul + avgust
    expect(r.overdue).toBe(4_000_000); // iyun — oynasi iyulda yopilgan
    expect(r.dueNow).toBe(4_000_000); // iyul — avgustda yig'iladi
    expect(r.monthsOverdue).toBe(1);
  });

  // FIFO: to'lov avval ENG ESKI qarzni yopadi. Bir xil pul `overdue` va
  // `dueNow` da ikki marta turmasligi kerak.
  it("to'lov avval muddati o'tgan qarzni yopadi", () => {
    const r = computeCompanyDebt({
      billingStart: "2026-06",
      currentPeriod: "2026-08",
      contractAmount: 4_000_000,
      payments: [{ amount: 4_000_000, status: "paid" }],
    });
    expect(r.overdue).toBe(0); // iyun yopildi
    expect(r.dueNow).toBe(4_000_000); // iyul hali ochiq
    expect(r.outstanding).toBe(8_000_000);
  });

  // Boshlang'ich qarz (1C dan) TO'LIQ muddati o'tgan — tarixiy qarz
  // ta'rifan kechikkan.
  it("boshlang'ich qarz muddati o'tgan deb sanaladi", () => {
    const r = computeCompanyDebt({
      ...base,
      contractAmount: 5_000_000,
      openingDebt: 12_000_000,
      payments: [],
    });
    expect(r.charged).toBe(22_000_000); // 12 + iyul 5 + avgust 5
    expect(r.overdue).toBe(12_000_000);
    expect(r.dueNow).toBe(5_000_000);
  });
});

describe("periodKeyOf", () => {
  it("oyni ikki raqamga to'ldiradi", () => {
    expect(periodKeyOf(new Date(2026, 0, 15))).toBe("2026-01");
    expect(periodKeyOf(new Date(2026, 11, 1))).toBe("2026-12");
  });
});
