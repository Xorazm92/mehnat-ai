/**
 * BANK QATORLARIDAN FOYDAGA TEGISHLI BO'LMAGANLARINI YOPISH.
 *
 *   npx tsx scripts/post-bank-non-pnl.ts                 # ko'rsatadi
 *   npx tsx scripts/post-bank-non-pnl.ts --apply
 *   npx tsx scripts/post-bank-non-pnl.ts --month=2026-08 --apply
 *
 * Vipiska "kiruvchi qutisi" da ikki xil qator qoladi va ikkalasi ham
 * XARAJAT/DAROMAD EMAS. Ular shu holicha qolsa, moliyaviy natija buziladi:
 *
 * 1. FIRMALARARO O'TKAZMA — ikkala hisob ham o'zimizniki. Guruh darajasida
 *    pul hech qayerga ketmagan. Belgisi: kontragent STIRi o'z firmalarimiz
 *    ro'yxatida (nom bo'yicha emas — nom har xil yoziladi).
 *    → `ignored`, jurnalga yozilmaydi.
 *
 * 2. MOLIYAVIY YORDAM (qarz) — pul harakati bor, lekin u daromad ham,
 *    xarajat ham emas: qaytariladi. Belgisi to'lov maqsadida: "фин помощь",
 *    "молиявий ёрдам", "moliyaviy yordam".
 *    → `LOAN_GIVEN` (aktiv) yoki `LOAN_RECEIVED` (passiv) hisobiga.
 *
 * QAYSI HISOB — yo'nalish va "qaytarish" so'zi bo'yicha:
 *
 *   chiqim, oddiy      biz berdik            Dt LOAN_GIVEN     Kt CASH
 *   kirim,  qaytarildi bizga qaytarishdi     Dt CASH           Kt LOAN_GIVEN
 *   chiqim, qaytarish  biz qaytardik         Dt LOAN_RECEIVED  Kt CASH
 *   kirim,  oddiy      bizga berishdi        Dt CASH           Kt LOAN_RECEIVED
 *
 * DIQQAT — "noto'g'ri o'tkazilgan pulni qaytarish" BU EMAS. U xizmat
 * to'lovining qaytarilishi, ya'ni TUSHUM qaytimi va mijoz qarziga ta'sir
 * qiladi. Shuning uchun bu skript faqat "yordam/помощь/ёрдам" so'zi bor
 * qatorlarni oladi va qolganiga tegmaydi.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { formatNum as som } from "@/lib/platform/format";
import { ACCOUNTS, postLedger } from "@/lib/ledger";

const apply = process.argv.includes("--apply");
const month = process.argv.find((a) => a.startsWith("--month="))?.slice(8);
const from = month ? new Date(`${month}-01T00:00:00.000Z`) : undefined;
const to = from
  ? new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1))
  : undefined;

/** Moliyaviy yordam belgisi — bank matnida uch alifboda uchraydi. */
const AID_RE = /фин\.?\s*помощь|молиявий\s*[её]рдам|moliyaviy\s*yordam|фин\.?\s*ёрдам/i;
/** Qaytarish belgisi. */
const RETURN_RE = /возврат|кайтарил|qaytaril|қайтарил/i;

async function main(): Promise<void> {
  const ownFirms = await prisma.company.findMany({
    where: { isOwnFirm: true },
    select: { inn: true },
  });
  const ownInns = new Set(ownFirms.map((c) => c.inn));

  const dateFilter = from && to ? { valueDate: { gte: from, lt: to } } : {};

  // ── 1. FIRMALARARO O'TKAZMA ──────────────────────────────────────────
  const internal = (
    await prisma.bankTransaction.findMany({
      where: { status: "unmatched", ...dateFilter },
      select: {
        id: true,
        valueDate: true,
        direction: true,
        amount: true,
        counterpartyInn: true,
        counterpartyName: true,
        account: { select: { label: true } },
      },
      orderBy: { valueDate: "asc" },
    })
  ).filter((t) => t.counterpartyInn && ownInns.has(t.counterpartyInn));

  console.log(`\n━━━ FIRMALARARO O'TKAZMA (${internal.length}) ━━━`);
  for (const t of internal) {
    console.log(
      `  ${t.valueDate.toISOString().slice(0, 10)}  ${t.account.label.padEnd(17)} ` +
        `${t.direction === "expense" ? "→" : "←"} ${(t.counterpartyName ?? "").slice(0, 26).padEnd(26)} ${som(Number(t.amount)).padStart(14)}`
    );
  }
  const internalSum = internal.reduce((s, t) => s + Number(t.amount), 0);
  if (internal.length) console.log(`  ${"JAMI".padEnd(50)} ${som(internalSum).padStart(14)}`);

  // ── 2. MOLIYAVIY YORDAM ──────────────────────────────────────────────
  const aidRows = (
    await prisma.bankTransaction.findMany({
      where: { status: { in: ["unmatched", "matched"] }, ...dateFilter },
      select: {
        id: true,
        valueDate: true,
        direction: true,
        amount: true,
        purpose: true,
        counterpartyInn: true,
        counterpartyName: true,
        account: { select: { label: true } },
      },
      orderBy: { valueDate: "asc" },
    })
  ).filter((t) => AID_RE.test(t.purpose ?? "") && !(t.counterpartyInn && ownInns.has(t.counterpartyInn)));

  const companies = await prisma.company.findMany({
    where: { inn: { in: aidRows.map((t) => t.counterpartyInn ?? "").filter(Boolean) } },
    select: { id: true, inn: true },
  });
  const companyByInn = new Map(companies.map((c) => [c.inn, c.id]));

  interface Plan {
    id: string;
    date: Date;
    label: string;
    party: string;
    inn: string | null;
    companyId: string | null;
    amount: number;
    account: typeof ACCOUNTS.LOAN_GIVEN | typeof ACCOUNTS.LOAN_RECEIVED;
    /** Hisob debitlanadimi (aks holda kreditlanadi). */
    debitLoan: boolean;
  }

  const plans: Plan[] = aidRows.map((t) => {
    const isReturn = RETURN_RE.test(t.purpose ?? "");
    const isExpense = t.direction === "expense";
    // Jadval yuqoridagi izohda.
    const account = isExpense === isReturn ? ACCOUNTS.LOAN_GIVEN : ACCOUNTS.LOAN_RECEIVED;
    return {
      id: t.id,
      date: t.valueDate,
      label: t.account.label,
      party: t.counterpartyName ?? "(noma'lum)",
      inn: t.counterpartyInn,
      companyId: t.counterpartyInn ? (companyByInn.get(t.counterpartyInn) ?? null) : null,
      amount: Number(t.amount),
      account,
      debitLoan: isExpense,
    };
  });

  console.log(`\n━━━ MOLIYAVIY YORDAM (${plans.length}) ━━━`);
  for (const p of plans) {
    const side = p.debitLoan ? "Dt" : "Kt";
    console.log(
      `  ${p.date.toISOString().slice(0, 10)}  ${p.label.padEnd(15)} ${p.party.slice(0, 30).padEnd(30)} ` +
        `${som(p.amount).padStart(14)}  ${side} ${p.account}${p.companyId ? "" : "  ⚠ reyestrda yo'q"}`
    );
  }

  const net = (account: string) =>
    plans
      .filter((p) => p.account === account)
      .reduce((s, p) => s + (p.debitLoan ? p.amount : -p.amount), 0);
  if (plans.length) {
    console.log(`\n  LOAN_GIVEN sof    : ${som(net(ACCOUNTS.LOAN_GIVEN))}`);
    console.log(`  LOAN_RECEIVED sof : ${som(net(ACCOUNTS.LOAN_RECEIVED))}`);
  }

  if (!apply) {
    console.log("\nHech narsa o'zgarmadi. Yozish uchun: --apply");
    return;
  }

  // ── YOZISH ───────────────────────────────────────────────────────────
  for (const t of internal) {
    await prisma.bankTransaction.update({
      where: { id: t.id },
      data: {
        status: "ignored",
        ignoredReason: "Firmalararo o'tkazma — xarajat ham, tushum ham emas",
      },
    });
  }

  let posted = 0;
  for (const p of plans) {
    const period = p.date.toISOString().slice(0, 7);
    const already = await prisma.ledgerEntry.count({
      where: { sourceTable: "BankTransaction", sourceId: p.id },
    });
    if (already) continue;

    const loanLeg = {
      accountId: p.account,
      ...(p.debitLoan ? { debit: p.amount } : { credit: p.amount }),
      subjectId: p.companyId,
      description: `${p.party}${p.inn ? ` (STIR ${p.inn})` : ""}`,
    };
    const cashLeg = {
      accountId: ACCOUNTS.CASH,
      ...(p.debitLoan ? { credit: p.amount } : { debit: p.amount }),
    };

    await postLedger(prisma as never, {
      period,
      sourceTable: "BankTransaction",
      sourceId: p.id,
      description: `Moliyaviy yordam — ${p.party}`,
      legs: [loanLeg, cashLeg],
    });
    await prisma.bankTransaction.update({
      where: { id: p.id },
      data: {
        status: "ignored",
        ignoredReason: `Moliyaviy yordam — ${p.account} hisobiga yozildi (xarajat/daromad emas)`,
      },
    });
    posted++;
  }

  console.log(`\n✓ Firmalararo: ${internal.length} ta belgilandi · Moliyaviy yordam: ${posted} ta yozildi`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
