// lib/paymentGeneration.ts
// =====================================================
// OYLIK Payment GENERATSIYASI — CompanyServiceTerm asosida
// =====================================================
// `lib/obligations.ts#generateObligations` bilan bir xil kunlik cron
// hodisasida ishga tushadi (bot/queues/obligation.worker.ts), lekin undan
// MUSTAQIL: majburiyat generatsiyasi "nima topshirilishi kerak" degan
// savolga javob beradi, bu yerdagi funksiya esa "necha pul kutilyapti".
//
// IDEMPOTENTLIK QOIDASI: faqat `status: 'pending'` VA `allocations.length===0`
// bo'lgan Payment qatorlari yangilanadi/yaratiladi. Agar buxgalter allaqachon
// qisman to'lov kiritgan bo'lsa (applyAllocation orqali `partial`/`paid`ga
// o'tgan), cron uni QAYTA YOZMAYDI — aks holda qayta ishga tushirilganda
// (re-run) real to'lov ustidan cron summasi yozilib, taqsimot bilan
// nomutanosiblik yuzaga kelardi.
//
// XATO IZOLYATSIYASI: har bir firma alohida try/catch bilan o'raladi —
// bitta firmadagi kutilmagan xato (masalan term topilmasa) butun cron
// partiyasini to'xtatib qo'ymasligi kerak.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveServiceTerm, roundToMonthStart } from "@/lib/terms";
import { periodKeyOf } from "@/lib/periods";
import { isCompanyEligible, type CompanyFacts } from "@/lib/engines/obligation/applicability";
import { logServerError } from "@/lib/logger";

type Db = Prisma.TransactionClient | typeof prisma;

export interface GeneratePaymentsResult {
  ref: string;
  period: string;
  companiesEligible: number;
  created: number;
  updated: number;
  skippedNoTerm: number;
  /** Allaqachon to'lov jarayoni boshlangan (partial/paid yoki allocation bor) — teginilmadi. */
  skippedInProgress: number;
  errors: { companyId: string; message: string }[];
}

export async function generateMonthlyPayments(
  db: Db = prisma,
  opts: { ref?: Date; createdBy?: string } = {}
): Promise<GeneratePaymentsResult> {
  const ref = opts.ref ?? new Date();
  const periodStart = roundToMonthStart(ref);
  const period = periodKeyOf(periodStart);

  const companies = await db.company.findMany({
    where: { isActive: true },
    select: { id: true, isActive: true, companyStatus: true, contractDate: true },
  });

  const res: GeneratePaymentsResult = {
    ref: ref.toISOString(),
    period,
    companiesEligible: 0,
    created: 0,
    updated: 0,
    skippedNoTerm: 0,
    skippedInProgress: 0,
    errors: [],
  };

  for (const c of companies) {
    // isCompanyEligible faqat isActive/companyStatus/contractDate ko'radi —
    // to'liq CompanyFacts (taxRegime va h.k.) shart emas, shuning uchun
    // qolgan maydonlar bo'sh qiymat bilan to'ldiriladi.
    const facts: CompanyFacts = {
      id: c.id,
      isActive: c.isActive,
      companyStatus: c.companyStatus,
      contractDate: c.contractDate,
      taxRegime: "vat",
      statsType: null,
      activeServices: [],
      hasLandTax: false,
      hasWaterTax: false,
      hasPropertyTax: false,
      hasExciseTax: false,
    };
    if (!isCompanyEligible(facts, ref)) continue;
    res.companiesEligible++;

    try {
      const term = await resolveServiceTerm(c.id, periodStart, db);
      if (!term) {
        res.skippedNoTerm++;
        continue;
      }

      const existing = await db.payment.findUnique({
        where: { companyId_period: { companyId: c.id, period } },
        select: { id: true, status: true, deletedAt: true, _count: { select: { allocations: true } } },
      });

      if (!existing) {
        await db.payment.create({
          data: {
            companyId: c.id,
            period,
            amount: term.totalAmount,
            status: "pending",
            paymentMethod: "naqd",
            createdBy: opts.createdBy ?? null,
          },
        });
        res.created++;
        continue;
      }

      const untouched = existing.status === "pending" && existing._count.allocations === 0 && !existing.deletedAt;
      if (!untouched) {
        res.skippedInProgress++;
        continue;
      }

      await db.payment.update({
        where: { id: existing.id },
        data: { amount: term.totalAmount },
      });
      res.updated++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.errors.push({ companyId: c.id, message });
      logServerError("paymentGeneration.company", e, { companyId: c.id, period });
    }
  }

  return res;
}
