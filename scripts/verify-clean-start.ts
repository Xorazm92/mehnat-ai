/**
 * CLEAN START TEKSHIRUVI — tozalash haqiqatan to'g'ri o'tganini isbotlaydi
 * ======================================================================
 * `reset-operational-data.ts` "o'chirdim" deydi. Bu skript esa buni mustaqil
 * tekshiradi va uchta savolga javob beradi:
 *
 *   1. Operatsion ma'lumot ROSTDAN ham 0 mi? (pul, ball, hisobot, xabar)
 *   2. Spravochnik JOYIDAMI? (User, Company, ContractAssignment, KpiRule,
 *      SystemSetting — bularsiz tizim ishlamaydi)
 *   3. DeadlineTemplate BORMI? (yo'q bo'lsa majburiyat generatsiya qilinmaydi
 *      va bot muddat eslatmasi yubora olmaydi — tozalash bexuda bo'ladi)
 *
 * Qaysi jadval qaysi chelakda ekani `lib/operationalTables.ts` da — reset
 * skripti ham o'sha ro'yxatni o'qiydi, shuning uchun ular ajralib keta olmaydi.
 *
 * AuditLog ALOHIDA tekshiriladi: u tozalanmasligi kerak. `--audit-min` bilan
 * reset'dan oldingi sonni bersangiz, qisman o'chish ham tutiladi ("> 0" yolg'iz
 * yetarli emas — 54 tadan 3 tasi qolsa ham "> 0" rost bo'ladi).
 *
 * ISHLATISH:
 *   npx tsx scripts/verify-clean-start.ts --audit-min=54
 *       → reset'dan keyin: majburiyat ham 0 bo'lishi kerak
 *   npx tsx scripts/verify-clean-start.ts post-generate --audit-min=54
 *       → generate-obligations.ts dan keyin: majburiyat > 0 bo'lishi kerak
 *
 * Xato bo'lsa exit(1), hammasi joyida bo'lsa "✓ CLEAN START OK".
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import {
  OPERATIONAL_TABLES,
  REFERENCE_TABLES,
  REQUIRED_REFERENCE,
  AUDIT_MODEL,
} from "@/lib/operationalTables";

type Level = "error" | "warn";
interface Problem {
  level: Level;
  msg: string;
}
const problems: Problem[] = [];
const err = (msg: string) => problems.push({ level: "error", msg });
const warn = (msg: string) => problems.push({ level: "warn", msg });

type Delegate = { count: (args?: object) => Promise<number> };
function delegate(name: string): Delegate {
  const d = (prisma as unknown as Record<string, Delegate>)[name];
  if (!d) {
    throw new Error(
      `Prisma modeli topilmadi: "${name}". lib/operationalTables.ts schema bilan mos emas — ` +
        `"npx vitest run lib/operationalTables.spec.ts" ni ishga tushiring.`,
    );
  }
  return d;
}

function parseAuditMin(): number | null {
  const arg = process.argv.find((a) => a.startsWith("--audit-min="));
  if (!arg) return null;
  const n = Number(arg.split("=")[1]);
  if (!Number.isInteger(n) || n < 0) {
    console.error(`✗ --audit-min butun musbat son bo'lishi kerak, berilgani: "${arg.split("=")[1]}"`);
    process.exit(1);
  }
  return n;
}

/** 1. Operatsion jadvallar bo'sh. */
async function checkOperational(postGenerate: boolean): Promise<void> {
  const blocking: Array<[string, number]> = [];
  const refilled: Array<[string, number]> = [];
  for (const t of OPERATIONAL_TABLES) {
    // post-generate rejimida majburiyatning O'ZI to'lgan bo'lishi kerak;
    // uning bola jadvallari (topshirish/hodisa) esa baribir bo'sh — ular
    // workflow davomida paydo bo'ladi, generatsiyada emas.
    if (postGenerate && t.model === "obligation") continue;
    const n = await delegate(t.model).count();
    if (n === 0) continue;
    (t.refillsWhenLive ? refilled : blocking).push([t.model, n]);
  }

  if (blocking.length > 0) {
    const rows = blocking.map(([m, n]) => `      ${String(n).padStart(7)}  ${m}`).join("\n");
    err(
      `Operatsion ma'lumot qolgan (${blocking.length} jadval):\n${rows}\n` +
        "    Tozalash to'liq o'tmagan. Qayta ishga tushiring:\n" +
        "      npx tsx scripts/reset-operational-data.ts --apply --confirm=RESET",
    );
  } else {
    const checked = OPERATIONAL_TABLES.length - (postGenerate ? 1 : 0);
    console.log(`  ✓ operatsion jadvallar bo'sh (${checked} ta tekshirildi)`);
  }

  // Bular tizim ishga tushgach o'z-o'zidan to'ladi. Xato DEB HISOBLAMAYMIZ:
  // aks holda bot yoqilgandan keyingi tekshiruv operatorga prod resetini
  // QAYTA bosishni maslahat berardi — tozalash aslida joyida bo'lsa ham.
  if (refilled.length > 0) {
    const rows = refilled.map(([m, n]) => `  ${String(n).padStart(7)}  ${m}`).join("\n");
    warn(
      `Tizim ishga tushgandan keyin qayta to'lgan jadvallar (bu NORMAL, reset qayta kerak emas):\n${rows}\n` +
        "  Eslatma/xabar oqimi tiklangan. Agar hali hech narsa ishga tushmagan bo'lishi\n" +
        "  kerak bo'lsa, pm2 holatini tekshiring.",
    );
  }
}

/** 2. Spravochnik joyida. */
async function checkReference(): Promise<void> {
  const empty: string[] = [];
  const present: Array<[string, number]> = [];
  for (const m of REFERENCE_TABLES) {
    const n = await delegate(m).count();
    if (n > 0) present.push([m, n]);
    if (REQUIRED_REFERENCE.includes(m) && n === 0) empty.push(m);
  }
  if (empty.length > 0) {
    err(
      `Spravochnik BO'SH: ${empty.join(", ")}.\n` +
        "    Bular tozalashda o'chmasligi kerak edi — zaxiradan tiklang:\n" +
        "      pg_restore --clean --no-owner --dbname=\"$DATABASE_URL\" backups/daily/<fayl>.dump",
    );
  }
  console.log("  ✓ spravochnik:");
  for (const [m, n] of present) console.log(`      ${String(n).padStart(7)}  ${m}`);
}

/** 3. Muddat shablonlari bor va generatsiyaga yaroqli. */
async function checkTemplates(): Promise<void> {
  const total = await prisma.deadlineTemplate.count();
  if (total === 0) {
    err(
      "DeadlineTemplate = 0 — majburiyat generatsiya qilinmaydi va bot muddat\n" +
        "    eslatmalarini yubora olmaydi. Shablonlarni ekin:\n" +
        "      npx tsx scripts/seed-deadline-templates.ts --no-generate",
    );
    return;
  }
  const usable = await prisma.deadlineTemplate.count({ where: { lifecycle: "active", active: true } });
  if (usable === 0) {
    err(
      `DeadlineTemplate ${total} ta, lekin birortasi ham lifecycle=active + active=true emas.\n` +
        "    Generator faqat shundaylarni oladi (lib/obligations.ts) — natija baribir 0 bo'ladi.",
    );
    return;
  }
  console.log(`  ✓ DeadlineTemplate: ${usable} faol (jami ${total})`);

  // Kelajakdagi effectiveFrom — hozircha generatsiyaga tushmaydi, bu normal
  // (clean-start chegarasi), lekin operator buni bilib turishi kerak.
  const future = await prisma.deadlineTemplate.findMany({
    where: { lifecycle: "active", active: true, effectiveFrom: { gt: new Date() } },
    select: { code: true, effectiveFrom: true },
    orderBy: { effectiveFrom: "asc" },
  });
  if (future.length > 0) {
    const rows = future.map((t) => `${t.code} (${t.effectiveFrom.toISOString().slice(0, 10)})`).join(", ");
    console.log(`      ℹ️  hali kuchga kirmagan: ${rows}`);
  }
}

/** 4. Audit izi saqlangan. */
async function checkAudit(auditMin: number | null): Promise<void> {
  const n = await delegate(AUDIT_MODEL).count();
  if (auditMin !== null) {
    if (n < auditMin) {
      err(
        `AuditLog = ${n}, kutilgani >= ${auditMin} — audit izi qisman yoki to'liq o'chgan.\n` +
          "    Reset `--with-audit` bilan ishlatilganmi? Zaxiradan tiklash kerak.",
      );
      return;
    }
    console.log(`  ✓ AuditLog: ${n} (>= ${auditMin}, saqlangan)`);
    return;
  }
  if (n === 0) {
    err(
      "AuditLog = 0 — audit izi o'chgan (yoki hech qachon yozilmagan).\n" +
        "    Aniq tekshirish uchun reset'dan oldingi sonni bering: --audit-min=<son>",
    );
    return;
  }
  console.log(`  ✓ AuditLog: ${n} (--audit-min berilmadi, faqat "> 0" tekshirildi)`);
}

/** 5. Generatsiyani jimgina nolga aylantiradigan sabab: contractDate yo'q. */
async function checkEligibility(): Promise<void> {
  const active = await prisma.company.count({ where: { isActive: true } });
  const noDate = await prisma.company.count({ where: { isActive: true, contractDate: null } });
  if (noDate > 0) {
    warn(
      `${noDate}/${active} faol firmada contractDate yo'q — isCompanyEligible ularni\n` +
        "  chetlab o'tadi, ya'ni majburiyat yaratilmaydi. Backfill:\n" +
        "    npx tsx scripts/seed-deadline-templates.ts --no-generate",
    );
  } else {
    console.log(`  ✓ ${active} faol firmaning hammasida contractDate bor`);
  }
  const noAccountant = await prisma.company.count({ where: { isActive: true, accountantId: null } });
  if (noAccountant > 0) {
    warn(
      `${noAccountant}/${active} faol firmada buxgalter biriktirilmagan — ularning\n` +
        "  majburiyatlari mas'ulsiz yaratiladi va shaxsiy eslatma bormaydi.",
    );
  }
}

/** post-generate: majburiyatlar yaratilganini tasdiqlash. */
async function checkGenerated(): Promise<void> {
  const total = await prisma.obligation.count();
  if (total === 0) {
    err(
      "Obligation = 0 — generatsiya natija bermadi.\n" +
        "    npx tsx scripts/generate-obligations.ts",
    );
    return;
  }
  const byPeriod = await prisma.obligation.groupBy({ by: ["periodKey"], _count: true });
  console.log(`  ✓ Obligation: ${total}`);
  for (const p of byPeriod.sort((a, b) => a.periodKey.localeCompare(b.periodKey))) {
    console.log(`      ${String(p._count).padStart(7)}  ${p.periodKey}`);
  }

  const overdue = await prisma.obligation.count({
    where: { dueAt: { lt: new Date() }, status: { notIn: ["accepted", "cancelled"] } },
  });
  if (overdue > 0) {
    warn(
      `${overdue} ta majburiyat allaqachon kechikkan holatda yaratildi — bot yoqilgach\n` +
        "  soatlik sweep ular uchun qizil eskalatsiya yuboradi. Shablon effectiveFrom\n" +
        "  sanasini tekshiring yoki ularni yopib qo'ying.",
    );
  }
  const noOwner = await prisma.obligation.count({ where: { responsibleUserId: null } });
  if (noOwner > 0) {
    warn(`${noOwner} ta majburiyatda mas'ul yo'q — ular hech kimga eslatilmaydi.`);
  }
}

async function main(): Promise<void> {
  const postGenerate = process.argv[2] === "post-generate";
  const auditMin = parseAuditMin();

  console.log(
    `\n🔍 CLEAN START TEKSHIRUVI${postGenerate ? " (generatsiyadan keyin)" : " (reset'dan keyin)"}\n`,
  );

  await checkOperational(postGenerate);
  await checkReference();
  await checkTemplates();
  await checkAudit(auditMin);
  await checkEligibility();
  if (postGenerate) await checkGenerated();

  const errors = problems.filter((p) => p.level === "error");
  const warns = problems.filter((p) => p.level === "warn");

  if (warns.length > 0) console.log("");
  for (const w of warns) console.warn(`⚠ ${w.msg}`);
  if (errors.length > 0) console.log("");
  for (const e of errors) console.error(`✗ ${e.msg}`);

  await prisma.$disconnect();

  if (errors.length > 0) {
    console.error(`\n✗ CLEAN START FAILED — ${errors.length} ta xato. Davom etmang.`);
    process.exit(1);
  }
  console.log(
    `\n✓ CLEAN START OK${warns.length > 0 ? ` (${warns.length} ta ogohlantirish bilan)` : ""}`,
  );
}

main().catch((e) => {
  console.error("✗ verify-clean-start crashed:", e?.message ?? e);
  process.exit(1);
});
