/**
 * KARTADAN BERILGAN OYLIKNI HISOBGA OLISH
 * =======================================
 *
 *   npx tsx scripts/post-transit-salary.ts            # hisobot, yozmaydi
 *   npx tsx scripts/post-transit-salary.ts --apply
 *
 * MUAMMO: `Payout` jadvali prodda BO'SH, lekin kartalardan oylik haqiqatan
 * berilgan — tranzit daftarida 840 mln so'mlik chiqim bor. Ya'ni `/payroll`
 * ekrani ortiqcha emas, u shunchaki ULANMAGAN edi: oylik Excel daftarida
 * yashab, tizimda umuman ko'rinmasdi.
 *
 * NIMA QILADI (`lib/transitSalary.ts` tasnifi bo'yicha):
 *
 *   self_salary   → `Payout`, xodim = kartaning egasi. Oluvchi shubhasiz.
 *   founder_draw  → `KassaEntry(expense)` toifa "Dividend" — bu OYLIK EMAS,
 *                   ta'sischiga taqsimot, shuning uchun `Payout` ga
 *                   yozilmaydi (aks holda u xodimlar oyligi qatoriga qo'shilib
 *                   o'rtacha maoshni buzardi).
 *   other_salary  → oluvchi izohdan topilsa `Payout`, topilmasa QOLDIRILADI.
 *   expense       → tegilmaydi; oddiy xarajat, alohida yo'l bilan yoziladi.
 *
 * BALANS: karta puli balansda TURIBDI (bankdan kartaga o'tkazma xarajat deb
 * sanalmagan — o'z cho'ntagimizdan o'z cho'ntagimizga). Oylik berilganda pul
 * haqiqatan chiqadi, shuning uchun `Payout`/`KassaEntry` balansni kamaytiradi
 * va bu TO'G'RI — ikki marta sanash yo'q.
 *
 * IDEMPOTENT: `Payout.note` ichida `transit:<id>` barqaror kaliti saqlanadi
 * (jadvalda `dedupKey` ustuni yo'q). `KassaEntry` uchun `dedupKey`.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { formatNum as som } from "@/lib/platform/format";
import { classifyTransitOutflow } from "@/lib/transitSalary";
import { ACCOUNTS, postLedger } from "@/lib/ledger";
import { periodKeyOf } from "@/lib/periods";

const norm = (s: string) => s.toLowerCase().replace(/[‘’'`]/g, "'").replace(/\s+/g, " ").trim();

/** Izohdagi ism ("Zamira opaga avans") xodimlar ro'yxatidan topiladi. */
function findEmployee(hint: string, staff: { id: string; fullName: string }[]) {
  const words = norm(hint)
    .split(" ")
    .filter((w) => w.length >= 4 && !["opaga", "akaga", "avans", "oylik", "uchun"].includes(w));
  if (words.length === 0) return null;

  // Bir nechta nomzod qolsa TANLANMAYDI — noto'g'ri moslik oylikni
  // begona odamga yozib qo'yardi.
  const hits = staff.filter((u) => {
    const full = norm(u.fullName);
    return words.some((w) => full.split(" ").some((part) => part.startsWith(w) || w.startsWith(part)));
  });
  return hits.length === 1 ? hits[0] : null;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const rows = await prisma.transitEntry.findMany({
    where: { direction: "out" },
    select: {
      id: true,
      amount: true,
      date: true,
      category: true,
      description: true,
      channelId: true,
      channel: { select: { label: true, employeeId: true } },
    },
    orderBy: { date: "asc" },
  });

  const staff = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, fullName: true },
  });

  const admin = await prisma.user.findFirst({
    where: { role: "super_admin", isActive: true },
    select: { id: true },
  });

  const buckets = {
    self: [] as typeof rows,
    founder: [] as typeof rows,
    other: [] as { row: (typeof rows)[number]; employeeId: string }[],
    manual: [] as { row: (typeof rows)[number]; why: string }[],
    expense: [] as typeof rows,
  };

  for (const r of rows) {
    const v = classifyTransitOutflow(r.category, r.description);

    if (v.kind === "founder_draw") {
      buckets.founder.push(r);
      continue;
    }
    if (v.kind === "self_salary") {
      if (r.channel?.employeeId) buckets.self.push(r);
      else buckets.manual.push({ row: r, why: "karta xodimga bog'lanmagan" });
      continue;
    }
    if (v.kind === "other_salary") {
      const hint = v.payeeHint;
      if (!hint) {
        buckets.manual.push({ row: r, why: "oluvchi ko'rsatilmagan" });
        continue;
      }
      const emp = findEmployee(hint, staff);
      if (emp) buckets.other.push({ row: r, employeeId: emp.id });
      else buckets.manual.push({ row: r, why: `oluvchi topilmadi: "${hint}"` });
      continue;
    }
    buckets.expense.push(r);
  }

  const sum = (list: { amount: unknown }[]) =>
    list.reduce((s, r) => s + Number((r as { amount: unknown }).amount), 0);

  console.log();
  console.log("KARTA CHIQIMI — tasnif");
  console.log("─".repeat(64));
  console.log(`  o'ziga oylik      ${String(buckets.self.length).padStart(4)} ta  ${som(sum(buckets.self)).padStart(14)}`);
  console.log(`  boshqaga oylik    ${String(buckets.other.length).padStart(4)} ta  ${som(sum(buckets.other.map((o) => o.row))).padStart(14)}`);
  console.log(`  ta'sischiga       ${String(buckets.founder.length).padStart(4)} ta  ${som(sum(buckets.founder)).padStart(14)}`);
  console.log(`  QO'LDA ko'riladi  ${String(buckets.manual.length).padStart(4)} ta  ${som(sum(buckets.manual.map((m) => m.row))).padStart(14)}`);
  console.log(`  oddiy xarajat     ${String(buckets.expense.length).padStart(4)} ta  ${som(sum(buckets.expense)).padStart(14)}  (tegilmaydi)`);

  if (buckets.manual.length) {
    console.log();
    console.log(`QO'LDA KO'RIB CHIQISH (${buckets.manual.length}):`);
    for (const m of buckets.manual.slice(0, 20)) {
      console.log(
        `   ${m.row.date.toISOString().slice(0, 10)} ${som(Number(m.row.amount)).padStart(12)}  ` +
          `${(m.row.channel?.label ?? "-").slice(0, 24).padEnd(25)}${m.why}`
      );
    }
    if (buckets.manual.length > 20) console.log(`   … yana ${buckets.manual.length - 20} ta`);
  }

  if (!apply) {
    console.log();
    console.log("Hech narsa yozilmadi. Yozish uchun: --apply");
    await prisma.$disconnect();
    return;
  }

  // ── OYLIK ──────────────────────────────────────────────────────────────
  let payouts = 0;
  let payoutSum = 0;
  const salaryRows = [
    ...buckets.self.map((r) => ({ row: r, employeeId: r.channel!.employeeId! })),
    ...buckets.other,
  ];

  for (const { row, employeeId } of salaryRows) {
    const key = `transit:${row.id}`;
    const existing = await prisma.payout.findFirst({
      where: { note: { contains: key } },
      select: { id: true },
    });
    if (existing) continue;

    const month = periodKeyOf(row.date);
    const created = await prisma.payout.create({
      data: {
        employeeId,
        month,
        amount: row.amount,
        paymentMethod: "plastik",
        // Manba jurnal oyog'ida allaqachon bor edi (pastdagi `postLedger`);
        // endi `Payout` qatorida ham saqlanadi, aks holda jadval va jurnal
        // bir savolga ikki xil javob berardi (reyestrda manba bo'sh,
        // kassalar jadvalida to'la).
        channelId: row.channelId,
        note: `Karta daftaridan: ${row.description ?? row.category ?? "oylik"} [${key}]`,
        paidAt: row.date,
        createdBy: admin?.id ?? null,
      },
      select: { id: true },
    });

    await postLedger(prisma as never, {
      legs: [
        { accountId: ACCOUNTS.SALARY_EXPENSE, debit: Number(row.amount), subjectId: employeeId },
        { accountId: ACCOUNTS.CASH, credit: Number(row.amount), channelId: row.channelId },
      ],
      period: month,
      sourceTable: "Payout",
      sourceId: created.id,
      createdBy: admin?.id ?? null,
      description: `Oylik (karta daftaridan): ${row.channel?.label ?? ""}`,
    });

    payouts += 1;
    payoutSum += Number(row.amount);
  }

  // ── TA'SISCHIGA TAQSIMOT ───────────────────────────────────────────────
  let draws = 0;
  let drawSum = 0;
  for (const row of buckets.founder) {
    const dedupKey = `transit-draw:${row.id}`;
    const existing = await prisma.kassaEntry.findFirst({ where: { dedupKey }, select: { id: true } });
    if (existing) continue;

    const entry = await prisma.kassaEntry.create({
      data: {
        type: "expense",
        category: "Dividend",
        amount: row.amount,
        date: row.date,
        channelId: row.channelId,
        description: `Ta'sischiga taqsimot (karta daftaridan): ${row.channel?.label ?? ""}`,
        dedupKey,
      },
      select: { id: true },
    });

    await postLedger(prisma as never, {
      legs: [
        { accountId: ACCOUNTS.OPERATING_EXPENSE, debit: Number(row.amount) },
        { accountId: ACCOUNTS.CASH, credit: Number(row.amount), channelId: row.channelId },
      ],
      period: periodKeyOf(row.date),
      sourceTable: "KassaEntry",
      sourceId: entry.id,
      createdBy: admin?.id ?? null,
      description: "Ta'sischiga taqsimot",
    });

    draws += 1;
    drawSum += Number(row.amount);
  }

  console.log();
  console.log(`✓ Payout yozildi: ${payouts} ta · ${som(payoutSum)} so'm`);
  console.log(`✓ Ta'sischiga taqsimot: ${draws} ta · ${som(drawSum)} so'm`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
