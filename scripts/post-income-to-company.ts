/**
 * BITTA BANK KIRIMINI ANIQ FIRMAGA HISOBGA OLADI.
 *
 * Avtomatik moslashtirish ATAYIN o'tkazib yuboradigan holatlar uchun: STIR
 * bir nechta firmaga to'g'ri kelsa (dublikat STIR) yoki vipiskadagi STIR
 * bazadagidan farq qilsa. Bunday qatorni faqat odam hal qila oladi, lekin
 * qaror qabul qilingandan keyin yozuv yo'li bank importi bilan AYNAN bir xil
 * bo'lishi kerak — shuning uchun `postIncomeTransaction` chaqiriladi, qo'lda
 * SQL emas.
 *
 *   npx tsx scripts/post-income-to-company.ts --tx <txId> --company <companyId>
 *   npx tsx scripts/post-income-to-company.ts --tx <txId> --company <id> --apply
 */
import "./load-env"; // birinchi bo'lishi shart
import { prisma } from "@/lib/prisma";
import { formatNum as som } from "@/lib/platform/format";
import { postIncomeTransaction } from "@/lib/bank/importStatement";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const APPLY = process.argv.includes("--apply");

async function main() {
  const txId = arg("tx");
  const companyId = arg("company");
  if (!txId || !companyId) throw new Error("--tx va --company majburiy");

  const tx = await prisma.bankTransaction.findUnique({
    where: { id: txId },
    select: {
      id: true, valueDate: true, amount: true, direction: true, status: true,
      counterpartyName: true, counterpartyInn: true, contractHint: true, purpose: true,
    },
  });
  if (!tx) throw new Error("Tranzaksiya topilmadi");

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, inn: true, isActive: true, contractAmount: true,
              contracts: { where: { isActive: true }, select: { id: true, number: true } } },
  });
  if (!company) throw new Error("Firma topilmadi");
  if (!company.isActive) throw new Error(`"${company.name}" nofaol — faol firmani tanlang`);

  // Shartnoma ishorasi mos kelsa uni ham bog'laymiz.
  const contract = tx.contractHint
    ? company.contracts.find((c) => c.number === tx.contractHint)
    : undefined;

  console.log(`Tranzaksiya : ${tx.valueDate.toISOString().slice(0, 10)} · ${som(Number(tx.amount))} so'm`);
  console.log(`Vipiskada   : ${tx.counterpartyName} (${tx.counterpartyInn ?? "STIRsiz"})`);
  console.log(`Yoziladi    : ${company.name} (${company.inn})`);
  console.log(`Shartnoma   : ${contract?.number ?? tx.contractHint ?? "—"}`);
  console.log(`Holat       : ${tx.status}`);

  if (!APPLY) {
    console.log("\nHech narsa yozilmadi. Yozish uchun: --apply");
    return;
  }

  const admin = await prisma.user.findFirst({
    where: { isActive: true, role: { in: ["super_admin", "admin"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  const res = await postIncomeTransaction(prisma, {
    transactionId: tx.id,
    companyId: company.id,
    contractId: contract?.id ?? null,
    createdBy: admin?.id ?? null,
  });

  console.log(`\n✓ Hisobga olindi. Shu davrdagi jami: ${som(res.paymentTotal)} so'm · holat: ${res.status}`);
  if (res.supersededManualAmount) {
    console.log(`⚠ Qo'lda kiritilgan ${som(res.supersededManualAmount)} so'm bank taqsimoti bilan almashtirildi`);
  }
}

main()
  .catch((e) => { console.error("XATO:", e.message ?? e); process.exit(1); })
  .finally(() => prisma.$disconnect());
