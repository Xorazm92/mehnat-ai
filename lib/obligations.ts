// =====================================================
// OBLIGATION GENERATOR — framework-free (Faza A / compliance engine)
// =====================================================
// Berilgan `ref` sanani o'z ichiga olgan davr uchun (har template o'z
// periodicity'si bo'yicha) yaroqli kompaniyalarga majburiyat yaratadi.
// IDEMPOTENT: @@unique([companyId, templateId, periodStart, periodEnd]) →
// qayta ishga tushirilsa dublikat yaratmaydi (P2002 → skip). Mas'ul va
// templateVersion snapshot qilinadi. Status/assignment EVENT'lari keyin
// workflow qatlamida (server/obligations.ts) yoziladi.
import { Prisma } from "@prisma/client";
import {
  periodWindowFor,
  computeDueAt,
  rawDueDate,
  adjustForWorkday,
  makeWorkdayPredicate,
} from "@/lib/deadlines";
import {
  isCompanyEligible,
  templateApplies,
  isDisabledByOverride,
  type CompanyFacts,
  type OverrideFacts,
} from "@/lib/applicability";

type Db = Prisma.TransactionClient;

export interface GenerateOptions {
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
}

const ovKey = (companyId: string, templateId: string) => `${companyId}::${templateId}`;

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/**
 * `ref` davri uchun majburiyatlarni yaratadi (idempotent). Bir necha davr
 * (catch-up) uchun turli `ref` bilan qayta chaqiriladi.
 */
export async function generateObligations(db: Db, opts: GenerateOptions = {}): Promise<GenerateResult> {
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

  // 2) Yaroqli kompaniyalar (contractDate/kelajak tekshiruvi kodda).
  const companies = await db.company.findMany({
    where: { isActive: true },
    select: {
      id: true,
      isActive: true,
      companyStatus: true,
      contractDate: true,
      taxRegime: true,
      statsType: true,
      activeServices: true,
      accountantId: true,
      supervisorId: true,
      chiefAccountantId: true,
    },
  });
  const facts: Map<string, CompanyFacts> = new Map();
  const roleSnap: Map<string, { accountantId: string | null; backupId: string | null }> = new Map();
  const eligible = companies.filter((c) => {
    const f: CompanyFacts = {
      id: c.id,
      isActive: c.isActive,
      companyStatus: c.companyStatus,
      contractDate: c.contractDate,
      taxRegime: c.taxRegime,
      statsType: c.statsType,
      activeServices: c.activeServices,
    };
    facts.set(c.id, f);
    roleSnap.set(c.id, { accountantId: c.accountantId, backupId: c.supervisorId ?? c.chiefAccountantId });
    return isCompanyEligible(f, ref);
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
  };

  for (const t of templates) {
    const window = periodWindowFor(t.periodicity, ref);
    for (const c of eligible) {
      const f = facts.get(c.id)!;
      if (!templateApplies(t.applicability, f)) {
        res.skippedNotApplicable++;
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
