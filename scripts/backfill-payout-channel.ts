/**
 * ESKI OYLIK TO'LOVLARINI MANBAGA BOG'LASH (bir martalik)
 * ======================================================
 *
 *   npx tsx scripts/backfill-payout-channel.ts                    # DRY-RUN
 *   npx tsx scripts/backfill-payout-channel.ts --map naqd=<id>    # qo'lda xarita
 *   npx tsx scripts/backfill-payout-channel.ts --apply
 *
 * `Payout.channelId` 2026-09-07 da qo'shildi. Undan oldingi to'lovlar
 * kanalsiz yozilgan: summa balansda to'g'ri turadi, lekin kassalar jadvalida
 * "Kanali ko'rsatilmagan" qatorida qoladi — ya'ni qaysi hisob kamaygani
 * noma'lum. Bu skript ularni bog'laydi.
 *
 * TAXMIN QILINMAYDI. Bog'lash faqat MANBA BIR XIL bo'lganda avtomatik:
 * to'lov usuli (`paymentMethod`) mos keladigan FAOL kanal bazada bittagina
 * bo'lsa. Bir nechta bo'lsa qator qoldiriladi va operator `--map` bilan
 * o'zi aytadi. Sabab `scripts/post-transit-salary.ts` dagi bilan bir xil:
 * noto'g'ri kassaga yozilgan chiqim ikki hisobni birdan buzadi
 * (biri kam chiqadi, ikkinchisi ko'p) va uni keyin farqlash qiyin.
 *
 * JURNAL. Payout qatori bilan birga uning CASH oyog'i ham yangilanadi —
 * kassalar jadvali (`server/kassaReport.ts`) jurnaldan o'qiydi, jadvaldan
 * emas. Bu summani O'ZGARTIRMAYDI, faqat o'lchov (kanal) to'ldiriladi;
 * `scripts/backfill-payment-channels.ts` da ham xuddi shunday qilingan.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { formatNum as som } from "@/lib/platform/format";
import { PAYOUT_METHOD_BY_CHANNEL, normalizeChannelType } from "@/lib/transitChannels";

/** `--map naqd=<id>,plastik=<id>` → { naqd: id, plastik: id } */
function parseMap(argv: string[]): Record<string, string> {
  const i = argv.indexOf("--map");
  if (i === -1 || !argv[i + 1]) return {};
  const out: Record<string, string> = {};
  for (const pair of argv[i + 1].split(",")) {
    const [method, id] = pair.split("=");
    if (method && id) out[method.trim()] = id.trim();
  }
  return out;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const manual = parseMap(process.argv);

  const channels = await prisma.disbursementChannel.findMany({
    select: { id: true, type: true, label: true, isActive: true },
  });
  const channelById = new Map(channels.map((c) => [c.id, c]));

  // Usul → faol kanallar. Kanal turidan usul chiqadi (`createPayout` ham
  // shu xaritadan foydalanadi), ya'ni ikki tomon bir qoidada.
  const byMethod = new Map<string, { id: string; label: string }[]>();
  for (const c of channels) {
    if (!c.isActive) continue;
    const kind = normalizeChannelType(c.type);
    if (!kind) continue;
    const method = PAYOUT_METHOD_BY_CHANNEL[kind];
    byMethod.set(method, [...(byMethod.get(method) ?? []), { id: c.id, label: c.label }]);
  }

  const payouts = await prisma.payout.findMany({
    where: { channelId: null, deletedAt: null },
    select: { id: true, amount: true, paymentMethod: true, month: true, employee: { select: { fullName: true } } },
    orderBy: { paidAt: "asc" },
  });

  const fixes: { id: string; channelId: string }[] = [];
  const skipped = new Map<string, { count: number; sum: number }>();
  const perChannel = new Map<string, { count: number; sum: number }>();

  for (const p of payouts) {
    const amount = Number(p.amount);
    const method = p.paymentMethod;
    // 1) Operator aytgan xarita — eng kuchli.
    // 2) Aks holda: usulga mos YAGONA faol kanal.
    const manualId = manual[method];
    const candidates = byMethod.get(method) ?? [];
    const channelId =
      (manualId && channelById.has(manualId) ? manualId : undefined) ??
      (candidates.length === 1 ? candidates[0].id : undefined);

    if (!channelId) {
      const reason = candidates.length === 0
        ? `${method}: mos faol kanal yo'q`
        : `${method}: ${candidates.length} ta nomzod — --map bilan tanlang`;
      const prev = skipped.get(reason) ?? { count: 0, sum: 0 };
      skipped.set(reason, { count: prev.count + 1, sum: prev.sum + amount });
      continue;
    }
    fixes.push({ id: p.id, channelId });
    const prev = perChannel.get(channelId) ?? { count: 0, sum: 0 };
    perChannel.set(channelId, { count: prev.count + 1, sum: prev.sum + amount });
  }

  console.log("═".repeat(64));
  console.log(apply ? "REJIM: --apply" : "REJIM: DRY-RUN");
  console.log("═".repeat(64));
  console.log(`Kanalsiz oylik to'lovlari : ${payouts.length} ta`);
  console.log(`Bog'lanadi                : ${fixes.length} ta`);
  for (const [id, agg] of perChannel) {
    const label = channelById.get(id)?.label ?? id;
    console.log(`   ${label.padEnd(30)} ${String(agg.count).padStart(4)} ta ${som(agg.sum).padStart(16)} so'm`);
  }
  if (skipped.size > 0) {
    console.log("\nQOLDIRILDI (taxmin qilinmaydi):");
    for (const [reason, agg] of skipped) {
      console.log(`   ${reason.padEnd(44)} ${String(agg.count).padStart(4)} ta ${som(agg.sum).padStart(16)} so'm`);
    }
    console.log("\n   Mavjud faol kanallar (usul bo'yicha):");
    for (const [method, list] of byMethod) {
      for (const c of list) console.log(`     ${method.padEnd(10)} ${c.id}  ${c.label}`);
    }
  }

  if (!apply || fixes.length === 0) {
    console.log("\nHech narsa o'zgarmadi.");
    return;
  }

  let rows = 0;
  let legs = 0;
  for (const fix of fixes) {
    // Payout qatori va uning jurnal CASH oyog'i — bitta tranzaksiyada:
    // ikkisi bir-biriga zid qolmasin (jadvalda kanal bor, jurnalda yo'q).
    await prisma.$transaction(async (tx) => {
      await tx.payout.update({ where: { id: fix.id }, data: { channelId: fix.channelId } });
      rows++;
      const res = await tx.ledgerEntry.updateMany({
        where: { sourceTable: "Payout", sourceId: fix.id, accountId: "CASH", channelId: null },
        data: { channelId: fix.channelId },
      });
      legs += res.count;
    });
  }
  console.log(`\nYangilandi: ${rows} ta to'lov, ${legs} ta jurnal oyog'i.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
