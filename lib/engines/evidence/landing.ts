// =====================================================
// EVIDENCE LANDING — da'vo → majburiyat
// =====================================================
// DOMEN-NEYTRAL. Bu yerda `if (source === "…")` YO'Q va bo'lmasligi kerak:
// manba farqi ma'lumotda (`sourceSystem`, `confidence`) ifodalanadi, kod
// shoxida emas. Yangi manba qo'shish shu faylda nol qator o'zgartiradi
// (Konstitutsiya, Modda 5).
//
// Qarang: docs/adr/0008-imported-evidence-proposes-it-never-accepts.md
import { Prisma, type ObligationStatus } from "@prisma/client";
import { recordAuditLog } from "@/lib/platform/auditTrail";
import { periodWindowFor } from "@/lib/engines/obligation/deadlines";
import { canTransition, timingPatch } from "@/lib/engines/workflow/obligationWorkflow";
import { claimSchema, proposedStatus, rankOf, type EvidenceClaim } from "@/lib/engines/evidence/claim";

type Db = Prisma.TransactionClient;

/** Avtomatik o'zgarmaydigan holatlar — ular kuzatuv emas, QAROR. */
const TERMINAL: ObligationStatus[] = ["accepted", "cancelled"];

export interface LandingResult {
  obligationId: string;
  submissionId: string;
  evidenceCount: number;
  /** Status siljidimi; `false` bo'lsa `conflictReason` to'ldiriladi. */
  applied: boolean;
  fromStatus: ObligationStatus;
  toStatus: ObligationStatus;
  conflictReason?: "illegal_transition" | "human_owns_status" | "terminal_status";
}

/** Davr satri (`"2026-07"`, `"2026-Q3"`, `"2026"`) → oyna hisoblanadigan sana. */
function refDateFor(period: string): Date {
  const ym = /^(\d{4})-(\d{2})$/.exec(period);
  if (ym) return new Date(Date.UTC(Number(ym[1]), Number(ym[2]) - 1, 15));
  const q = /^(\d{4})-Q([1-4])$/i.exec(period);
  if (q) return new Date(Date.UTC(Number(q[1]), (Number(q[2]) - 1) * 3 + 1, 15));
  const y = /^(\d{4})$/.exec(period);
  if (y) return new Date(Date.UTC(Number(y[1]), 6, 1));
  throw new Error(`Davr formati tanilmadi: ${period}`);
}

async function resolveCompanyId(db: Db, connectionId: string, subject: EvidenceClaim["subject"]): Promise<string> {
  if (subject.kind === "companyId") return subject.companyId;

  if (subject.kind === "externalOrgId") {
    const m = await db.oneCCompanyMapping.findFirst({
      where: { connectionId, externalOrgId: subject.externalOrgId, active: true },
      select: { companyId: true },
    });
    if (!m) throw new Error(`Mapping topilmadi: ${subject.externalOrgId}`);
    return m.companyId;
  }

  // INN unique EMAS. Aniq bitta faol moslik bo'lsa — ishlatamiz; aks holda
  // rad etamiz. Noto'g'ri firmaga yozilgan dalil rad etilgan qatordan yomonroq:
  // birinchisi jimgina yolg'on, ikkinchisi ko'rinadigan ish.
  const hits = await db.company.findMany({
    where: { inn: subject.inn, isActive: true },
    select: { id: true },
    take: 2,
  });
  if (hits.length === 0) throw new Error(`AMBIGUOUS_COMPANY: INN ${subject.inn} bo'yicha firma topilmadi`);
  if (hits.length > 1) throw new Error(`AMBIGUOUS_COMPANY: INN ${subject.inn} bir nechta firmaga mos keldi`);
  return hits[0].id;
}

type TemplateRow = { id: string; version: number; periodicity: "monthly" | "quarterly" | "annual" };

async function resolveTemplate(db: Db, obligation: EvidenceClaim["obligation"], ref: Date): Promise<TemplateRow> {
  const where =
    obligation.kind === "templateCode"
      ? { code: obligation.code, active: true, lifecycle: "active" as const }
      : { matrixKey: obligation.key, active: true, lifecycle: "active" as const };

  const rows = await db.deadlineTemplate.findMany({
    where: { ...where, effectiveFrom: { lte: ref }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: ref } }] },
    select: { id: true, version: true, periodicity: true },
    orderBy: { version: "desc" },
  });

  if (rows.length === 0) throw new Error(`Template topilmadi: ${JSON.stringify(obligation)}`);
  // `templateCode` bo'yicha eng yuqori versiya kanonik. `matrixKey` bo'yicha
  // bir nechta template bo'lishi mumkin (subyekt atributiga qarab) —
  // bunday holatda qaysi biri ekanini applicability hal qilishi kerak, va uni
  // bu yerdan chaqirib bo'lmaydi (subyekt atributlari domen bilimi). Shuning
  // uchun noaniqlikni yutmaymiz — rad etamiz.
  if (obligation.kind === "matrixKey" && rows.length > 1) {
    throw new Error(`AMBIGUOUS_TEMPLATE: "${obligation.key}" bir nechta template'ga mos keldi — templateCode bering`);
  }
  return rows[0] as TemplateRow;
}

/**
 * Ziddiyat qoidasi.
 *
 * Uchta xususiyat qasddan:
 *   1. Dalil HECH QACHON tashlanmaydi — status rad etilsa ham submission va
 *      evidence yoziladi. Auditor uchun aynan shu kerak: hujjat bor, lekin
 *      odamning so'zi ustun.
 *   2. Odam qo'ygan status teng darajada g'olib; import faqat OLDINGA siljitadi.
 *   3. Terminal holat avtomatik o'zgarmaydi.
 *
 * NARVON IMPORTGA QO'LLANMAYDI, va bu ataylab.
 *
 * `canTransition` inson oqimini boshqaradi: `planned → in_progress → ready →
 * sent`. Import uchun bu noto'g'ri chegara — ish ko'pincha ASRO'dan TASHQARIDA
 * bajariladi va tizim oraliq holatlarni umuman ko'rmaydi, ya'ni `planned` dagi
 * majburiyat uchun "topshirildi" dalili NORMAL holat. Dalil natijani
 * tasdiqlaydi, jarayonni emas.
 *
 * Import xavfsizligini narvon emas, to'rtta boshqa qoida ta'minlaydi:
 * vakolat shifti (`proposedStatus`), faqat oldinga, terminalga tegmaslik va
 * odamni bosib o'tmaslik. Narvonning vazifasi — ODAM ko'rikdan o'tkazmasdan
 * `accepted` qo'ymasligi, va u `permissionForTransition` da qoladi.
 *
 * Narvondan TASHQARIDAGI o'tishlar (`rejected`, `cancelled`) esa haqiqiy holat
 * mashinasi harakati, shuning uchun ular uchun `canTransition` saqlanadi:
 * topshirilmagan narsani rad etib bo'lmaydi.
 */
function decide(
  current: ObligationStatus,
  proposed: ObligationStatus,
  humanOwned: boolean,
): { applied: boolean; reason?: LandingResult["conflictReason"] } {
  if (TERMINAL.includes(current)) return { applied: false, reason: "terminal_status" };

  const onLadder = rankOf(proposed) >= 0 && rankOf(current) >= 0;
  if (onLadder) {
    if (rankOf(proposed) <= rankOf(current)) {
      // Orqaga yoki joyida — import hech qachon holatni pasaytirmaydi.
      return { applied: false, reason: humanOwned ? "human_owns_status" : "illegal_transition" };
    }
  } else if (!canTransition(current, proposed)) {
    return { applied: false, reason: "illegal_transition" };
  }

  if (humanOwned && rankOf(proposed) <= rankOf(current)) {
    return { applied: false, reason: "human_owns_status" };
  }
  return { applied: true };
}

export interface EventRow {
  id: string;
  connectionId: string;
  eventType: string;
  schemaVersion: number;
  payload: Prisma.JsonValue;
}

/** `obligation.claim@1` — hozircha yagona hodisa turi (ADR-0008). */
export async function landObligationClaim(db: Db, ev: EventRow): Promise<LandingResult> {
  const claim = claimSchema.parse(ev.payload);

  const companyId = await resolveCompanyId(db, ev.connectionId, claim.subject);
  const ref = refDateFor(claim.period);
  const template = await resolveTemplate(db, claim.obligation, ref);
  // Davr oynasi TEMPLATE davriyligidan hisoblanadi, manbaning tasavvuridan
  // emas — `lib/obligationBridge.ts` aynan shu yerda jimgina yiqilgan edi
  // (u har doim oylik kalit qurardi, yillik template hech qachon topilmasdi).
  const window = periodWindowFor(template.periodicity, ref);

  let obligation = await db.obligation.findUnique({
    where: {
      companyId_templateId_periodStart_periodEnd: {
        companyId,
        templateId: template.id,
        periodStart: window.periodStart,
        periodEnd: window.periodEnd,
      },
    },
    select: { id: true, status: true },
  });

  if (!obligation) {
    // `effectiveFrom` gate'i generator uchun; import uchun emas. Tarixiy dalil
    // ishning bo'lganini isbotlaydi — clean-start chegarasi uni o'chirmasin.
    obligation = await db.obligation.create({
      data: {
        companyId,
        templateId: template.id,
        templateVersion: template.version,
        periodStart: window.periodStart,
        periodEnd: window.periodEnd,
        periodKey: window.periodKey,
        dueAt: window.periodEnd,
        status: "planned",
        createdBy: `import:${claim.provenance.sourceSystem}`,
      },
      select: { id: true, status: true },
    });
  }

  const current = obligation.status as ObligationStatus;
  const proposed = proposedStatus(claim.claim, claim.confidence) as ObligationStatus;

  const lastEvent = await db.obligationStatusEvent.findFirst({
    where: { obligationId: obligation.id },
    orderBy: { at: "desc" },
    select: { byUserId: true },
  });
  const humanOwned = Boolean(lastEvent?.byUserId);

  const verdict = decide(current, proposed, humanOwned);

  // Dalil HAR DOIM yoziladi — qaror qanday bo'lishidan qat'i nazar.
  const maxAttempt = await db.obligationSubmission.aggregate({
    where: { obligationId: obligation.id },
    _max: { attemptNo: true },
  });
  const submission = await db.obligationSubmission.create({
    data: {
      obligationId: obligation.id,
      attemptNo: (maxAttempt._max.attemptNo ?? 0) + 1,
      status: claim.claim === "rejected" ? "rejected" : claim.claim === "accepted" ? "accepted" : "sent",
      sentAt: new Date(claim.occurredAt),
      externalId: claim.externalId ?? null,
      sourceSystem: claim.provenance.sourceSystem,
    },
    select: { id: true },
  });

  let evidenceCount = 0;
  for (const e of claim.evidence ?? []) {
    await db.submissionEvidence.create({
      data: {
        submissionId: submission.id,
        type: e.type,
        storageRef: e.storageRef,
        note: e.note ?? null,
        sourceEventId: ev.id,
      },
    });
    evidenceCount++;
  }

  if (verdict.applied) {
    const now = new Date();
    await db.obligation.update({
      where: { id: obligation.id },
      data: { status: proposed, ...timingPatch(proposed, now) },
    });
    await db.obligationStatusEvent.create({
      data: {
        obligationId: obligation.id,
        fromStatus: current,
        toStatus: proposed,
        // Tizim aktyori — `byUserId: null` aynan shuni bildiradi, va ziddiyat
        // qoidasi keyingi safar shunga qarab "odam egallamagan" deb hisoblaydi.
        byUserId: null,
        note: `import:${claim.provenance.sourceSystem}:${ev.id}`,
      },
    });
  } else {
    // Rad etilgan da'vo JIMLIK emas, ish yaratadi: hujjat bor, lekin holat
    // o'zgarmadi — buni odam ko'rishi kerak (ADR-0008).
    await db.task.create({
      data: {
        companyId,
        obligationId: obligation.id,
        title: `Import ziddiyati: ${claim.provenance.sourceSystem}`,
        description:
          `Da'vo "${claim.claim}" (${current} → ${proposed}) qabul qilinmadi: ${verdict.reason}. ` +
          `Dalil yozildi. IntegrationEvent: ${ev.id}`,
        taskType: "import_conflict",
        priority: "normal",
        status: "open",
        createdBy: `import:${claim.provenance.sourceSystem}`,
      },
    });
  }

  await recordAuditLog({
    userId: null,
    action: "update",
    tableName: "Obligation",
    recordId: obligation.id,
    oldData: { status: current },
    newData: {
      status: verdict.applied ? proposed : current,
      applied: verdict.applied,
      reason: verdict.reason ?? null,
      source: claim.provenance.sourceSystem,
      eventId: ev.id,
    },
  });

  return {
    obligationId: obligation.id,
    submissionId: submission.id,
    evidenceCount,
    applied: verdict.applied,
    fromStatus: current,
    toStatus: verdict.applied ? proposed : current,
    conflictReason: verdict.reason,
  };
}

/** `(eventType, schemaVersion)` bo'yicha dispetcher. */
export async function applyEvidenceEvent(db: Db, ev: EventRow): Promise<void> {
  switch (`${ev.eventType}@${ev.schemaVersion}`) {
    case "obligation.claim@1":
      await landObligationClaim(db, ev);
      return;
    default:
      throw new Error(`Noma'lum hodisa turi: ${ev.eventType}@${ev.schemaVersion}`);
  }
}
