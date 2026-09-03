// =====================================================
// TASDIQLANMAGAN SHABLONLARNI QORALAMAGA QAYTARISH (bir martalik)
// =====================================================
//
// NIMA UCHUN. `scripts/seed-deadline-templates.ts` ilgari shablonni
// `lifecycle: "active"` qilib yaratardi va `approvedById` ga o'ZI
// Superadmin id'sini yozardi — ya'ni skript o'ziga tasdiq qo'yardi. Keyinroq
// o'sha yo'l qisman o'zgargan va ba'zi shablonlar `active`, lekin
// `approvedById = NULL` bo'lib qolgan: majburiyat yaratadi, ko'rikdan
// o'tgani esa hech qayerda qayd etilmagan.
//
// Bu skript AYNAN O'SHALARNI qoralamaga qaytaradi. Tasdiqlovchisi BOR
// yozuvlarga TEGMAYDI — ular boshqa savol (ularning tasdig'i haqiqiymi degan
// savol alohida ko'rib chiqiladi va bu skript uni hal qilmaydi).
//
// SOXTA TASDIQ YOZMAYDI. Skript hech qachon `approvedById` to'ldirmaydi;
// `active` holatga o'tkazish faqat `/admin/deadline-templates` orqali,
// haqiqiy odam tomonidan (`server/deadlineTemplates.ts` setLifecycle).
//
//   npx tsx scripts/revert-unapproved-templates.ts            # DRY-RUN
//   npx tsx scripts/revert-unapproved-templates.ts --apply    # yozadi
import "./load-env";
import { prisma } from "@/lib/prisma";

const APPLY = process.argv.includes("--apply");

/** Faqat shu shart: faol + lifecycle=active + tasdiqlovchisi YO'Q. */
const TARGET = {
  active: true,
  lifecycle: "active",
  approvedById: null,
} as const;

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const dbName = url.replace(/^.*\/([^/?]+).*$/, "$1");
  console.log(`Baza: ${dbName}`);
  console.log(APPLY ? "REJIM: --apply (yoziladi)" : "REJIM: DRY-RUN\n");

  const rows = await prisma.deadlineTemplate.findMany({
    where: TARGET,
    select: {
      id: true, code: true, name: true, lifecycle: true, active: true,
      approvedById: true, approvedAt: true, periodicity: true, createdBy: true,
    },
    orderBy: { code: "asc" },
  });

  // Tegilmasligi kerak bo'lganlar — oldin va keyin solishtirish uchun.
  const untouchedBefore = await prisma.deadlineTemplate.count({
    where: { approvedById: { not: null } },
  });

  console.log(`Nomzodlar (active + lifecycle=active + approvedById IS NULL): ${rows.length} ta`);
  for (const r of rows) {
    console.log(`  ${r.code.padEnd(16)} ${r.periodicity.padEnd(10)} ${r.name}`);
  }
  console.log(`\nTegilmaydiganlar (approvedById mavjud): ${untouchedBefore} ta`);

  if (!APPLY) {
    console.log("\nHech narsa o'zgarmadi. Bajarish uchun: --apply");
    await prisma.$disconnect();
    return;
  }
  if (rows.length === 0) {
    console.log("\nO'zgartiradigan narsa yo'q.");
    await prisma.$disconnect();
    return;
  }

  // Yozuv va audit izi BITTA tranzaksiyada: yarim bajarilgan holat qolmasin.
  const { changed, audited } = await prisma.$transaction(async (tx) => {
    let changed = 0;
    let audited = 0;
    for (const r of rows) {
      // Shartni yozish paytida QAYTA tekshiramiz: oradan kimdir shablonni
      // haqiqatan tasdiqlagan bo'lsa, uni orqaga qaytarib yubormaylik.
      const res = await tx.deadlineTemplate.updateMany({
        where: { id: r.id, ...TARGET },
        data: { lifecycle: "draft" },
      });
      if (res.count === 0) continue;
      changed += res.count;

      await tx.auditLog.create({
        data: {
          // Tizim amali — odam emas. Soxta muallif yozilmaydi.
          userId: null,
          action: "update",
          tableName: "DeadlineTemplate",
          recordId: r.id,
          oldData: {
            lifecycle: r.lifecycle,
            active: r.active,
            approvedById: r.approvedById,
            approvedAt: r.approvedAt?.toISOString() ?? null,
          },
          newData: {
            lifecycle: "draft",
            reason:
              "tasdiqlovchisiz aktiv shablon qoralamaga qaytarildi — " +
              "majburiyat yaratadigan shablon odam ko'rigidan o'tishi shart",
            script: "scripts/revert-unapproved-templates.ts",
            code: r.code,
          },
        },
      });
      audited += 1;
    }
    return { changed, audited };
  });

  // ── Tekshiruv ────────────────────────────────────────────────────────
  const [stillBad, untouchedAfter, nowDraft] = await Promise.all([
    prisma.deadlineTemplate.count({ where: TARGET }),
    prisma.deadlineTemplate.count({ where: { approvedById: { not: null } } }),
    prisma.deadlineTemplate.count({ where: { lifecycle: "draft", active: true } }),
  ]);

  console.log(`\n✓ Qoralamaga qaytarildi : ${changed} ta`);
  console.log(`✓ Audit yozuvi          : ${audited} ta`);
  console.log(`✓ Qolgan tasdiqsiz aktiv: ${stillBad} ta  (0 bo'lishi kerak)`);
  console.log(`✓ Tasdiqlovchisi borlar : ${untouchedBefore} → ${untouchedAfter}  (o'zgarmasligi kerak)`);
  console.log(`✓ Jami qoralama         : ${nowDraft} ta`);

  if (stillBad !== 0 || untouchedAfter !== untouchedBefore) {
    console.error("\n✗ TEKSHIRUV YIQILDI — yuqoridagi raqamlarni ko'ring.");
    process.exitCode = 1;
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
