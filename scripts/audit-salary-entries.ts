// =====================================================
// OYLIK KASSA YOZUVLARI — INVENTARIZATSIYA (Faza 4.1)
// =====================================================
//
// ⚠️ FAQAT O'QISH. `--apply` bayrog'i ATAYLAB YO'Q.
//
// NEGA. Oylik `Payout` orqali beriladi va balansdan shu yo'l bilan chiqadi
// (`lib/balance.ts` → `outflowPayroll`). Uni yana kassa chiqimi qilib yozish
// bitta pulni IKKI MARTA sanaydi, shuning uchun oylik toifasi `KassaEntry`
// da taqiqlangan. Ammo taqiq YOZUV yo'liga qo'yilgan, TARIXGA emas: prodda
// (2026-09-11) 162 ta tirik qator, 660 314 246 so'm turibdi.
//
// Faza 4.3 o'sha qatorlarni storno qiladi, lekin rejadagi QAT'IY SHART shu:
//
//   > Storno qilishda har bir tranzaksiyaning qarshi hisobi
//   > (SALARY_EXPENSE ↔ CASH) tekshirilsin. Aks holda teskari yozuv CASH ni
//   > oshirib, kassa qoldig'ini sun'iy shishirib yuboradi.
//
// Shu sababdan inventarizatsiya storno'dan OLDIN keladi va eng muhim ustuni
// — jurnal oyoqlari. Qarshi hisobi kutilganidan boshqa bo'lgan qator
// ommaviy storno partiyasiga TUSHMASLIGI kerak; u qo'lda ko'riladi.
//
// ISHLATISH:
//   npx tsx scripts/audit-salary-entries.ts
//   npx tsx scripts/audit-salary-entries.ts --json > /tmp/salary.json
//
// PROD ma'lumotiga qarshi (lokal baza prod emas):
//   ssh -i ~/Downloads/ASRO.pem -N -L 15432:localhost:5432 ubuntu@16.192.135.23
//   DATABASE_URL="postgresql://debora:root@localhost:15432/inbola?schema=public" \
//     npx tsx scripts/audit-salary-entries.ts

import "./load-env";
import { prisma } from "@/lib/prisma";
import { isSalaryCategory } from "@/lib/salaryCategory";
import { ACCOUNTS } from "@/lib/ledger";
import { formatNum as som } from "@/lib/platform/format";
import { nameCandidates, scoreMatch } from "@/lib/nameMatch";

/** Jurnal oyoqlarining storno uchun yaroqliligi. */
type LegVerdict =
  /** SALARY_EXPENSE debet / CASH kredit — kutilgan juftlik, storno xavfsiz. */
  | "kutilgan"
  /** Jurnalda izi yo'q — storno qiladigan narsa ham yo'q. */
  | "jurnalsiz"
  /** Boshqa hisoblar aralashgan — QO'LDA ko'riladi. */
  | "boshqacha";

interface Row {
  id: string;
  date: string;
  month: string;
  amount: number;
  category: string;
  description: string | null;
  channelLabel: string;
  /** `dedupKey` prefiksi — qaysi import partiyasidan kelgani. */
  source: string;
  /** Kanal egasi yoki izohdan topilgan xodim. */
  employee: string | null;
  /**
   * Ism izohdan TAXMIN qilinganmi (kanal egasi emas).
   *
   * Ataylab alohida bayroq, ismning o'ziga "(taxmin)" qo'shilmaydi: aks holda
   * bitta odam kesimda ikki qatorga bo'linib ("Alisher" va "Alisher (taxmin)")
   * uning jami oyligi ikkiga bo'lingan holda ko'rinardi — ya'ni hisobotning
   * asosiy savoli javobsiz qolardi.
   */
  employeeGuessed: boolean;
  legs: LegVerdict;
  legDetail: string;
}

function monthOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** `dedupKey` dan import manbaini ajratadi: "bank:<id>" → "bank". */
function sourceOf(dedupKey: string | null): string {
  if (!dedupKey) return "qo'lda";
  const colon = dedupKey.indexOf(":");
  return colon === -1 ? dedupKey : dedupKey.slice(0, colon);
}

function tally<T>(rows: T[], key: (r: T) => string, amount: (r: T) => number) {
  const m = new Map<string, { count: number; sum: number }>();
  for (const r of rows) {
    const k = key(r);
    const cur = m.get(k) ?? { count: 0, sum: 0 };
    cur.count += 1;
    cur.sum += amount(r);
    m.set(k, cur);
  }
  return [...m].sort((a, b) => b[1].sum - a[1].sum);
}

function printTally(title: string, rows: [string, { count: number; sum: number }][]) {
  console.log();
  console.log(`── ${title} ${"─".repeat(Math.max(0, 50 - title.length))}`);
  for (const [k, v] of rows) {
    console.log(`   ${k.padEnd(34)} ${String(v.count).padStart(4)} ta  ${som(v.sum).padStart(16)}`);
  }
}

async function main() {
  const asJson = process.argv.includes("--json");

  // Toifa qoidasi `lib/salaryCategory.ts` dan — `lib/reconciliation.ts` va
  // `lib/cashGate.ts` bilan AYNAN bir manba. Bu yerda regexni qayta yozish
  // ikki xil "oylik" ta'rifi hosil qilardi.
  const candidates = await prisma.kassaEntry.findMany({
    where: { deletedAt: null, type: "expense" },
    select: {
      id: true,
      date: true,
      amount: true,
      category: true,
      description: true,
      channelId: true,
      dedupKey: true,
    },
    orderBy: { date: "asc" },
  });
  const entries = candidates.filter((e) => isSalaryCategory(e.category));

  if (entries.length === 0) {
    console.log("Oylik toifasidagi kassa chiqimi yo'q — `salary-single-home` yashil.");
    return;
  }

  const [channels, users, legs] = await Promise.all([
    prisma.disbursementChannel.findMany({
      select: { id: true, label: true, employee: { select: { fullName: true } } },
    }),
    prisma.user.findMany({ select: { fullName: true } }),
    prisma.ledgerEntry.findMany({
      where: { sourceTable: "KassaEntry", sourceId: { in: entries.map((e) => e.id) } },
      select: { sourceId: true, accountId: true, debit: true, credit: true },
    }),
  ]);

  const channelBy = new Map(channels.map((c) => [c.id, c]));
  const legsBy = new Map<string, typeof legs>();
  for (const l of legs) {
    if (!l.sourceId) continue;
    const list = legsBy.get(l.sourceId) ?? [];
    list.push(l);
    legsBy.set(l.sourceId, list);
  }

  const rows: Row[] = entries.map((e) => {
    const channel = e.channelId ? channelBy.get(e.channelId) : undefined;
    const mine = legsBy.get(e.id) ?? [];

    // ── QARSHI HISOB TEKSHIRUVI ────────────────────────────────────────
    // Kutilgani AYNAN ikki oyoq: SALARY_EXPENSE debet, CASH kredit. Undan
    // farq qilgan har qanday shakl ommaviy storno'ga tushmaydi.
    let verdict: LegVerdict;
    let legDetail: string;
    if (mine.length === 0) {
      verdict = "jurnalsiz";
      legDetail = "jurnalda iz yo'q";
    } else {
      const salaryDebit = mine.filter(
        (l) => l.accountId === ACCOUNTS.SALARY_EXPENSE && Number(l.debit) > 0
      );
      const cashCredit = mine.filter(
        (l) => l.accountId === ACCOUNTS.CASH && Number(l.credit) > 0
      );
      const expected = mine.length === 2 && salaryDebit.length === 1 && cashCredit.length === 1;
      verdict = expected ? "kutilgan" : "boshqacha";
      legDetail = expected
        ? "SALARY_EXPENSE debet / CASH kredit"
        : mine
            .map((l) => `${l.accountId}${Number(l.debit) > 0 ? " D" : " K"}`)
            .join(" · ");
    }

    // Xodim: avval kanal egasi (ishonchli), bo'lmasa izohdan TAXMIN.
    let employee: string | null = channel?.employee?.fullName ?? null;
    let employeeGuessed = false;
    if (!employee && e.description) {
      const cands = nameCandidates(e.description);
      for (const u of users) {
        const tier = scoreMatch(cands, u.fullName).tier;
        if (tier === "exact" || tier === "near") {
          employee = u.fullName;
          employeeGuessed = true;
          break;
        }
      }
    }

    return {
      id: e.id,
      date: e.date.toISOString().slice(0, 10),
      month: monthOf(e.date),
      amount: Number(e.amount),
      category: e.category,
      description: e.description,
      channelLabel: channel?.label ?? (e.channelId ? "(o'chirilgan kanal)" : "(kanalsiz)"),
      source: sourceOf(e.dedupKey),
      employee,
      employeeGuessed,
      legs: verdict,
      legDetail,
    };
  });

  const total = rows.reduce((s, r) => s + r.amount, 0);

  if (asJson) {
    console.log(JSON.stringify({ count: rows.length, total, rows }, null, 2));
    return;
  }

  console.log("═".repeat(64));
  console.log("OYLIK KASSA YOZUVLARI — INVENTARIZATSIYA (faqat o'qish)");
  console.log("═".repeat(64));
  console.log(`Jami: ${rows.length} ta yozuv · ${som(total)} so'm`);

  printTally("OY BO'YICHA", tally(rows, (r) => r.month, (r) => r.amount));
  printTally("KANAL BO'YICHA", tally(rows, (r) => r.channelLabel, (r) => r.amount));
  printTally("IMPORT MANBAI BO'YICHA", tally(rows, (r) => r.source, (r) => r.amount));
  printTally("TOIFA MATNI BO'YICHA", tally(rows, (r) => r.category, (r) => r.amount));
  // Xodim kesimi — kanal egasi va izohdan taxmin qilingani BIR guruhda.
  // Taxminiy qatorlar soni alohida ko'rsatiladi: raqam aniq, manbasi shubhali
  // bo'lsa buni ko'rish kerak.
  const guessedBy = new Map<string, number>();
  for (const r of rows) {
    if (!r.employeeGuessed) continue;
    const k = r.employee ?? "(aniqlanmadi)";
    guessedBy.set(k, (guessedBy.get(k) ?? 0) + 1);
  }
  printTally(
    "XODIM BO'YICHA",
    tally(rows, (r) => r.employee ?? "(aniqlanmadi)", (r) => r.amount).map(
      ([k, v]) => {
        const g = guessedBy.get(k) ?? 0;
        return [g > 0 ? `${k} · ${g} taxminiy` : k, v] as [string, typeof v];
      }
    )
  );

  // ── STORNO TAYYORLIGI — eng muhim bo'lim ─────────────────────────────
  printTally("JURNAL OYOQLARI", tally(rows, (r) => r.legs, (r) => r.amount));

  const risky = rows.filter((r) => r.legs !== "kutilgan");
  console.log();
  console.log("─".repeat(64));
  if (risky.length === 0) {
    console.log("Hamma yozuvda qarshi hisob KUTILGAN shaklda (SALARY_EXPENSE ↔ CASH).");
    console.log("Faza 4.3 ommaviy storno'si shu qatorlar uchun xavfsiz.");
  } else {
    console.log(`⚠ ${risky.length} ta yozuv ommaviy storno'ga TUSHMASLIGI kerak:`);
    for (const r of risky.slice(0, 40)) {
      console.log(`   ${r.date}  ${som(r.amount).padStart(14)}  ${r.legs.padEnd(10)} ${r.legDetail}`);
      console.log(`       ${r.channelLabel} · ${r.description ?? "(izohsiz)"}`);
    }
    if (risky.length > 40) console.log(`   … yana ${risky.length - 40} ta`);
    console.log();
    console.log("Sabab: teskari yozuv CASH ni oshirib, kassa qoldig'ini sun'iy shishirishi mumkin.");
  }
  console.log();
  console.log("Bu skript hech narsani o'zgartirmaydi — storno alohida qadam.");
}

main()
  .catch((e) => {
    console.error("XATO:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
