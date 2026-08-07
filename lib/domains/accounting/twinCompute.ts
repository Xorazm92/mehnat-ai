// =====================================================
// DIGITAL TWIN — ballarni haqiqiy ma'lumotdan hisoblash (C1)
// =====================================================
// AKTYOR ARGUMENT, SESSIYA EMAS. Bu qatlam `auth()` chaqirmaydi: ballar
// faqat ekran uchun emas, ogohlantirish uchun ham kerak, ogohlantirish esa
// navbat ishchisida ishlaydi va u yerda sessiya YO'Q. Kirish tekshiruvi
// `server/twin.ts` da — bu yerda esa doira aktyordan keladi, ya'ni tizim
// ishchisi ham, foydalanuvchi ham bir xil kodni ishlatadi.
// Engine (`lib/engines/analytics/twin.ts`) sof matematika. Bu fayl unga
// ma'lumot yetkazadi va natijani biriktiruv doirasida qaytaradi.
//
// TARTIB MUHIM: avval sig'im, keyin xavf. Xavfning beshinchi qo'shiluvchisi —
// mas'ulning yuklamasi, ya'ni sig'im ballisiz xavf to'liq emas.
//
// `Company.riskLevel` BUGUN QO'LDA KIRITILADI (`server/companies.ts`) va 7
// joyda o'qiladi — ya'ni ekranlardagi "risk" bugun kimningdir eski taxmini.
// `persistRiskLevels` uni hisoblanganga aylantiradi: USTUN o'zgarmaydi,
// faqat YOZUVCHISI, shuning uchun 7 o'quvchining bittasiga ham tegilmaydi.
// `riskNotes` sababni saqlaydi — raqam manbasiz ko'rsatilmasin (7-modda).
import type { Prisma } from "@prisma/client";
import { companyScopeWhere, type Actor } from "@/lib/platform/access";
import { periodWindowFor } from "@/lib/engines/obligation/deadlines";
import { complexityWeight } from "@/lib/fairKpi";
import { normativeEffort } from "@/lib/domains/accounting/normativeEffort";
import {
  riskScore, complianceScore, capacityLoad, explain,
  type Score, type CapacityItem,
} from "@/lib/engines/analytics/twin";
import { toYearMonthKey } from "@/lib/periods";

/** Ish kuni — soatda. Ish fondi shu bilan quriladi. */
const WORK_HOURS_PER_DAY = 8;

const MS_DAY = 86_400_000;

type Db = Prisma.TransactionClient;

/** Davr oynasi — `"YYYY-MM"` yoki `"2026 Iyul"`. */
function monthWindow(period: string) {
  const ym = toYearMonthKey(period);
  if (!ym) throw new Error(`Davr o'qib bo'lmadi: ${period}`);
  const [y, m] = ym.split("-").map(Number);
  return periodWindowFor("monthly", new Date(Date.UTC(y, m - 1, 15)));
}

/**
 * Davrdagi ish fondi, daqiqada.
 *
 * Biznes kalendar to'ldirilgan bo'lsa — o'sha; bo'lmasa dushanba-juma. Ikkinchi
 * yo'l taxmin, lekin sig'imni umuman hisoblamaslikdan yaxshiroq va u yakshanba
 * kunlarini ish deb sanamaydi.
 */
async function workFundMinutes(db: Db, start: Date, end: Date): Promise<number> {
  const days = await db.businessCalendarDay.findMany({
    where: { date: { gte: start, lt: end } },
    select: { isWorkday: true, isHoliday: true },
  });
  if (days.length > 0) {
    const n = days.filter((d) => d.isWorkday && !d.isHoliday).length;
    return n * WORK_HOURS_PER_DAY * 60;
  }
  let n = 0;
  for (let t = start.getTime(); t < end.getTime(); t += MS_DAY) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n * WORK_HOURS_PER_DAY * 60;
}

export interface StaffCapacity {
  userId: string;
  fullName: string;
  score: Score;
  /** Bittasi ham normativsiz bo'lsa — raqam taxminiy. */
  estimated: boolean;
}

/**
 * Xodimlar bo'yicha yuklama.
 *
 * Faqat OCHIQ majburiyatlar sanaladi: yopilgan ish sig'imni band qilmaydi.
 */
export async function computeStaffCapacity(db: Db, actor: Actor, period: string): Promise<StaffCapacity[]> {
  const w = monthWindow(period);
  const fund = await workFundMinutes(db, w.periodStart, w.periodEnd);

  const rows = await db.obligation.findMany({
    where: {
      company: companyScopeWhere(actor),
      periodStart: { gte: w.periodStart },
      periodEnd: { lte: w.periodEnd },
      status: { in: ["planned", "in_progress", "ready", "sent"] },
      responsibleUserId: { not: null },
    },
    select: {
      responsibleUserId: true,
      company: { select: { complexity: true } },
      template: { select: { normativeMinutes: true, obligationType: true } },
    },
  });

  const byUser = new Map<string, { items: CapacityItem[]; estimated: boolean }>();
  for (const o of rows) {
    const uid = o.responsibleUserId as string;
    const bucket = byUser.get(uid) ?? { items: [], estimated: false };
    const effort = normativeEffort(o.template);
    bucket.items.push({
      normativeMinutes: effort.minutes,
      complexityWeight: complexityWeight(o.company?.complexity),
    });
    if (effort.estimated) bucket.estimated = true;
    byUser.set(uid, bucket);
  }

  const users = await db.user.findMany({
    where: { id: { in: [...byUser.keys()] } },
    select: { id: true, fullName: true },
  });

  return users
    .map((u) => {
      const b = byUser.get(u.id)!;
      return {
        userId: u.id,
        fullName: u.fullName,
        score: capacityLoad({ items: b.items, availableMinutes: fund }),
        estimated: b.estimated,
      };
    })
    .sort((a, b) => (b.score.value ?? -1) - (a.score.value ?? -1));
}

export interface CompanyTwin {
  companyId: string;
  name: string;
  risk: Score;
  compliance: Score;
  /** Mas'ulning yuklamasi — xavfning bir qo'shiluvchisi. */
  capacity: Score | null;
  responsibleName: string | null;
  explanation: string;
}

/**
 * Firmalar bo'yicha uch ball.
 *
 * Bitta so'rov — majburiyatlar; qolgani xotirada. 213 firma × ~28 template
 * oyiga ~6 000 qator, ya'ni firma boshiga so'rov yuborish 6 000 marta borib
 * kelish bo'lardi.
 */
export async function computeCompanyTwins(db: Db, actor: Actor, period: string): Promise<CompanyTwin[]> {
  const w = monthWindow(period);
  const now = new Date();
  const scope = companyScopeWhere(actor);

  const companies = await db.company.findMany({
    where: { isActive: true, ...scope },
    select: { id: true, name: true, accountantId: true },
    orderBy: { name: "asc" },
  });
  const companyIds = companies.map((c) => c.id);

  const [obligations, questions, capacity] = await Promise.all([
    db.obligation.findMany({
      where: { companyId: { in: companyIds }, periodStart: { gte: w.periodStart }, periodEnd: { lte: w.periodEnd } },
      select: { companyId: true, status: true, dueAt: true, acceptedAt: true, responsibleUserId: true },
    }),
    // `Question` da firma bog'lanishi yo'q, faqat `companyId` — shuning uchun
    // biriktiruv doirasi yuqoridagi ro'yxat orqali qo'llanadi.
    // `pending` — javob kutilmoqda, `late` — muddati o'tgan javobsiz.
    db.question.findMany({
      where: { companyId: { in: companyIds }, status: { in: ["pending", "late"] } },
      select: { companyId: true },
    }),
    computeStaffCapacity(db, actor, period),
  ]);

  const loadOf = new Map(capacity.map((c) => [c.userId, c]));
  const unanswered = new Map<string, number>();
  for (const q of questions) {
    if (!q.companyId) continue;
    unanswered.set(q.companyId, (unanswered.get(q.companyId) ?? 0) + 1);
  }

  interface Agg {
    total: number; overdue: number; maxOverdueDays: number; rejected: number;
    onTime: number; closed: number; overdueOpen: number; responsible: string | null;
  }
  const agg = new Map<string, Agg>();
  const blank = (): Agg => ({
    total: 0, overdue: 0, maxOverdueDays: 0, rejected: 0,
    onTime: 0, closed: 0, overdueOpen: 0, responsible: null,
  });

  for (const o of obligations) {
    const a = agg.get(o.companyId) ?? blank();
    a.total++;
    if (!a.responsible && o.responsibleUserId) a.responsible = o.responsibleUserId;

    const closed = o.status === "accepted" || o.status === "rejected";
    if (o.status === "rejected") a.rejected++;
    if (closed) {
      a.closed++;
      // Qabul qilingan sana muddatdan keyin bo'lsa — kechikkan.
      if (o.status === "accepted" && o.acceptedAt && o.acceptedAt <= o.dueAt) a.onTime++;
    } else if (o.dueAt < now) {
      a.overdue++;
      a.overdueOpen++;
      const days = Math.floor((now.getTime() - o.dueAt.getTime()) / MS_DAY);
      if (days > a.maxOverdueDays) a.maxOverdueDays = days;
    }
    agg.set(o.companyId, a);
  }

  return companies.map((c) => {
    const a = agg.get(c.id) ?? blank();
    const responsibleId = a.responsible ?? c.accountantId;
    const cap = responsibleId ? loadOf.get(responsibleId) ?? null : null;
    const risk = riskScore({
      overdue: a.overdue,
      maxOverdueDays: a.maxOverdueDays,
      rejected: a.rejected,
      total: a.total,
      unanswered: unanswered.get(c.id) ?? 0,
      responsibleLoadPct: cap?.score.value ?? null,
    });
    return {
      companyId: c.id,
      name: c.name,
      risk,
      compliance: complianceScore({ onTime: a.onTime, closed: a.closed, overdueOpen: a.overdueOpen }),
      capacity: cap?.score ?? null,
      responsibleName: cap?.fullName ?? null,
      explanation: explain("Risk", risk),
    };
  });
}
