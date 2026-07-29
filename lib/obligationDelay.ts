// =====================================================
// MAJBURIYAT: kechikish sababi va qayta biriktirish — framework-free
// =====================================================
// server/obligations.ts dagi mantiq shu yerga ko'chirildi, chunki bot worker'i
// server action'ni chaqira olmaydi (u yerda `auth()` konteksti yo'q). Endi
// ikkala chaqiruvchi — server action ham, Telegram tugmasi ham — bir xil
// ruxsat tekshiruvi va bir xil audit izidan o'tadi.
//
// Ruxsat: assertCompanyPermission (lib/access.ts) — rol gate + OBYEKT-scope,
// ya'ni payload'dagi id almashtirilsa ham boshqa kompaniyaga o'tib bo'lmaydi.
import type { Prisma, DelayReason } from "@prisma/client";
import { assertCompanyPermission, type Actor } from "@/lib/access";
import { recordAuditLog } from "@/lib/auditTrail";

type Db = Prisma.TransactionClient;

/**
 * Nazoratchi/chief "🟢 Sababli" tugmasini bosganda qo'yiladigan sabab.
 * lib/kpiEvidence.ts#EXCUSED_DELAY_REASONS ichida bor — ya'ni tasdiqlangandan
 * keyin KPI jarimasidan chiqaradi.
 */
export const MANAGER_EXCUSE_REASON: DelayReason = "management_decision";

async function loadObligation(db: Db, id: string) {
  const o = await db.obligation.findUnique({
    where: { id },
    select: {
      id: true,
      companyId: true,
      responsibleUserId: true,
      delayMarkedById: true,
      delayApprovedById: true,
    },
  });
  if (!o) throw new Error("Majburiyat topilmadi");
  return o;
}

/** Kechikish sababini belgilash. Belgilash mavjud tasdiqni bekor qiladi. */
export async function markObligationDelayReason(
  db: Db,
  actor: Actor,
  id: string,
  reason: DelayReason,
  comment?: string,
): Promise<void> {
  const o = await loadObligation(db, id);
  await assertCompanyPermission(db, actor, o.companyId, "delay-reason:mark");

  await db.obligation.update({
    where: { id },
    data: {
      delayReason: reason,
      delayComment: comment ?? null,
      delayMarkedById: actor.id,
      delayMarkedAt: new Date(),
      // Belgilash tasdiqlashni bekor qiladi (qayta ko'rib chiqilishi kerak).
      delayApprovedById: null,
      delayApprovedAt: null,
    },
  });
  await recordAuditLog({
    userId: actor.id,
    action: "update",
    tableName: "Obligation",
    recordId: id,
    newData: { delayReason: reason },
  });
}

/**
 * Kechikish sababini MANAGER tasdiqlaydi — faqat shundan keyin KPI exclusion'ga
 * yaroqli. Belgilanmagan sababni tasdiqlab bo'lmaydi.
 */
export async function approveObligationDelayReason(
  db: Db,
  actor: Actor,
  id: string,
): Promise<void> {
  const o = await loadObligation(db, id);
  await assertCompanyPermission(db, actor, o.companyId, "delay-reason:approve");
  if (!o.delayMarkedById) throw new Error("Avval kechikish sababi belgilanishi kerak");

  await db.obligation.update({
    where: { id },
    data: { delayApprovedById: actor.id, delayApprovedAt: new Date() },
  });
  await recordAuditLog({
    userId: actor.id,
    action: "update",
    tableName: "Obligation",
    recordId: id,
    newData: { delayApproved: true },
  });
}

export interface ExcuseResult {
  /** false ⇒ allaqachon tasdiqlangan edi, hech narsa o'zgarmadi. */
  changed: boolean;
}

/**
 * Bir harakatda belgilash + tasdiqlash — Telegramdagi "🟢 Sababli" tugmasi
 * uchun. Ikki bosqichni bitta senior bajaradi, shuning uchun ruxsat
 * `delay-reason:approve` (kuchliroq talab) bo'yicha tekshiriladi.
 *
 * Idempotent: allaqachon tasdiqlangan bo'lsa qayta yozmaydi, shunda tugmani
 * ikki marta bosish ikkita audit yozuvi hosil qilmaydi.
 */
export async function excuseObligationDelay(
  db: Db,
  actor: Actor,
  id: string,
  comment?: string,
): Promise<ExcuseResult> {
  const o = await loadObligation(db, id);
  await assertCompanyPermission(db, actor, o.companyId, "delay-reason:approve");
  if (o.delayApprovedById) return { changed: false };

  const now = new Date();
  await db.obligation.update({
    where: { id },
    data: {
      delayReason: MANAGER_EXCUSE_REASON,
      delayComment: comment ?? null,
      delayMarkedById: actor.id,
      delayMarkedAt: now,
      delayApprovedById: actor.id,
      delayApprovedAt: now,
    },
  });
  await recordAuditLog({
    userId: actor.id,
    action: "update",
    tableName: "Obligation",
    recordId: id,
    newData: { delayReason: MANAGER_EXCUSE_REASON, delayApproved: true, via: "telegram" },
  });
  return { changed: true };
}

export interface ReassignResult {
  changed: boolean;
  fromUserId: string | null;
}

/** Majburiyatni boshqa xodimga biriktirish (+ tayinlash hodisasi va audit). */
export async function reassignObligationTo(
  db: Db,
  actor: Actor,
  id: string,
  toUserId: string,
  reason?: string,
): Promise<ReassignResult> {
  const o = await loadObligation(db, id);
  await assertCompanyPermission(db, actor, o.companyId, "obligation:assign");
  if (o.responsibleUserId === toUserId) return { changed: false, fromUserId: o.responsibleUserId };

  const now = new Date();
  await db.obligation.update({
    where: { id },
    data: { responsibleUserId: toUserId, assignedById: actor.id, assignedAt: now },
  });
  await db.obligationAssignmentEvent.create({
    data: {
      obligationId: id,
      fromUserId: o.responsibleUserId,
      toUserId,
      byUserId: actor.id,
      reason: reason ?? null,
    },
  });
  await recordAuditLog({
    userId: actor.id,
    action: "update",
    tableName: "Obligation",
    recordId: id,
    oldData: { responsibleUserId: o.responsibleUserId },
    newData: { responsibleUserId: toUserId },
  });
  return { changed: true, fromUserId: o.responsibleUserId };
}
