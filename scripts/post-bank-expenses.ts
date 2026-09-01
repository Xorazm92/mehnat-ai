/**
 * VIPISKA CHIQIMLARINI KASSAGA YOZISH (navbatda qolganlari).
 *
 *   npx tsx scripts/post-bank-expenses.ts --month=2026-08
 *   npx tsx scripts/post-bank-expenses.ts --month=2026-08 --apply
 *
 * MUAMMO (D11). Bank vipiskasidagi chiqim `unmatched` holatda navbatda
 * turadi va operator uni ekrandan tasdiqlaganda kassaga tushadi. Avgustda
 * 160 tasi shunday tushgan, 91 tasi esa navbatda qolib ketgan —
 * 73 323 355,03 so'm balansda ham, foyda hisobida ham yo'q.
 *
 * NEGA OMMAVIY YOZISH XAVFSIZ (o'lchangan, taxmin emas):
 *
 *   • Kartaga o'tkazma `xodim_kartasi` toifasida bo'ladi va bu skript uni
 *     OLMAYDI (`NON_POSTABLE_CATEGORIES`). Qolgan 91 qatorning birortasida
 *     ham `~<16 raqam>~` karta belgisi YO'Q — ya'ni ular karta to'ldirish
 *     emas, haqiqiy chiqim.
 *   • Summa+sana bo'yicha karta daftari bilan "juftlik" izlash YOLG'ON
 *     natija beradi: 10 000 000 kabi raqamlar ikkala tomonda ham tez-tez
 *     uchraydi. Tuzilish bo'yicha ular bir xil pul BO'LA OLMAYDI —
 *     byudjetga to'lov firma hisobidan, karta kirimi esa shaxs kartasiga.
 *
 * `dedupKey = "bank-expense:<txId>"` — UI dagi
 * `postExpenseFromBankTransaction` bilan AYNAN BIR XIL. Ya'ni keyin operator
 * o'sha qatorni ekrandan tasdiqlasa ham, ikkinchi yozuv paydo bo'lmaydi.
 */
import "./load-env"; // birinchi bo'lishi shart
import { prisma } from "@/lib/prisma";
import { formatNum as som } from "@/lib/platform/format";
import { recordKassaMovement, runCashTx } from "@/lib/cashGate";
import { ACCOUNTS } from "@/lib/ledger";
import { expenseAccountFor } from "@/lib/expenseAccount";
import { NON_POSTABLE_CATEGORIES, type ExpenseCategory } from "@/lib/bank/classifyExpense";

const apply = process.argv.includes("--apply");
const month = process.argv.find((a) => a.startsWith("--month="))?.slice(8);
const actor = { kind: "script" as const, name: "post-bank-expenses" };

if (month && !/^\d{4}-\d{2}$/.test(month)) {
  console.error(`Davr YYYY-MM formatida bo'lishi kerak: "${month}"`);
  process.exit(1);
}
const from = month ? new Date(`${month}-01T00:00:00.000Z`) : undefined;
const to = from ? new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1)) : undefined;

/** Pul qaysi manbadan chiqdi — vipiska hisobining firmasi kanali. */
async function ownAccountChannel(ownerCompanyId: string): Promise<string | null> {
  const ch = await prisma.disbursementChannel.findFirst({
    where: { type: "own_firm_account", ownFirmId: ownerCompanyId, isActive: true },
    select: { id: true },
  });
  return ch?.id ?? null;
}

async function main(): Promise<void> {
  const rows = await prisma.bankTransaction.findMany({
    where: {
      direction: "expense",
      status: "unmatched",
      ...(from && to ? { valueDate: { gte: from, lt: to } } : {}),
    },
    select: {
      id: true,
      valueDate: true,
      amount: true,
      purpose: true,
      counterpartyName: true,
      expenseCategory: true,
      account: { select: { label: true, ownerCompanyId: true } },
    },
    orderBy: { valueDate: "asc" },
  });

  const skipped: Record<string, { count: number; sum: number }> = {};
  const postable: typeof rows = [];

  for (const r of rows) {
    const cat = (r.expenseCategory ?? "boshqa") as ExpenseCategory;
    // Karta belgisi: `~` bilan ajratilgan AYNAN 16 raqamli bo'lak
    // (`extractCardTransfer` bilan bir xil). Oddiy `\d{16}` YARAMAYDI —
    // u 20 xonali hisob raqamining ichiga ham tushadi.
    const looksLikeCard = /(^|~)\s*\d{16}\s*(~|$)/.test(r.purpose ?? "");
    const reason = NON_POSTABLE_CATEGORIES.has(cat)
      ? `toifa "${cat}" — boshqa qatlamga tegishli`
      : looksLikeCard
        ? "maqsadida karta raqami bor — kartaga o'tkazma"
        : null;

    if (reason) {
      const e = skipped[reason] ?? { count: 0, sum: 0 };
      e.count++;
      e.sum += Number(r.amount);
      skipped[reason] = e;
      continue;
    }
    postable.push(r);
  }

  const byCategory = new Map<string, { count: number; sum: number }>();
  for (const r of postable) {
    const cat = r.expenseCategory ?? "boshqa";
    const e = byCategory.get(cat) ?? { count: 0, sum: 0 };
    e.count++;
    e.sum += Number(r.amount);
    byCategory.set(cat, e);
  }

  console.log(`\n━━━ VIPISKA CHIQIMI → KASSA${month ? ` (${month})` : ""} ━━━\n`);
  console.log(`  Navbatdagi chiqim : ${rows.length} ta`);
  for (const [reason, e] of Object.entries(skipped)) {
    console.log(`  O'tkazib yuborildi: ${String(e.count).padStart(3)} ta · ${som(e.sum).padStart(14)}  (${reason})`);
  }
  console.log(`\n  YOZILADI          : ${postable.length} ta · ${som(postable.reduce((s, r) => s + Number(r.amount), 0))}\n`);
  for (const [cat, e] of [...byCategory].sort((a, b) => b[1].sum - a[1].sum)) {
    console.log(`    ${cat.padEnd(16)} ${String(e.count).padStart(3)} ta  ${som(e.sum).padStart(16)}`);
  }

  if (!apply) {
    console.log("\n  DRY-RUN — hech narsa yozilmadi. Yozish uchun: --apply");
    return;
  }

  let posted = 0;
  let already = 0;
  const failed: string[] = [];

  for (const r of postable) {
    const category = r.expenseCategory ?? "boshqa";
    const channelId = await ownAccountChannel(r.account.ownerCompanyId);
    const description =
      [r.counterpartyName, r.purpose].filter(Boolean).join(" · ").slice(0, 500) || null;

    try {
      const res = await runCashTx((db) =>
        recordKassaMovement(db, actor, {
          type: "expense",
          category,
          amount: Number(r.amount),
          date: r.valueDate,
          description,
          channelId,
          dedupKey: `bank-expense:${r.id}`,
          expenseAccount: ACCOUNTS[expenseAccountFor(category)],
        })
      );
      if (res.alreadyRecorded) already++;
      else posted++;

      await prisma.bankTransaction.update({
        where: { id: r.id },
        data: {
          status: "ignored",
          ignoredReason: `Chiqim sifatida yozildi (${category}, KassaEntry ${res.id})`,
        },
      });
    } catch (e) {
      failed.push(`${r.valueDate.toISOString().slice(0, 10)} ${som(Number(r.amount))} — ${(e as Error).message}`);
    }
  }

  console.log(`\n  ✓ Yozildi: ${posted} ta · allaqachon bor edi: ${already} ta`);
  if (failed.length) {
    console.log(`\n  ⚠️  Yozilmadi (${failed.length}):`);
    for (const f of failed) console.log(`     ${f}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
