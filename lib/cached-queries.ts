/**
 * Markaziy cache qatlami — barcha "o'qish" so'rovlari uchun.
 *
 * Har bir funksiya:
 *  1) `unstable_cache` — server-side cache (5 daqiqa TTL)
 *  2) `React.cache()`  — bitta render ichida deduplication
 *  3) `tags`           — mutatsiyada `revalidateTag()` bilan tozalanadi
 *
 * auth() (cookies) cache ichida ishlamaydi, shuning uchun
 * auth tekshiruvini tashqarida qilib, natijani (userId, role)
 * argument sifatida beramiz.
 */

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isSeniorRole } from "@/lib/permissions";
import { companyScopeWhere, scopedStaffIds } from "@/lib/access";
import { mapMonthlyReportToOperationEntry } from "@/lib/operationTemplates";
import {
  TARIFF_PRESET_SETTING_KEY,
  resolveTariffPreset,
  type TariffPreset,
} from "@/lib/tariffPresets";

// Firma ro'yxati BIRIKTIRUV bo'yicha cheklanadi (lib/access.ts). Ilgari bu yerda
// rol bo'yicha uch tarmoq bor edi va "senior" tarmog'i argumentsiz cache'langani
// uchun nazoratchi/bosh buxgalter butun tizimning firmalarini ko'rardi.
//
// Endi har bir funksiya (userId, role) qabul qiladi — `unstable_cache` kalitni
// argumentlar bo'yicha quradi, ya'ni har bir foydalanuvchining o'z yozuvi bo'ladi.
// Kontekst kesh KALITIGA kiradi — aks holda buxgalter sifatida ochilgan
// ro'yxat nazoratchi kontekstiga o'tganda ham eskicha qaytardi.
const scopeFor = (userId: string, role: string, context?: string) =>
  companyScopeWhere({ id: userId, role, context: context as never });

// Firma kartochkasi/jadvali barcha mas'ul shaxslarni ko'rsatadi va klient
// tomonda `companyRelations` hisoblanadi — shuning uchun include hamma uchun bir xil.
const COMPANY_INCLUDE = {
  accountant: { select: { id: true, fullName: true, avatarColor: true } },
  // "Ichki shartnoma tomoni" — shartnoma qaysi O'Z firmamiz nomidan tuzilgan.
  // ID saqlanadi, ekranga esa NOM chiqadi, shuning uchun relation kerak.
  internalContractorFirm: { select: { id: true, name: true } },
  supervisor: { select: { id: true, fullName: true } },
  chiefAccountant: { select: { id: true, fullName: true } },
  bankClient: { select: { id: true, fullName: true } },
  // chiefAccountantId — klientda `companyRelations` uchun: bosh buxgalter
  // firmaga departament orqali ham biriktirilgan bo'lishi mumkin.
  departmentRef: { select: { id: true, name: true, chiefAccountantId: true } },
  // Shartnomalar firma kartochkasida ko'rinishi kerak. Eski
  // `Company.contractNumber` bitta ustun — u 213 firmadan atigi 2 tasida
  // to'ldirilgan va bitta mijozda bir nechta shartnoma bo'lishini
  // ko'tarolmaydi. Haqiqiy manba — `Contract` jadvali (1C reestridan).
  contracts: {
    where: { isActive: true },
    select: {
      id: true,
      number: true,
      signedAt: true,
      amount: true,
      source: true,
      ownFirm: { select: { id: true, name: true } },
    },
    orderBy: { number: "asc" },
  },
} as const;

// ─────────────────────────────────────────────
// COMPANIES
// ─────────────────────────────────────────────

const _getCachedCompanies = unstable_cache(
  async (userId: string, role: string, context?: string) => {
    return prisma.company.findMany({
      where: { isActive: true, isOwnFirm: false, ...scopeFor(userId, role, context) },
      include: COMPANY_INCLUDE,
      orderBy: { name: "asc" },
    });
  },
  ["companies-scoped"],
  { tags: ["companies"], revalidate: 300 }
);

/** Firmalarni cache'dan olish (render ichida deduplicate) */
export const getCachedCompanies = cache(
  async (userId: string, role: string, context?: string) =>
    _getCachedCompanies(userId, role, context)
);

/**
 * O'Z FIRMALARIMIZ — "Ichki shartnoma tomoni" tanlagichi uchun.
 *
 * ALOHIDA SO'ROV SHART: `getCachedCompanies` ataylab `isOwnFirm: false` bilan
 * ishlaydi (o'z firmalarimiz mijozlar ro'yxatida, qarzdorlikda va payrollda
 * qatnashmasligi kerak), shuning uchun ular yuqoridagi ro'yxatda YO'Q.
 *
 * NEGA BAZADAN: bu ro'yxat `OnboardingWizard` ichida QO'LDA yozilgan edi va
 * bazadan ajralib ketgan — "FINFO INFO BEST" (mijozlar "Fininfo best" deb
 * ataydigan firma) ro'yxatda yo'q edi, o'rniga bazada o'z firma sifatida
 * turmagan "Plastik" bor edi. Natijada shartnomasi shu firma bilan tuzilgan
 * mijozni to'g'ri belgilash imkoni bo'lmagan.
 *
 * Arxivlanganlar chiqarilmaydi: yangi shartnoma tugatilgan firma nomiga
 * yozilmasligi kerak. Eski qiymat esa tahrirlashda saqlanadi (mijoz tomonda).
 */
const _getCachedOwnFirms = unstable_cache(
  async () => {
    return prisma.company.findMany({
      where: { isOwnFirm: true, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  },
  ["own-firms"],
  { tags: ["companies"], revalidate: 300 }
);

export const getCachedOwnFirms = cache(async () => _getCachedOwnFirms());

const _getCachedArchivedCompanies = unstable_cache(
  async (userId: string, role: string, context?: string) => {
    return prisma.company.findMany({
      where: { isActive: false, ...scopeFor(userId, role, context) },
      include: COMPANY_INCLUDE,
      orderBy: { name: "asc" },
    });
  },
  ["companies-archived"],
  { tags: ["companies"], revalidate: 300 }
);

/**
 * Arxivlangan firmalar — FAQAT "Firmalar" sahifasidagi Arxiv/Barchasi filtri uchun.
 *
 * Yuqoridagi `getCachedCompanies` ataylab `isActive: true` bilan qoladi: uni
 * kengaytirish arxivdagi firmalarni matritsa, kassa, oylik va hujjatlar
 * ekranlariga ham olib kirardi. Shuning uchun arxiv alohida so'rov bilan olinadi.
 * Arxiv ham portfelga cheklanadi va faqat senior rollarga ko'rsatiladi.
 *
 * `context` yuqoridagi faol ro'yxat bilan bir xil parametr — aks holda "Faol"
 * tab kontekstga qarab toraysayu, "Arxiv" tab kengroq (butun portfel) qolib
 * ketardi va ikkovi bir xil filtr ostida mos kelmagan sonlar ko'rsatardi.
 */
export const getCachedArchivedCompanies = cache(
  async (userId: string, role: string, context?: string) =>
    isSeniorRole(role) ? _getCachedArchivedCompanies(userId, role, context) : []
);

// ─────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────

const _getCachedUsers = unstable_cache(
  async (userId: string, role: string) => {
    const ids = await scopedStaffIds(prisma, { id: userId, role });
    return prisma.user.findMany({
      where: { isActive: true, ...(ids ? { id: { in: ids } } : {}) },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        avatarColor: true,
        phone: true,
        department: true,
        gender: true,
        birthDate: true,
        education: true,
        hiredAt: true,
        status: true,
        rating: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { fullName: "asc" },
    });
  },
  ["users-scoped"],
  { tags: ["users", "companies"], revalidate: 300 }
);

/** Xodimlarni cache'dan olish — portfeldagi firmalarga biriktirilganlar (+ o'zi). */
export const getCachedUsers = cache(async (userId: string, role: string) => {
  return _getCachedUsers(userId, role);
});

// ─────────────────────────────────────────────
// OPERATIONS
// ─────────────────────────────────────────────

// Eslatma: bu yerda "Operation" emas, "MonthlyReport" jadvali so'raladi — Firmalar/Xodimlar/
// KPI/Oylik/Hisobotlar sahifalari oylik hisobot-checklist ma'lumotini (Didox, 1C, soliqlar va h.k.)
// kutadi (frontend turi: OperationEntry). Yillik/choraklik "Operation" statistikasi uchun
// alohida `getCachedOperationSummary` bor.
const _getCachedOperations = unstable_cache(
  async (userId: string, role: string) => {
    const reports = await prisma.monthlyReport.findMany({
      where: { company: scopeFor(userId, role) },
      orderBy: [{ period: "desc" }],
    });
    return reports.map(mapMonthlyReportToOperationEntry);
  },
  ["operations-scoped"],
  { tags: ["operations", "companies"], revalidate: 300 }
);

/** Operatsiyalarni (oylik hisobot-checklist) cache'dan olish (render ichida deduplicate) */
export const getCachedOperations = cache(
  async (userId: string, role: string) => _getCachedOperations(userId, role)
);

// ─────────────────────────────────────────────
// MAJBURIYAT QAMROVI — "kim nimani topshirishi SHART"
// ─────────────────────────────────────────────
// Matritsa foizi uchun MAXRAJ shu yerdan keladi.
//
// Bungacha maxraj "kimdir belgilagan kataklar" edi. Ya'ni hisobotni 253
// firmadan 2 tasi belgilagan bo'lsa, foiz o'sha 2 tadan hisoblanardi ("50%"),
// holbuki savol — talab qilingan firmalardan qanchasi topshirgani.
//
// `Company.requiredReports` bu ishga yaramaydi: prodda u 263 firmaning
// HAMMASIDA bo'sh (`activeServices` ham). Yagona ishonchli manba — majburiyat
// dvigateli: u firma va davrga qarab farqlaydi (masalan QQS_DECL faqat QQS
// to'lovchilarda).
//
// Faqat (companyId, templateCode) juftliklari qaytariladi — 2026-08 da ~3100
// qator, ya'ni arzon.
const _getCachedObligationCoverage = unstable_cache(
  async (userId: string, role: string, periodKey: string) => {
    const rows = await prisma.obligation.findMany({
      where: {
        periodKey,
        status: { not: "cancelled" },
        company: scopeFor(userId, role),
      },
      select: { companyId: true, template: { select: { code: true } } },
    });
    return rows.map((r) => ({ companyId: r.companyId, code: r.template.code }));
  },
  ["obligation-coverage"],
  { tags: ["obligations", "companies"], revalidate: 300 }
);

/** Davr bo'yicha "qaysi firmadan qaysi hisobot talab qilinadi" ro'yxati. */
export const getCachedObligationCoverage = cache(
  async (userId: string, role: string, periodKey: string) =>
    _getCachedObligationCoverage(userId, role, periodKey)
);

// ─────────────────────────────────────────────
// COMPANY STATS
// ─────────────────────────────────────────────

const _getCachedCompanyStats = unstable_cache(
  async (userId: string, role: string) => {
    const where = { isActive: true, ...scopeFor(userId, role) };
    const [total, byTaxRegime, byRisk] = await Promise.all([
      prisma.company.count({ where }),
      prisma.company.groupBy({
        by: ["taxRegime"],
        where,
        _count: true,
      }),
      prisma.company.groupBy({
        by: ["riskLevel"],
        where,
        _count: true,
      }),
    ]);
    return { total, byTaxRegime, byRisk };
  },
  ["company-stats-scoped"],
  { tags: ["companies"], revalidate: 300 }
);

/** Firma statistikasini cache'dan olish */
export const getCachedCompanyStats = cache(
  async (userId: string, role: string) => _getCachedCompanyStats(userId, role)
);

// ─────────────────────────────────────────────
// MAJBURIYAT XULOSASI
// ─────────────────────────────────────────────
// Ilgari bu `Operation` jadvalini sanardi — u yillik/choraklik hisobotlarning
// alohida nusxasi edi va jadval bazada umuman yaratilmagan. Endi manba bitta:
// `Obligation`. Shu bilan taxtadagi progress bilan `/deadlines` dagi holat
// bir xil raqamdan kelib chiqadi.

const _getCachedObligationSummary = unstable_cache(
  async (userId: string, role: string) => {
    const scope = { company: scopeFor(userId, role) };
    const now = new Date();
    const [total, accepted, rejected, inProgress, overdue] = await Promise.all([
      prisma.obligation.count({ where: scope }),
      prisma.obligation.count({ where: { ...scope, status: "accepted" } }),
      prisma.obligation.count({ where: { ...scope, status: "rejected" } }),
      prisma.obligation.count({ where: { ...scope, status: { in: ["in_progress", "ready", "sent"] } } }),
      prisma.obligation.count({
        where: { ...scope, dueAt: { lt: now }, status: { in: ["planned", "in_progress", "ready", "sent", "rejected"] } },
      }),
    ]);
    return {
      total,
      accepted,
      rejected,
      inProgress,
      overdue,
      pending: total - accepted - rejected - inProgress,
    };
  },
  ["obligation-summary"],
  { revalidate: 60, tags: ["obligations"] }
);

export const getCachedObligationSummary = cache(
  async (userId: string, role: string) => _getCachedObligationSummary(userId, role)
);
// ─────────────────────────────────────────────
// UNREAD COUNT
// ─────────────────────────────────────────────

const _getCachedUnreadCount = unstable_cache(
  async (userId: string) => {
    return prisma.notification.count({
      where: { userId, isRead: false },
    });
  },
  ["unread-count"],
  { tags: ["notifications"], revalidate: 60 } // bildirishnomalar tezroq yangilansin
);

/** O'qilmagan bildirishnomalar sonini cache'dan olish */
export const getCachedUnreadCount = cache(async (userId: string) => {
  return _getCachedUnreadCount(userId);
});

// ─────────────────────────────────────────────
// TARIF PRESETI
// ─────────────────────────────────────────────

const _getCachedTariffPreset = unstable_cache(
  async () => {
    const row = await prisma.systemSetting.findUnique({
      where: { key: TARIFF_PRESET_SETTING_KEY },
    });
    return resolveTariffPreset(row?.value);
  },
  ["tariff-preset"],
  { tags: ["system-settings"], revalidate: 300 }
);

/**
 * Biriktirish oynasidagi "Standart taqsimot" qiymatlari.
 * Sozlama yo'q/buzuq bo'lsa STANDARD_TARIFF ga qaytadi — sozlamadagi xato
 * firma ochishni to'xtatmasligi kerak.
 */
export const getCachedTariffPreset = cache(async (): Promise<TariffPreset> => {
  return _getCachedTariffPreset();
});
