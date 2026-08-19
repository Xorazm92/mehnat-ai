// Batafsil ekranlarning sof testi (DB'siz).
//
// Nima uchun kerak: bu ekranlar direktor raqamga ISHONISHI uchun bor. Agar
// tugma bo'sh bo'limni ochsa yoki "asos" qatori raqamga mos kelmasa, keyingi
// safar hech kim bosmaydi va hisobot yana ishonchsiz ro'yxatga aylanadi.
import { describe, it, expect } from "vitest";
import type { DirectorReport } from "../../../../lib/directorReport";
import {
  DIRECTOR_SECTION,
  directorReportKeyboard,
  directorSectionKeyboard,
  hasSection,
  isDirectorSectionKey,
  renderDirectorSection,
} from "./render-director-section";
import { decodeCallback } from "../../interaction/domain/callback-token";
import { ACTION } from "../../interaction/domain/actions";

const SECRET = "test-secret";

/**
 * Testlar MA'NONI tekshiradi, razmetkani emas — ekran Telegram HTML chizadi
 * va keyingi dizayn tuzatishi tasdiqlarni buzmasligi kerak.
 */
const plain = (text: string): string =>
  text
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

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

const debtor = (name: string, overdue: number, monthsOverdue = 1, accountantName: string | null = "Aziza") => ({
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

/** Klaviaturadagi barcha tugma matnlari — bitta ro'yxatda. */
const labels = (kb: { inline_keyboard: Array<Array<{ text: string }>> }) =>
  kb.inline_keyboard.flat().map((b) => b.text);

describe("directorReportKeyboard", () => {
  // Bo'sh bo'limga tugma qo'yilsa direktor bosib "0 ta" ni ko'radi va boshqa
  // bosmaydi — shuning uchun tugma mazmun bilan birga paydo bo'ladi.
  it("bo'sh bo'limlarga tugma chizmaydi", () => {
    const kb = directorReportKeyboard(SECRET, empty);
    expect(labels(kb)).toEqual(["💰 Pul harakati", "◀️ Menyu"]);
  });

  it("mazmuni bor bo'limlarni sanoq bilan ko'rsatadi", () => {
    const kb = directorReportKeyboard(SECRET, {
      ...empty,
      debt: { ...empty.debt, overdueCompanies: 4, overdueTotal: 16_100_000, dueNowCompanies: 137, dueNowTotal: 410_955_555 },
      obligations: { overdue: 1890, dueToday: 3, topResponsible: [], unassigned: 0 },
      pending: { expenses: 3, proofs: 384 },
      debt1C: { asOf: new Date(2026, 7, 7), total: 902_233_000, contracts: 131, asroComparable: 427_055_555 },
    });
    expect(labels(kb)).toEqual([
      "💰 Pul harakati",
      "📒 1C sverka",
      "📥 Yig'iladi (137)",
      "⚠️ Muddati o'tgan (4)",
      "⏰ Majburiyat (1890)",
      "🧾 Navbatlar",
      "◀️ Menyu",
    ]);
  });

  // Tugma imzolangan bo'lishi shart — aks holda uni router "eskirgan" deydi.
  it("imzolangan callback_data beradi", () => {
    const kb = directorReportKeyboard(SECRET, empty);
    const first = kb.inline_keyboard[0][0] as { callback_data: string };
    expect(decodeCallback(SECRET, first.callback_data)).toEqual({
      action: ACTION.DIR_SECTION,
      id: DIRECTOR_SECTION.CASH,
    });
  });
});

describe("renderDirectorSection", () => {
  it("pul harakati ekrani qoldiq va rejani ochib beradi", () => {
    const { text: raw } = renderDirectorSection(DIRECTOR_SECTION.CASH, {
      ...empty,
      yesterday: { income: 5_000_000, outflow: 2_000_000 },
      revenueBreakdown: { b2bIncome: 300_000_000, b2cIncome: 12_000_000 },
      plan: { period: "2026-08", plan: 500_000_000, fact: 312_000_000, percent: 62 },
    });
    expect(plain(raw)).toContain("💰 Pul harakati · 13-avgust");
    expect(plain(raw)).toContain("Sof     +3,000,000 so'm");
    expect(plain(raw)).toContain("Shartnoma (B2B): 300,000,000 so'm");
    expect(plain(raw)).toContain("🎯 2026-08 rejasi: 62%");
    expect(plain(raw)).toContain("ℹ️ Asos");
  });

  it("muddati o'tgan ekrani kechikish bosqichlarini beradi", () => {
    const alfa = debtor("Alfa MChJ", 9_000_000, 2);
    const { text: raw } = renderDirectorSection(DIRECTOR_SECTION.OVERDUE, {
      ...empty,
      debt: { ...empty.debt, overdueCompanies: 2, overdueTotal: 15_000_000, neverPaid: 1 },
      topDebtors: [alfa, debtor("Beta MChJ", 6_000_000)],
      agingMatrix: {
        ...empty.agingMatrix,
        stages: {
          ...empty.agingMatrix.stages,
          critical: { stage: "critical", label: "60+ kun", daysRange: "60+", companyCount: 1, totalAmount: 9_000_000, companies: [alfa] },
        },
        totalOverdueCompanies: 1,
        totalOverdueAmount: 9_000_000,
      },
    });
    expect(plain(raw)).toContain("⚠️ Muddati o'tgan qarz · 2 ta firma");
    expect(plain(raw)).toContain("60+ kun: 1 ta — 9,000,000 so'm");
    expect(plain(raw)).toContain("• Alfa MChJ — 9,000,000 so'm · 2 oylik · hech to'lamagan · Aziza");
  });

  // Biriktirilmagan firma — o'zi topilma: qarzni hech kim yurgizmayapti.
  it("mas'ul yo'q bo'lsa buni ochiq aytadi", () => {
    const { text: raw } = renderDirectorSection(DIRECTOR_SECTION.COLLECT, {
      ...empty,
      debt: { ...empty.debt, dueNowCompanies: 1, dueNowTotal: 2_000_000 },
      topDebtors: [{ ...debtor("Gamma MChJ", 0, 0, null), dueNow: 2_000_000 }],
    });
    expect(plain(raw)).toContain("• Gamma MChJ — 2,000,000 so'm · biriktirilmagan");
  });

  it("navbatlarni egasi bilan ajratadi", () => {
    const { text: raw } = renderDirectorSection(DIRECTOR_SECTION.QUEUES, {
      ...empty,
      pending: { expenses: 3, proofs: 384 },
      unmatchedBank: { income: 57, expense: 446 },
    });
    expect(plain(raw)).toContain("Mijozi topilmagan kirim: 57 ta · bank-klient");
    expect(plain(raw)).toContain("Toifalanmagan chiqim: 446 ta · admin");
  });

  it("1C farqini yo'nalishi bilan izohlaydi", () => {
    const { text: raw } = renderDirectorSection(DIRECTOR_SECTION.ONEC, {
      ...empty,
      debt1C: { asOf: new Date(2026, 7, 7), total: 902_233_000, contracts: 131, asroComparable: 427_055_555 },
    });
    expect(plain(raw)).toContain("📒 1C bilan sverka · 7-avgust");
    expect(plain(raw)).toContain("Farq: +475,177,445 so'm");
    expect(plain(raw)).toContain("1C ko'proq");
  });

  it("kesim yo'q bo'lsa 1C ekrani buni aytadi, bo'sh chiqmaydi", () => {
    expect(plain(renderDirectorSection(DIRECTOR_SECTION.ONEC, empty).text)).toContain("yuklanmagan");
  });

  it("majburiyat sanog'ini kimda to'planganiga bog'laydi", () => {
    const { text: raw } = renderDirectorSection(DIRECTOR_SECTION.OBLIGATIONS, {
      ...empty,
      obligations: {
        overdue: 1890,
        dueToday: 27,
        topResponsible: [
          { name: "Sevara", count: 126, oldestDays: 212 },
          { name: "Abrorbek", count: 126, oldestDays: 180 },
        ],
        unassigned: 44,
      },
    });
    expect(plain(raw)).toContain("🔴 Muddati o'tgan: 1890 ta");
    expect(plain(raw)).toContain("🔴 Sevara: 126 ta · eng eskisi 212 kun");
    // Biriktirilmagan — odamni emas, biriktiruvni tuzatish kerak.
    expect(plain(raw)).toContain("Mas'uli biriktirilmagan: 44 ta");
  });
});

describe("bo'lim kalitlari", () => {
  it("noma'lum kalitni rad etadi", () => {
    expect(isDirectorSectionKey("x")).toBe(false);
    expect(isDirectorSectionKey(DIRECTOR_SECTION.OVERDUE)).toBe(true);
  });

  it("hasSection tugma bilan matnni bir xil qoidada ushlaydi", () => {
    expect(hasSection(empty, DIRECTOR_SECTION.QUEUES)).toBe(false);
    expect(hasSection({ ...empty, pending: { expenses: 1, proofs: 0 } }, DIRECTOR_SECTION.QUEUES)).toBe(true);
  });
});

describe("directorSectionKeyboard", () => {
  it("HTTPS manzil bo'lmasa havola tugmasi umuman chizilmaydi", () => {
    const kb = directorSectionKeyboard(SECRET, DIRECTOR_SECTION.OVERDUE, null);
    expect(labels(kb)).toEqual(["◀️ Hisobotga qaytish"]);
  });

  it("manzil bor bo'lsa saytdagi to'liq ro'yxatga olib boradi", () => {
    const kb = directorSectionKeyboard(SECRET, DIRECTOR_SECTION.OVERDUE, "https://asro.uz");
    expect(kb.inline_keyboard[0][0]).toEqual({ text: "🌐 Qarzdorlik", url: "https://asro.uz/kassa/qarzdorlik" });
  });
});
