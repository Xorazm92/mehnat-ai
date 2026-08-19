/**
 * BANK KIRIMLARI NAVBATINI YOPISH.
 *
 * Prodda ikki xil "yopilmagan" kirim to'plangan edi:
 *
 *   1. status='matched' — firma ALLAQACHON belgilangan, lekin hisobga
 *      olinmagan: `PaymentAllocation` qatori yo'q. Ya'ni pul kelgan, lekin
 *      hech kimning qarzini kamaytirmagan. Avgustda 491 mln shu holatda edi
 *      va shuning uchun "Kirim reyestri (Joriy oy)" bo'sh ko'rinardi.
 *
 *   2. status='unmatched' — firma hali belgilanmagan.
 *
 * DAVR HAQIDA: qarz `lib/debt.ts` da JAMG'ARILIB hisoblanadi va to'lov ENG
 * ESKI qarzni birinchi yopadi (FIFO). Shuning uchun `Payment.period` ni
 * majburan o'zgartirish SHART EMAS — avgustda kelgan pul iyun/iyul qarzini
 * o'zi yopadi. Davr tranzaksiyaning o'z sanasidan olinadi, ya'ni kassa
 * hisoboti pul HAQIQATDA qachon kelganini ko'rsatadi.
 *
 *   npx tsx scripts/close-bank-income.ts            # quruq yurish (standart)
 *   npx tsx scripts/close-bank-income.ts --apply    # haqiqatan yozadi
 *
 * Idempotent: `PaymentAllocation.dedupKey = "bank:<txId>"` va
 * `postIncomeTransaction` allaqachon hisobga olingan qatorni rad etadi.
 */
import "./load-env"; // birinchi bo'lishi shart
import { prisma } from "@/lib/prisma";
import { formatNum as som } from "@/lib/format";
import { postIncomeTransaction, autoMatchTransactions } from "@/lib/bank/importStatement";

const APPLY = process.argv.includes("--apply");

/**
 * `Payment.createdBy` — `User` ga FOREIGN KEY (`PaymentAllocation.createdBy`
 * esa oddiy matn). Shuning uchun bu yerga "script:..." kabi belgi yozib
 * bo'lmaydi: FK buziladi. Haqiqiy admin foydalanuvchi topiladi, topilmasa
 * `null` — iz `AuditLog` da qoladi.
 */
async function resolveActor(): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { isActive: true, role: { in: ["super_admin", "admin"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, role: true },
  });
  if (admin) {
    console.log(`   yozuv egasi: ${admin.email} (${admin.role})`);
    return admin.id;
  }
  console.log("   ⚠ admin topilmadi — createdBy bo'sh qoladi");
  return null;
}

/** Mijoz to'lovi BO'LMAGAN kirimlar — bularni hisobga olish qarzni soxta yopadi. */
const NON_CLIENT_INNS = new Set([
  "202858483", // АТИБ "ИПОТЕКАБАНК" — bank foizi/komissiyasi
  "200542744", // "Т/счет по безнал зачисл на ПК физ лиц" — dividend
]);
/** STIRsiz qatorlar orasidan: qaytarilgan pul (mijoz to'lovi emas). */
const NON_CLIENT_PURPOSE = /возврат средств|карта получателя указано неверно/i;

function line() {
  console.log("─".repeat(72));
}

async function main() {
  console.log(APPLY ? "▶ HAQIQIY YOZUV (--apply)" : "▶ QURUQ YURISH — hech narsa yozilmaydi");
  const ACTOR = APPLY ? await resolveActor() : null;
  line();

  // ─────────────────────────────────────────────────────────
  // 1-BOSQICH: firma belgilangan, lekin hisobga olinmagan
  // ─────────────────────────────────────────────────────────
  const matched = await prisma.bankTransaction.findMany({
    where: {
      direction: "income",
      status: "matched",
      matchedCompanyId: { not: null },
      allocations: { none: {} },
    },
    select: {
      id: true,
      valueDate: true,
      amount: true,
      matchedCompanyId: true,
      matchedContractId: true,
      counterpartyName: true,
    },
    orderBy: { valueDate: "asc" },
  });

  const matchedSum = matched.reduce((s, t) => s + Number(t.amount), 0);
  console.log(`1-bosqich — moslashtirilgan, hisobga olinmagan: ${matched.length} ta / ${som(matchedSum)} so'm`);

  let posted = 0;
  let superseded = 0;
  if (APPLY) {
    for (const tx of matched) {
      const res = await postIncomeTransaction(prisma, {
        transactionId: tx.id,
        companyId: tx.matchedCompanyId!,
        contractId: tx.matchedContractId,
        createdBy: ACTOR,
      });
      posted++;
      // Qo'lda kiritilgan summa bank ma'lumoti bilan almashtirilgan bo'lsa —
      // bu JIM sodir bo'lmasligi kerak.
      if (res.supersededManualAmount) {
        superseded++;
        console.log(
          `   ⚠ ${tx.counterpartyName}: qo'lda kiritilgan ${som(res.supersededManualAmount)} ` +
            `so'm bank taqsimoti bilan almashtirildi`
        );
      }
    }
    console.log(`   ✓ ${posted} ta hisobga olindi (${superseded} tasida qo'lda summa almashdi)`);
  }
  line();

  // ─────────────────────────────────────────────────────────
  // 2-BOSQICH: mijoz to'lovi bo'lmagan qatorlarni e'tiborsiz qilish
  // ─────────────────────────────────────────────────────────
  const unmatchedAll = await prisma.bankTransaction.findMany({
    where: { direction: "income", status: "unmatched" },
    select: { id: true, counterpartyInn: true, counterpartyName: true, purpose: true, amount: true },
  });

  const nonClient = unmatchedAll.filter(
    (t) =>
      (t.counterpartyInn && NON_CLIENT_INNS.has(t.counterpartyInn)) ||
      NON_CLIENT_PURPOSE.test(t.purpose ?? "")
  );
  const nonClientSum = nonClient.reduce((s, t) => s + Number(t.amount), 0);
  console.log(`2-bosqich — mijoz to'lovi EMAS: ${nonClient.length} ta / ${som(nonClientSum)} so'm`);
  for (const t of nonClient) {
    console.log(`   · ${(t.counterpartyName ?? "(nomsiz)").slice(0, 40)} — ${som(Number(t.amount))}`);
  }
  if (APPLY && nonClient.length > 0) {
    await prisma.bankTransaction.updateMany({
      where: { id: { in: nonClient.map((t) => t.id) } },
      data: {
        status: "ignored",
        ignoredReason: "Mijoz to'lovi emas (bank foizi / qaytarilgan pul / dividend)",
        postedBy: ACTOR,
      },
    });
    console.log(`   ✓ ${nonClient.length} ta 'ignored' holatiga o'tdi`);
  }
  line();

  // ─────────────────────────────────────────────────────────
  // 3-BOSQICH: STIR bo'yicha avtomatik moslashtirish + hisobga olish
  // ─────────────────────────────────────────────────────────
  if (APPLY) {
    const res = await autoMatchTransactions(prisma);
    console.log(
      `3-bosqich — avtomatik moslashtirish: ${res.examined} ta ko'rildi, ` +
        `${res.matchedByInn} tasi STIR bo'yicha topildi (${res.matchedContract} tasida shartnoma ham)`
    );

    const fresh = await prisma.bankTransaction.findMany({
      where: {
        direction: "income",
        status: "matched",
        matchedCompanyId: { not: null },
        allocations: { none: {} },
      },
      select: { id: true, matchedCompanyId: true, matchedContractId: true, amount: true },
    });
    for (const tx of fresh) {
      await postIncomeTransaction(prisma, {
        transactionId: tx.id,
        companyId: tx.matchedCompanyId!,
        contractId: tx.matchedContractId,
        createdBy: ACTOR,
      });
    }
    const freshSum = fresh.reduce((s, t) => s + Number(t.amount), 0);
    console.log(`   ✓ ${fresh.length} ta hisobga olindi / ${som(freshSum)} so'm`);
  } else {
    // Quruq yurishda avtomatik moslashtirish YOZADI (status o'zgaradi),
    // shuning uchun uni chaqirmaymiz — faqat bashorat qilamiz.
    const inns = [...new Set(unmatchedAll.map((t) => t.counterpartyInn).filter(Boolean))] as string[];
    const companies = await prisma.company.findMany({
      where: { inn: { in: inns }, isOwnFirm: false },
      select: { id: true, inn: true },
    });
    const byInn = new Map<string, number>();
    for (const c of companies) byInn.set(c.inn, (byInn.get(c.inn) ?? 0) + 1);

    const willMatch = unmatchedAll.filter(
      (t) => !nonClient.includes(t) && t.counterpartyInn && byInn.get(t.counterpartyInn) === 1
    );
    const ambiguous = unmatchedAll.filter(
      (t) => t.counterpartyInn && (byInn.get(t.counterpartyInn) ?? 0) > 1
    );
    const orphan = unmatchedAll.filter(
      (t) => !nonClient.includes(t) && (!t.counterpartyInn || !byInn.has(t.counterpartyInn))
    );

    const sum = (rows: typeof unmatchedAll) => rows.reduce((s, t) => s + Number(t.amount), 0);
    console.log(`3-bosqich (bashorat) — STIR bitta firmaga mos: ${willMatch.length} ta / ${som(sum(willMatch))} so'm`);
    console.log(`   dublikat STIR (qo'lda hal qilinadi): ${ambiguous.length} ta / ${som(sum(ambiguous))} so'm`);
    for (const t of ambiguous) {
      console.log(`   · ${(t.counterpartyName ?? "").slice(0, 40)} (${t.counterpartyInn}) — ${som(Number(t.amount))}`);
    }
    console.log(`   firmasi bazada YO'Q (tegilmaydi): ${orphan.length} ta / ${som(sum(orphan))} so'm`);
  }
  line();

  // ─────────────────────────────────────────────────────────
  // YAKUNIY HOLAT
  // ─────────────────────────────────────────────────────────
  const rest = await prisma.bankTransaction.groupBy({
    by: ["status"],
    where: { direction: "income" },
    _count: { _all: true },
    _sum: { amount: true },
  });
  console.log("Yakuniy holat (kirim tranzaksiyalari):");
  for (const r of rest.sort((a, b) => a.status.localeCompare(b.status))) {
    console.log(`   ${r.status.padEnd(10)} ${String(r._count._all).padStart(4)} ta  ${som(Number(r._sum.amount ?? 0))} so'm`);
  }

  if (!APPLY) {
    console.log("\nHech narsa yozilmadi. Yozish uchun: --apply");
  }
}

main()
  .catch((e) => {
    console.error("XATO:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
