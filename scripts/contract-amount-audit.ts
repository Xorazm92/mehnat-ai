/**
 * SHARTNOMA SUMMASI — IKKI MANBA SVERKASI (qat'iy READ-ONLY)
 * ==========================================================
 *
 * MUAMMO. Oylik shartnoma summasi ikki joyda yashaydi:
 *
 *   Company.contractAmount   ← `lib/debt.ts` BUTUN qarzdorlikni shundan hisoblaydi
 *   Contract.amount          ← 1C reestridan kelgan, `server/contracts.ts` yozadi
 *
 * `Contract` modeli yagona manba bo'lishi kerak, lekin ko'chirish HOZIR
 * mumkin emas: ikki manba 283 faol firmaning 152 tasida rozi emas. Ko'chirish
 * ularning qarzini jimgina o'zgartirardi — ba'zilarini ikki barobar,
 * ba'zilarini yarmiga.
 *
 * Qaysi raqam to'g'ri ekani BIZNES qarori. Bu skript o'sha qarorni qabul
 * qilish uchun kerakli ro'yxatni beradi va HECH NARSANI o'zgartirmaydi.
 *
 * ISHLATISH:
 *   npx tsx scripts/contract-amount-audit.ts            # xulosa + nomuvofiqlar
 *   npx tsx scripts/contract-amount-audit.ts --csv      # CSV (buxgalteriyaga)
 *   npx tsx scripts/contract-amount-audit.ts --all      # 283 tasining hammasi
 */
import "./load-env";
import { prisma } from "@/lib/prisma";

const CSV = process.argv.includes("--csv");
const ALL = process.argv.includes("--all");

const num = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

type Verdict = "mos" | "shartnomasiz" | "mos_emas" | "summasiz" | "bir_nechta";

const VERDICT_LABEL: Record<Verdict, string> = {
  mos: "Mos",
  shartnomasiz: "Contract yo'q, Company'da summa bor",
  mos_emas: "Summalar mos emas",
  summasiz: "Ikkalasida ham summa yo'q",
  bir_nechta: "Bir nechta faol Contract",
};

async function main() {
  const companies = await prisma.company.findMany({
    where: { isActive: true, isOwnFirm: false },
    select: {
      id: true,
      name: true,
      inn: true,
      contractAmount: true,
      contractNumber: true,
      accountant: { select: { fullName: true } },
      contracts: {
        where: { isActive: true },
        select: { number: true, amount: true, source: true },
      },
    },
    orderBy: { name: "asc" },
  });

  interface Row {
    name: string;
    inn: string;
    accountant: string;
    companyAmount: number;
    contractAmount: number;
    contractCount: number;
    numbers: string;
    verdict: Verdict;
  }

  const rows: Row[] = companies.map((c) => {
    const companyAmount = Number(c.contractAmount ?? 0);
    const contractSum = c.contracts.reduce((s, k) => s + Number(k.amount ?? 0), 0);

    let verdict: Verdict;
    if (c.contracts.length === 0) {
      verdict = companyAmount > 0 ? "shartnomasiz" : "summasiz";
    } else if (c.contracts.length > 1) {
      verdict = "bir_nechta";
    } else if (Math.abs(contractSum - companyAmount) > 1) {
      verdict = "mos_emas";
    } else {
      verdict = "mos";
    }

    return {
      name: c.name,
      inn: c.inn,
      accountant: c.accountant?.fullName ?? "—",
      companyAmount,
      contractAmount: contractSum,
      contractCount: c.contracts.length,
      numbers: c.contracts.map((k) => k.number).join(" / ") || (c.contractNumber ?? "—"),
      verdict,
    };
  });

  if (CSV) {
    console.log("Firma,STIR,Buxgalter,Company.contractAmount,Contract.amount,Farq,Shartnoma raqami,Holat");
    for (const r of rows) {
      if (!ALL && r.verdict === "mos") continue;
      const cells = [
        r.name,
        r.inn,
        r.accountant,
        r.companyAmount,
        r.contractAmount,
        r.contractAmount - r.companyAmount,
        r.numbers,
        VERDICT_LABEL[r.verdict],
      ];
      // Vergul va qo'shtirnoq CSV ni buzmasin.
      console.log(cells.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    }
    await prisma.$disconnect();
    return;
  }

  const counts = new Map<Verdict, number>();
  for (const r of rows) counts.set(r.verdict, (counts.get(r.verdict) ?? 0) + 1);

  console.log("\n━━━ SHARTNOMA SUMMASI — IKKI MANBA SVERKASI ━━━━━━━━━━━━━━━━━\n");
  console.log(`  Faol mijoz firmalari: ${rows.length} ta\n`);
  for (const v of ["mos", "mos_emas", "shartnomasiz", "bir_nechta", "summasiz"] as Verdict[]) {
    const n = counts.get(v) ?? 0;
    if (n === 0) continue;
    console.log(`    ${String(n).padStart(4)} ta  ${VERDICT_LABEL[v]}`);
  }

  const needsDecision = rows.filter((r) => r.verdict === "mos_emas" || r.verdict === "bir_nechta");
  if (needsDecision.length) {
    console.log(`\n  QAROR TALAB QILADI — qaysi summa to'g'ri? (${needsDecision.length} ta)\n`);
    console.log(
      `    ${"Firma".padEnd(32)} ${"Company".padStart(12)} ${"Contract".padStart(12)} ${"Farq".padStart(12)}  Buxgalter`
    );
    console.log(`    ${"─".repeat(32)} ${"─".repeat(12)} ${"─".repeat(12)} ${"─".repeat(12)}  ${"─".repeat(20)}`);
    for (const r of needsDecision) {
      const diff = r.contractAmount - r.companyAmount;
      console.log(
        `    ${r.name.slice(0, 32).padEnd(32)} ${num(r.companyAmount).padStart(12)} ` +
          `${num(r.contractAmount).padStart(12)} ${(diff > 0 ? "+" : "") + num(diff)}`.padEnd(13) +
          `  ${r.accountant}`
      );
    }
  }

  const missing = rows.filter((r) => r.verdict === "shartnomasiz");
  if (missing.length) {
    console.log(
      `\n  CONTRACT YARATILISHI KERAK — Company'da summa bor, shartnoma yo'q (${missing.length} ta).`
    );
    console.log("  Bularda ko'chirish hech narsani buzmaydi: yagona manba allaqachon Company.");
    console.log("  Birinchi 10 tasi:");
    for (const r of missing.slice(0, 10)) {
      console.log(`    ${r.name.slice(0, 40).padEnd(40)} ${num(r.companyAmount).padStart(12)} so'm`);
    }
  }

  console.log(
    "\n  KEYINGI QADAM. Yuqoridagi ro'yxat buxgalteriya tomonidan tasdiqlangach:\n" +
      "    1) qaror qilingan summa Contract.amount ga yoziladi;\n" +
      "    2) shartnomasiz firmalarga Contract yaratiladi;\n" +
      "    3) shundan keyingina lib/debt.ts Contract'dan o'qishga o'tkaziladi\n" +
      "       va Company.contractAmount/contractNumber ustunlari olib tashlanadi.\n" +
      "  CSV: npx tsx scripts/contract-amount-audit.ts --csv > sverka.csv\n"
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
