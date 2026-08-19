// Direktor hisoboti MATNINING sof testi (DB'siz — CI shuni yuritadi).
//
// Nima uchun kerak: hisobot direktorga har kuni ketadi va uning raqamlari
// qaror qabul qilishga asos bo'ladi. Bir marta noto'g'ri ramka qo'yilsa
// (masalan "233 tasi umuman to'lamagan") u oylar davomida shovqin bo'lib
// turadi va hech kim sezmaydi.
import { describe, it, expect } from "vitest";
import { renderDirectorReport } from "./render-director-report";
import type { DirectorReport } from "../../../../lib/directorReport";

const empty: DirectorReport = {
  forDate: new Date(2026, 7, 13),
  yesterday: { income: 0, outflow: 0 },
  balance: { income: 0, outflow: 0, balance: 666_019_900 },
  debt: {
    companies: 0,
    total: 0,
    overdueCompanies: 0,
    overdueTotal: 0,
    dueNowCompanies: 0,
    dueNowTotal: 0,
    neverPaid: 0,
    inAdvance: 0,
  },
  agingMatrix: {
    stages: {
      normal: { stage: "normal", label: "1-10 kun", daysRange: "1-10", companyCount: 0, totalAmount: 0, companies: [] },
      warning: { stage: "warning", label: "11-30 kun", daysRange: "11-30", companyCount: 0, totalAmount: 0, companies: [] },
      suspension: { stage: "suspension", label: "31-60 kun", daysRange: "31-60", companyCount: 0, totalAmount: 0, companies: [] },
      critical: { stage: "critical", label: "60+ kun", daysRange: "60+", companyCount: 0, totalAmount: 0, companies: [] },
    },
    totalOverdueCompanies: 0,
    totalOverdueAmount: 0,
  },
  topPartners: [],
  revenueBreakdown: { b2bIncome: 0, b2cIncome: 0 },
  topDebtors: [],
  obligations: { overdue: 0, dueToday: 0, topResponsible: [], unassigned: 0 },
  pending: { expenses: 0, proofs: 0 },
  unmatchedBank: { income: 0, expense: 0 },
  debt1C: null,
  plan: null,
};

const debtor = (name: string, overdue: number, monthsOverdue = 1, accountantName = "Aziza") => ({
  companyId: name,
  name,
  inn: "123456789",
  contractAmount: overdue,
  charged: overdue * 2,
  paid: 0,
  outstanding: overdue * 2,
  overdue,
  dueNow: 0,
  monthsOverdue,
  overdueDays: Math.round(monthsOverdue * 30),
  lastPaidPeriod: null,
  accountantName,
  supervisorName: null,
});

describe("renderDirectorReport", () => {
  it("sarlavha va kassa balansini chizadi", () => {
    const text = renderDirectorReport(empty);
    expect(text).toContain("📊 Kunlik hisobot — 13-avgust");
    expect(text).toContain("🏦 Kassa balansi: 666,019,900 so'm");
  });

  // Nol harakat tinchlik belgisi EMAS — ish kunida vipiska yuklanmagan
  // bo'lishi mumkin, va buni aytmasa hech kim tekshirmaydi.
  it("kecha harakat bo'lmasa tekshirishga chaqiradi", () => {
    expect(renderDirectorReport(empty)).toContain("Harakat umuman yo'q");
  });

  it("harakat bo'lsa ogohlantirish chiqmaydi", () => {
    const text = renderDirectorReport({
      ...empty,
      yesterday: { income: 5_000_000, outflow: 1_000_000 },
    });
    expect(text).not.toContain("Harakat umuman yo'q");
    expect(text).toContain("Sof:    +4,000,000 so'm");
  });

  // ASOSIY REGRESSIYA. Joriy oy qoldig'i o'zi bilan ogohlantirish EMAS:
  // 15-avgustda hamma firma "avgustni to'lamagan" bo'ladi.
  it("faqat joriy oy qoldig'i bo'lsa qarzdorlik ogohlantirishi chiqmaydi", () => {
    const text = renderDirectorReport({
      ...empty,
      debt: { ...empty.debt, companies: 233, total: 832_200_000 },
    });
    expect(text).not.toContain("Qarzdorlik");
    expect(text).not.toContain("umuman to'lamagan");
    expect(text).toContain("✅ E'tibor talab qiladigan holat yo'q");
  });

  it("muddati o'tgan qarz bo'lsa nomma-nom ko'rsatadi", () => {
    const text = renderDirectorReport({
      ...empty,
      debt: {
        companies: 233,
        total: 832_200_000,
        overdueCompanies: 12,
        overdueTotal: 48_000_000,
        dueNowCompanies: 0,
        dueNowTotal: 0,
        neverPaid: 3,
        inAdvance: 2,
      },
      topDebtors: [debtor("Alfa MChJ", 9_000_000, 2), debtor("Beta MChJ", 6_000_000)],
    });
    expect(text).toContain("⚠️ Muddati o'tgan qarz: 12 ta firma — 48,000,000 so'm");
    expect(text).toContain("🔴 3 tasi bir marta ham to'lamagan");
    expect(text).toContain("• Alfa MChJ — 9,000,000 so'm · 2 oylik · Aziza");
    expect(text).toContain("• Beta MChJ — 6,000,000 so'm · 1 oylik · Aziza");
    // 12 tadan 2 tasi ko'rsatildi — qolgani uchun havola.
    expect(text).toContain("va yana 10 ta");
  });

  it("hammasi ro'yxatga sig'sa 'yana' qatori chiqmaydi", () => {
    const text = renderDirectorReport({
      ...empty,
      debt: { ...empty.debt, overdueCompanies: 1, overdueTotal: 9_000_000 },
      topDebtors: [debtor("Alfa MChJ", 9_000_000)],
    });
    expect(text).not.toContain("va yana");
  });

  it("mas'ul buxgalter yo'q bo'lsa nom bilan cheklanadi", () => {
    const text = renderDirectorReport({
      ...empty,
      debt: { ...empty.debt, overdueCompanies: 1, overdueTotal: 9_000_000 },
      topDebtors: [{ ...debtor("Alfa MChJ", 9_000_000), accountantName: null }],
    });
    expect(text).toContain("• Alfa MChJ — 9,000,000 so'm · 1 oylik");
  });

  // 1C solishtiruvi endi ikkala tomonda ham JAMG'ARILGAN qarz — ya'ni farq
  // haqiqiy nomuvofiqlikni bildiradi, tuzilish farqini emas.
  it("1C bilan ASRO hisobini yonma-yon ko'rsatadi", () => {
    const text = renderDirectorReport({
      ...empty,
      debt: { ...empty.debt, total: 832_200_000 },
      debt1C: { asOf: new Date(2026, 7, 7), total: 902_233_000, contracts: 131, asroComparable: 832_200_000 },
    });
    expect(text).toContain("📒 1C bo'yicha qarz: 902,233,000 so'm (7-avgust holatiga, 131 shartnoma)");
    expect(text).toContain("ASRO hisobi (o'sha sanaga): 832,200,000 so'm");
    expect(text).toContain("Farq: +70,033,000 so'm");
  });

  // Solishtiruv JORIY oy qoldig'iga emas, kesim davriga hisoblangan raqamga
  // tayanadi — aks holda farq har doim bir oylik shartnoma summasicha
  // yolg'on chiqardi.
  it("solishtiruv joriy oy qoldig'ini emas, kesim davri raqamini oladi", () => {
    const text = renderDirectorReport({
      ...empty,
      debt: { ...empty.debt, total: 1_500_000_000 }, // joriy oy — e'tiborga olinmaydi
      debt1C: {
        asOf: new Date(2026, 7, 7),
        total: 902_233_000,
        contracts: 131,
        asroComparable: 902_233_000,
      },
    });
    expect(text).toContain("✅ Mos keladi");
    expect(text).not.toContain("Farq:");
  });

  // BIZNES QOIDASI: ish oyi tugagach mijoz KEYINGI oy davomida to'laydi
  // ("iyulning puli avgustda olinadi"). Shuning uchun "hali to'lamagan"
  // buzilish emas — u inkasso ish ro'yxati va alohida blokda ko'rsatiladi.
  it("shu oy yig'ilishi kerak bo'lganlarni alohida blokda beradi", () => {
    const text = renderDirectorReport({
      ...empty,
      debt: { ...empty.debt, dueNowCompanies: 40, dueNowTotal: 210_000_000 },
      topDebtors: [
        { ...debtor("Gamma MChJ", 0, 0), dueNow: 8_000_000 },
        { ...debtor("Delta MChJ", 0, 0, "Bekzod"), dueNow: 5_000_000 },
      ],
    });
    expect(text).toContain("📥 Bu oy yig'ilishi kerak: 40 ta firma — 210,000,000 so'm");
    expect(text).toContain("• Gamma MChJ — 8,000,000 so'm · Aziza");
    expect(text).toContain("• Delta MChJ — 5,000,000 so'm · Bekzod");
    // Muddati o'tgani yo'q — ogohlantirish bloki chiqmasligi kerak.
    expect(text).not.toContain("Muddati o'tgan qarz");
  });

  it("ikkala blok bir vaqtda chiqa oladi va aralashmaydi", () => {
    const text = renderDirectorReport({
      ...empty,
      debt: {
        ...empty.debt,
        overdueCompanies: 2,
        overdueTotal: 15_000_000,
        dueNowCompanies: 5,
        dueNowTotal: 30_000_000,
      },
      topDebtors: [
        debtor("Eski MChJ", 15_000_000, 2),
        { ...debtor("Yangi MChJ", 0, 0), dueNow: 6_000_000 },
      ],
    });
    expect(text).toContain("📥 Bu oy yig'ilishi kerak: 5 ta firma — 30,000,000 so'm");
    expect(text).toContain("⚠️ Muddati o'tgan qarz: 2 ta firma — 15,000,000 so'm");
    // Har firma FAQAT o'z blokida — bir xil pul ikki joyda ko'rinmasin.
    const dueBlock = text.slice(text.indexOf("📥"), text.indexOf("⚠️ Muddati"));
    expect(dueBlock).toContain("Yangi MChJ");
    expect(dueBlock).not.toContain("Eski MChJ");
  });

  // Xulosadagi sanoq o'zi yetarli emas: yonida javobgar turmasa, direktor uni
  // har kuni o'qib hech qachon hech narsa qilmaydi.
  it("majburiyat sanogʻi yonida eng ogʻir masʼulni koʻrsatadi", () => {
    const text = renderDirectorReport({
      ...empty,
      obligations: {
        overdue: 1890,
        dueToday: 0,
        topResponsible: [{ name: "Sevara", count: 126, oldestDays: 212 }],
        unassigned: 0,
      },
    });
    expect(text).toContain("⏰ Muddati o'tgan majburiyat: 1890 ta — eng ko'pi: Sevara (126 ta)");
  });

  it("bank navbatlarini ikki xil ish sifatida ajratadi", () => {
    const text = renderDirectorReport({
      ...empty,
      unmatchedBank: { income: 49, expense: 228 },
    });
    expect(text).toContain("🔗 Mijozi topilmagan kirim: 49 ta (bank-klient)");
    expect(text).toContain("🧮 Toifalanmagan chiqim: 228 ta (admin)");
  });
});
