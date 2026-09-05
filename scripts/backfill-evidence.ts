/**
 * DALIL BACKFILL — eski `ReportProof` qatorlariga topshirish urinishi yozadi.
 *
 *   npm run backfill:evidence            # QURUQ YURISH, hech narsa yozilmaydi
 *   npm run backfill:evidence -- --apply # yozadi
 *
 * NEGA. Ikki tomonlama yozuv `server/proofs.ts` ga 2026-08-30 da qo'shilgan.
 * Undan OLDIN topshirilgan dalillar `ObligationSubmission`/`SubmissionEvidence`
 * tomonida iz qoldirmagan — `npm run audit:evidence` ularni ko'rsatadi. Bu
 * ajralish emas, backfill bo'shlig'i; lekin `ReportProof` ni chiqarishdan
 * oldin yopilishi shart, aks holda topshirish tarixi yo'qoladi.
 *
 * NIMAGA TEGMAYDI — ATAYLAB:
 *   · `Obligation.status` O'ZGARTIRILMAYDI. `applyObligationStatus` uni
 *     o'zgartirar va `sentAt`/`acceptedAt` ga BUGUNGI sanani yozardi —
 *     tarixiy yozuvni buzardi. Backfill sof qo'shimcha.
 *   · `ReportProof` ga tegilmaydi, hech narsa o'chirilmaydi.
 *
 * Idempotent: allaqachon bog'langan dalil o'tkazib yuboriladi, ya'ni skriptni
 * qayta yurgizish xavfsiz.
 *
 * Majburiyatni topish mantig'i `lib/domains/accounting/matrixWrite.ts` dagi
 * bilan BIR XIL manbalardan quriladi (`toYearMonthKey` + `periodWindowFor`),
 * qayta yozilmaydi.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { periodWindowFor } from "@/lib/engines/obligation/deadlines";
import { toYearMonthKey } from "@/lib/periods";
import { PROOF_REF_PREFIX, PROOF_TO_SUBMISSION_STATUS } from "@/lib/evidenceConsistency";
import type { SubmissionStatus } from "@prisma/client";

const APPLY = process.argv.includes("--apply");

/** `matrixWrite.refDateFor` bilan bir xil: oy o'rtasi, chegara kunlarisiz. */
function refDateFor(period: string): Date | null {
  const ym = toYearMonthKey(period);
  if (!ym) return null;
  const [y, m] = ym.split("-");
  return new Date(Date.UTC(Number(y), Number(m) - 1, 15));
}

async function main() {
  const orphans = await prisma.reportProof.findMany({
    where: { NOT: { id: { in: [] } } },
    select: {
      id: true, companyId: true, period: true, colKey: true, status: true,
      submittedById: true, submittedAt: true, reviewedAt: true, rejectReason: true,
      company: { select: { name: true } },
    },
    orderBy: { submittedAt: "asc" },
  });

  const linked = new Set(
    (await prisma.submissionEvidence.findMany({
      where: { storageRef: { startsWith: PROOF_REF_PREFIX } },
      select: { storageRef: true },
    })).map((e) => e.storageRef.slice(PROOF_REF_PREFIX.length)),
  );

  const todo = orphans.filter((p) => !linked.has(p.id));
  console.log(`\nDalillar: ${orphans.length} · bog'langan: ${linked.size} · backfill kerak: ${todo.length}`);
  console.log(APPLY ? "REJIM: YOZILADI\n" : "REJIM: quruq yurish (--apply bermadingiz)\n");

  let done = 0;
  const skipped: string[] = [];

  for (const p of todo) {
    const label = `${p.company.name} · ${p.period} · ${p.colKey}`;
    const ref = refDateFor(p.period);
    if (!ref) { skipped.push(`${label} — davr o'qilmadi`); continue; }

    const templates = await prisma.deadlineTemplate.findMany({
      where: {
        matrixKey: p.colKey, active: true, lifecycle: "active",
        effectiveFrom: { lte: ref },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: ref } }],
      },
      select: { id: true, periodicity: true },
    });
    if (templates.length === 0) { skipped.push(`${label} — shablon yo'q (no_template)`); continue; }

    let obligationId: string | null = null;
    for (const t of templates) {
      const w = periodWindowFor(t.periodicity, ref);
      const o = await prisma.obligation.findUnique({
        where: {
          companyId_templateId_periodStart_periodEnd: {
            companyId: p.companyId, templateId: t.id,
            periodStart: w.periodStart, periodEnd: w.periodEnd,
          },
        },
        select: { id: true },
      });
      if (o) { obligationId = o.id; break; }
    }
    if (!obligationId) { skipped.push(`${label} — majburiyat qatori yo'q (no_obligation)`); continue; }

    const status = (PROOF_TO_SUBMISSION_STATUS[p.status] ?? "sent") as SubmissionStatus;
    console.log(`  ${APPLY ? "+" : "·"} ${label} → urinish (${status})`);
    if (!APPLY) { done++; continue; }

    // Bitta dalil = bitta atomik yozuv: urinishsiz dalil yoki dalilsiz urinish
    // qolib ketmasin.
    await prisma.$transaction(async (tx) => {
      const attemptNo = (await tx.obligationSubmission.count({ where: { obligationId: obligationId! } })) + 1;
      const submission = await tx.obligationSubmission.create({
        data: {
          obligationId: obligationId!,
          attemptNo,
          status,
          // TARIXIY sanalar — `new Date()` EMAS.
          sentAt: p.submittedAt,
          acceptedAt: status === "accepted" ? p.reviewedAt : null,
          rejectedAt: status === "rejected" ? p.reviewedAt : null,
          rejectionNote: status === "rejected" ? p.rejectReason : null,
          // Kelib chiqishi ko'rinib tursin: bu qator odam topshirgan paytda
          // emas, backfill paytida yozilgan.
          sourceSystem: "asro-backfill",
          createdById: p.submittedById,
        },
        select: { id: true },
      });
      await tx.submissionEvidence.create({
        data: {
          submissionId: submission.id,
          type: "screenshot",
          storageRef: `${PROOF_REF_PREFIX}${p.id}`,
          note: `Backfill · matritsa ustuni: ${p.colKey}`,
          createdById: p.submittedById,
        },
      });
    });
    done++;
  }

  console.log(`\nBajarildi: ${done}${APPLY ? "" : " (yozilmadi)"}`);
  if (skipped.length) {
    console.log(`\nO'tkazib yuborildi (${skipped.length}) — majburiyat topilmadi:`);
    for (const s of skipped) console.log(`  ! ${s}`);
    console.log("\nBular shablon/majburiyat qamrovi masalasi. Dalil YO'QOLMAYDI —");
    console.log("`ReportProof` joyida turibdi va `audit:evidence` ularni ko'rsatishda davom etadi.");
  }
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error("backfill yiqildi:", e); await prisma.$disconnect(); process.exit(1); });
