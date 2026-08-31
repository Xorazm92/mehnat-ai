/**
 * O'Z FIRMALARNING BOSHLANG'ICH QOLDIG'I — VIPISKADAN, QO'LDAN EMAS.
 *
 *   npx tsx scripts/set-opening-balances.ts              # solishtiradi
 *   npx tsx scripts/set-opening-balances.ts --apply
 *
 * NEGA BU SKRIPT BOR. Qoldiq ilgari Excel "Firmalar" varag'idagi qo'lda
 * yozilgan "BANK OSTATKASI" ustunidan olinardi
 * (`scripts/import-firm-balances.ts`). 2026-09-01 auditi o'sha ustun
 * HAQIQATDAN 20 BARAVAR uzoq ekanini ko'rsatdi:
 *
 *   THE POWERFUL TEAM   36 083 174  →  haqiqiy      21 513,10
 *   SOFYTEAM            25 962 860  →  haqiqiy     236 983,47
 *   TOOLSTREK CA         1 522 260  →  haqiqiy     488 276,24
 *   qolgan 7 firma            NULL
 *
 * Ustunda sana ham yo'q edi, ya'ni raqam qaysi kunga tegishli ekani
 * noma'lum. Uchala qiymat prod bazasiga "Boshlang'ich qoldiq" kirimi
 * bo'lib tushgan va balansni 63 568 294 so'mga shishirgan.
 *
 * Endi manba — VIPISKANING O'ZI: `BankStatementImport.openingBalance` va
 * uning `periodFrom` sanasi. Ular bankdan kelgan, tekshirilgan va sanasi bor.
 *
 * Skript ikki ish qiladi: qo'ldan kelgan eski qoldiq yozuvini BEKOR QILADI
 * (yumshoq o'chirish + jurnal teskarisi) va o'rniga vipiskadagi qiymatni
 * yozadi. Idempotent: `dedupKey = "opening:<hisob>:<sana>"`.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { formatNum as som } from "@/lib/platform/format";
import { recordKassaMovement, reverseKassaMovement, runCashTx } from "@/lib/cashGate";

const CATEGORY = "Boshlang'ich qoldiq";
const apply = process.argv.includes("--apply");
const actor = { kind: "script" as const, name: "set-opening-balances" };

async function main(): Promise<void> {
  const channels = await prisma.disbursementChannel.findMany({
    where: { type: "own_firm_account", ownFirmId: { not: null } },
    select: { id: true, label: true, ownFirmId: true },
  });

  let fixed = 0;
  let reversed = 0;

  for (const ch of channels) {
    // Eng erta vipiska — o'sha davrning ochilish qoldig'i.
    const stmt = await prisma.bankStatementImport.findFirst({
      where: { account: { ownerCompanyId: ch.ownFirmId! }, openingBalance: { not: null } },
      orderBy: { periodFrom: "asc" },
      select: { openingBalance: true, periodFrom: true, accountId: true },
    });
    if (!stmt) {
      console.log(`${ch.label.padEnd(24)} vipiska yo'q — o'tkazib yuborildi`);
      continue;
    }

    const want = Number(stmt.openingBalance);
    const dedupKey = `opening:${stmt.accountId}:${stmt.periodFrom.toISOString().slice(0, 10)}`;

    // Shu kanaldagi mavjud qoldiq yozuvlari (qo'ldan kelganlari ham).
    const existing = await prisma.kassaEntry.findMany({
      where: { channelId: ch.id, category: CATEGORY, deletedAt: null },
      select: { id: true, amount: true, dedupKey: true },
    });
    const stale = existing.filter((e) => e.dedupKey !== dedupKey);
    const current = existing.find((e) => e.dedupKey === dedupKey);

    const staleSum = stale.reduce((s, e) => s + Number(e.amount), 0);
    const status = current
      ? "✓ turibdi"
      : stale.length
        ? `qo'lda yozilgan ${som(staleSum)} → vipiskadan ${som(want)}`
        : `yangi ${som(want)}`;
    console.log(`${ch.label.padEnd(24)} ${stmt.periodFrom.toISOString().slice(0, 10)}  ${status}`);

    if (!apply) continue;

    for (const e of stale) {
      const res = await runCashTx((tx) =>
        reverseKassaMovement(tx, actor, {
          kassaEntryId: e.id,
          reason: `Qo'lda yozilgan bank qoldig'i bekor qilindi — manba endi vipiska (${dedupKey})`,
        })
      );
      if (res.reversed) reversed++;
    }

    if (!current && want !== 0) {
      await runCashTx((tx) =>
        recordKassaMovement(tx, actor, {
          type: "income",
          category: CATEGORY,
          amount: want,
          date: stmt.periodFrom,
          description: `${ch.label} — vipiska ochilish qoldig'i (${stmt.periodFrom.toISOString().slice(0, 10)})`,
          channelId: ch.id,
          dedupKey,
        })
      );
      fixed++;
    }
  }

  console.log(
    `\n${apply ? `Yozildi: ${fixed} ta qoldiq · bekor qilindi: ${reversed} ta eski yozuv` : "Hech narsa o'zgarmadi. Yozish uchun: --apply"}`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
