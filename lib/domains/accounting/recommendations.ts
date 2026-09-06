// =====================================================
// TAVSIYA DAFTARI VA AMAL ISHLOVCHILARI (M5.3)
// =====================================================
// Shartnoma `lib/ai/recommendation.ts` da (mijozga ham boradi), bu yerda esa
// uning UCH amali: yaratish, ro'yxat, qaror.
//
// NEGA `server/` DA EMAS. Ikki iste'molchi bor va ikkalasining ham sessiyasi
// boshqacha: `server/recommendations.ts` (direktor ekrani, `auth()`) va
// `lib/ai/tools.ts` (AI funksiya chaqiruvi, o'sha sessiya lekin boshqa
// darvoza). Mantiq "use server" faylida qolsa toollar server action'ni
// import qilishga majbur bo'lardi — M3 da aynan shu chegara muammo bo'lgan
// (`bot/` `server/` ni import qilmaydi) va yechim o'sha: lib runner.
//
// QABUL = AMAL. Tavsiya qabul qilinganda payload HAQIQATAN bajariladi:
// majburiyat ko'chadi, eskalatsiya yoziladi, kechikish sababi tasdiqlanadi.
// Shuning uchun uch qoida:
//
//   1. TARTIB — avval AMAL, keyin STATUS. Amal yiqilsa tavsiya `pending`
//      bo'lib qoladi va direktor xatoni ko'radi. Teskarisi bo'lsa ekranda
//      "qabul qilindi" turardi, lekin hech narsa bajarilmagan bo'lardi.
//   2. PAYLOAD FIRMANI CHETLAB O'TA OLMAYDI. Har ishlovchi payloaddagi
//      majburiyat/xodim ayni shu tavsiyaning firmasiga tegishli ekanini
//      tekshiradi. Aks holda doiradagi firmaga tavsiya yaratib, payloadda
//      begona firmaning majburiyatini ko'rsatish mumkin bo'lardi.
//   3. HUQUQ ISHLOVCHIDA TEKSHIRILADI. `reassignObligationTo`,
//      `markObligationDelayReason` va boshqalar o'z `assertCompanyPermission`
//      larini SAQLAYDI — bu yer ularni almashtirmaydi, ustiga direktor
//      darvozasini qo'yadi.
//
// RAD ETISH HECH NARSA BAJARMAYDI — faqat status va sabab yoziladi.
import type { Prisma } from "@prisma/client";
import { companyScopeWhere, type Actor } from "@/lib/platform/access";
import { recordAuditLog } from "@/lib/platform/auditTrail";
import { logEvent } from "@/lib/engines/analytics/logEvent";
import { escalate, type EscalationLevel } from "@/lib/engines/automation/escalation";
import {
  markObligationDelayReason,
  approveObligationDelayReason,
  reassignObligationTo,
} from "@/lib/engines/obligation/obligationDelay";
import { notifyUsers, type TelegramDispatcher } from "@/lib/notify";
import type { AiClaim } from "@/lib/ai/claim";
import {
  parseRecommendationPayload,
  parseClaims,
  isRecommendationKind,
  RECOMMENDATION_LABELS,
  RECOMMENDATION_TTL_DAYS,
  type Recommendation,
  type RecommendationKind,
  type RecommendationStatus,
} from "@/lib/ai/recommendation";

type Db = Prisma.TransactionClient;

const DAY = 86_400_000;

/** Bank sverkasi vazifasiga beriladigan muddat — kun. */
const BANK_REVIEW_DUE_DAYS = 3;

/** Direktor ekranida bir vaqtda ko'rinadigan tavsiyalar soni. */
export const PENDING_PAGE_SIZE = 5;

/** Foydalanish o'lchovi uchun hodisa nomlari (M4.2 `ANALYTICS_KINDS` uslubida). */
export const RECOMMENDATION_EVENT_KINDS = {
  accepted: "recommendation_accepted",
  dismissed: "recommendation_dismissed",
  expired: "recommendation_expired",
} as const;

// ─────────────────────────────────────────────────────────
// YARATISH
// ─────────────────────────────────────────────────────────

export interface CreateRecommendationInput {
  actor: Actor;
  companyId: string;
  kind: RecommendationKind;
  rationale: string;
  claims: AiClaim[];
  payload: unknown;
  source: "system" | "assistant";
  now?: Date;
}

export interface CreateRecommendationResult {
  created: boolean;
  id: string;
  /** `created: false` sababi — bugun faqat bitta: takror. */
  reason?: "duplicate";
}

/**
 * Tavsiya yaratadi.
 *
 * DUBLIKAT QO'RIQCHISI: bitta (firma, tur) juftligi uchun bir vaqtda faqat
 * BITTA `pending` bo'ladi. Sababi o'lchangan xatti-harakat — model bir
 * suhbatda bir savolni ikki xil so'zlab qayta so'raydi va har safar tavsiya
 * yaratardi; direktor ekrani bir xil qatorning beshta nusxasi bilan to'lib,
 * 5-va'da o'lchovi ham shishardi (maxraj sun'iy o'sardi).
 *
 * Takror XATO TASHLAMAYDI, `created: false` qaytaradi: bu nosozlik emas,
 * "allaqachon navbatda turibdi" degan normal holat va model uni foydalanuvchiga
 * shunday aytishi kerak.
 */
export async function createRecommendationRecord(
  db: Db,
  input: CreateRecommendationInput,
): Promise<CreateRecommendationResult> {
  if (!isRecommendationKind(input.kind)) {
    throw new Error(`Noma'lum tavsiya turi: ${String(input.kind)}`);
  }
  const rationale = input.rationale?.trim();
  if (!rationale) throw new Error("Tavsiya izohi (rationale) majburiy");

  // Payload SXEMASI — yaratishda, qabulda emas. Yaroqsiz payloadli tavsiya
  // navbatda "bajarib bo'lmaydigan" bo'lib qolardi.
  const payload = parseRecommendationPayload(input.kind, input.payload);

  // Firma DOIRADA bo'lishi shart. `findFirst` + doira, `findUnique` emas —
  // `lib/ai/tools.ts#resolveCompany` dagi bilan bir xil sabab.
  const company = await db.company.findFirst({
    where: { id: input.companyId, ...companyScopeWhere(input.actor) },
    select: { id: true },
  });
  if (!company) throw new Error("Firma topilmadi yoki sizning portfelingizda emas");

  const existing = await db.recommendation.findFirst({
    where: { companyId: company.id, kind: input.kind, status: "pending" },
    select: { id: true },
  });
  if (existing) return { created: false, id: existing.id, reason: "duplicate" };

  const row = await db.recommendation.create({
    data: {
      companyId: company.id,
      kind: input.kind,
      rationale,
      // Da'volar bo'sh bo'lishi MUMKIN: har tavsiya ostida raqam bo'lavermaydi
      // ("hujjat so'rash" raqamsiz ham to'g'ri tavsiya).
      claims: input.claims as unknown as Prisma.InputJsonValue,
      payload: payload as unknown as Prisma.InputJsonValue,
      source: input.source,
      status: "pending",
      ...(input.now ? { createdAt: input.now } : {}),
    },
    select: { id: true },
  });

  await recordAuditLog({
    userId: input.actor.id,
    action: "create",
    tableName: "Recommendation",
    recordId: row.id,
    newData: { kind: input.kind, source: input.source },
  });

  return { created: true, id: row.id };
}

// ─────────────────────────────────────────────────────────
// RO'YXAT
// ─────────────────────────────────────────────────────────

const ROW_SELECT = {
  id: true,
  companyId: true,
  kind: true,
  rationale: true,
  claims: true,
  payload: true,
  source: true,
  status: true,
  decidedBy: true,
  decidedAt: true,
  decisionNote: true,
  createdAt: true,
  company: { select: { name: true } },
  decider: { select: { fullName: true } },
} as const;

type Row = Prisma.RecommendationGetPayload<{ select: typeof ROW_SELECT }>;

function toRecommendation(row: Row): Recommendation {
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: row.company.name,
    kind: row.kind as RecommendationKind,
    rationale: row.rationale,
    claims: parseClaims(row.claims),
    payload: (row.payload ?? {}) as Record<string, unknown>,
    source: row.source === "system" ? "system" : "assistant",
    createdAt: row.createdAt,
    status: row.status as RecommendationStatus,
    decidedBy: row.decidedBy,
    decidedByName: row.decider?.fullName ?? null,
    decidedAt: row.decidedAt,
    decisionNote: row.decisionNote,
  };
}

/**
 * Javob kutayotgan tavsiyalar — ENG ESKISI BIRINCHI.
 *
 * Tartib ataylab `createdAt asc`: eng eski qator 7 kunlik muddatga eng yaqini,
 * ya'ni javobsiz qolsa birinchi bo'lib `expired` ga tushadi. Yangisini tepaga
 * chiqarish aynan yo'qolayotgan tavsiyani ro'yxat oxirida ko'mib qo'yardi.
 */
export async function listPendingRecommendationRows(
  db: Db,
  actor: Actor,
  limit = PENDING_PAGE_SIZE,
): Promise<Recommendation[]> {
  const rows = await db.recommendation.findMany({
    where: { status: "pending", company: companyScopeWhere(actor) },
    select: ROW_SELECT,
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  return rows.map(toRecommendation);
}

// ─────────────────────────────────────────────────────────
// AMAL ISHLOVCHILARI
// ─────────────────────────────────────────────────────────

export interface ExecuteDeps {
  /** Telegram porti — `server/` qatlami in'ektsiya qiladi (lib botni bilmaydi). */
  dispatchTelegram?: TelegramDispatcher;
  now?: Date;
}

/** Payloaddagi majburiyat AYNI SHU tavsiyaning firmasiga tegishli ekanini tekshiradi. */
async function loadScopedObligation(db: Db, companyId: string, obligationId: string) {
  const o = await db.obligation.findUnique({
    where: { id: obligationId },
    select: {
      id: true,
      companyId: true,
      dueAt: true,
      periodKey: true,
      responsibleUserId: true,
      company: { select: { name: true } },
      template: { select: { name: true } },
    },
  });
  if (!o) throw new Error("Majburiyat topilmadi");
  if (o.companyId !== companyId) {
    // Tavsiya firmasi bilan payload firmasi mos kelmasa — bu doira buzilishi,
    // "topilmadi" emas: uni jimgina o'tkazib yuborish begona firmada amal
    // bajarishga yo'l ochardi.
    throw new Error("Tavsiya payloadi boshqa firmaning majburiyatini ko'rsatmoqda");
  }

  // Mas'ulning ismi ALOHIDA so'rov bilan: `Obligation.responsibleUserId` —
  // SNAPSHOT ustuni, `User` ga relation EMAS (biriktiruv keyin o'zgarsa ham
  // tarix yo'qolmasligi uchun ataylab shunday).
  const responsibleName = o.responsibleUserId
    ? (
        await db.user.findUnique({
          where: { id: o.responsibleUserId },
          select: { fullName: true },
        })
      )?.fullName ?? null
    : null;

  return { ...o, responsibleName };
}

/** Firmaning mas'ul buxgalteri — ishlovchilarning standart qabul qiluvchisi. */
async function defaultAssignee(db: Db, companyId: string): Promise<string | null> {
  const c = await db.company.findUnique({ where: { id: companyId }, select: { accountantId: true } });
  return c?.accountantId ?? null;
}

/**
 * Payloadni BAJARADI va bajarilgan ishning bir qatorlik tavsifini qaytaradi
 * (audit iziga va ekrandagi xabarga tushadi).
 */
async function executeRecommendation(
  db: Db,
  actor: Actor,
  row: Recommendation,
  deps: ExecuteDeps,
): Promise<string> {
  const now = deps.now ?? new Date();
  const note = row.decisionNote ?? undefined;

  switch (row.kind) {
    // ── Eskalatsiya zanjiri ────────────────────────────────────────────
    // DIQQAT: `Obligation.status` ga "escalated" YOZILMAYDI — bunday holat
    // `ObligationStatus` enumida yo'q va uni qo'shish butun workflow'ni
    // (o'tish jadvali, KPI, matritsa tasniflagichi) qayta ta'riflashni
    // talab qilardi. "Zanjirga qo'shish" ASROda allaqachon boshqa narsa:
    // `lib/engines/automation/escalation.ts` bosqichni qayd etadi va
    // nazoratchi/bosh buxgalterga xabar beradi. Majburiyatning O'Z holati
    // o'zgarmaydi — ish hali ham o'sha bosqichda turibdi, faqat undan
    // yuqoridagi odam endi biladi.
    case "escalate_obligation": {
      const p = parseRecommendationPayload("escalate_obligation", row.payload);
      const o = await loadScopedObligation(db, row.companyId, p.obligationId);
      // Standart daraja — 1 (nazoratchi): mas'ulning o'zi (L0) allaqachon
      // biladi, direktor tavsiyasi zanjirni KO'TARADI.
      const level: EscalationLevel = (p.level ?? 1) as EscalationLevel;
      const res = await escalate(
        db,
        {
          kind: "obligation",
          entityId: o.id,
          companyId: o.companyId,
          companyName: o.company.name,
          responsibleUserId: o.responsibleUserId,
          responsibleName: o.responsibleName,
          detail: `${o.template.name} · ${o.periodKey} — direktor qarori bilan eskalatsiya`,
          link: `/deadlines?company=${o.companyId}`,
        },
        level,
        // Telegram yuboruvchi berilmaydi: sayt ichidagi xabar ishonchli kanal
        // va bu bir martalik qaror, sweep emas — kunlik yig'maga qoldirilsa
        // direktor bosgan tugmaning natijasi ertaga ko'rinardi.
        { now, deliverNow: true },
      );
      if (!res.claimed) {
        return res.skipped === "no_recipient"
          ? `Eskalatsiya qabul qiluvchisi yo'q (daraja ${level})`
          : `Bu daraja (${level}) allaqachon eskalatsiya qilingan`;
      }
      return `Eskalatsiya: ${res.recipient?.fullName ?? "—"} (daraja ${level})`;
    }

    // ── Mas'ulni almashtirish ──────────────────────────────────────────
    // `CompanyObligationOverride` EMAS: u faqat KELAJAKDA generatsiya
    // qilinadigan majburiyatlarga ta'sir qiladi va tavsiya ko'rsatgan
    // aniq qatorga umuman tegmasdi (M4 da o'lchangan xato).
    case "reassign_responsible": {
      const p = parseRecommendationPayload("reassign_responsible", row.payload);
      const o = await loadScopedObligation(db, row.companyId, p.obligationId);
      const res = await reassignObligationTo(db, actor, o.id, p.toUserId, note);
      return res.changed ? "Mas'ul almashtirildi" : "Mas'ul allaqachon o'sha xodim";
    }

    // ── Kechikishni rasmiylashtirish ───────────────────────────────────
    // `dueAt` KO'CHIRILMAYDI. Muddat qonundan keladi (soliq/statistika
    // taqvimi) va uni ASRO ichida surish hisobotni to'g'ri qilmaydi —
    // faqat ekrandagi qizil rangni o'chiradi. ASROdagi haqiqiy "surish"
    // — kechikish sababini belgilash va uni MANAGER tasdiqlashi
    // (`Obligation.delayReason` + `delayApprovedById`), shundan keyin
    // qator KPI dan chiqadi. Ikki bosqich birga bajariladi, chunki
    // direktorning qabuli aynan o'sha tasdiq.
    case "postpone_obligation": {
      const p = parseRecommendationPayload("postpone_obligation", row.payload);
      const o = await loadScopedObligation(db, row.companyId, p.obligationId);
      await markObligationDelayReason(db, actor, o.id, p.delayReason, note);
      await approveObligationDelayReason(db, actor, o.id);
      return `Kechikish sababi tasdiqlandi: ${p.delayReason}`;
    }

    // ── Bank sverkasi ──────────────────────────────────────────────────
    // Tavsiya "tekshir" deydi — bajarilishi VAZIFA ochish. To'g'ridan-to'g'ri
    // qatorlarni `matched` qilish mumkin emas: taqqoslash odamning qarori,
    // va uni AI tavsiyasi bilan avtomatlashtirish pul harakatini noto'g'ri
    // firmaga yozib qo'yishi mumkin edi.
    case "review_unmatched_bank": {
      const p = parseRecommendationPayload("review_unmatched_bank", row.payload);
      const assignee = p.assigneeUserId ?? (await defaultAssignee(db, row.companyId));
      const task = await db.task.create({
        data: {
          companyId: row.companyId,
          title: `Bank sverkasini tekshirish — ${row.companyName}`,
          description: row.rationale,
          taskType: "bank_reconciliation",
          priority: "high",
          assigneeUserId: assignee,
          createdBy: actor.id,
          dueAt: new Date(now.getTime() + BANK_REVIEW_DUE_DAYS * DAY),
        },
        select: { id: true },
      });
      await recordAuditLog({
        userId: actor.id,
        action: "create",
        tableName: "Task",
        recordId: task.id,
        newData: { via: "recommendation", recommendationId: row.id },
      });
      return assignee ? "Sverka vazifasi ochildi" : "Sverka vazifasi ochildi (mas'ul biriktirilmagan)";
    }

    // ── Hujjat so'rash ─────────────────────────────────────────────────
    // Xabar MIJOZGA emas, XODIMGA boradi. ASRO boti mijozlar bilan yozishmaydi
    // (xodimlar `/link_me` orqali o'zini bog'laydi) — mijoz bilan aloqa
    // buxgalter zimmasida qoladi, tizim esa talabni yozib qo'yadi.
    case "request_documentation": {
      const p = parseRecommendationPayload("request_documentation", row.payload);
      const target = p.toUserId ?? (await defaultAssignee(db, row.companyId));
      if (!target) throw new Error("Kimdan so'ralishi aniqlanmadi: firmada mas'ul buxgalter yo'q");
      const res = await notifyUsers(
        db,
        {
          userIds: [target],
          type: "recommendation",
          title: `Hujjat so'rang — ${row.companyName}`,
          message: `${p.documentName}. Sabab: ${row.rationale}`,
          link: `/organizations?company=${row.companyId}`,
          channel: "recommendation",
          // Tavsiya qatori bir marta qabul qilinadi, ya'ni kalit ham bir
          // martalik — takror bosish ikkinchi xabar yozmaydi.
          dedupKey: `recommendation:${row.id}`,
          dedupeKey: `recommendation:${row.id}`,
          priority: "high",
        },
        { dispatchTelegram: deps.dispatchTelegram, now },
      );
      return res.inapp > 0 ? "Hujjat so'rovi yuborildi" : "Hujjat so'rovi allaqachon yuborilgan";
    }
  }
}

// ─────────────────────────────────────────────────────────
// QAROR
// ─────────────────────────────────────────────────────────

export interface DecideInput {
  actor: Actor;
  id: string;
  decision: "accepted" | "dismissed";
  note: string;
  now?: Date;
}

export interface DecideResult {
  id: string;
  status: RecommendationStatus;
  /** Bajarilgan ish tavsifi; rad etishda `null` — hech narsa bajarilmagan. */
  effect: string | null;
}

/**
 * Qabul yoki rad.
 *
 * SABAB MAJBURIY — ikkalasida ham. Qabulda u bajarilgan amalga izoh bo'ladi
 * (`reassignObligationTo` uni `ObligationAssignmentEvent.reason` ga yozadi),
 * radda esa YAGONA saqlanadigan ma'lumot: "nega bu tavsiya yaroqsiz" —
 * keyinchalik tavsiyalar sifatini shundan o'qiladi.
 */
export async function decideRecommendationRow(
  db: Db,
  input: DecideInput,
  deps: ExecuteDeps = {},
): Promise<DecideResult> {
  const note = input.note?.trim();
  if (!note) throw new Error("Sabab majburiy — bu qaror audit izida saqlanadi");
  if (input.decision !== "accepted" && input.decision !== "dismissed") {
    throw new Error("Qaror faqat 'accepted' yoki 'dismissed' bo'lishi mumkin");
  }

  const found = await db.recommendation.findFirst({
    where: { id: input.id, company: companyScopeWhere(input.actor) },
    select: ROW_SELECT,
  });
  if (!found) throw new Error("Tavsiya topilmadi yoki sizning portfelingizda emas");
  if (found.status !== "pending") {
    throw new Error(`Bu tavsiya allaqachon hal qilingan (${found.status})`);
  }

  const row = toRecommendation(found);
  // Sabab amal ishlovchisiga ham kerak (izoh sifatida yoziladi).
  row.decisionNote = note;

  const now = input.now ?? new Date();

  // TARTIB: avval AMAL, keyin STATUS. Amal yiqilsa qator `pending` bo'lib
  // qoladi — "qabul qilindi, lekin hech narsa bo'lmadi" holati mumkin emas.
  const effect =
    input.decision === "accepted"
      ? await executeRecommendation(db, input.actor, row, { ...deps, now })
      : null;

  await db.recommendation.update({
    where: { id: row.id },
    data: {
      status: input.decision,
      decidedBy: input.actor.id,
      decidedAt: now,
      decisionNote: note,
    },
  });

  await recordAuditLog({
    userId: input.actor.id,
    action: "update",
    tableName: "Recommendation",
    recordId: row.id,
    oldData: { status: "pending" },
    newData: { status: input.decision, kind: row.kind, note, effect },
  });

  await logEvent(db, {
    kind:
      input.decision === "accepted"
        ? RECOMMENDATION_EVENT_KINDS.accepted
        : RECOMMENDATION_EVENT_KINDS.dismissed,
    actor: input.actor,
    metadata: { recommendationId: row.id, kind: row.kind, source: row.source },
  });

  return { id: row.id, status: input.decision, effect };
}

// ─────────────────────────────────────────────────────────
// MUDDAT VA O'LCHOV
// ─────────────────────────────────────────────────────────

export interface ExpireResult {
  expired: number;
}

/**
 * 7 kundan beri javobsiz turgan tavsiyalarni `expired` qiladi (kunlik cron).
 *
 * `decidedAt` HAM to'ldiriladi (`decidedBy` esa `null`) — 5-va'da o'lchovi
 * uch holatni BIR vaqt o'qi bo'yicha sanaydi. Aks holda "shu haftada nechta
 * tavsiya hal bo'ldi" so'rovi eskirganlarni umuman ko'rmasdi va ulush
 * doimiy ravishda haqiqatdan yaxshiroq chiqardi.
 */
export async function expireStaleRecommendations(
  db: Db,
  opts: { now?: Date; ttlDays?: number } = {},
): Promise<ExpireResult> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - (opts.ttlDays ?? RECOMMENDATION_TTL_DAYS) * DAY);

  const stale = await db.recommendation.findMany({
    where: { status: "pending", createdAt: { lt: cutoff } },
    select: { id: true, kind: true },
  });
  if (stale.length === 0) return { expired: 0 };

  await db.recommendation.updateMany({
    where: { id: { in: stale.map((r) => r.id) } },
    data: {
      status: "expired",
      decidedAt: now,
      decisionNote: `${RECOMMENDATION_TTL_DAYS} kun javobsiz qoldi`,
    },
  });

  for (const r of stale) {
    // Aktyor YO'Q — bu cron qarori, odamniki emas (`AnalyticsEvent.actorId`
    // nullable, `AuditLog` bilan bir xil qoida).
    await logEvent(db, {
      kind: RECOMMENDATION_EVENT_KINDS.expired,
      actor: { id: null, role: "system" },
      metadata: { recommendationId: r.id, kind: r.kind },
    });
  }

  return { expired: stale.length };
}

export interface AdoptionResult {
  accepted: number;
  dismissed: number;
  expired: number;
  total: number;
  /** Qabul ulushi, foizda. Hal qilingan tavsiya bo'lmasa `null` — 0% EMAS. */
  percent: number | null;
  fromDate: string;
}

/**
 * 5-VA'DA O'LCHOVI: qabul / (qabul + rad + eskirgan).
 *
 * MANBA — `Recommendation` JADVALI, `AnalyticsEvent` EMAS. Sabab: `logEvent`
 * xatoni ATAYLAB yutadi (o'lchov yozuvi asosiy ishni yiqitmasligi kerak),
 * ya'ni hodisa qatori yo'qolishi MUMKIN. Qaror daftari esa qarorning o'zi
 * bilan bitta tranzaksiyada emas, lekin bitta amalda yoziladi va yo'qolmaydi.
 * `AnalyticsEvent` foydalanish tahlili uchun qoladi (kim, qaysi rol, qachon).
 *
 * `percent === null` — hal qilingan tavsiya YO'Q. "0%" deb ko'rsatish
 * "hech kim qabul qilmayapti" degan yolg'on bo'lardi (`Score.value` qoidasi).
 */
export async function getRecommendationAdoption(
  db: Db,
  opts: { now?: Date; days?: number } = {},
): Promise<AdoptionResult> {
  const now = opts.now ?? new Date();
  const from = new Date(now.getTime() - (opts.days ?? 7) * DAY);

  const rows = await db.recommendation.groupBy({
    by: ["status"],
    where: { decidedAt: { gte: from, lte: now }, status: { in: ["accepted", "dismissed", "expired"] } },
    _count: { _all: true },
  });
  const at = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;

  const accepted = at("accepted");
  const dismissed = at("dismissed");
  const expired = at("expired");
  const total = accepted + dismissed + expired;

  return {
    accepted,
    dismissed,
    expired,
    total,
    percent: total > 0 ? Math.round((accepted / total) * 100) : null,
    fromDate: from.toISOString().slice(0, 10),
  };
}

/** Ekrandagi nom — shartnomadan, bu yerda takrorlanmaydi. */
export const labelFor = (kind: RecommendationKind): string => RECOMMENDATION_LABELS[kind];
