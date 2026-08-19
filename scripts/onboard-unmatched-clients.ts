/**
 * MOSLASHTIRILMAGAN KIRIMLAR EGASI BO'LGAN FIRMALARNI BAZAGA QO'SHISH.
 *
 * Vipiskadan tushgan pulning bir qismi bazada UMUMAN YO'Q firmalardan kelgan:
 * STIRi hech qaysi `Company` qatoriga to'g'ri kelmaydi. Shu sababdan bu pul
 * hisobga olinmay navbatda turardi va hech kimning qarzini kamaytirmasdi.
 *
 * NIMA UCHUN SHARTNOMA RAQAMI BILAN TOPIB BO'LMAYDI: `Contract.number` GLOBAL
 * NOYOB EMAS (`@@unique([companyId, number])`), ya'ni "05/26БК" bazada bir
 * necha firmada uchraydi. Shuning uchun to'lovni raqam bo'yicha mavjud
 * firmaga bog'lash XATO bo'lardi — yagona ishonchli kalit STIR.
 *
 * TAXMIN QILINADIGAN YAGONA NARSA — OYLIK SUMMA. U to'lovlardan olinadi:
 * bir xil summa bir necha marta takrorlansa, o'sha oylik deb qabul qilinadi.
 * Bitta to'lov bo'lsa, o'sha summa olinadi va OGOHLANTIRISH chiqadi — uni
 * keyin firma kartochkasidan tuzatish kerak.
 *
 *   npx tsx scripts/onboard-unmatched-clients.ts          # quruq yurish
 *   npx tsx scripts/onboard-unmatched-clients.ts --apply
 *
 * Idempotent: STIR bazada paydo bo'lgach ikkinchi yurishda o'tkazib yuboriladi.
 */
import "./load-env"; // birinchi bo'lishi shart
import { prisma } from "@/lib/prisma";
import { formatNum as som } from "@/lib/format";
import { postIncomeTransaction } from "@/lib/bank/importStatement";
import { Prisma } from "@prisma/client";

const APPLY = process.argv.includes("--apply");

/** Vipiskadagi nomni tozalaydi — ortiqcha bo'shliq va qo'shtirnoq. Nom O'YLAB TOPILMAYDI. */
function cleanName(raw: string): string {
  return (
    raw
      .replace(/\s+/g, " ")
      // Faqat QO'SHTIRNOQ ICHIDAGI ortiqcha bo'shliq olinadi: `MCHJ " ANVAR "`
      // → `MCHJ "ANVAR"`. Qo'shtirnoqdan OLDINGI bo'shliqqa tegilmaydi — aks
      // holda `ЧП "LIDER ELITE"` → `ЧП"LIDER ELITE"` bo'lib nom buzilardi.
      .replace(/"\s*([^"]*?)\s*"/g, '"$1"')
      .trim()
  );
}

/**
 * Oylik summa: eng ko'p takrorlangan to'lov summasi. Teng bo'lsa — kattasi.
 * `confident` false bo'lsa summa TAXMIN, foydalanuvchi tekshirishi kerak.
 */
function monthlyAmount(amounts: number[]): { value: number; confident: boolean } {
  const freq = new Map<number, number>();
  for (const a of amounts) freq.set(a, (freq.get(a) ?? 0) + 1);
  let best = 0;
  let bestCount = 0;
  for (const [value, count] of freq) {
    if (count > bestCount || (count === bestCount && value > best)) {
      best = value;
      bestCount = count;
    }
  }
  return { value: best, confident: bestCount >= 2 };
}

async function main() {
  console.log(APPLY ? "▶ HAQIQIY YOZUV (--apply)" : "▶ QURUQ YURISH — hech narsa yozilmaydi");
  console.log("─".repeat(76));

  const txs = await prisma.bankTransaction.findMany({
    where: { direction: "income", status: "unmatched", counterpartyInn: { not: null } },
    select: {
      id: true,
      valueDate: true,
      amount: true,
      counterpartyInn: true,
      counterpartyName: true,
      contractHint: true,
    },
    orderBy: { valueDate: "asc" },
  });

  // STIR bo'yicha guruhlash — bir firma bir necha marta to'lagan bo'lishi mumkin.
  const groups = new Map<string, typeof txs>();
  for (const t of txs) {
    const inn = t.counterpartyInn!;
    if (!groups.has(inn)) groups.set(inn, []);
    groups.get(inn)!.push(t);
  }

  // XAVFSIZLIK: STIR allaqachon bazada bo'lsa TEGMAYMIZ — dublikat firma
  // yaratish qarzdorlikni ikkiga bo'lib yuboradi.
  const existing = await prisma.company.findMany({
    where: { inn: { in: [...groups.keys()] } },
    select: { inn: true, name: true },
  });
  const taken = new Map(existing.map((c) => [c.inn, c.name]));

  const admin = await prisma.user.findFirst({
    where: { isActive: true, role: { in: ["super_admin", "admin"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  if (APPLY) console.log(`Yozuv egasi: ${admin?.email ?? "(topilmadi)"}\n`);

  let created = 0;
  let postedCount = 0;
  let postedSum = 0;
  const warnings: string[] = [];

  const sorted = [...groups].sort(
    (a, b) =>
      b[1].reduce((s, t) => s + Number(t.amount), 0) -
      a[1].reduce((s, t) => s + Number(t.amount), 0)
  );

  for (const [inn, rows] of sorted) {
    if (taken.has(inn)) {
      console.log(`⤼  ${inn} — bazada allaqachon bor ("${taken.get(inn)}"), o'tkazib yuborildi`);
      continue;
    }

    const name = cleanName(rows[0].counterpartyName ?? `STIR ${inn}`);
    const amounts = rows.map((t) => Number(t.amount));
    const total = amounts.reduce((s, a) => s + a, 0);
    const monthly = monthlyAmount(amounts);
    const firstDate = rows[0].valueDate;
    const contractNumber = rows.find((t) => t.contractHint)?.contractHint ?? null;

    console.log(`+  ${name}`);
    console.log(`   STIR ${inn} · ${rows.length} ta to'lov · jami ${som(total)} so'm`);
    console.log(
      `   oylik: ${som(monthly.value)} so'm ${
        monthly.confident ? "(takrorlangan — ishonchli)" : "⚠ TAXMIN — bitta to'lov"
      }`
    );
    console.log(
      `   shartnoma: ${contractNumber ?? "— (raqam yo'q)"} · sana ${firstDate
        .toISOString()
        .slice(0, 10)}`
    );

    if (!monthly.confident) {
      warnings.push(
        `${name} (${inn}) — oylik summa ${som(monthly.value)} so'm bitta to'lovdan olindi, tekshiring`
      );
    }

    if (!APPLY) {
      console.log("");
      continue;
    }

    const company = await prisma.company.create({
      data: {
        name,
        inn,
        isActive: true,
        contractAmount: new Prisma.Decimal(monthly.value.toFixed(2)),
        contractDate: firstDate,
        contractNumber,
      },
      select: { id: true },
    });
    created++;

    // Shartnoma jadvali — raqam bo'lsa. `Company.contractNumber` eski bitta
    // ustun, `Contract` esa haqiqiy manba.
    let contractId: string | null = null;
    if (contractNumber) {
      const k = await prisma.contract.create({
        data: {
          companyId: company.id,
          number: contractNumber,
          signedAt: firstDate,
          amount: new Prisma.Decimal(monthly.value.toFixed(2)),
          source: "manual",
          isActive: true,
        },
        select: { id: true },
      });
      contractId = k.id;
    }

    for (const t of rows) {
      await postIncomeTransaction(prisma, {
        transactionId: t.id,
        companyId: company.id,
        contractId,
        createdBy: admin?.id ?? null,
      });
      postedCount++;
      postedSum += Number(t.amount);
    }
    console.log(`   ✓ firma yaratildi (${company.id}) · ${rows.length} ta to'lov hisobga olindi\n`);
  }

  console.log("─".repeat(76));
  if (APPLY) {
    console.log(
      `✓ ${created} ta firma yaratildi · ${postedCount} ta to'lov / ${som(postedSum)} so'm hisobga olindi`
    );
  }
  if (warnings.length > 0) {
    console.log("\n⚠ TEKSHIRISH KERAK (oylik summa taxmin qilingan):");
    for (const w of warnings) console.log(`   · ${w}`);
  }

  const rest = await prisma.bankTransaction.groupBy({
    by: ["status"],
    where: { direction: "income" },
    _count: { _all: true },
    _sum: { amount: true },
  });
  console.log("\nYakuniy holat (kirim tranzaksiyalari):");
  for (const r of rest.sort((a, b) => a.status.localeCompare(b.status))) {
    console.log(
      `   ${r.status.padEnd(10)} ${String(r._count._all).padStart(4)} ta  ${som(
        Number(r._sum.amount ?? 0)
      )} so'm`
    );
  }

  if (!APPLY) console.log("\nHech narsa yozilmadi. Yozish uchun: --apply");
}

main()
  .catch((e) => {
    console.error("XATO:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
