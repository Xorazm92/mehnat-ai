/**
 * O'Z FIRMA SCHYOTLARINI PUL MANBAI SIFATIDA RO'YXATGA OLISH
 * ==========================================================
 * Har bir `isOwnFirm` firma uchun bitta `DisbursementChannel` yaratadi
 * (`type = "own_firm_account"`). Shundan keyin xarajat/kassa formasidagi
 * "pul manbai" tanlagichida schyotlar ham, plastik kartalar ham chiqadi.
 *
 * NEGA YANGI JADVAL EMAS: `DisbursementChannel` boshidanoq ikkala turni
 * nazarda tutgan — `KassaEntry.channelId` izohi buni aniq yozadi ("o'z bank
 * hisobi, naqd, plastik yoki xodim kartasi"). Jadvalda `ownFirmId`, `mfo`,
 * `transitAccount` maydonlari allaqachon bor.
 *
 * IDEMPOTENT: `@@unique([type, cardMask])` bu yerda yordam bermaydi (schyotda
 * karta yo'q), shuning uchun moslik `type + ownFirmId` bo'yicha topiladi.
 * Qayta ishga tushirish dublikat yaratmaydi.
 *
 * BANK REKVIZITLARI ATAYLAB BO'SH qoldiriladi: ularni skript ichiga yozib
 * qo'yish — taxmin qilish demak. MFO va hisob raqamini keyin firma
 * kartochkasidan to'ldirasiz; manba tanlash ularsiz ham ishlaydi.
 *
 *   npx tsx scripts/seed-own-firm-accounts.ts            # nima bo'lishini ko'rsatadi
 *   npx tsx scripts/seed-own-firm-accounts.ts --apply    # yozadi
 */
import "./load-env";
import { prisma } from "@/lib/prisma";

const CHANNEL_TYPE = "own_firm_account";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const ownFirms = await prisma.company.findMany({
    where: { isOwnFirm: true },
    select: { id: true, name: true, inn: true, isActive: true },
    orderBy: { name: "asc" },
  });

  if (ownFirms.length === 0) {
    console.error("✗ `isOwnFirm` belgilangan firma yo'q — avval o'z firmalarni belgilang.");
    process.exit(1);
  }

  const existing = await prisma.disbursementChannel.findMany({
    where: { type: CHANNEL_TYPE },
    select: { id: true, ownFirmId: true, label: true, isActive: true },
  });
  const byFirm = new Map(existing.map((c) => [c.ownFirmId, c]));

  const toCreate = ownFirms.filter((f) => !byFirm.has(f.id));
  const already = ownFirms.length - toCreate.length;

  console.log();
  console.log(`O'Z FIRMA SCHYOTLARI — manba kanali (${CHANNEL_TYPE})`);
  console.log(`  o'z firma        : ${ownFirms.length}`);
  console.log(`  allaqachon bor   : ${already}`);
  console.log(`  yaratiladi       : ${toCreate.length}`);
  console.log();

  for (const f of ownFirms) {
    const mark = byFirm.has(f.id) ? "=" : "+";
    console.log(`  ${mark} ${f.name.padEnd(34)} STIR ${f.inn}${f.isActive ? "" : "   (NOFAOL firma)"}`);
  }
  console.log();

  if (!apply) {
    console.log("─".repeat(64));
    console.log("Hech narsa yozilmadi. Yozish uchun:");
    console.log("   npx tsx scripts/seed-own-firm-accounts.ts --apply");
    await prisma.$disconnect();
    return;
  }

  if (toCreate.length === 0) {
    console.log("✓ Hammasi allaqachon ro'yxatda — o'zgarish yo'q.");
    await prisma.$disconnect();
    return;
  }

  // Bitta tranzaksiya + son tasdig'i: yarim ro'yxat qolmasin.
  const before = await prisma.disbursementChannel.count({ where: { type: CHANNEL_TYPE } });

  await prisma.$transaction(async (tx) => {
    for (const f of toCreate) {
      await tx.disbursementChannel.create({
        data: {
          type: CHANNEL_TYPE,
          label: f.name,
          ownFirmId: f.id,
          // Rekvizitlar keyin to'ldiriladi — taxmin yozilmaydi.
          cardMask: null,
          mfo: null,
          transitAccount: null,
          isActive: f.isActive,
          notes: "O'z firma bank hisobi (schyot) — pul manbai sifatida",
        },
      });
    }

    const after = await tx.disbursementChannel.count({ where: { type: CHANNEL_TYPE } });
    const expected = before + toCreate.length;
    if (after !== expected) {
      throw new Error(`kanal soni ${after} ≠ kutilgan ${expected} — ROLLBACK`);
    }
  });

  const after = await prisma.disbursementChannel.count({ where: { type: CHANNEL_TYPE } });
  console.log(`✓ Yaratildi: ${toCreate.length} ta.  Schyot kanallari: ${before} → ${after}`);
  console.log("\n  Bank rekvizitlarini (MFO, hisob raqami) keyin to'ldiring —");
  console.log("  manba tanlash ularsiz ham ishlaydi.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("✗ seed-own-firm-accounts yiqildi:", e instanceof Error ? e.message : e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
