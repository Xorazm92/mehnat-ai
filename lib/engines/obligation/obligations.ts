// =====================================================
// OBLIGATION GENERATOR — framework-free (Faza A / compliance engine)
// =====================================================
// Berilgan `ref` sanani o'z ichiga olgan davr uchun (har template o'z
// periodicity'si bo'yicha) yaroqli kompaniyalarga majburiyat yaratadi.
// IDEMPOTENT: @@unique([companyId, templateId, periodStart, periodEnd]) →
// qayta ishga tushirilsa dublikat yaratmaydi (P2002 → skip). Mas'ul va
// templateVersion snapshot qilinadi. Status/assignment EVENT'lari keyin
// workflow qatlamida (server/obligations.ts) yoziladi.
import { Prisma, type Periodicity } from "@prisma/client";
import {
  periodWindowFor,
  periodKeyMatchesPeriodicity,
  computeDueAt,
  rawDueDate,
  adjustForWorkday,
  makeWorkdayPredicate,
} from "@/lib/engines/obligation/deadlines";
import {
  isSubjectEligible,
  templateApplies,
  isDisabledByOverride,
  type SubjectFacts,
  type OverrideFacts,
} from "@/lib/engines/obligation/applicability";

type Db = Prisma.TransactionClient;

/** Subyekt + majburiyatga snapshot qilinadigan mas'ullar. */
export interface SubjectRow extends SubjectFacts {
  responsibleUserId: string | null;
  backupUserId: string | null;
}

/**
 * Subyektlarni yuklovchi. Engine domen jadvalini o'zi so'ramaydi — qaysi
 * ustunlar o'qilishi va ular qanday atributga aylanishi domen qatlamida
 * (Konstitutsiya 4a/4b). Buxgalteriya uchun:
 * `lib/domains/accounting/subjects.ts#loadCompanySubjects`.
 */
export type SubjectLoader = (db: Db) => Promise<SubjectRow[]>;

export interface GenerateOptions {
  /** Subyektlarni yuklovchi — majburiy, standarti yo'q (domen tanlaydi). */
  loadSubjects: SubjectLoader;
  /** Davrni aniqlaydigan sana. Standart — hozir. */
  ref?: Date;
  /** Audit uchun kim ishga tushirgani (createdBy/assignedById). */
  createdBy?: string;
}

export interface GenerateResult {
  ref: string;
  templatesConsidered: number;
  companiesEligible: number;
  created: number;
  skippedExisting: number;
  skippedNotApplicable: number;
  /** Rejim o'zgargani uchun bekor qilingan (faqat `planned` bo'lganlari). */
  cancelledNotApplicable: number;
  /**
   * Template DAVRIYLIGI o'zgargani uchun bekor qilingan — eski qoida bo'yicha
   * yaratilgan, hali yopilmagan davrdagi `planned` majburiyatlar.
   */
  cancelledStaleRule: number;
}

const ovKey = (companyId: string, templateId: string) => `${companyId}::${templateId}`;

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/**
 * TEMPLATE DAVRIYLIGI O'ZGARGANDA ESKI QOIDA QATORLARINI YOPADI.
 *
 * Generator mavjud majburiyatni FAQAT joriy oyna kaliti bilan qidiradi
 * (`companyId_templateId_periodStart_periodEnd`). Template `quarterly` dan
 * `monthly` ga o'tsa oyna butunlay boshqa bo'ladi, ya'ni eski qatorlar shu
 * qidiruvga umuman tushmaydi: ular na yangilanadi, na bekor qilinadi.
 *
 * PRODDA O'LCHANGAN (2026-09-06, lokal `inbola`): 1 004 ta shunday qator —
 * `AYLANMA_SOLIQ`/`AYLANMA_TOLOV` (choraklik→oylik, 2×233) va
 * `FOYDA_YILLIK`/`FOYDA_TOLOV` (yillik→choraklik, 2×269). Hammasi `planned`,
 * muddatlari 2026-10-15 va 2027-03-01 — ya'ni ular hali ogohlantirish
 * bermagan, lekin `obligationSweep` D-5 bosqichida bera boshlar edi.
 *
 * FAQAT HALI YOPILMAGAN DAVR (`periodEnd > ref`) bekor qilinadi. Yopilgan
 * davrdagi `planned` qator — HAQIQIY bajarilmagan ish tarixi bo'lishi mumkin
 * (masalan o'tgan chorak topshirilmagan); uni jimgina bekor qilish dalilni
 * yo'q qilardi. Bunday qatorlar odam ko'rigiga qoldiriladi.
 *
 * `planned` dan nariga o'tgani (`sent`, `accepted`, …) hech qachon tegilmaydi —
 * `cancelledNotApplicable` dagi bilan bir xil qoida.
 */
async function cancelStaleRuleObligations(
  db: Db,
  template: { id: string; periodicity: Periodicity },
  ref: Date,
): Promise<number> {
  const open = await db.obligation.findMany({
    where: { templateId: template.id, status: "planned", periodEnd: { gt: ref } },
    select: { id: true, periodKey: true },
  });
  const stale = open.filter((o) => !periodKeyMatchesPeriodicity(o.periodKey, template.periodicity));
  if (stale.length === 0) return 0;

  const ids = stale.map((o) => o.id);
  await db.obligation.updateMany({ where: { id: { in: ids } }, data: { status: "cancelled" } });
  await db.obligationStatusEvent.createMany({
    data: ids.map((obligationId) => ({
      obligationId,
      fromStatus: "planned" as const,
      toStatus: "cancelled" as const,
      byUserId: null,
      note: "Shablon davriyligi o'zgardi — bu majburiyat eski qoida bo'yicha yaratilgan edi",
    })),
  });
  return stale.length;
}

/**
 * `ref` davri uchun majburiyatlarni yaratadi (idempotent). Bir necha davr
 * (catch-up) uchun turli `ref` bilan qayta chaqiriladi.
 */
export async function generateObligations(db: Db, opts: GenerateOptions): Promise<GenerateResult> {
  const ref = opts.ref ?? new Date();

  // 1) Faol, kuchdagi, tasdiqlangan (active lifecycle) templatelar.
  const templates = await db.deadlineTemplate.findMany({
    where: {
      active: true,
      lifecycle: "active",
      effectiveFrom: { lte: ref },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: ref } }],
    },
    include: { applicability: true },
  });

  // 2) Yaroqli subyektlar (startedAt/kelajak tekshiruvi kodda). Domen yuklaydi.
  const subjects = await opts.loadSubjects(db);
  const facts = new Map<string, SubjectFacts>();
  const roleSnap = new Map<string, { accountantId: string | null; backupId: string | null }>();
  const eligible = subjects.filter((s) => {
    facts.set(s.id, s);
    roleSnap.set(s.id, { accountantId: s.responsibleUserId, backupId: s.backupUserId });
    return isSubjectEligible(s, ref);
  });

  // 3) Override'lar (company+template kaliti bo'yicha).
  const overrides = await db.companyObligationOverride.findMany();
  const ovMap = new Map<string, OverrideFacts>(
    overrides.map((o) => [ovKey(o.companyId, o.templateId), o as unknown as OverrideFacts]),
  );

  // 4) Biznes kalendar (kichik jadval → to'liq yuklaymiz).
  const calDays = await db.businessCalendarDay.findMany();
  const isWorkday = makeWorkdayPredicate(
    calDays.map((d) => ({ date: d.date, isWorkday: d.isWorkday, isHoliday: d.isHoliday })),
  );

  const res: GenerateResult = {
    ref: ref.toISOString(),
    templatesConsidered: templates.length,
    companiesEligible: eligible.length,
    created: 0,
    skippedExisting: 0,
    skippedNotApplicable: 0,
    cancelledNotApplicable: 0,
    cancelledStaleRule: 0,
  };

  for (const t of templates) {
    const window = periodWindowFor(t.periodicity, ref);
    // Firma tsiklidan OLDIN: eski davriylik qoidasining qoldiqlari yopiladi,
    // aks holda ular yangi qatorlar YONIDA turib ishni ikki marta ko'rsatardi.
    res.cancelledStaleRule += await cancelStaleRuleObligations(db, t, ref);
    for (const c of eligible) {
      const f = facts.get(c.id)!;
      if (!templateApplies(t.applicability, f)) {
        res.skippedNotApplicable++;
        /**
         * REJIM O'ZGARSA ESKI MAJBURIYAT QOLIB KETMASIN.
         *
         * Generator faqat YARATARDI. Firma aylanmadan QQS ga o'tkazilganda
         * (2026-08 da 119 ta firma birdaniga) unga allaqachon yaratilgan
         * "Aylanma soliq" majburiyati joyida qolardi: /deadlines da soxta
         * kechikish sifatida turardi va bot ular uchun eskalatsiya yuborardi.
         *
         * FAQAT `planned` bekor qilinadi. Undan nariga o'tgani (`sent`,
         * `accepted`, `rejected`) — bajarilgan ish tarixi; uni bekor qilish
         * dalilni yo'q qilardi. Bunday holat qo'lda ko'rib chiqilishi kerak.
         */
        const stale = await db.obligation.findUnique({
          where: {
            companyId_templateId_periodStart_periodEnd: {
              companyId: c.id,
              templateId: t.id,
              periodStart: window.periodStart,
              periodEnd: window.periodEnd,
            },
          },
          select: { id: true, status: true },
        });
        if (stale && stale.status === "planned") {
          await db.obligation.update({
            where: { id: stale.id },
            data: { status: "cancelled" },
          });
          await db.obligationStatusEvent.create({
            data: {
              obligationId: stale.id,
              fromStatus: "planned",
              toStatus: "cancelled",
              byUserId: null,
              note: "Firma bu shablonga endi mos kelmaydi (masalan soliq rejimi o'zgargan)",
            },
          });
          res.cancelledNotApplicable++;
        }
        continue;
      }
      const ov = ovMap.get(ovKey(c.id, t.id));
      if (isDisabledByOverride(ov)) {
        res.skippedNotApplicable++;
        continue;
      }

      // Muddat — custom_due override bo'lsa qoidani almashtiradi.
      let dueAt = computeDueAt(t, window, isWorkday);
      if (ov?.action === "custom_due" && (ov.customDueDay != null || ov.customOffsetDays != null)) {
        const customRule = {
          anchorType: ov.customDueDay != null ? ("fixed_day_of_month" as const) : ("period_end_offset" as const),
          dueDay: ov.customDueDay,
          dueMonth: null,
          offsetDays: ov.customOffsetDays,
        };
        dueAt = adjustForWorkday(rawDueDate(customRule, window), t.adjustmentPolicy, isWorkday);
      }

      // Mas'ul snapshot — reassign override > kompaniya buxgalteri.
      const snap = roleSnap.get(c.id)!;
      const responsibleUserId =
        ov?.action === "reassign" && ov.responsibleUserId ? ov.responsibleUserId : snap.accountantId;

      const existing = await db.obligation.findUnique({
        where: {
          companyId_templateId_periodStart_periodEnd: {
            companyId: c.id,
            templateId: t.id,
            periodStart: window.periodStart,
            periodEnd: window.periodEnd,
          },
        },
        select: { id: true },
      });
      if (existing) {
        res.skippedExisting++;
        continue;
      }

      try {
        await db.obligation.create({
          data: {
            companyId: c.id,
            templateId: t.id,
            templateVersion: t.version,
            periodStart: window.periodStart,
            periodEnd: window.periodEnd,
            periodKey: window.periodKey,
            dueAt,
            status: "planned",
            responsibleUserId: responsibleUserId ?? null,
            backupUserId: snap.backupId,
            assignedAt: responsibleUserId ? ref : null,
            assignedById: opts.createdBy ?? null,
            createdBy: opts.createdBy ?? null,
          },
        });
        res.created++;
      } catch (e) {
        if (isUniqueViolation(e)) res.skippedExisting++;
        else throw e;
      }
    }
  }

  return res;
}

const OBLIGATION_TYPE_LABELS: Record<string, string> = {
  tax_declaration: "Soliq hisoboti",
  tax_payment: "Soliq to'lovi",
  financial_statement: "Moliyaviy hisobot",
  statistics: "Statistika",
  internal_task: "Ichki ish",
};

/** Turkum uchun o'zbekcha yorliq; noma'lum qiymat chiroyli ko'rinishga keltiriladi. */
export function obligationTypeLabel(type: string | null | undefined): string {
  if (!type) return "—";
  const known = OBLIGATION_TYPE_LABELS[type];
  if (known) return known;
  // "some_new_kind" → "Some new kind" — hech bo'lmaganda o'qiladi.
  const pretty = type.replace(/_/g, " ").trim();
  return pretty.charAt(0).toUpperCase() + pretty.slice(1);
}
