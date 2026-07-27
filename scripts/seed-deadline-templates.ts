// =====================================================
// DEADLINE TEMPLATE SEED + OBLIGATION GENERATSIYA (Faza A)
// =====================================================
// IDEMPOTENT: qayta ishga tushirish xavfsiz.
//  1) contractDate yo'q faol firmalarga standart sana (backfill) — aks holda
//     isCompanyEligible ularni chetlab o'tadi.
//  2) Standart O'zbekiston deadline shablonlari (upsert, lifecycle=active).
//  3) Joriy davr uchun majburiyat generatsiyasi (catch-up=0 → tarixiy
//     "kechikkan" uyumi yaratilmaydi; muddatlar oldinga qarab toza chiqadi).
//
// Ishga tushirish:  npx tsx scripts/seed-deadline-templates.ts
import "./load-env";
import { prisma } from "@/lib/prisma";
import { runGenerationLocked } from "@/lib/obligationRun";
import type { Periodicity, DeadlineAnchorType } from "@prisma/client";

// contractDate yo'q firmalar uchun taxminiy xizmat-boshlanish sanasi.
const CONTRACT_BACKFILL = new Date(Date.UTC(2026, 0, 1)); // 2026-01-01
// Shablonlar kuchga kirish sanasi (davr boshidan oldin bo'lishi shart).
const EFFECTIVE_FROM = new Date(Date.UTC(2026, 0, 1)); // 2026-01-01

interface TplSeed {
  code: string;
  name: string;
  obligationType: string;
  periodicity: Periodicity;
  anchorType: DeadlineAnchorType;
  dueDay?: number;
  dueMonth?: number;
  offsetDays?: number;
  applicability?: { criteriaType: string; criteriaValue: string }[];
}

// Tasdiqlangan to'plam (foydalanuvchi 2026-07-24). Sanalar = keyingi davr kuni.
const TEMPLATES: TplSeed[] = [
  {
    code: "QQS_DECL",
    name: "QQS deklaratsiyasi",
    obligationType: "tax_declaration",
    periodicity: "monthly",
    anchorType: "fixed_day_of_month",
    dueDay: 20,
    applicability: [{ criteriaType: "tax_regime", criteriaValue: "vat" }],
  },
  {
    code: "AYLANMA_SOLIQ",
    name: "Aylanma soliq",
    obligationType: "tax_declaration",
    periodicity: "quarterly",
    anchorType: "fixed_day_of_month",
    dueDay: 15,
    applicability: [{ criteriaType: "tax_regime", criteriaValue: "turnover" }],
  },
  {
    code: "INPS_IJTIMOIY",
    name: "INPS va ijtimoiy soliq",
    obligationType: "tax_declaration",
    periodicity: "monthly",
    anchorType: "fixed_day_of_month",
    dueDay: 15,
    // universal (barcha yaroqli firma)
  },
  {
    code: "DAROMAD_AGENT",
    name: "Daromad solig'i (soliq agenti)",
    obligationType: "tax_declaration",
    periodicity: "monthly",
    anchorType: "fixed_day_of_month",
    dueDay: 15,
  },
  {
    code: "FOYDA_YILLIK",
    name: "Foyda solig'i (yillik)",
    obligationType: "tax_declaration",
    periodicity: "annual",
    anchorType: "fixed_day_of_month",
    dueMonth: 3,
    dueDay: 1,
  },
  {
    code: "MOLIYAVIY_YILLIK",
    name: "Moliyaviy hisobot",
    obligationType: "financial_statement",
    periodicity: "annual",
    anchorType: "fixed_day_of_month",
    dueMonth: 2,
    dueDay: 15,
  },
];

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: { in: ["super_admin", "admin"] }, isActive: true },
    select: { id: true },
  });
  const createdBy = admin?.id;

  // ── 1) contractDate backfill ────────────────────────────────
  const backfill = await prisma.company.updateMany({
    where: { isActive: true, contractDate: null },
    data: { contractDate: CONTRACT_BACKFILL },
  });
  console.log(`1) contractDate backfill: ${backfill.count} firma → ${CONTRACT_BACKFILL.toISOString().slice(0, 10)}`);

  // ── 2) Shablonlar (upsert + applicability reconcile) ────────
  for (const t of TEMPLATES) {
    const tpl = await prisma.deadlineTemplate.upsert({
      where: { code_version: { code: t.code, version: 1 } },
      create: {
        code: t.code,
        version: 1,
        name: t.name,
        obligationType: t.obligationType,
        periodicity: t.periodicity,
        anchorType: t.anchorType,
        dueDay: t.dueDay ?? null,
        dueMonth: t.dueMonth ?? null,
        offsetDays: t.offsetDays ?? null,
        adjustmentPolicy: "next_workday",
        effectiveFrom: EFFECTIVE_FROM,
        effectiveTo: null,
        lifecycle: "active",
        active: true,
        approvedById: createdBy ?? null,
        approvedAt: new Date(),
        createdBy: createdBy ?? null,
      },
      update: {
        name: t.name,
        obligationType: t.obligationType,
        periodicity: t.periodicity,
        anchorType: t.anchorType,
        dueDay: t.dueDay ?? null,
        dueMonth: t.dueMonth ?? null,
        offsetDays: t.offsetDays ?? null,
        adjustmentPolicy: "next_workday",
        effectiveFrom: EFFECTIVE_FROM,
        lifecycle: "active",
        active: true,
      },
    });

    // Applicability'ni har run'da qayta quramiz (idempotent).
    await prisma.templateApplicability.deleteMany({ where: { templateId: tpl.id } });
    if (t.applicability?.length) {
      await prisma.templateApplicability.createMany({
        data: t.applicability.map((a) => ({
          templateId: tpl.id,
          criteriaType: a.criteriaType,
          criteriaValue: a.criteriaValue,
        })),
      });
    }
    const scope = t.applicability?.length
      ? t.applicability.map((a) => `${a.criteriaType}=${a.criteriaValue}`).join(", ")
      : "universal";
    console.log(`   ✓ ${t.code.padEnd(18)} ${t.periodicity.padEnd(9)} → ${scope}`);
  }

  // ── 3) Generatsiya (faqat joriy davr, catch-up yo'q) ─────────
  const gen = await runGenerationLocked(prisma as any, { catchUpMonths: 0, createdBy });
  if (gen.skipped === "locked") {
    console.log("3) Generatsiya: boshqa jarayon lock ushlab turibdi — o'tkazib yuborildi");
  } else {
    const r = gen.results?.[0];
    console.log(`3) Generatsiya (ref=${r?.ref?.slice(0, 10)}):`);
    console.log(`   templatelar=${r?.templatesConsidered}  yaroqli firma=${r?.companiesEligible}`);
    console.log(`   yaratildi=${r?.created}  mavjud(skip)=${r?.skippedExisting}  mos emas(skip)=${r?.skippedNotApplicable}`);
  }

  // ── Yakuniy tekshiruv ───────────────────────────────────────
  const total = await prisma.obligation.count();
  const sample = await prisma.obligation.findMany({
    orderBy: { dueAt: "asc" },
    take: 6,
    include: { company: { select: { name: true } }, template: { select: { name: true } } },
  });
  console.log(`\nJami Obligation: ${total}`);
  console.log("Eng yaqin 6 muddat:");
  for (const o of sample) {
    console.log(`   ${o.dueAt.toISOString().slice(0, 10)}  ${o.periodKey.padEnd(8)} ${o.template.name} — ${o.company.name}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
