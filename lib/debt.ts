// =====================================================
// QARZDORLIK — YAGONA MANBA
// =====================================================
//
// Auditda "qarzdorlik" so'zi UCH XIL raqamni bildirishi aniqlandi:
//
//   lib/directorReport.ts  contractAmount − joriy oy to'lovi   → 852 mln
//   server/debt.ts         (o'sha formulaning nusxasi)         → 852 mln
//   server/profitability.ts Invoice.amount − paidAmount        → boshqa manba
//   bot/.../domain/debt.ts  contractAmount − paidAmount        → eskalatsiya
//   DebtSnapshot (1C)      jamg'arilgan qarz                   → 902 mln
//
// Keyinchalik `Invoice` va u bilan birga `/profitability` butunlay olib
// tashlandi. Endi shartnoma qarzi shu fayldan, 1C qarzi esa `DebtSnapshot`
// dan keladi — boshqa manba yo'q.
//
// ─────────────────────────────────────────────────────────────────────────
// NIMA UCHUN JAMG'ARILGAN HISOB (2026-08 o'zgarishi)
// ─────────────────────────────────────────────────────────────────────────
//
// Ilgari qarz FAQAT JORIY OY uchun hisoblanardi: `contractAmount − shu oy
// to'lovi`. Bu ikki jiddiy nuqson bergan edi:
//
//  1) HAR OY BOSHIDA HAMMA QARZDOR. Direktorning kunlik hisoboti 15-avgustda
//     "233 ta firma qarzdor, 233 tasi UMUMAN TO'LAMAGAN" deb yozardi —
//     holbuki bu shunchaki "avgust to'lovlari hali kelmagan" degani edi.
//     Raqam har kuni bir xil turardi, ya'ni signal emas, SHOVQIN edi.
//
//  2) KECHIKKAN TO'LOV ESKI OYNI YOPMASDI. Mijoz iyul hisobini avgustda
//     to'lasa, `Payment` avgust davriga yozilardi (davr TUSHGAN SANAdan
//     olinadi) va iyul abadiy qarzdor bo'lib qolardi. Ortiqcha to'lov esa
//     `Math.max(0, ...)` da yo'qolardi — avans tushunchasi umuman yo'q edi.
//
// Endi hisob AKKUMULYATIV: hisoblangan (charge) minus tushgan, davrga
// bog'lanmagan holda. Va eng muhimi, IKKI XIL raqam ajratiladi:
//
//   outstanding — jami qoldiq (joriy oy ham ichida). Manfiy bo'lsa AVANS.
//   overdue     — MUDDATI O'TGAN qism: faqat o'tgan oylar hisobi.
//
// Direktorga kerak bo'lgani — `overdue`. "Bu oy hali to'lamagan" normal holat,
// "o'tgan oy to'lamagan" esa aralashuv sababi.
//
// ATAYIN BIRLASHTIRILMAGANLAR:
//   * `bot/contexts/billing/domain/debt.ts` `assessDebt` — u eskalatsiya
//     DARAJASINI (yellow/orange/red) hisoblaydi; domen sof (DB'siz) bo'lib
//     qolishi kerak.

import { Prisma } from "@prisma/client";
import { debtAgingStage, type DebtAgingStage } from "@/lib/debtAging";
import { periodKeyOf } from "@/lib/periods";

type Db = Prisma.TransactionClient;

// Davr kaliti YAGONA manbadan (`lib/periods.ts`) — bu yerda o'z nusxasi bor
// edi. Mavjud importerlar (`lib/directorReport.ts`, `server/debt.ts`) buzilmasin
// deb qayta eksport qilinadi.
export { periodKeyOf };

/**
 * ASRO qaysi davrdan boshlab hisob qo'yadi.
 *
 * Bu SANA EMAS, CHEGARA: undan oldingi davrlar uchun ASRO hisob-kitob
 * yuritmaydi (tizim o'sha paytda ishlatilmagan). Qiymat ma'lumotdan olingan —
 * bazadagi eng eski `Payment.period` 2026-07, va prod 2026-08 da tozalangan
 * ("clean start"). Undan oldin charge yozish butun mijoz bazasiga soxta
 * milliardlab so'm qarz yopishtirardi.
 *
 * Firma keyinroq kelgan bo'lsa (`contractDate`), hisob o'sha oydan boshlanadi.
 */
export const BILLING_START_PERIOD = "2026-07";

/**
 * TO'LOV MUDDATI — necha oy ichida to'lanadi.
 *
 * Biznes qoidasi: ish oyi tugagach, mijoz KEYINGI OY davomida to'laydi.
 * "Iyulning puli avgustda olinadi." Ya'ni iyul uchun hisob avgust oyida
 * TO'LANISHI KERAK, va faqat avgust tugagachgina u MUDDATI O'TGAN bo'ladi.
 *
 * Bu farq mayda emas. Muddat hisobga olinmaganida 18-avgustda iyul qarzi
 * "muddati o'tgan" deb ko'rsatilardi va direktor 111 ta firmani qarzdor deb
 * ko'rardi — holbuki ularning hammasi hali o'z muddati ichida edi. Ya'ni
 * ogohlantirish qonuniy ishni buzilish deb ko'rsatardi.
 *
 * Shu sababdan uch xil holat ajratiladi:
 *   overdue — muddati o'tgan (aralashuv kerak)
 *   dueNow  — SHU OY yig'ilishi kerak (ish ro'yxati)
 *   qolgani — hali muddati kelmagan (joriy oy ishi)
 */
export const PAYMENT_TERM_MONTHS = 1;

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "YYYY-MM" → oy tartib raqami (1970-01 dan). Solishtirish va ayirish uchun. */
function periodIndex(period: string): number {
  const [y, m] = period.split("-");
  return Number(y) * 12 + (Number(m) - 1);
}

/** Ikki davr orasidagi oylar soni, IKKALASI HAM kiradi. `to < from` bo'lsa 0. */
export function monthsInclusive(from: string, to: string): number {
  if (!PERIOD_RE.test(from) || !PERIOD_RE.test(to)) return 0;
  return Math.max(0, periodIndex(to) - periodIndex(from) + 1);
}

/** Davrni n oyga suradi ("2026-01", -1 → "2025-12"). */
export function shiftPeriod(period: string, months: number): string {
  const idx = periodIndex(period) + months;
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Oldingi davr ("2026-01" → "2025-12"). */
export const previousPeriod = (period: string): string => shiftPeriod(period, -1);

/**
 * To'lov qarzni kamaytiradimi.
 *
 * Faqat HAQIQATAN tushgan pul: "pending" qatordagi reja summasi qarzni
 * yashirmasligi kerak. Bu qoida bot/billing bilan bir xil.
 */
export const isSettledPayment = (status: string | null | undefined): boolean =>
  status === "paid" || status === "partial";

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

// ─────────────────────────────────────────────────────────
// SOF YADRO
// ─────────────────────────────────────────────────────────

export interface CompanyDebtInput {
  contractAmount: Prisma.Decimal | number | null;
  /** Shu firma uchun hisob boshlanadigan davr ("YYYY-MM"). */
  billingStart: string;
  /** Joriy davr ("YYYY-MM"). */
  currentPeriod: string;
  /** Firmaning BARCHA to'lovlari (davrga qaramay). */
  payments: { amount: Prisma.Decimal | number; status: string }[];
  /**
   * ASRO hisob yuritishni boshlagunga qadar to'plangan qarz (1C dan,
   * `Contract.openingDebt`). U TO'LIQ muddati o'tgan deb sanaladi — tarixiy
   * qarz ta'rifan kechikkan. Busiz ASRO faqat o'z davridagi hisobni ko'rar
   * va eski qarz ko'rinmay ketardi.
   */
  openingDebt?: Prisma.Decimal | number | null;
  /** "Bugun" — kun hisobini testlash uchun. Berilmasa joriy vaqt. */
  now?: Date;
}

export interface CompanyDebtBreakdown {
  /** Hisoblangan jami (joriy oy ham ichida) + boshlang'ich qarz. */
  charged: number;
  /** Tushgan jami. */
  paid: number;
  /** charged − paid. MANFIY = avans (ortiqcha to'lagan). */
  outstanding: number;
  /** MUDDATI O'TGAN — to'lov oynasi yopilgan qism. Aralashuv kerak. */
  overdue: number;
  /** SHU OY yig'ilishi kerak bo'lgan qism — inkasso ish ro'yxati. */
  dueNow: number;
  /** Necha oy uchun hisob qo'yilgan. */
  monthsCharged: number;
  /** Muddati o'tgan qarz necha oylik shartnomaga teng (yaxlitlangan). */
  monthsOverdue: number;
  /**
   * ENG ESKI to'lanmagan hisob muddatidan beri o'tgan KUNLAR.
   *
   * Bu `monthsOverdue × 30` EMAS. `monthsOverdue` — pul nisbati (qarz / oylik),
   * vaqt emas; undan kun yasash "1-10 kun" yorlig'ini yolg'onga aylantirardi.
   * Bu yerda to'lovlar FIFO tartibida eng eski hisobdan yopiladi va birinchi
   * yopilmagan hisobning to'lov oynasi qachon yopilgani topiladi.
   */
  overdueDays: number;
}

/** Davr TUGAGAN payt (keyingi oyning 1-kuni, UTC). */
function periodEndsAt(period: string): Date {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1));
}

const DAY_MS = 86_400_000;

/**
 * Eng eski to'lanmagan hisobning muddati o'tganiga necha kun bo'ldi.
 *
 * Ish oyi P uchun pul P+TERM oyi DAVOMIDA to'lanadi, ya'ni muddat P+TERM
 * tugaganda o'tadi. Boshlang'ich (1C) qarz ASRO ishga tushgan birinchi oy
 * oxirigacha to'lanishi kerak deb qabul qilinadi.
 */
function computeOverdueDays(args: {
  opening: number;
  monthly: number;
  billingStart: string;
  overdueThrough: string;
  paid: number;
  now: Date;
}): number {
  const { opening, monthly, billingStart, overdueThrough, paid, now } = args;

  // FIFO navbat: boshlang'ich qarz, keyin har bir ish oyi.
  const queue: { amount: number; dueEndsAt: Date }[] = [];
  if (opening > 0) queue.push({ amount: opening, dueEndsAt: periodEndsAt(billingStart) });
  if (monthly > 0) {
    const months = monthsInclusive(billingStart, overdueThrough);
    for (let i = 0; i < months; i++) {
      const workPeriod = shiftPeriod(billingStart, i);
      queue.push({
        amount: monthly,
        dueEndsAt: periodEndsAt(shiftPeriod(workPeriod, PAYMENT_TERM_MONTHS)),
      });
    }
  }

  let remaining = paid;
  for (const item of queue) {
    if (remaining >= item.amount) {
      remaining -= item.amount;
      continue;
    }
    // Mana shu hisob to'liq yopilmagan — eng eski qarz shu.
    const days = Math.floor((now.getTime() - item.dueEndsAt.getTime()) / DAY_MS);
    return Math.max(0, days);
  }
  return 0;
}

/**
 * Bitta firmaning jamg'arilgan qarzi. Sof funksiya — testlanadi.
 *
 * `outstanding` NOLDA CHEKLANMAYDI: ortiqcha to'lov avans sifatida manfiy
 * qoldiqda ko'rinishi kerak. Ilgari `Math.max(0, ...)` uni yo'q qilardi va
 * oldindan to'lagan mijoz keyingi oyda yana qarzdor bo'lib chiqardi.
 */
export function computeCompanyDebt(input: CompanyDebtInput): CompanyDebtBreakdown {
  const monthly = num(input.contractAmount);
  const opening = num(input.openingDebt);
  const paid = input.payments
    .filter((p) => isSettledPayment(p.status))
    .reduce((sum, p) => sum + num(p.amount), 0);

  const now = input.now ?? new Date();

  if (monthly <= 0) {
    // Shartnoma summasi yo'q — yangi hisob qo'yib bo'lmaydi. Boshlang'ich qarz
    // bo'lsa u saqlanadi; tushgan pul uni kamaytiradi va ortig'i avans bo'ladi.
    const outstanding = opening - paid;
    const overdue = Math.max(0, outstanding);
    return {
      charged: opening,
      paid,
      outstanding,
      overdue,
      dueNow: 0,
      monthsCharged: 0,
      monthsOverdue: 0,
      overdueDays:
        overdue > 0
          ? computeOverdueDays({
              opening,
              monthly: 0,
              billingStart: input.billingStart,
              overdueThrough: input.billingStart,
              paid,
              now,
            })
          : 0,
    };
  }

  const monthsCharged = monthsInclusive(input.billingStart, input.currentPeriod);

  // To'lov oynasi. Ish oyi P uchun pul P+TERM oyida olinadi, ya'ni:
  //   muddati o'tgan  → P <= joriy − TERM − 1
  //   shu oy to'lanadi → P == joriy − TERM
  //   hali erta        → P > joriy − TERM
  const dueThrough = shiftPeriod(input.currentPeriod, -PAYMENT_TERM_MONTHS);
  const overdueThrough = shiftPeriod(dueThrough, -1);

  const charged = opening + monthly * monthsCharged;
  // Boshlang'ich qarz TO'LIQ muddati o'tgan — tarixiy qarz ta'rifan kechikkan.
  const overdueBase = opening + monthly * monthsInclusive(input.billingStart, overdueThrough);
  const dueBase = opening + monthly * monthsInclusive(input.billingStart, dueThrough);

  const outstanding = charged - paid;
  const overdue = Math.max(0, overdueBase - paid);
  // To'lov avval ENG ESKI qarzni yopadi (FIFO), shuning uchun `dueNow` dan
  // muddati o'tgan qism ayiriladi — bir xil pul ikki chelakda turmasin.
  const dueNow = Math.max(0, Math.max(0, dueBase - paid) - overdue);

  return {
    charged,
    paid,
    outstanding,
    overdue,
    dueNow,
    monthsCharged,
    monthsOverdue: overdue > 0 ? Math.round((overdue / monthly) * 10) / 10 : 0,
    overdueDays:
      overdue > 0
        ? computeOverdueDays({
            opening,
            monthly,
            billingStart: input.billingStart,
            overdueThrough,
            paid,
            now,
          })
        : 0,
  };
}

/**
 * Firma uchun hisob boshlanadigan davr: global chegara yoki shartnoma sanasi —
 * qaysi biri KEYINROQ bo'lsa. Shartnomasi 2026-09 da imzolangan firmaga
 * 2026-07 dan hisob qo'yish soxta qarz yaratardi.
 */
export function billingStartFor(contractDate: Date | null | undefined): string {
  if (!contractDate) return BILLING_START_PERIOD;
  const fromContract = periodKeyOf(contractDate);
  return periodIndex(fromContract) > periodIndex(BILLING_START_PERIOD)
    ? fromContract
    : BILLING_START_PERIOD;
}

// ─────────────────────────────────────────────────────────
// DB QATLAMI
// ─────────────────────────────────────────────────────────

export interface DebtorRow {
  companyId: string;
  name: string;
  inn: string;
  contractAmount: number;
  charged: number;
  paid: number;
  outstanding: number;
  overdue: number;
  /** Shu oy yig'ilishi kerak (muddati hali o'tmagan). */
  dueNow: number;
  monthsOverdue: number;
  /** Eng eski to'lanmagan hisob muddatidan beri o'tgan kunlar. */
  overdueDays: number;
  /** Oxirgi tushum bo'lgan davr — "hech qachon" bo'lsa null. */
  lastPaidPeriod: string | null;
  /** Mas'ul buxgalter (kim bilan gaplashish kerakligi). */
  accountantName: string | null;
  supervisorName: string | null;
  // ALOQA IZI — qarz HISOBIGA kirmaydi, u ustidagi ASRO izohi. Shuning uchun
  // ixtiyoriy: bot hisoboti (`render-director-report`) sof qarz raqamlari
  // bilan ishlaydi va bu ustunlarni bilishi shart emas.
  /** Oxirgi marta qachon gaplashilgan (ISO). */
  contactedAt?: string | null;
  /** Keyingi suhbat qachonga belgilangan (ISO). */
  nextContactAt?: string | null;
  contactNote?: string | null;
  /** Suhbat muddati kelgan yoki o'tgan — bugungi ro'yxat shu bo'yicha. */
  contactDue?: boolean;
}

export interface DebtTotals {
  /** Qoldig'i musbat firmalar soni. */
  companies: number;
  /** Jami qoldiq (joriy oy ham ichida). */
  total: number;
  /** MUDDATI O'TGAN qarzi bor firmalar soni. */
  overdueCompanies: number;
  /** Muddati o'tgan jami summa — aralashuv talab qiladigan raqam. */
  overdueTotal: number;
  /** SHU OY yig'ilishi kerak bo'lgan firmalar soni. */
  dueNowCompanies: number;
  /** Shu oy yig'ilishi kerak bo'lgan summa — inkasso rejasi. */
  dueNowTotal: number;
  /** Bir marta ham to'lov qilmagan firmalar soni (muddati o'tganlar ichida). */
  neverPaid: number;
  /** Avansda turgan firmalar (ortiqcha to'lagan). */
  inAdvance: number;
  /** companyId → qoldiq (outstanding). */
  byCompany: Map<string, number>;
}

export interface DebtScopeOptions {
  /** Faqat shu firmalar. `null`/berilmasa — hammasi (admin). */
  companyIds?: string[] | null;
}

interface CompanyWithPayments {
  id: string;
  name: string;
  inn: string;
  contractAmount: Prisma.Decimal | null;
  contractDate: Date | null;
  accountant: { fullName: string } | null;
  supervisor: { fullName: string } | null;
  debtContactedAt: Date | null;
  debtNextContactAt: Date | null;
  debtContactNote: string | null;
  payments: { period: string; amount: Prisma.Decimal; status: string }[];
  contracts: { openingDebt: Prisma.Decimal | null }[];
}

async function loadCompanies(
  db: Db,
  companyIds?: string[] | null
): Promise<CompanyWithPayments[]> {
  return db.company.findMany({
    where: {
      isActive: true,
      isOwnFirm: false,
      ...(companyIds ? { id: { in: companyIds } } : {}),
    },
    select: {
      id: true,
      name: true,
      inn: true,
      contractAmount: true,
      contractDate: true,
      accountant: { select: { fullName: true } },
      supervisor: { select: { fullName: true } },
      // Qarz bo'yicha aloqa izi — "bugun kim bilan gaplashish kerak"
      // ro'yxati shu ustunlarsiz har kuni bir xil turadi.
      debtContactedAt: true,
      debtNextContactAt: true,
      debtContactNote: true,
      // BARCHA davrlar — jamg'arilgan hisob uchun. Ilgari faqat joriy oy
      // o'qilardi, shuning uchun kechikkan to'lov eski oyni yopa olmasdi.
      payments: {
        where: { deletedAt: null },
        select: { period: true, amount: true, status: true },
      },
      // ASRO davridan OLDINGI qarz (1C dan). Schema izohi: "boshlang'ich +
      // yangi oylar − to'lovlar" — aynan shu model.
      contracts: { where: { isActive: true }, select: { openingDebt: true } },
    },
  });
}

function rowFor(c: CompanyWithPayments, currentPeriod: string): DebtorRow {
  const openingDebt = c.contracts.reduce((s, k) => s + num(k.openingDebt), 0);
  const breakdown = computeCompanyDebt({
    contractAmount: c.contractAmount,
    billingStart: billingStartFor(c.contractDate),
    currentPeriod,
    payments: c.payments,
    openingDebt,
  });

  const settled = c.payments.filter((p) => isSettledPayment(p.status));
  const lastPaidPeriod = settled.length
    ? settled.map((p) => p.period).sort().at(-1) ?? null
    : null;

  return {
    companyId: c.id,
    name: c.name,
    inn: c.inn,
    contractAmount: num(c.contractAmount),
    charged: breakdown.charged,
    paid: breakdown.paid,
    outstanding: breakdown.outstanding,
    overdue: breakdown.overdue,
    dueNow: breakdown.dueNow,
    monthsOverdue: breakdown.monthsOverdue,
    overdueDays: breakdown.overdueDays,
    lastPaidPeriod,
    accountantName: c.accountant?.fullName ?? null,
    supervisorName: c.supervisor?.fullName ?? null,
    contactedAt: c.debtContactedAt ? c.debtContactedAt.toISOString() : null,
    nextContactAt: c.debtNextContactAt ? c.debtNextContactAt.toISOString() : null,
    contactNote: c.debtContactNote,
    // Suhbat belgilanmagan bo'lsa ham "muddati keldi" deb sanaladi: qarzdor
    // bilan hech kim gaplashmagani — kechiktirilganidan battarroq holat.
    contactDue: !c.debtNextContactAt || c.debtNextContactAt <= new Date(),
  };
}

/**
 * Shartnoma asosidagi jamg'arilgan qarzdorlik — YIG'MA ko'rsatkichlar.
 *
 * @param period "2026-08". Berilmasa joriy oy.
 *
 * 1C bilan solishtirish endi MA'NOLI: ikkalasi ham jamg'arilgan qarzni beradi.
 * Ilgari ASRO joriy oyni, 1C esa jamg'arilganini ko'rsatardi va ikkalasining
 * farqi hech narsani anglatmasdi.
 */
export async function computeContractDebt(
  db: Db,
  period?: string,
  options: DebtScopeOptions = {}
): Promise<DebtTotals> {
  const currentPeriod = period ?? periodKeyOf(new Date());
  const companies = await loadCompanies(db, options.companyIds);

  const byCompany = new Map<string, number>();
  let total = 0;
  let overdueTotal = 0;
  let overdueCompanies = 0;
  let dueNowTotal = 0;
  let dueNowCompanies = 0;
  let neverPaid = 0;
  let inAdvance = 0;

  for (const c of companies) {
    const row = rowFor(c, currentPeriod);

    if (row.outstanding > 0) {
      byCompany.set(c.id, row.outstanding);
      total += row.outstanding;
    } else if (row.outstanding < 0) {
      inAdvance++;
    }

    if (row.overdue > 0) {
      overdueCompanies++;
      overdueTotal += row.overdue;
      // "Umuman to'lamagan" endi FAQAT muddati o'tganlar ichida sanaladi —
      // aks holda oy boshida butun mijoz bazasi shu raqamga tushib ketardi.
      if (row.paid === 0) neverPaid++;
    }

    if (row.dueNow > 0) {
      dueNowCompanies++;
      dueNowTotal += row.dueNow;
    }
  }

  return {
    companies: byCompany.size,
    total,
    overdueCompanies,
    overdueTotal,
    dueNowCompanies,
    dueNowTotal,
    neverPaid,
    inAdvance,
    byCompany,
  };
}

/**
 * To'lamagan firmalar RO'YXATI — muddati o'tgani eng kattasi tepada.
 *
 * Direktor hisoboti ham, `/kassa/qarzdorlik` ekrani ham shundan oziqlanadi,
 * shuning uchun ikkovi bir xil ro'yxatni ko'rsatadi.
 *
 * @param opts.scope qaysi qatorlar kerak:
 *   "overdue" — faqat muddati o'tganlar (standart, aralashuv ro'yxati);
 *   "collect" — muddati o'tgan + shu oy yig'ilishi kerak (inkasso ro'yxati);
 *   "all"     — qoldig'i bor hamma firma.
 */
export async function listDebtors(
  db: Db,
  opts: DebtScopeOptions & {
    period?: string;
    scope?: "overdue" | "collect" | "all";
    limit?: number;
  } = {}
): Promise<DebtorRow[]> {
  const currentPeriod = opts.period ?? periodKeyOf(new Date());
  const scope = opts.scope ?? "overdue";
  const companies = await loadCompanies(db, opts.companyIds);

  const keep = (r: DebtorRow) =>
    scope === "overdue" ? r.overdue > 0
    : scope === "collect" ? r.overdue > 0 || r.dueNow > 0
    : r.outstanding > 0;

  const rows = companies
    .map((c) => rowFor(c, currentPeriod))
    .filter(keep)
    // Muddati o'tgani tepada — u aralashuv talab qiladi; keyin shu oy
    // yig'iladigani.
    .sort((a, b) => b.overdue - a.overdue || b.dueNow - a.dueNow);

  return opts.limit ? rows.slice(0, opts.limit) : rows;
}

// ─────────────────────────────────────────────────────────
// 4 BOSQICHLI AGING DEBT MATRITSASI
// ─────────────────────────────────────────────────────────

export type { DebtAgingStage };

export interface DebtAgingStageGroup {
  stage: DebtAgingStage;
  label: string;
  daysRange: string;
  companyCount: number;
  totalAmount: number;
  companies: DebtorRow[];
}

export interface DebtAgingMatrix {
  stages: {
    normal: DebtAgingStageGroup;
    warning: DebtAgingStageGroup;
    suspension: DebtAgingStageGroup;
    critical: DebtAgingStageGroup;
  };
  totalOverdueCompanies: number;
  totalOverdueAmount: number;
}

/**
 * Muddati o'tgan qarzdorlarni 4 ta bosqichga ajratadi:
 *  - 1-10 kun:  normal / operatsion
 *  - 11-30 kun: ogohlantirish / bildirishnoma
 *  - 31-60 kun: xizmatni to'xtatish xavfi
 *  - 60+ kun:   kritik qarzdorlik / shartnomani bekor qilish / sud
 */
export function computeDebtAgingMatrix(debtors: DebtorRow[]): DebtAgingMatrix {
  const matrix: DebtAgingMatrix = {
    stages: {
      normal: {
        stage: "normal",
        label: "1-10 kun (Operatsion)",
        daysRange: "1-10",
        companyCount: 0,
        totalAmount: 0,
        companies: [],
      },
      warning: {
        stage: "warning",
        label: "11-30 kun (Ogohlantirish)",
        daysRange: "11-30",
        companyCount: 0,
        totalAmount: 0,
        companies: [],
      },
      suspension: {
        stage: "suspension",
        label: "31-60 kun (Xizmatni to'xtatish xavfi)",
        daysRange: "31-60",
        companyCount: 0,
        totalAmount: 0,
        companies: [],
      },
      critical: {
        stage: "critical",
        label: "60+ kun (Kritik / Sud)",
        daysRange: "60+",
        companyCount: 0,
        totalAmount: 0,
        companies: [],
      },
    },
    totalOverdueCompanies: 0,
    totalOverdueAmount: 0,
  };

  for (const d of debtors) {
    if (d.overdue <= 0) continue;

    const days = d.overdueDays;

    // Chegaralar `lib/debtAging.ts` da — ekran ham, direktor hisoboti ham
    // AYNAN shu funksiyani ishlatadi, ya'ni ular ajralib keta olmaydi.
    const targetStage = debtAgingStage(days);

    const group = matrix.stages[targetStage];
    group.companyCount++;
    group.totalAmount += d.overdue;
    group.companies.push(d);

    matrix.totalOverdueCompanies++;
    matrix.totalOverdueAmount += d.overdue;
  }

  return matrix;
}

export async function getDebtAgingMatrix(
  db: Db,
  opts: DebtScopeOptions & { period?: string } = {}
): Promise<DebtAgingMatrix> {
  const debtors = await listDebtors(db, { ...opts, scope: "overdue" });
  return computeDebtAgingMatrix(debtors);
}
