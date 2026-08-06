// =====================================================
// BACKFILL: MonthlyReport kataklari → Obligation holatlari (B2)
// =====================================================
// `matrix_read_projection` bayrog'i yoqilganda qoplangan ustunlarda HAQIQAT
// majburiyat bo'ladi. Ya'ni bayroqni yoqishdan oldin bugungi matritsadagi
// qiymatlar majburiyat holatiga ko'chirilishi SHART — aks holda yoqish
// foydalanuvchi uchun "ma'lumot o'chib ketdi" bo'lib ko'rinadi.
//
// DRY-RUN BIRLAMCHI. `--apply` berilmasa hamma yozuv tranzaksiya ichida
// bajariladi va oxirida QAYTARILADI. Ya'ni "quruq" ishga tushirish taxmin
// emas — u haqiqiy kodni haqiqiy ma'lumotda bajaradi, keyin izini o'chiradi.
//
// NEGA `generateObligations` CHAQIRILADI, LEKIN CHEKLANGAN HOLDA.
// Reja uni chaqirmaslikni maslahat beradi, sababi: `effectiveFrom` filtri
// tarixiy davrni JIMGINA tashlab ketadi. Muammo chaqiruvda emas, JIMLIKDA —
// shuning uchun u chaqiriladi (muddat, override, mas'ul snapshot mantig'ini
// takrorlamaslik uchun), lekin majburiyatsiz qolgan HAR katak hisobotda
// ko'rinadi. Ular ikkiga ajratiladi: `effectiveFrom` dan oldingi tarix
// (xavfsiz — eski qiymat joyida qoladi) va haqiqiy bo'shliq (darvozani
// yopadi). Bu farq muhim: birinchisi kutilgan, ikkinchisi nuqson.
//
// Subyekt yuklovchi FAQAT o'sha davrda hisobot qatori bor firmalarga
// cheklanadi: backfill 3 ta katak uchun 213 firmaga tarixiy majburiyat
// yaratmasligi kerak.
//
// Ishga tushirish:
//   npx tsx scripts/backfill-matrix-obligations.ts            # dry-run
//   npx tsx scripts/backfill-matrix-obligations.ts --apply
//   npx tsx scripts/backfill-matrix-obligations.ts --period=2026-03
import "./load-env";
import { prisma } from "@/lib/prisma";
import { generateObligations } from "@/lib/engines/obligation/obligations";
import { toSubject } from "@/lib/domains/accounting/subjects";
import { applyCellWrite, meaningOf } from "@/lib/domains/accounting/matrixWrite";
import { mapMonthlyReportToOperationEntry } from "@/lib/operationTemplates";
import { toYearMonthKey } from "@/lib/periods";
import { CELL_EMPTY } from "@/lib/reportPermissions";
import type { Prisma } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const PERIOD = process.argv.find((a) => a.startsWith("--period="))?.slice(9) ?? null;

/** Tranzaksiyani qaytarish uchun — xato emas, signal. */
const ROLLBACK = Symbol("dry-run rollback");

interface Cell {
  companyId: string;
  /** `"YYYY-MM"`. */
  period: string;
  matrixKey: string;
  value: string;
}

async function collectCells(): Promise<{ cells: Cell[]; coveredKeys: string[] }> {
  const templates = await prisma.deadlineTemplate.findMany({
    where: { lifecycle: "active", matrixKey: { not: null } },
    select: { matrixKey: true },
  });
  const coveredKeys = [...new Set(templates.map((t) => t.matrixKey as string))];

  const reports = await prisma.monthlyReport.findMany();
  const cells: Cell[] = [];
  for (const r of reports) {
    const entry = mapMonthlyReportToOperationEntry(r) as unknown as Record<string, unknown>;
    const period = toYearMonthKey(String(entry.period ?? ""));
    if (!period) continue;
    if (PERIOD && period !== PERIOD) continue;

    for (const key of coveredKeys) {
      const raw = entry[key];
      if (raw == null) continue;
      const value = String(raw).trim();
      // `""` va `"0"` — bo'sh katak, majburiyatning standart holati bilan bir
      // xil. Ularni ko'chirish hech nima o'zgartirmaydi.
      if (!value || value === CELL_EMPTY) continue;
      // Erkin matn — izoh, holat emas.
      if (meaningOf(value).status === null) continue;
      cells.push({ companyId: String(entry.companyId), period, matrixKey: key, value });
    }
  }
  return { cells, coveredKeys };
}

async function run(db: Prisma.TransactionClient, cells: Cell[]) {
  const byPeriod = new Map<string, Cell[]>();
  for (const c of cells) {
    const list = byPeriod.get(c.period) ?? [];
    list.push(c);
    byPeriod.set(c.period, list);
  }

  const created: string[] = [];
  const applied: string[] = [];
  const unchanged: string[] = [];
  const legacy: string[] = [];
  const missing: string[] = [];

  for (const [period, list] of [...byPeriod.entries()].sort()) {
    const companyIds = [...new Set(list.map((c) => c.companyId))];
    const [y, m] = period.split("-").map(Number);
    // Oy o'rtasi — davr oynasi chegara kunlarida noaniq bo'lmasin.
    const ref = new Date(Date.UTC(y, m - 1, 15));

    const res = await generateObligations(db, {
      ref,
      loadSubjects: async () => {
        const rows = await db.company.findMany({
          where: { id: { in: companyIds } },
          select: {
            id: true, isActive: true, companyStatus: true, contractDate: true,
            taxRegime: true, statsType: true, activeServices: true,
            accountantId: true, supervisorId: true, chiefAccountantId: true,
          },
        });
        return rows.map(toSubject);
      },
    });
    created.push(`${period}: ${res.created} yaratildi, ${res.skippedExisting} bor edi`);

    for (const c of list) {
      const out = await applyCellWrite(db, {
        companyId: c.companyId,
        period: c.period,
        matrixKey: c.matrixKey,
        value: c.value,
      });
      const label = `${c.period} ${c.companyId.slice(0, 8)} ${c.matrixKey}=${c.value}`;
      // `no_template` — o'sha DAVRDA amal qilgan template yo'q (odatda
      // `effectiveFrom` dan oldingi tarix). Bu nuqson EMAS: majburiyat u
      // davrga da'vogar emas, va `overlayObligations` ham unga tegmaydi —
      // u faqat majburiyati BOR kataklarni bosadi. Eski qiymat o'z joyida
      // qoladi, ya'ni bayroq yoqilganda bu katak o'zgarmaydi.
      if (!out.ok && out.reason === "no_template") legacy.push(`${label} → eski qiymat qoladi`);
      else if (!out.ok) missing.push(`${label} → ${out.reason} (${out.detail})`);
      else if ("skipped" in out) unchanged.push(`${label} → izoh`);
      else if (out.from === out.to) unchanged.push(`${label} → allaqachon ${out.to}`);
      else applied.push(`${label} → ${out.from} → ${out.to}`);
    }
  }

  return { created, applied, unchanged, legacy, missing };
}

async function main() {
  const { cells, coveredKeys } = await collectCells();
  console.log(`Rejim            : ${APPLY ? "APPLY (yoziladi)" : "DRY-RUN (qaytariladi)"}`);
  console.log(`Qoplangan ustun  : ${coveredKeys.length}`);
  console.log(`Ko'chiriladigan  : ${cells.length} katak\n`);

  if (cells.length === 0) {
    console.log("Ko'chiradigan narsa yo'q.");
    return;
  }

  let report: Awaited<ReturnType<typeof run>> | null = null;
  try {
    await prisma.$transaction(
      async (tx) => {
        report = await run(tx, cells);
        if (!APPLY) throw ROLLBACK;
      },
      { timeout: 180_000, maxWait: 30_000 },
    );
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
  if (!report) throw new Error("hisobot yig'ilmadi");

  const r = report as Awaited<ReturnType<typeof run>>;
  const show = (title: string, lines: string[]) => {
    console.log(`${title} (${lines.length})`);
    for (const l of lines) console.log(`  ${l}`);
    console.log("");
  };
  show("Majburiyat generatsiyasi", r.created);
  show("Holat ko'chirildi", r.applied);
  show("O'zgarishsiz", r.unchanged);
  show("Eski qiymat qoladi (template o'sha davrda amal qilmagan)", r.legacy);
  show("MAJBURIYATI TOPILMADI", r.missing);

  // B blok darvozasi. FAQAT `missing` hisobga olinadi: template amal qilgan,
  // demak majburiyat bo'lishi kerak edi — bo'lmasa bayroq yoqilganda katak
  // haqiqatan bo'shab qoladi. `legacy` esa xavfsiz, yuqoridagi izohga qarang.
  if (r.missing.length > 0) {
    console.log(`⚠ ${r.missing.length} katakning majburiyati yo'q — bayroq YOQILMAYDI.`);
    process.exitCode = 1;
  } else {
    console.log("✓ Har bir katakning majburiyati bor.");
  }
  if (!APPLY) console.log("\nDRY-RUN: hech narsa saqlanmadi. Yozish uchun --apply.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
