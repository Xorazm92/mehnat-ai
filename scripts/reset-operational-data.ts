/**
 * OPERATSION MA'LUMOTNI TOZALASH — yangi hisob davriga toza start
 * ==============================================================
 * Nima o'chib, nima qolishi `lib/operationalTables.ts` da tasniflangan —
 * bu skript ham, `scripts/verify-clean-start.ts` ham o'sha yagona ro'yxatni
 * o'qiydi, shuning uchun "o'chirdim" bilan "o'chganini tekshirdim" hech qachon
 * bir-biridan uzoqlashmaydi.
 *
 * ⚠️  QAYTARIB BO'LMAYDI. Ishlatishdan oldin ALBATTA:
 *       bash scripts/backup.sh
 *
 * ISHLATISH:
 *   npx tsx scripts/reset-operational-data.ts                    # quruq hisobot
 *   npx tsx scripts/reset-operational-data.ts --apply --confirm=RESET
 *
 * `--confirm=RESET` ataylab: yolg'iz `--apply` ni tasodifan yozib yuborish
 * mumkin, ikkita mustaqil bayroqni esa yo'q.
 *
 * To'liq tartib (zaxira → seed → reset → verify → generatsiya → bot):
 *   docs/CLEAN_START_RUNBOOK.md
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import {
  OPERATIONAL_TABLES,
  REFERENCE_TABLES,
  AUDIT_MODEL,
} from "@/lib/operationalTables";

type Delegate = { count: () => Promise<number>; deleteMany: (args?: object) => Promise<{ count: number }> };
const delegate = (name: string): Delegate | undefined =>
  (prisma as unknown as Record<string, Delegate>)[name];

/**
 * Nom noto'g'ri bo'lsa jimgina o'tkazib yuborish eng yomon yakun: jadval
 * o'chmay qoladi, hisobotda esa ko'rinmaydi. `lib/operationalTables.spec.ts`
 * nomlarni schema bilan solishtiradi, shuning uchun bu yerga yetib kelgan
 * xato — kutilmagan holat va to'xtatish kerak.
 */
function requireDelegate(name: string): Delegate {
  const d = delegate(name);
  if (!d) {
    throw new Error(
      `Prisma modeli topilmadi: "${name}". lib/operationalTables.ts schema bilan mos emas — ` +
        `avval "npx vitest run lib/operationalTables.spec.ts" ni ishga tushiring.`,
    );
  }
  return d;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const confirmed = process.argv.includes("--confirm=RESET");
  const withAudit = process.argv.includes("--with-audit");

  const list = withAudit
    ? [...OPERATIONAL_TABLES, { model: AUDIT_MODEL, why: "audit izi" }]
    : OPERATIONAL_TABLES;

  console.log("\n🧹 OPERATSION MA'LUMOTNI TOZALASH\n");
  let total = 0;
  const counts: Array<{ t: { model: string; why: string }; n: number }> = [];
  for (const t of list) {
    const n = await requireDelegate(t.model).count();
    total += n;
    if (n > 0) counts.push({ t, n });
  }

  if (counts.length === 0) {
    console.log("✅ Tozalanadigan operatsion ma'lumot yo'q — baza allaqachon toza.");
    await prisma.$disconnect();
    return;
  }

  console.log("O'CHIRILADI:");
  for (const c of counts) {
    console.log(`  ${String(c.n).padStart(7)}  ${c.t.model.padEnd(28)} ${c.t.why}`);
  }
  console.log(`  ${String(total).padStart(7)}  JAMI`);

  // Saqlanadigan spravochnik — operator nima qolishini ko'rib turishi uchun.
  const keep: Array<[string, number]> = [];
  for (const m of REFERENCE_TABLES) {
    keep.push([m, await requireDelegate(m).count()]);
  }
  console.log("\nSAQLANADI (spravochnik):");
  for (const [m, n] of keep.filter(([, n]) => n > 0)) {
    console.log(`  ${String(n).padStart(7)}  ${m}`);
  }
  if (!withAudit) {
    const a = await requireDelegate(AUDIT_MODEL).count();
    console.log(`  ${String(a).padStart(7)}  auditLog  (--with-audit bilan o'chiriladi)`);
    console.log(`\n   ℹ️  Shu sonni yozib oling: verify uni --audit-min=${a} bilan tekshiradi.`);
  }

  const templates = await requireDelegate("deadlineTemplate").count();
  if (templates === 0) {
    console.log(
      "\n⚠️  DeadlineTemplate = 0 — majburiyat shablonlari yo'q, ya'ni tozalashdan\n" +
        "    keyin yangi majburiyatlar GENERATSIYA QILINMAYDI va bot muddat\n" +
        "    eslatmalarini yubora olmaydi. Avval shablonlarni kiriting:\n" +
        "      npx tsx scripts/seed-deadline-templates.ts --no-generate",
    );
  }

  if (!apply || !confirmed) {
    console.log(
      "\n— Quruq ishlash, hech narsa o'chirilmadi.\n" +
        "  Avval zaxira:  bash scripts/backup.sh\n" +
        "  So'ng:         npx tsx scripts/reset-operational-data.ts --apply --confirm=RESET",
    );
    await prisma.$disconnect();
    return;
  }

  console.log("\n⏳ O'chirilmoqda…");
  let deleted = 0;
  for (const c of counts) {
    const res = await requireDelegate(c.t.model).deleteMany({});
    deleted += res.count;
    console.log(`   ${String(res.count).padStart(7)}  ${c.t.model}`);
  }
  console.log(`\n✅ ${deleted} qator o'chirildi. Spravochnik tegilmadi.`);
  console.log(
    "   Keyingi qadamlar:\n" +
      "     npx tsx scripts/verify-clean-start.ts --audit-min=<yuqoridagi son>\n" +
      "     npx tsx scripts/generate-obligations.ts",
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("reset-operational-data failed:", e);
  process.exit(1);
});
