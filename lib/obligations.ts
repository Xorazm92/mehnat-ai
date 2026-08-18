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
  makeWorkdayPredicate,
} from "@/lib/deadlines";
import {
  isCompanyEligible,
  templateApplies,
  type CompanyFacts,
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
  /** Rejim o'zgargani uchun bekor qilingan (faqat `planned` bo'lganlari). */
  cancelledNotApplicable: number;
}


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

  // 3) Biznes kalendar (kichik jadval → to'liq yuklaymiz).
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
  };

  for (const t of templates) {
    const window = periodWindowFor(t.periodicity, ref);
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
      // Muddat — shablon qoidasi + biznes kalendar. Firma-darajali istisno
      // (`CompanyObligationOverride`) olib tashlandi: u UI'ga hech qachon
      // ulanmagan, bitta ham yozuvi bo'lmagan va "qoida qayerda?" degan
      // savolga ikkinchi javob berardi. Istisno kerak bo'lsa — shablonning
      // applicability mezoni orqali, ya'ni ko'rinadigan qoida bilan.
      const dueAt = computeDueAt(t, window, isWorkday);

      // Mas'ul snapshot — firma buxgalteri.
      const snap = roleSnap.get(c.id)!;
      const responsibleUserId = snap.accountantId;

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
