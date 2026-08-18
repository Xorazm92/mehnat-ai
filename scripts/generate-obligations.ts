/**
 * MAJBURIYAT GENERATSIYASI — qo'lda ishga tushirish
 * ================================================
 * `runGenerationLocked` ustidan yupqa CLI. Odatda buni kunlik 06:00 cron'i
 * bajaradi (bot/queues/obligation.worker.ts), lekin clean-start'dan keyin
 * majburiyatlar bot yoqilishidan OLDIN turishi kerak — aks holda birinchi
 * sweep bo'sh ro'yxat ustidan ishlaydi va xodimlar 06:00 gacha hech narsa
 * ko'rmaydi.
 *
 * IDEMPOTENT: @@unique([companyId, templateId, periodStart, periodEnd]) →
 * qayta ishga tushirish dublikat yaratmaydi, mavjudlari `skip` bo'ladi.
 *
 * ISHLATISH:
 *   npx tsx scripts/generate-obligations.ts                # joriy davr (catch-up yo'q)
 *   npx tsx scripts/generate-obligations.ts --catch-up=2   # + oxirgi 2 oy (downtime'dan keyin)
 *
 * ⚠️  `--catch-up` shablonning `effectiveFrom` sanasidan orqaga o'ta olmaydi —
 * clean-start chegarasi aynan shu bilan ushlab turiladi
 * (qarang: scripts/seed-deadline-templates.ts).
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { runGenerationLocked } from "@/lib/obligationRun";

function parseCatchUp(): number {
  const arg = process.argv.find((a) => a.startsWith("--catch-up="));
  if (!arg) return 0;
  const n = Number(arg.split("=")[1]);
  if (!Number.isInteger(n) || n < 0) {
    console.error(`✗ --catch-up butun musbat son bo'lishi kerak, berilgani: "${arg.split("=")[1]}"`);
    process.exit(1);
  }
  return n;
}

async function main(): Promise<void> {
  const catchUpMonths = parseCatchUp();
  const admin = await prisma.user.findFirst({
    where: { role: { in: ["super_admin", "admin"] }, isActive: true },
    select: { id: true },
  });

  const templates = await prisma.deadlineTemplate.count({ where: { lifecycle: "active", active: true } });
  if (templates === 0) {
    console.error(
      "✗ Faol DeadlineTemplate yo'q — generatsiya qiladigan narsa yo'q.\n" +
        "    npx tsx scripts/seed-deadline-templates.ts --no-generate",
    );
    process.exit(1);
  }

  console.log(`\n📅 MAJBURIYAT GENERATSIYASI (faol shablon: ${templates}, catch-up: ${catchUpMonths} oy)\n`);
  const gen = await runGenerationLocked(prisma, { catchUpMonths, createdBy: admin?.id });

  if (gen.skipped === "locked") {
    // Jimgina "0 yaratildi" deb ketish eng yomoni: operator generatsiya
    // bo'ldi deb o'ylaydi, aslida boshqa jarayon lockni ushlab turibdi.
    console.error("✗ Boshqa jarayon generatsiya lockini ushlab turibdi (bot ishlayaptimi?).");
    console.error("    Botni to'xtating yoki bir necha daqiqadan keyin qayta urinib ko'ring.");
    await prisma.$disconnect();
    process.exit(1);
  }

  for (const r of gen.results ?? []) {
    console.log(`  ref=${r.ref.slice(0, 10)}`);
    console.log(`    shablon=${r.templatesConsidered}  yaroqli firma=${r.companiesEligible}`);
    console.log(
      `    yaratildi=${r.created}  mavjud(skip)=${r.skippedExisting}  mos emas(skip)=${r.skippedNotApplicable}  bekor=${r.cancelledNotApplicable}`,
    );
  }

  // ── Natija ──────────────────────────────────────────────────
  const total = await prisma.obligation.count();
  const byPeriod = await prisma.obligation.groupBy({ by: ["periodKey"], _count: true });
  console.log(`\nJami Obligation: ${total}`);
  for (const p of byPeriod.sort((a, b) => a.periodKey.localeCompare(b.periodKey))) {
    console.log(`  ${String(p._count).padStart(7)}  ${p.periodKey}`);
  }

  const upcoming = await prisma.obligation.findMany({
    orderBy: { dueAt: "asc" },
    take: 10,
    select: { dueAt: true, periodKey: true, template: { select: { name: true } } },
  });
  console.log("\nEng yaqin 10 muddat:");
  for (const o of upcoming) {
    console.log(`   ${o.dueAt.toISOString().slice(0, 10)}  ${o.periodKey.padEnd(8)} ${o.template.name}`);
  }

  const overdue = await prisma.obligation.count({
    where: { dueAt: { lt: new Date() }, status: { notIn: ["accepted", "cancelled"] } },
  });
  if (overdue > 0) {
    console.log(
      `\n⚠️  ${overdue} ta majburiyat allaqachon kechikkan holatda yaratildi.\n` +
        "    Bot yoqilgach soatlik sweep ular uchun qizil eskalatsiya yuboradi.\n" +
        "    Shablon effectiveFrom sanasini tekshiring (scripts/seed-deadline-templates.ts).",
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("generate-obligations failed:", e);
  process.exit(1);
});
