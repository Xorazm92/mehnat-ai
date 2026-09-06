/**
 * AI READ TOOLS — Gemini'ga function declaration sifatida beriladi (M5.1).
 *
 * IKKI QOIDA, IKKALASI HAM AUDITDA TOPILGAN NUQSONDAN CHIQQAN:
 *
 * 1. HISOBNI BU YERDA QILMAYMIZ. Avvalgi tahrir balansni o'zi yig'ardi
 *    (`kassa − payout + payment`) va `lib/balance.ts` ni umuman bilmasdi.
 *    Natijada ochilish qoldig'i, moliyaviy yordam harakati va
 *    `KASSA_START` chegarasi tushib qolardi, `payment.aggregate` esa
 *    offsetni naqd deb sanardi — ya'ni AI raqami ekrandagi raqamdan
 *    KAFOLATLI farq qilardi (PRODUCT.md 4-va'dasi aynan buni taqiqlaydi).
 *    Endi har tool tegishli hisob qatlamini CHAQIRADI.
 *
 * 2. PORTFEL DOIRASI MAJBURIY. Avvalgi tahrir `auth()` dan keyin
 *    `findUnique({ id: companyId })` qilardi — ya'ni assistant har
 *    foydalanuvchining tepa panelida turgani uchun, buxgalter AI orqali
 *    portfelidan tashqaridagi firma raqamini so'ray olardi. Endi firma
 *    `companyScopeWhere` bilan qidiriladi: doiradan tashqarida bo'lsa
 *    "topilmadi" — mavjudligining o'zi ham oshkor bo'lmaydi.
 *
 * Har tool `ToolResult<T>` qaytaradi: `data` modelga, `claims` ekranga va
 * testga (`lib/ai/claim.ts`).
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { companyScopeWhere, staffScopeFilter, type Actor } from "@/lib/platform/access";
import { listDebtors } from "@/lib/debt";
import { cashFromPaymentRows } from "@/lib/paymentCash";
import { claim, AI_CONFIDENCE, type ToolResult } from "@/lib/ai/claim";
import {
  computeLeadingIndicators,
  aggregateSeverity,
  type LeadingIndicator,
  type Severity,
} from "@/lib/domains/accounting/leadingIndicator";
import { createRecommendationRecord } from "@/lib/domains/accounting/recommendations";
import {
  isRecommendationKind,
  RECOMMENDATION_LABELS,
  type RecommendationKind,
} from "@/lib/ai/recommendation";

/** Aktyor + doira ichidagi firma. Doiradan tashqarida — "topilmadi". */
async function resolveCompany(
  companyId: string,
): Promise<{ actor: Actor; company: { id: string; name: string } } | { error: string }> {
  const session = await auth();
  if (!session) return { error: "Avtorizatsiya kerak" };
  const actor: Actor = { id: session.user.id as string, role: session.user.role as string };

  // `findFirst` + doira — `findUnique` DOIRANI QO'LLAY OLMAYDI (u faqat
  // unikal kalit bo'yicha qidiradi), aynan shuning uchun bu yerda o'sha.
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...companyScopeWhere(actor) },
    select: { id: true, name: true },
  });
  if (!company) return { error: "Firma topilmadi yoki sizning portfelingizda emas" };
  return { actor, company };
}

/** Doira bo'yicha firma id'lari — `lib/debt.ts` `companyIds` shaklida. */
const scopedIds = (companyId: string) => [companyId];

// ─────────────────────────────────────────────────────────
// 1 — FIRMA MOLIYAVIY HOLATI
// ─────────────────────────────────────────────────────────

export interface CompanyBalanceResult {
  companyId: string;
  companyName: string;
  /** Hisoblangan jami (shartnoma bo'yicha). */
  charged: number;
  /** To'langan jami. */
  paid: number;
  /** Qoldiq = charged − paid. */
  outstanding: number;
  asOf: string;
}

/**
 * Firmaning moliyaviy holati.
 *
 * DIQQAT — `lib/balance.ts` `getAvailableBalance` BU YERDA ISHLAMAYDI: u
 * KORXONANING O'Z kassa qoldig'ini beradi (firma kesimi yo'q) va mijoz
 * firmaning holatiga umuman aloqasi yo'q. Mijoz kesimidagi pul haqiqati —
 * `lib/debt.ts`, ya'ni "qancha hisoblandi, qancha to'ladi, qancha qoldi".
 */
export async function getCompanyBalance(companyId: string): Promise<ToolResult<CompanyBalanceResult>> {
  const found = await resolveCompany(companyId);
  if ("error" in found) return { ok: false, error: found.error };

  const rows = await listDebtors(prisma, { companyIds: scopedIds(companyId), scope: "all" });
  const row = rows[0];
  const asOf = new Date();

  const data: CompanyBalanceResult = {
    companyId: found.company.id,
    companyName: found.company.name,
    charged: row?.charged ?? 0,
    paid: row?.paid ?? 0,
    outstanding: row?.outstanding ?? 0,
    asOf: asOf.toISOString().slice(0, 10),
  };

  const src = `lib/debt.ts#listDebtors(companyId=${companyId}, scope=all)`;
  return {
    ok: true,
    data,
    claims: [
      claim({ value: data.outstanding, unit: "so'm", label: `${data.companyName} — qoldiq`, sourceTool: "getCompanyBalance", sourceQuery: src, asOf }),
      claim({ value: data.paid, unit: "so'm", label: `${data.companyName} — to'langan`, sourceTool: "getCompanyBalance", sourceQuery: src, asOf }),
      claim({ value: data.charged, unit: "so'm", label: `${data.companyName} — hisoblangan`, sourceTool: "getCompanyBalance", sourceQuery: src, asOf }),
    ],
  };
}

// ─────────────────────────────────────────────────────────
// 2 — MUDDATI O'TGAN QARZ
// ─────────────────────────────────────────────────────────

export interface OverdueResult {
  companyId: string;
  companyName: string;
  overdueAmount: number;
  /** Eng eski to'lanmagan hisobdan beri o'tgan kunlar. */
  overdueDays: number;
  /** Oxirgi tushum davri — "hech qachon" bo'lsa null. */
  lastPaidPeriod: string | null;
}

/**
 * Muddati o'tgan qarz — `lib/debt.ts` dan.
 *
 * Avvalgi tahrir `Payment.status === "overdue"` qatorlarini sanardi; bu
 * qarzdorlik qatlamining ta'rifi EMAS (u hisoblanma davrlari va to'lov
 * oynasidan chiqadi), ya'ni ekrandagi "Qarzdorlik" bilan mos kelmasdi.
 */
export async function getCompanyOverdue(companyId: string): Promise<ToolResult<OverdueResult>> {
  const found = await resolveCompany(companyId);
  if ("error" in found) return { ok: false, error: found.error };

  const rows = await listDebtors(prisma, { companyIds: scopedIds(companyId), scope: "all" });
  const row = rows[0];
  const asOf = new Date();

  const data: OverdueResult = {
    companyId: found.company.id,
    companyName: found.company.name,
    overdueAmount: row?.overdue ?? 0,
    overdueDays: row?.overdueDays ?? 0,
    lastPaidPeriod: row?.lastPaidPeriod ?? null,
  };

  const src = `lib/debt.ts#listDebtors(companyId=${companyId}, scope=all)`;
  return {
    ok: true,
    data,
    claims: [
      claim({ value: data.overdueAmount, unit: "so'm", label: `${data.companyName} — muddati o'tgan qarz`, sourceTool: "getCompanyOverdue", sourceQuery: src, asOf }),
      claim({ value: data.overdueDays, unit: "kun", label: `${data.companyName} — kechikish`, sourceTool: "getCompanyOverdue", sourceQuery: src, asOf }),
    ],
  };
}

// ─────────────────────────────────────────────────────────
// 3 — SO'NGGI TUSHUMLAR
// ─────────────────────────────────────────────────────────

export interface RecentPaymentResult {
  companyId: string;
  companyName: string;
  days: number;
  /** NAQD ulush — offset (vzaimozachyot) chiqarib tashlangan. */
  cashTotal: number;
  payments: Array<{ period: string; amount: number; date: string; method: string }>;
}

/**
 * So'nggi tushumlar.
 *
 * `cashTotal` xom `_sum(amount)` EMAS — `lib/paymentCash.ts`
 * `cashFromPaymentRows`. `Payment.amount` ga offset ham kiradi, kassaga esa
 * undan pul TUSHMAYDI; xom yig'indi ekrandagi "Kirim" bilan ziddiyatga
 * tushardi (M1 da tuzatilgan nuqsonning aynan o'zi).
 */
export async function getRecentPayments(
  companyId: string,
  days: number = 30,
): Promise<ToolResult<RecentPaymentResult>> {
  const found = await resolveCompany(companyId);
  if ("error" in found) return { ok: false, error: found.error };

  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await prisma.payment.findMany({
    where: {
      companyId,
      deletedAt: null,
      status: { in: ["paid", "partial"] },
      paymentDate: { gte: since },
    },
    select: {
      amount: true,
      period: true,
      paymentDate: true,
      paymentMethod: true,
      allocations: { select: { source: true, amount: true } },
    },
    orderBy: { paymentDate: "desc" },
    take: 20,
  });

  const asOf = new Date();
  const data: RecentPaymentResult = {
    companyId: found.company.id,
    companyName: found.company.name,
    days,
    cashTotal: cashFromPaymentRows(rows),
    payments: rows.map((p) => ({
      period: p.period,
      amount: Number(p.amount),
      date: p.paymentDate?.toISOString().slice(0, 10) ?? "",
      method: p.paymentMethod,
    })),
  };

  return {
    ok: true,
    data,
    claims: [
      claim({
        value: data.cashTotal,
        unit: "so'm",
        label: `${data.companyName} — so'nggi ${days} kunlik naqd tushum`,
        sourceTool: "getRecentPayments",
        sourceQuery: `lib/paymentCash.ts#cashFromPaymentRows(Payment[paymentDate>=${since.toISOString().slice(0, 10)}])`,
        asOf,
        conditions: ["offset (vzaimozachyot) chiqarib tashlangan"],
      }),
    ],
  };
}

// ─────────────────────────────────────────────────────────
// 4 — XODIM KPI TRENDI
// ─────────────────────────────────────────────────────────

export interface KpiTrendResult {
  userId: string;
  userName: string;
  months: Array<{
    month: string;
    /** Avtomatik hodisalar sof SANOG'I (dona) — foiz emas. */
    score: number;
    bonus: number;
    penalty: number;
    /** Qo'lda kiritilgan tuzatishlar yig'indisi — FOIZDA, alohida birlik. */
    manualPercent: number;
  }>;
}

export async function getKpiTrend(
  userId: string,
  months: number = 3,
): Promise<ToolResult<KpiTrendResult>> {
  const session = await auth();
  if (!session) return { ok: false, error: "Avtorizatsiya kerak" };
  const actor: Actor = { id: session.user.id as string, role: session.user.role as string };

  // XODIM DOIRASI — QAYTARILGAN QIYMAT ISHLATILADI.
  //
  // `staffScopeFilter` xato TASHLAMAYDI, u FILTR QIYMATINI qaytaradi
  // (oddiy xodim → o'z id'si; senior → portfeli; admin → cheklovsiz) va
  // faqat senior begona id so'raganda tashlaydi. Avvalgi tahrir natijani
  // e'tiborsiz qoldirib, so'rovni xom `userId` bilan qilardi — ya'ni
  // buxgalter AI orqali BEGONA xodimning KPI tarixini o'qiy olardi.
  // Loyihadagi qolgan yettita chaqiruvchi (server/payroll.ts,
  // server/attendance.ts, server/kpi.ts …) natijani filtr sifatida
  // ishlatadi; bu yer yagona istisno edi.
  //
  // Doira boshqa odamni ko'rsatsa — RAD ETAMIZ, jimgina almashtirmaymiz:
  // "o'zinikini ko'rsatib qo'yish" AI ni boshqa odam haqida gapirtirardi.
  const scope = await staffScopeFilter(prisma, actor, userId);
  if (typeof scope === "string" && scope !== userId) {
    return { ok: false, error: "Bu xodim ma'lumotiga ruxsatingiz yo'q" };
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, fullName: true } });
  if (!user) return { ok: false, error: "Xodim topilmadi" };

  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceMonth = since.toISOString().slice(0, 7);

  const events = await prisma.kpiEvent.findMany({
    where: { employeeId: userId, periodMonth: { gte: sinceMonth } },
    select: { periodMonth: true, points: true, type: true },
    orderBy: { periodMonth: "desc" },
  });

  // BIRLIKLAR ARALASHMAYDI: avtomatik hodisada `points` — sanoq (+1/−1),
  // qo'lda tuzatishda esa foiz. Ilgari ikkalasi bitta `score` ga qo'shilardi.
  const monthMap = new Map<string, { bonus: number; penalty: number; manualPercent: number }>();
  for (const e of events) {
    const existing = monthMap.get(e.periodMonth) ?? { bonus: 0, penalty: 0, manualPercent: 0 };
    const pts = Number(e.points);
    if (e.type === "manual") existing.manualPercent += pts;
    else if (pts >= 0) existing.bonus += pts;
    else existing.penalty += Math.abs(pts);
    monthMap.set(e.periodMonth, existing);
  }

  const monthList = [...monthMap.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, months);

  const asOf = new Date();
  const data: KpiTrendResult = {
    userId: user.id,
    userName: user.fullName,
    months: monthList.map(([month, m]) => ({
      month,
      score: Math.round((m.bonus - m.penalty) * 100) / 100,
      bonus: m.bonus,
      penalty: m.penalty,
      manualPercent: Math.round(m.manualPercent * 100) / 100,
    })),
  };

  // `monthList` KAMAYISH tartibida — eng so'nggi oy BIRINCHI.
  const last = data.months[0];
  return {
    ok: true,
    data,
    claims: last
      ? [
          claim({
            value: last.score,
            unit: "ball",
            label: `${data.userName} — ${last.month} KPI`,
            sourceTool: "getKpiTrend",
            sourceQuery: `MonthlyPerformance(userId=${userId}, month=${last.month})`,
            asOf,
          }),
        ]
      : [],
  };
}

// ─────────────────────────────────────────────────────────
// 5 — MAJBURIYAT HOLATI
// ─────────────────────────────────────────────────────────

export interface ObligationStatusResult {
  companyId: string;
  companyName: string;
  period: string;
  total: number;
  done: number;
  overdue: number;
}

export async function getObligationStatus(
  companyId: string,
  period?: string,
): Promise<ToolResult<ObligationStatusResult>> {
  const found = await resolveCompany(companyId);
  if ("error" in found) return { ok: false, error: found.error };

  const now = new Date();
  const key = period ?? `${now.getUTCFullYear()}-M${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const rows = await prisma.obligation.findMany({
    where: { companyId, periodKey: key },
    select: { status: true, dueAt: true },
  });

  const done = rows.filter((r) => r.status === "accepted").length;
  const overdue = rows.filter((r) => r.status !== "accepted" && r.status !== "cancelled" && r.dueAt < now).length;

  const data: ObligationStatusResult = {
    companyId: found.company.id,
    companyName: found.company.name,
    period: key,
    total: rows.length,
    done,
    overdue,
  };

  const src = `Obligation(companyId=${companyId}, periodKey=${key})`;
  return {
    ok: true,
    data,
    claims: [
      claim({ value: data.overdue, unit: "dona", label: `${data.companyName} — kechikkan majburiyat (${key})`, sourceTool: "getObligationStatus", sourceQuery: src, asOf: now }),
      claim({ value: data.done, unit: "dona", label: `${data.companyName} — bajarilgan (${key})`, sourceTool: "getObligationStatus", sourceQuery: src, asOf: now, confidence: AI_CONFIDENCE.system }),
    ],
  };
}

// ─────────────────────────────────────────────────────────
// 6 — YETAKCHI KO'RSATKICHLAR (M5.2)
// ─────────────────────────────────────────────────────────

export interface LeadingIndicatorResult {
  companyId: string;
  companyName: string;
  /** Eng yomon ko'rsatkich — o'rtacha EMAS (aggregateSeverity izohiga qarang). */
  severity: Severity;
  indicators: Array<Omit<LeadingIndicator, "claim">>;
}

/**
 * "Nima qilishim kerak?" / "xavf bormi?" savoliga javob beradigan tool.
 *
 * Twin (M3) o'tmishni o'lchaydi, bu esa kelajakka qaraydi: muddat hali
 * o'tmagan, lekin uch kundan keyin uchta ish bir vaqtda tugaydi va mas'ul
 * allaqachon 178% yuklamada. Hisob `lib/domains/accounting/leadingIndicator.ts`
 * da — bu yerda faqat doira va da'volarni yig'ish.
 */
export async function getLeadingIndicators(companyId: string): Promise<ToolResult<LeadingIndicatorResult>> {
  const found = await resolveCompany(companyId);
  if ("error" in found) return { ok: false, error: found.error };

  const list = await computeLeadingIndicators(prisma, {
    companyId,
    actor: found.actor,
  });

  return {
    ok: true,
    data: {
      companyId: found.company.id,
      companyName: found.company.name,
      severity: aggregateSeverity(list),
      // `claim` modelga BERILMAYDI — u ekran va test uchun, quyida alohida.
      // Modelga uzatilsa u da'vo matnini o'ylab topa boshlardi.
      indicators: list.map(({ claim: _claim, ...rest }) => rest),
    },
    claims: list.map((i) => i.claim),
  };
}

// ─────────────────────────────────────────────────────────
// 7 — TAVSIYA YARATISH (M5.3)
// ─────────────────────────────────────────────────────────

export interface CreatedRecommendation {
  id: string;
  companyId: string;
  companyName: string;
  kind: RecommendationKind;
  /** Inson tilidagi nom — ekran uni takrorlamaydi. */
  label: string;
  rationale: string;
  /** `false` ⇒ shu firma va tur bo'yicha pending tavsiya allaqachon bor edi. */
  created: boolean;
}

/**
 * Modelning YAGONA yozadigan tooli.
 *
 * DA'VOLARNI MODEL BERMAYDI. Tool ularni o'zi o'lchaydi
 * (`computeLeadingIndicators`) va tavsiyaga biriktiradi. Sabab M5.2 dagi
 * bilan bir xil: modelga da'vo yozish imkoni berilsa u manba nomini ham,
 * raqamni ham o'ylab topa boshlaydi — Modda 7 ning aynan buzilishi. Ya'ni
 * model NIMA QILISH kerakligini aytadi, NEGA kerakligining raqamlari esa
 * o'lchov qatlamidan keladi.
 *
 * PAYLOAD SXEMASI shu yerda emas, `lib/ai/recommendation.ts` da tekshiriladi
 * va xato TASHLANADI — bu yerda u `ok: false` ga aylantiriladi, chunki
 * model uchun bu javob beriladigan xato ("parametrni to'g'irlab qayta
 * chaqir"), tizim nosozligi emas.
 */
export async function createRecommendation(
  companyId: string,
  kind: string,
  rationale: string,
  payload: unknown,
): Promise<ToolResult<CreatedRecommendation>> {
  const found = await resolveCompany(companyId);
  if ("error" in found) return { ok: false, error: found.error };
  if (!isRecommendationKind(kind)) {
    return { ok: false, error: `Noma'lum tavsiya turi: ${kind}` };
  }

  try {
    const indicators = await computeLeadingIndicators(prisma, {
      companyId,
      actor: found.actor,
    });
    const claims = indicators.map((i) => i.claim);

    const res = await createRecommendationRecord(prisma, {
      actor: found.actor,
      companyId: found.company.id,
      kind,
      rationale,
      claims,
      payload,
      source: "assistant",
    });

    return {
      ok: true,
      data: {
        id: res.id,
        companyId: found.company.id,
        companyName: found.company.name,
        kind,
        label: RECOMMENDATION_LABELS[kind],
        rationale: rationale.trim(),
        created: res.created,
      },
      claims,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Tavsiya yaratilmadi" };
  }
}
