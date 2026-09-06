// =====================================================
// YETAKCHI KO'RSATKICH — arifmetik, tarixsiz (M5.2)
// =====================================================
// NEGA "YETAKCHI". Digital Twin (M3) "nima BO'LDI" ni o'lchaydi: nechta
// majburiyat kechikkan, muvofiqlik qancha. Bu modul esa "nima BO'LADI" ga
// qaraydi — muddat hali o'tmagan, lekin uch kundan keyin uchta ish bir vaqtda
// tugaydi va mas'ul allaqachon 178% yuklamada.
//
// NEGA ML EMAS. ICEBOX dagi "O'rganilgan bashorat" bandi buni ochiq aytadi:
// yozib olingan xavf o'tishi = 0, ya'ni o'rgatadigan tarix yo'q va tarixsiz
// model "ishonch oralig'i kiygan taxmin" bo'lardi. Bu yerdagi hammasi —
// KELAJAK USTIDA ARIFMETIKA: sanoq, nisbat, chegara. Tarix talab qilmaydi,
// birinchi kunidan ishlaydi va har raqamini qo'lda tekshirib bo'ladi.
//
// NEGA `domains/accounting/`, `engines/` EMAS. Modul domen qatlamlarini
// chaqiradi (`twinCompute`, `lib/debt.ts`), engine esa Modda 4a bo'yicha
// faqat `engines/` va `platform/` dan import qila oladi — domen-neytral
// bo'lishi shart. `twinCompute.ts` ham xuddi shu sababdan shu yerda.
// Konstitutsiya testi buni tutdi.
//
// HISOB QILINMAYDI, CHAQIRILADI. Yuklama `twinCompute` dan, qarzdorlik
// `lib/debt.ts` dan, majburiyat holati `obligationWorkflow` ro'yxatidan.
// Ikkinchi ta'rif yozilsa ekran bilan AI yana ajralib ketardi (M1/M5.1 da
// tuzatilgan nuqsonning aynan o'zi).
import type { Prisma } from "@prisma/client";
import { OPEN_OBLIGATION_STATUSES } from "@/lib/engines/workflow/obligationWorkflow";
import { computeStaffCapacity } from "@/lib/domains/accounting/twinCompute";
import { listDebtors } from "@/lib/debt";
import { periodKeyOf } from "@/lib/periods";
import { periodWindowFor } from "@/lib/engines/obligation/deadlines";
import { claim, AI_CONFIDENCE, type AiClaim } from "@/lib/ai/claim";
import type { Actor } from "@/lib/platform/access";

type Db = Prisma.TransactionClient;

const DAY = 86_400_000;

/** "Yaqin" muddat oynasi — kun. */
const NEAR_DAYS = 5;
/** Rad etish darajasi qaysi oynada o'lchanadi — kun. */
const REJECTION_WINDOW_DAYS = 30;

export type Severity = "low" | "medium" | "high";

export interface LeadingIndicator {
  /** Barqaror kalit — UI tarjimasi va testlar shunga bog'lanadi. */
  code: string;
  label: string;
  /**
   * O'lchangan qiymat. Nisbatlar FOIZDA (0-100), sanoqlar donada —
   * `unit` ni `claim` aytadi. Ulushni 0..1 saqlash "0.2 foiz" degan
   * yolg'on yorliqqa olib borardi.
   */
  value: number;
  /** Chegaralar: `value < low` → past, `< medium` → o'rta, aks holda yuqori. */
  threshold: { low: number; medium: number };
  severity: Severity;
  /** Odam o'qiydigan izoh: "5 kun ichida 3 muddat". */
  detail: string;
  /** Raqamning pasporti (M5.1) — manbasiz ko'rsatilmaydi (Modda 7). */
  claim: AiClaim;
}

/** Chegara → daraja. Yagona joy: beshta ko'rsatkich ham shundan o'tadi. */
export function severityOf(value: number, low: number, medium: number): Severity {
  if (value < low) return "low";
  if (value < medium) return "medium";
  return "high";
}

const RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 };

/**
 * Yig'ma daraja — ENG YOMONI g'alaba qiladi, o'rtacha EMAS.
 *
 * O'rtacha olish aynan e'tibor kerak bo'lgan holatni yashirardi: to'rtta
 * ko'rsatkich "past", bittasi "yuqori" bo'lsa o'rtacha "past" chiqadi va
 * yagona haqiqiy xavf ko'rinmay qoladi (ADR-0013 dagi Health bilan bir xil
 * sabab).
 */
export function aggregateSeverity(list: LeadingIndicator[]): Severity {
  let worst: Severity = "low";
  for (const i of list) if (RANK[i.severity] > RANK[worst]) worst = i.severity;
  return worst;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export interface LeadingOptions {
  companyId: string;
  /** Yuklama ko'rsatkichi uchun — `computeStaffCapacity` doira talab qiladi. */
  actor: Actor;
  /** Deterministik sinov uchun; berilmasa joriy vaqt. */
  now?: Date;
}

/**
 * Firma bo'yicha beshta yetakchi ko'rsatkich.
 *
 * O'lchab bo'lmagan ko'rsatkich RO'YXATGA TUSHMAYDI (masalan mas'uli yo'q
 * firmada yuklama). Uni 0 bilan qo'shish "xavf yo'q" degan yolg'on bo'lardi —
 * `twin.ts` dagi `null` qoidasi bilan bir xil sabab.
 */
export async function computeLeadingIndicators(
  db: Db,
  opts: LeadingOptions,
): Promise<LeadingIndicator[]> {
  const now = opts.now ?? new Date();
  const { companyId } = opts;
  // IKKI XIL DAVR KALITI — ADASHTIRMANG.
  //
  //   `periodKeyOf`      → "2091-06"   — sig'im davri (oylik hisob oynasi)
  //   `periodWindowFor`  → "2091-M06"  — MAJBURIYAT kaliti (chorak/yil ham
  //                                      shu yerdan: "2091-Q3", "2091-Y")
  //
  // Ikkalasi bir xil ko'rinadi va shuning uchun almashtirib yuborish oson:
  // majburiyat so'roviga "2091-06" berilsa u HECH NARSA topmaydi va
  // ko'rsatkich jimgina yo'qoladi (aynan shu test bilan tutildi).
  // Nom ATAYLAB `capacityPeriod`: davr-yopish modeliga o'xshash nom
  // `test/constitution.test.ts` (Modda 1) qo'riqchisiga tushadi — u
  // o'zgaruvchi nomini model nomidan ajrata olmaydi. Bu yerda hech qanday
  // davr-yopish marosimi yo'q, faqat sig'im so'rovi uchun oy kaliti.
  const capacityPeriod = periodKeyOf(now);
  const obligationPeriod = periodWindowFor("monthly", now).periodKey;
  const out: LeadingIndicator[] = [];

  // ── a) YAQIN MUDDATLAR ────────────────────────────────────────────────
  const nearFrom = now;
  const nearTo = new Date(now.getTime() + NEAR_DAYS * DAY);
  const near = await db.obligation.count({
    where: { companyId, status: { in: OPEN_OBLIGATION_STATUSES }, dueAt: { gte: nearFrom, lte: nearTo } },
  });
  out.push({
    code: "near_deadlines",
    label: "Yaqin muddatlar",
    value: near,
    threshold: { low: 3, medium: 7 },
    severity: severityOf(near, 3, 7),
    detail: `${NEAR_DAYS} kun ichida ${near} muddat`,
    claim: claim({
      value: near,
      unit: "dona",
      label: "Yaqin muddatlar",
      sourceTool: "obligation",
      sourceQuery: `Obligation(companyId=${companyId}, status IN open, dueAt ∈ [${nearFrom.toISOString().slice(0, 10)}, ${nearTo.toISOString().slice(0, 10)}])`,
      asOf: now,
    }),
  });

  // ── b) MAS'UL YUKLAMASI ───────────────────────────────────────────────
  // Hisob `twinCompute` da — bu yerda faqat firmaning mas'uli tanlanadi.
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { accountantId: true },
  });
  if (company?.accountantId) {
    const capacity = await computeStaffCapacity(db, opts.actor, capacityPeriod);
    const mine = capacity.find((c) => c.userId === company.accountantId);
    // `value === null` — o'lchanmagan (ish fondi yoki normativ yo'q).
    // Ro'yxatga TUSHMAYDI: yo'q o'lchovni "past xavf" deb ko'rsatib bo'lmaydi.
    if (mine && mine.score.value != null) {
      const load = Math.round(mine.score.value);
      out.push({
        code: "overload",
        label: "Mas'ul yuklamasi",
        value: load,
        threshold: { low: 110, medium: 150 },
        severity: severityOf(load, 110, 150),
        detail: `mas'ul ${load}% yuklamada`,
        claim: claim({
          value: load,
          unit: "foiz",
          label: `${mine.fullName} — yuklama`,
          sourceTool: "twin",
          sourceQuery: `lib/domains/accounting/twinCompute.ts#computeStaffCapacity(period=${capacityPeriod}, userId=${company.accountantId})`,
          asOf: now,
          // Normativ taxminiy bo'lsa vakolat pasayadi — raqam operator
          // kiritgan standartga tayanadi, o'lchovga emas.
          confidence: mine.estimated ? AI_CONFIDENCE.operator : AI_CONFIDENCE.system,
          ...(mine.estimated ? { conditions: ["normativ mehnat taxminiy"] } : {}),
        }),
      });
    }
  }

  // ── c) RAD ETISH DARAJASI ─────────────────────────────────────────────
  const since = new Date(now.getTime() - REJECTION_WINDOW_DAYS * DAY);
  const [subTotal, subRejected] = await Promise.all([
    db.obligationSubmission.count({ where: { obligation: { companyId }, createdAt: { gte: since } } }),
    db.obligationSubmission.count({
      where: { obligation: { companyId }, createdAt: { gte: since }, status: "rejected" },
    }),
  ]);
  // Topshirish bo'lmasa nisbat MAVJUD EMAS — 0% "yaxshi" degani emas.
  if (subTotal > 0) {
    const rate = pct(subRejected, subTotal);
    out.push({
      code: "rejection_rate",
      label: "Rad etish darajasi",
      value: rate,
      threshold: { low: 20, medium: 40 },
      severity: severityOf(rate, 20, 40),
      detail: `oxirgi ${subTotal} topshirishdan ${subRejected} tasi rad etilgan`,
      claim: claim({
        value: rate,
        unit: "foiz",
        label: "Rad etish darajasi",
        sourceTool: "submission",
        sourceQuery: `ObligationSubmission(companyId=${companyId}, createdAt >= ${since.toISOString().slice(0, 10)}): rejected=${subRejected} / total=${subTotal}`,
        asOf: now,
      }),
    });
  }

  // ── d) QARZDORLIK QARILIGI ────────────────────────────────────────────
  const [debtRow] = await listDebtors(db, { companyIds: [companyId], scope: "all" });
  if (debtRow && debtRow.outstanding > 0) {
    // 30+ kunlik ulush: qarzning o'zi bitta firma uchun bitta qator, shuning
    // uchun "ulush" = kechikish 30 kundan oshgan bo'lsa muddati o'tgan
    // qismning jami qoldiqdagi og'irligi.
    const aged = debtRow.overdueDays >= 30 ? debtRow.overdue : 0;
    const share = pct(aged, debtRow.outstanding);
    out.push({
      code: "overdue_aging",
      label: "Qarzdorlik qariligi",
      value: share,
      threshold: { low: 10, medium: 25 },
      severity: severityOf(share, 10, 25),
      detail: `qarzdorlikning ${share}% 30+ kunlik`,
      claim: claim({
        value: share,
        unit: "foiz",
        label: "30+ kunlik qarz ulushi",
        sourceTool: "debt",
        sourceQuery: `lib/debt.ts#listDebtors(companyId=${companyId}): overdue=${aged} / outstanding=${debtRow.outstanding}, overdueDays=${debtRow.overdueDays}`,
        asOf: now,
      }),
    });
  }

  // ── e) TOPSHIRISH JARAYONI ────────────────────────────────────────────
  const openRows = await db.obligation.groupBy({
    by: ["status"],
    where: { companyId, periodKey: obligationPeriod, status: { in: OPEN_OBLIGATION_STATUSES } },
    _count: { _all: true },
  });
  const openTotal = openRows.reduce((s, r) => s + r._count._all, 0);
  if (openTotal > 0) {
    const sent = openRows.find((r) => r.status === "sent")?._count._all ?? 0;
    const share = pct(sent, openTotal);
    out.push({
      code: "obligation_state",
      label: "Topshirish jarayoni",
      value: share,
      threshold: { low: 30, medium: 60 },
      severity: severityOf(share, 30, 60),
      detail: `${share}% topshirish jarayonida`,
      claim: claim({
        value: share,
        unit: "foiz",
        label: "Javob kutayotgan majburiyat ulushi",
        sourceTool: "obligation",
        sourceQuery: `Obligation(companyId=${companyId}, periodKey=${obligationPeriod}, status IN open): sent=${sent} / open=${openTotal}`,
        asOf: now,
      }),
    });
  }

  return out;
}
