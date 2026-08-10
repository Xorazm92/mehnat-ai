/**
 * B4 · 1-BOSQICH — SOXTA PAYROLL MAJBURIYATLARI: PREVIEW (qat'iy READ-ONLY)
 * ========================================================================
 * Bekor qilinadigan yozuvlarni ANIQLAYDI va invariantlarni tekshiradi.
 * Hech narsa yozmaydi, o'zgartirmaydi, o'chirmaydi.
 *
 * NIMA UCHUN BU YOZUVLAR NOTO'G'RI:
 *   `PAYROLL_CALC` va `PAYROLL_POSTED` shablonlarida applicability mezoni yo'q
 *   → `templateApplies([])` → UNIVERSAL, ya'ni har bir yaroqli firmaga tushadi.
 *   Ikkalasi `period_end_offset` + `offsetDays: 0`, ya'ni muddat = davrning
 *   OXIRGI KUNI. 2026-M07 uchun bu 31-iyul — tizim ishga tushgan kunning o'zida
 *   allaqachon o'tgan. Bu ish iyulda tizimsiz bajarilgan; uni "kechikkan" deb
 *   yozib qo'yish noto'g'ri.
 *
 *   Sabab KODDA TUZATILGAN: shablonlarning effectiveFrom sanasi 2026-08-01 ga
 *   ko'chirilgan (scripts/seed-deadline-templates.ts, EFFECTIVE_FROM_IN_MONTH),
 *   shuning uchun bundan keyin M07 davri qayta yaratilmaydi. Lekin seed'ning
 *   `update:` shoxi faqat SHABLONNI yangilaydi — allaqachon yaratilgan
 *   Obligation qatorlariga tegmaydi. Ular bazada qolgan.
 *
 * ISHLATISH:
 *   npx tsx scripts/recovery-b4-preview.ts
 *   npx tsx scripts/recovery-b4-preview.ts --save .recovery/b4-baseline.json
 *
 * `--save` bilan: nomzod ID'lari va moliyaviy bazaviy holat JSON faylga
 * yoziladi (FAYLGA, bazaga emas). 2-bosqich AYNAN o'sha ro'yxat ustida
 * ishlaydi, 3-bosqich esa moliyaviy holatni shu bilan solishtiradi.
 */
import "./load-env";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ObligationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OPEN_OBLIGATION_STATUSES, canTransition } from "@/lib/obligationWorkflow";

// ── Tanlov mezonlari — bitta joyda, 2-bosqich ham shuni o'qiydi ──────────
export const B4_CRITERIA = {
  templateCodes: ["PAYROLL_CALC", "PAYROLL_POSTED"] as const,
  periodKey: "2026-M07",
  /** Faqat hali yakunlanmagan statuslar (accepted/cancelled — tegilmaydi). */
  openStatuses: OPEN_OBLIGATION_STATUSES,
  expectedCount: 425,
} as const;

export const B4_REASON =
  "Invalid PAYROLL obligation generated from expired PAYROLL template for 2026-M07; " +
  "cancelled during Production Recovery B4.";

const num = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "—");

/** Moliyaviy bazaviy holat — 3-bosqich shuni solishtiradi. */
export interface FinancialBaseline {
  kassaCount: number;
  kassaSum: number;
  paymentCount: number;
  paymentSum: number;
  ledgerRows: number;
  ledgerDebit: number;
  ledgerCredit: number;
  ledgerCashBalance: number;
  sourceBalance: number;
}

export async function readFinancialBaseline(): Promise<FinancialBaseline> {
  const [kassa, payment, ledger, cash, src] = await Promise.all([
    prisma.$queryRaw<{ cnt: number; total: number }[]>`
      SELECT count(*)::int AS cnt, coalesce(sum(amount), 0)::float8 AS total
        FROM "KassaEntry" WHERE "deletedAt" IS NULL`,
    prisma.$queryRaw<{ cnt: number; total: number }[]>`
      SELECT count(*)::int AS cnt, coalesce(sum(amount), 0)::float8 AS total
        FROM "Payment" WHERE "deletedAt" IS NULL`,
    prisma.$queryRaw<{ cnt: number; d: number; c: number }[]>`
      SELECT count(*)::int AS cnt, coalesce(sum(debit), 0)::float8 AS d,
             coalesce(sum(credit), 0)::float8 AS c
        FROM "LedgerEntry"`,
    prisma.$queryRaw<{ balance: number }[]>`
      SELECT coalesce(sum(debit) - sum(credit), 0)::float8 AS balance
        FROM "LedgerEntry" WHERE "accountId" = 'CASH'`,
    prisma.$queryRaw<{ balance: number }[]>`
      SELECT (
        coalesce((SELECT sum(amount) FROM "Payment"    WHERE "deletedAt" IS NULL AND status IN ('paid','partial')), 0)
      + coalesce((SELECT sum(amount) FROM "KassaEntry" WHERE "deletedAt" IS NULL AND type = 'income'), 0)
      - coalesce((SELECT sum(amount) FROM "KassaEntry" WHERE "deletedAt" IS NULL AND type = 'expense'), 0)
      - coalesce((SELECT sum(amount) FROM "Expense"    WHERE "deletedAt" IS NULL AND status = 'approved'), 0)
      - coalesce((SELECT sum(amount) FROM "Payout"     WHERE "deletedAt" IS NULL), 0)
      )::float8 AS balance`,
  ]);
  return {
    kassaCount: kassa[0].cnt,
    kassaSum: kassa[0].total,
    paymentCount: payment[0].cnt,
    paymentSum: payment[0].total,
    ledgerRows: ledger[0].cnt,
    ledgerDebit: ledger[0].d,
    ledgerCredit: ledger[0].c,
    ledgerCashBalance: cash[0].balance,
    sourceBalance: src[0].balance,
  };
}

/** Nomzodlarni MEZON bo'yicha tanlaydi (2-bosqich ham shu funksiyani chaqiradi). */
export async function selectCandidates() {
  return prisma.obligation.findMany({
    where: {
      periodKey: B4_CRITERIA.periodKey,
      status: { in: [...B4_CRITERIA.openStatuses] },
      template: { code: { in: [...B4_CRITERIA.templateCodes] } },
    },
    select: {
      id: true,
      companyId: true,
      periodKey: true,
      status: true,
      dueAt: true,
      firstOverdueAt: true,
      responsibleUserId: true,
      template: { select: { code: true, name: true, obligationType: true } },
      company: { select: { name: true } },
    },
    orderBy: [{ template: { code: "asc" } }, { companyId: "asc" }],
  });
}

async function main(): Promise<void> {
  const now = new Date();
  const saveIdx = process.argv.indexOf("--save");
  const savePath = saveIdx >= 0 ? process.argv[saveIdx + 1] : undefined;

  console.log();
  console.log("╔════════════════════════════════════════════════════════════════════════╗");
  console.log("║  B4 · 1-BOSQICH — SOXTA PAYROLL PREVIEW            (READ-ONLY)         ║");
  console.log("╚════════════════════════════════════════════════════════════════════════╝");
  console.log(`  Vaqt : ${now.toISOString().slice(0, 19).replace("T", " ")}`);
  console.log(`  Mezon: periodKey=${B4_CRITERIA.periodKey}`);
  console.log(`         template.code ∈ {${B4_CRITERIA.templateCodes.join(", ")}}`);
  console.log(`         status ∈ {${B4_CRITERIA.openStatuses.join(", ")}}`);
  console.log();

  const candidates = await selectCandidates();

  // ── Butun PAYROLL to'plami: nima tanlandi, nima TASHLAB KETILDI ────────
  const allPayroll = await prisma.obligation.findMany({
    where: { template: { code: { in: [...B4_CRITERIA.templateCodes] } } },
    select: {
      id: true,
      periodKey: true,
      status: true,
      dueAt: true,
      template: { select: { code: true } },
      company: { select: { name: true } },
    },
  });
  const candidateIds = new Set(candidates.map((c) => c.id));
  const spared = allPayroll.filter((o) => !candidateIds.has(o.id));

  // ── Status va shablon kesimi ──────────────────────────────────────────
  const byTemplate = new Map<string, number>();
  const byStatus = new Map<string, number>();
  for (const c of candidates) {
    byTemplate.set(c.template.code, (byTemplate.get(c.template.code) ?? 0) + 1);
    byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1);
  }

  console.log("  ── Nomzodlar kesimi ────────────────────────────────────────────────");
  console.log("     shablon                 soni");
  for (const [k, v] of [...byTemplate].sort()) console.log(`     ${k.padEnd(22)} ${String(v).padStart(5)}`);
  console.log();
  console.log("     status                  soni     cancelled ga o'tish qonuniymi");
  for (const [k, v] of [...byStatus].sort()) {
    const legal = canTransition(k as ObligationStatus, "cancelled");
    console.log(`     ${k.padEnd(22)} ${String(v).padStart(5)}     ${legal ? "ha" : "YO'Q ✗"}`);
  }
  console.log();

  // ── INVARIANTLAR ──────────────────────────────────────────────────────
  const nonPayroll = candidates.filter(
    (c) => !(B4_CRITERIA.templateCodes as readonly string[]).includes(c.template.code),
  ).length;
  const nonM07 = candidates.filter((c) => c.periodKey !== B4_CRITERIA.periodKey).length;
  const m08 = candidates.filter((c) => c.periodKey === "2026-M08").length;
  // "Haqiqiy kechikkan" — PAYROLL bo'lmagan, muddati o'tgan majburiyatlar.
  // Ular nomzodlar ro'yxatiga TUSHMASLIGI shart.
  const realOverdueTotal = await prisma.obligation.count({
    where: {
      dueAt: { lt: now },
      status: { in: OPEN_OBLIGATION_STATUSES },
      template: { code: { notIn: [...B4_CRITERIA.templateCodes] } },
    },
  });
  const realOverdueInCandidates = candidates.filter(
    (c) => !(B4_CRITERIA.templateCodes as readonly string[]).includes(c.template.code),
  ).length;
  const illegalTransition = candidates.filter(
    (c) => !canTransition(c.status as ObligationStatus, "cancelled"),
  ).length;
  const notOverdue = candidates.filter((c) => c.dueAt >= now).length;

  const invariants: [string, number, number][] = [
    ["candidate_count", candidates.length, B4_CRITERIA.expectedCount],
    ["non_PAYROLL_candidates", nonPayroll, 0],
    ["non_2026_M07_candidates", nonM07, 0],
    ["real_overdue_candidates", realOverdueInCandidates, 0],
    ["M08_candidates", m08, 0],
    ["illegal_transition_candidates", illegalTransition, 0],
    ["candidates_not_yet_overdue", notOverdue, 0],
  ];

  console.log("  ── INVARIANTLAR ────────────────────────────────────────────────────");
  let allOk = true;
  for (const [name, actual, expected] of invariants) {
    const ok = actual === expected;
    if (!ok) allOk = false;
    console.log(`     ${ok ? "✓" : "✗"} ${name.padEnd(32)} ${String(actual).padStart(6)}  (kutilgan ${expected})`);
  }
  console.log();

  // ── Tegilmaydigan yozuvlar — nima uchun ───────────────────────────────
  console.log("  ── TEGILMAYDI (PAYROLL, lekin mezonga tushmadi) ────────────────────");
  if (spared.length === 0) {
    console.log("     (yo'q — barcha PAYROLL yozuvlari nomzod)");
  } else {
    for (const s of spared) {
      const why =
        s.periodKey !== B4_CRITERIA.periodKey
          ? `boshqa davr (${s.periodKey})`
          : !(B4_CRITERIA.openStatuses as readonly string[]).includes(s.status)
            ? `status "${s.status}" — yakunlangan, dalil saqlanadi`
            : "noma'lum";
      console.log(`     ${s.template.code.padEnd(16)} ${s.periodKey.padEnd(9)} ${s.status.padEnd(12)} ${why}`);
      console.log(`       firma: ${s.company.name}`);
    }
  }
  console.log();

  // ── Haqiqiy kechikkanlar tegilmaganini tasdiqlash ────────────────────
  console.log("  ── HAQIQIY KECHIKKANLAR (tegilmaydi) ───────────────────────────────");
  const realByTemplate = await prisma.obligation.groupBy({
    by: ["templateId"],
    where: {
      dueAt: { lt: now },
      status: { in: OPEN_OBLIGATION_STATUSES },
      template: { code: { notIn: [...B4_CRITERIA.templateCodes] } },
    },
    _count: { _all: true },
  });
  const tplNames = await prisma.deadlineTemplate.findMany({
    where: { id: { in: realByTemplate.map((r) => r.templateId) } },
    select: { id: true, code: true },
  });
  const codeOf = new Map(tplNames.map((t) => [t.id, t.code]));
  for (const r of realByTemplate.sort((a, b) => b._count._all - a._count._all)) {
    console.log(`     ${(codeOf.get(r.templateId) ?? "?").padEnd(22)} ${String(r._count._all).padStart(5)}`);
  }
  console.log(`     ${"JAMI".padEnd(22)} ${String(realOverdueTotal).padStart(5)}`);
  console.log();

  // ── 2026-M08 holati ───────────────────────────────────────────────────
  const m08Total = await prisma.obligation.count({ where: { periodKey: "2026-M08" } });
  console.log(`  ── 2026-M08 majburiyatlari: ${m08Total} ta (B3 hali ishlamagan bo'lsa 0 bo'lishi kerak)`);
  console.log();

  // ── Moliyaviy bazaviy holat ───────────────────────────────────────────
  const baseline = await readFinancialBaseline();
  console.log("  ── MOLIYAVIY BAZAVIY HOLAT (3-bosqich shuni solishtiradi) ──────────");
  console.log(`     KassaEntry     : ${baseline.kassaCount} qator · ${num(baseline.kassaSum)} so'm`);
  console.log(`     Payment        : ${baseline.paymentCount} qator · ${num(baseline.paymentSum)} so'm`);
  console.log(`     LedgerEntry    : ${baseline.ledgerRows} qator · D ${num(baseline.ledgerDebit)} / K ${num(baseline.ledgerCredit)}`);
  console.log(`     Jurnal CASH    : ${num(baseline.ledgerCashBalance)} so'm`);
  console.log(`     Manba balansi  : ${num(baseline.sourceBalance)} so'm`);
  console.log();

  // ── Namuna qatorlar ───────────────────────────────────────────────────
  console.log("  ── NAMUNA (birinchi 5 nomzod) ──────────────────────────────────────");
  console.log("     id                                    shablon         status    muddat      1-kechikish");
  for (const c of candidates.slice(0, 5)) {
    console.log(
      `     ${c.id}  ${c.template.code.padEnd(15)} ${c.status.padEnd(9)} ${iso(c.dueAt)}  ${iso(c.firstOverdueAt)}`,
    );
  }
  console.log(`     … jami ${candidates.length} ta`);
  console.log();

  // ── Saqlash ───────────────────────────────────────────────────────────
  if (savePath) {
    mkdirSync(dirname(savePath), { recursive: true });
    writeFileSync(
      savePath,
      JSON.stringify(
        {
          generatedAt: now.toISOString(),
          criteria: B4_CRITERIA,
          reason: B4_REASON,
          invariantsPassed: allOk,
          candidateCount: candidates.length,
          candidateIds: candidates.map((c) => c.id),
          candidates: candidates.map((c) => ({
            id: c.id,
            companyId: c.companyId,
            companyName: c.company.name,
            template: c.template.code,
            obligationType: c.template.obligationType,
            periodKey: c.periodKey,
            status: c.status,
            dueAt: c.dueAt.toISOString(),
            firstOverdueAt: c.firstOverdueAt?.toISOString() ?? null,
            responsibleUserId: c.responsibleUserId,
          })),
          realOverdueTotal,
          m08Total,
          baseline,
        },
        null,
        2,
      ),
    );
    console.log(`  ✓ Bazaviy holat saqlandi: ${savePath}`);
    console.log("    (FAYLGA yozildi — bazaga emas)");
    console.log();
  }

  // ── Hukm ──────────────────────────────────────────────────────────────
  if (!allOk) {
    console.error("  ✗ INVARIANT BUZILDI — TO'XTATILDI. 2-bosqichga o'tmang.");
    console.error("    Mezonni qayta ko'rib chiqing yoki bazadagi holat o'zgargan.");
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log("  ✓ Barcha invariantlar joyida.");
  console.log(`    ${candidates.length} ta yozuv bekor qilishga tayyor.`);
  console.log("    Keyingi qadam (FAQAT tasdiqdan keyin):");
  console.log("      npx tsx scripts/recovery-b4-cancel.ts --baseline .recovery/b4-baseline.json --apply");
  console.log();

  await prisma.$disconnect();
}

// Bu modul 2- va 3-bosqich skriptlariga mezon/baseline funksiyalarini eksport
// qiladi. `main()` faqat fayl TO'G'RIDAN-TO'G'RI ishga tushirilganda yuguradi —
// aks holda import qilishning o'zi to'liq preview'ni chiqarib yuborardi.
const isEntrypoint = process.argv[1]?.endsWith("recovery-b4-preview.ts") ?? false;

if (isEntrypoint) {
  main().catch(async (e) => {
    console.error("\n✗ b4-preview yiqildi:", e instanceof Error ? e.message : e);
    await prisma.$disconnect().catch(() => {});
    process.exit(2);
  });
}
