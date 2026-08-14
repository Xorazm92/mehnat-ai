// =====================================================
// MATRITSA ↔ MAJBURIYAT KO'PRIGI — yagona manba qoidasi
// =====================================================
// ASRO'da bir xil ish ikki joyda ko'rinadi: `/reports` amallar matritsasi
// (buxgalterning kundalik ish yuzasi) va `/deadlines` majburiyatlar dvigateli
// (shablon + kalendardan avtomatik hosil bo'ladigan MANBA). Ikkovi alohida
// yozuvda qolsa, katakda "topshirildi", muddatlarda "kechikdi" bo'lib turadi.
//
// Shu sabab qoida: MANBA — `Obligation`. Matritsa katagi unga YOZADI, undan
// mustaqil holat saqlamaydi. MonthlyReport ustunlari tez render uchun ko'rinish
// keshi bo'lib qoladi.
import { prisma } from "@/lib/prisma";
import { timingPatch } from "@/lib/obligationWorkflow";
import { toObligationMonthKey, toYearMonthKey } from "@/lib/periods";
import {
  CELL_APPROVED,
  CELL_EMPTY,
  CELL_FAILED,
  CELL_KARTOTEKA,
  CELL_SUBMITTED,
  CELL_ZERO_REPORT,
} from "@/lib/reportPermissions";
import type { ObligationStatus } from "@prisma/client";

/**
 * Matritsa ustuni → DeadlineTemplate kod(lar)i.
 *
 * QIYMAT MASSIV, chunki bitta katak soliq rejimiga qarab turli shablonga
 * tegishli bo'ladi: "Aylanma/QQS Hisobot" katagi QQS to'lovchida QQS_DECL,
 * aylanma rejimida AYLANMA_SOLIQ majburiyatini ko'taradi. Firma uchun qaysi
 * majburiyat HAQIQATDA hosil qilingan bo'lsa (applicability generator'da hal
 * qilinadi), o'sha topiladi — bu yerda rejimni qayta hisoblash shart emas.
 */
export const COL_KEY_TO_TEMPLATE_CODES: Record<string, string[]> = {
  // ── Oylik ichki reglament ────────────────────────────────
  pul_oqimlari: ["CASHFLOW"],
  debitor_kreditor: ["AR_AP"],
  tovar_ostatka: ["MATERIALS"],
  one_c: ["ONEC_BASE"],
  xatlar: ["LETTERS"],
  hisoblangan_oylik: ["PAYROLL_CALC"],
  chiqadigan_soliqlar: ["TAX_SCHEDULE"],
  foyda_va_zarar: ["PNL_REPORT"],
  didox: ["DIDOX_FLOW"],
  avtokameral: ["AVTOKAMERAL"],
  my_mehnat: ["MY_MEHNAT"],

  // ── Soliq deklaratsiyalari ───────────────────────────────
  inps: ["INPS_IJTIMOIY"],
  daromad_soliq: ["DAROMAD_AGENT"],
  aylanma_qqs: ["QQS_DECL", "AYLANMA_SOLIQ"],
  foyda_soliq: ["FOYDA_YILLIK"],
  yer_soligi: ["YER_SOLIQ"],
  suv_soligi: ["SUV_SOLIQ"],
  mol_mulk_soligi: ["MOL_MULK_SOLIQ"],
  bonak: ["BONAK"],
  ekologiya: ["EKOLOGIYA"],

  // ── Moliyaviy hisobotlar ─────────────────────────────────
  moliyaviy_natija: ["MOLIYAVIY_YILLIK"],
  buxgalteriya_balansi: ["BUX_BALANS"],

  // ── IT Park ──────────────────────────────────────────────
  // Shablon kodi "OYLIK", lekin davriyligi CHORAKLIK (IT Park rezidenti ish
  // haqi hisobotini chorakda topshiradi) — shuning uchun choraklik ustunga
  // bog'lanadi. `itpark_oylik` katagi oylik kuzatuv bo'lib qoladi.
  itpark_chorak: ["ITPARK_OYLIK"],
};

/**
 * ATAYLAB matritsaga bog'lanmagan shablonlar — bu ro'yxat "unutilgan" bilan
 * "qasddan" ni ajratadi (test shu ro'yxatga tayanadi).
 */
export const UNMAPPED_TEMPLATE_CODES: Record<string, string> = {
  // "Oylik chiqdi + 6710 Kt" — matritsada katagi yo'q, manbasi oylik moduli
  // (`/payroll`). `hisoblangan_oylik` allaqachon PAYROLL_CALC'ni ko'taradi;
  // ikkalasini bitta katakka bog'lash qaysi majburiyat harakatlanishini
  // noaniq qilardi.
  PAYROLL_POSTED: "Oylik moduli (Payout) orqali yuritiladi",
};

/** Eski nom — chaqiruv joylari uchun (bitta kod qaytaradi). */
export const COL_KEY_TO_TEMPLATE_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(COL_KEY_TO_TEMPLATE_CODES).map(([k, v]) => [k, v[0]]),
);

/**
 * Katak qiymati → majburiyat holati.
 *
 * `kartoteka` ATAYLAB `null`: u to'lov topshirig'i bankda kartotekada turganini
 * bildiradi, hisobot topshirilgan-topshirilmaganini emas. Uni holatga aylantirsak
 * to'lov muammosi hisobot kechikishi bo'lib KPI'ga tushardi.
 *
 * `nol` (nol hisobot) → `sent`, ya'ni `topshirildi` BILAN BIR XIL.
 *
 * Avval u hech qayerda ushlanmasdi va oxirgi tarmoqqa — "erkin matn" ga —
 * tushib `in_progress` qaytarardi. Natijada nol deklaratsiya topshirgan
 * buxgalterning majburiyati OCHIQ qolaverardi va u muddati o'tgan ish uchun
 * ogohlantirish olishda davom etardi.
 *
 * `accepted` EMAS, ataylab: `allowedCellActions` da `nol` buxgalterga ham
 * ochiq (`CELL_ZERO_REPORT`), `isReviewerOwnedValue` esa uni himoyalamaydi.
 * Uni `accepted` ga bog'lasak, buxgalter o'z ishini nazoratchisiz yopib,
 * majburiyatni xohlagancha ochib-yopa olardi.
 */
export function cellValueToStatus(value: unknown): ObligationStatus | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "" || v === CELL_EMPTY) return "planned"; // tozalash
  if (v === CELL_APPROVED || v === "accepted") return "accepted";
  if (v === CELL_SUBMITTED || v === "submitted" || v === CELL_ZERO_REPORT) return "sent";
  if (v === CELL_FAILED) return "rejected";
  if (v === CELL_KARTOTEKA) return null;
  // Erkin matn (sana, izoh, summa) — ish boshlanganining belgisi.
  return "in_progress";
}

/**
 * Oldinga yurish tartibi. Matritsa `planned → sent` kabi sakrashlarga yo'l
 * qo'yadi (buxgalter hisobotni topshirgach katakni belgilaydi), shuning uchun
 * `canTransition` grafi emas, RANG solishtiriladi: pastga tushirish faqat
 * ataylab tozalash (`planned`) yoki rad etish orqali bo'ladi.
 */
const RANK: Record<ObligationStatus, number> = {
  planned: 0,
  in_progress: 1,
  ready: 2,
  rejected: 2,
  sent: 3,
  accepted: 4,
  cancelled: 9,
};

interface ResolvedObligation {
  id: string;
  status: ObligationStatus;
}

/**
 * Katak (firma + davr + ustun) qaysi majburiyatga tegishli.
 *
 * Davr moslashi ikki yo'l bilan:
 *  1) OYLIK shablon — `periodKey` aynan mos ("2026-M07").
 *  2) CHORAKLIK/YILLIK shablon — matritsada alohida davr yo'q; buxgalter uni
 *     MUDDAT TUSHGAN oy katagida belgilaydi. Shuning uchun `dueAt` shu oy
 *     ichiga tushsa ham mos deb qabul qilinadi. Bu bo'lmasa foyda solig'i va
 *     moliyaviy hisobot kabi yillik majburiyatlar ("2026-Y") oylik kalit bilan
 *     HECH QACHON topilmasdi — ular jimgina "planned" bo'lib qolaverardi.
 */
export async function resolveObligationForCell(
  companyId: string,
  period: string,
  colKey: string,
): Promise<ResolvedObligation | null> {
  const codes = COL_KEY_TO_TEMPLATE_CODES[colKey];
  if (!codes?.length) return null;

  const monthKey = toObligationMonthKey(period);
  const ym = toYearMonthKey(period);
  if (!monthKey || !ym) return null;

  const [year, month] = ym.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));

  const templates = await prisma.deadlineTemplate.findMany({
    where: { code: { in: codes }, active: true },
    select: { id: true },
  });
  if (!templates.length) return null;

  const rows = await prisma.obligation.findMany({
    where: {
      companyId,
      templateId: { in: templates.map((t) => t.id) },
      OR: [{ periodKey: monthKey }, { dueAt: { gte: monthStart, lt: monthEnd } }],
    },
    select: { id: true, status: true, periodKey: true, dueAt: true },
    orderBy: { dueAt: "asc" },
  });
  if (!rows.length) return null;

  // Aynan shu oyning majburiyati ustun — choraklik/yillik faqat boshqasi
  // bo'lmaganda olinadi.
  const exact = rows.find((r) => r.periodKey === monthKey);
  const picked = exact ?? rows[0];
  return { id: picked.id, status: picked.status };
}

interface ApplyOpts {
  obligation: ResolvedObligation;
  target: ObligationStatus;
  actorId?: string | null;
  note: string;
  /** Tozalash — vaqt belgilarini ham qaytaradi. */
  reset?: boolean;
}

/** Holatni yozadi + tarix hodisasini qoldiradi. O'zgarish bo'lmasa — hech nima. */
async function applyStatus({ obligation, target, actorId, note, reset }: ApplyOpts): Promise<boolean> {
  if (obligation.status === target) return false;
  // Bekor qilingan majburiyatni matritsa tirilta olmaydi.
  if (obligation.status === "cancelled") return false;
  // Faqat oldinga; ortga qaytish — ataylab tozalash yoki rad etish.
  if (!reset && target !== "rejected" && RANK[target] <= RANK[obligation.status]) return false;

  const now = new Date();
  await prisma.$transaction([
    prisma.obligation.update({
      where: { id: obligation.id },
      data: {
        status: target,
        ...timingPatch(target, now),
        // Ortga qaytarishda vaqt belgilari ham tozalanadi: aks holda majburiyat
        // "planned", lekin `sentAt` to'ldirilgan holatda qolib, hisobotlarda
        // topshirilgan bo'lib ko'rinardi. `timingPatch` faqat oldinga yuradi.
        ...(target === "planned" ? { sentAt: null, acceptedAt: null, completedAt: null } : {}),
      },
    }),
    prisma.obligationStatusEvent.create({
      data: {
        obligationId: obligation.id,
        fromStatus: obligation.status,
        toStatus: target,
        byUserId: actorId ?? null,
        note,
      },
    }),
  ]);
  return true;
}

/**
 * Matritsa katagi yozilganda majburiyatni harakatga keltiradi.
 * Mos shablon/majburiyat topilmasa — jim no-op (matritsa-only ustunlar bor).
 */
export async function syncCellToObligation(opts: {
  companyId: string;
  period: string;
  colKey: string;
  value: unknown;
  actorId?: string | null;
}): Promise<boolean> {
  const target = cellValueToStatus(opts.value);
  if (!target) return false;

  const obligation = await resolveObligationForCell(opts.companyId, opts.period, opts.colKey);
  if (!obligation) return false;

  return applyStatus({
    obligation,
    target,
    actorId: opts.actorId,
    note: `Matritsa katagi: ${opts.colKey}`,
    reset: target === "planned",
  });
}

/**
 * Bog'langan vazifa yakunlanganda majburiyatni `ready` ga ko'taradi.
 *
 * ATAYLAB `sent` EMAS: "yuborildi" — dalil talab qiladigan da'vo (skrinshot yoki
 * nazoratchi qarori). Vazifani yopish faqat "ish tayyor" degan signal; aks holda
 * ichki topshiriqni yopish soliqqa topshirilgan degan yolg'on yozuvni tug'dirardi.
 */
export async function syncTaskDoneToObligation(
  obligationId: string,
  actorId?: string | null,
): Promise<boolean> {
  const o = await prisma.obligation.findUnique({
    where: { id: obligationId },
    select: { id: true, status: true },
  });
  if (!o) return false;
  return applyStatus({
    obligation: o,
    target: "ready",
    actorId,
    note: "Bog'langan vazifa yakunlandi",
  });
}

/**
 * Skrinshotli topshiruv / nazoratchi qarori → majburiyat.
 *
 * Holatdan tashqari YUBORISH URINISHI ham yoziladi (`ObligationSubmission` +
 * `SubmissionEvidence`): majburiyat "yuborilgan" deb tursa-yu, ortida bitta ham
 * urinish bo'lmasa, audit va KPI dalilni topa olmaydi. `storageRef` base64
 * saqlamaydi — u `ReportProof` yozuviga ishora qiladi (schema izohidagi
 * "legacy → attempt, type=screenshot" ko'prigi).
 */
export async function syncProofToObligation(opts: {
  companyId: string;
  period: string; // "2026-07" | "2026-07-01" | "2026 Iyul"
  colKey: string;
  /** `planned` — katak tozalanganda ortga qaytarish. */
  targetStatus: "planned" | "sent" | "accepted" | "rejected";
  proofId?: string;
  actorId?: string | null;
}) {
  const obligation = await resolveObligationForCell(opts.companyId, opts.period, opts.colKey);
  if (!obligation) return;

  await applyStatus({
    obligation,
    target: opts.targetStatus,
    actorId: opts.actorId,
    note: `Matritsa dalili: ${opts.colKey}`,
    reset: opts.targetStatus === "planned",
  });

  if (opts.targetStatus === "sent") {
    // Urinish holat o'zgarishidan MUSTAQIL yoziladi: rad etilgandan keyingi
    // qayta topshirish ham, allaqachon "sent" turgan majburiyatga yangi
    // skrinshot ham alohida urinish — aks holda dalil tarixi yo'qolardi.
    const attemptNo = (await prisma.obligationSubmission.count({
      where: { obligationId: obligation.id },
    })) + 1;
    const submission = await prisma.obligationSubmission.create({
      data: {
        obligationId: obligation.id,
        attemptNo,
        status: "sent",
        sentAt: new Date(),
        sourceSystem: "asro",
        createdById: opts.actorId ?? null,
      },
    });
    if (opts.proofId) {
      await prisma.submissionEvidence.create({
        data: {
          submissionId: submission.id,
          type: "screenshot",
          storageRef: `reportProof:${opts.proofId}`,
          note: `Matritsa ustuni: ${opts.colKey}`,
          createdById: opts.actorId ?? null,
        },
      });
    }
    return;
  }

  if (opts.targetStatus === "accepted" || opts.targetStatus === "rejected") {
    const latest = await prisma.obligationSubmission.findFirst({
      where: { obligationId: obligation.id },
      orderBy: { attemptNo: "desc" },
      select: { id: true },
    });
    if (!latest) return;
    const now = new Date();
    await prisma.obligationSubmission.update({
      where: { id: latest.id },
      data:
        opts.targetStatus === "accepted"
          ? { status: "accepted", acceptedAt: now }
          : { status: "rejected", rejectedAt: now },
    });
  }
}

/**
 * Katak tozalanganda uning IZINI ham tozalaydi.
 *
 * Katakni bo'shatish yolg'iz yetarli emas edi: biriktirilgan skrinshot
 * (`ReportProof`) va u ko'targan majburiyat holati joyida qolardi. Natijada
 * matritsada katak bo'sh ko'rinardi, lekin ustida dalil nuqtasi turaverardi va
 * nazoratchi hech qanday qiymati yo'q katak uchun "kutilmoqda" dalilni ko'rardi
 * — foydalanuvchi buni "tozalash ishlamadi" deb o'qiydi.
 *
 * Dalilni O'CHIRISH ataylab: buxgalter topshirilgan yoki tasdiqlangan katakni
 * tozalay olmaydi (`checkCellWrite` → `isReviewerOwnedValue`), ya'ni bu yerga
 * faqat nazoratchi/administrator yetib keladi va tozalash uning ongli qarori.
 */
export async function clearCellEvidence(opts: {
  companyId: string;
  period: string;
  colKey: string;
  actorId?: string | null;
}): Promise<{ proofsRemoved: number }> {
  const { count } = await prisma.reportProof.deleteMany({
    where: { companyId: opts.companyId, period: opts.period, colKey: opts.colKey },
  });
  await syncProofToObligation({ ...opts, targetStatus: "planned" });
  return { proofsRemoved: count };
}
