// =====================================================
// KANALNI EGASIGA BOG'LASH — taklif qiladi, yozmaydi
// =====================================================
//
// NEGA KERAK. `DisbursementChannel.employeeId` bo'sh bo'lsa, o'sha kanaldan
// berilgan pul KIMGA ketganini tizim bilmaydi. Bu ikki joyda TO'SIQ bo'lib
// turibdi va ikkalasining sababi bitta:
//
//   1. Oylikni `Payout` ga ko'chirib bo'lmaydi — `Payout.employeeId`
//      MAJBURIY maydon. Prodda 81 ta avgust oylik qatoridan 19 tasi
//      (93 564 352 so'm) aynan shu sababdan ko'chmay qoladi.
//   2. Avgust oyligini yozib bo'lmaydi — `createPayout` `channelId` ni
//      talab qiladi va ekran kanalni xodim bo'yicha taklif qiladi.
//      26 xodimdan 7 tasi shu sababdan bloklangan.
//
// Kanal nomi odatda xodimning to'liq F.I.Sh. si ("XIKMATULLAYEVA
// MAHMUDAXON"), shuning uchun moslikni TAKLIF qilish mumkin — lekin
// TASDIQLASH odamniki: noto'g'ri bog'lash pulni boshqa odamga yozadi.
//
// ISHLATISH:
//   npx tsx scripts/link-channel-employees.ts            # taklif (DRY-RUN)
//   npx tsx scripts/link-channel-employees.ts --apply    # bog'laydi
//
// `--apply` FAQAT ANIQ mosliklarni yozadi (bitta nomzod, `exact`/`near`).
// Shubhali va ko'p nomzodli qatorlar HECH QACHON avtomatik bog'lanmaydi.

import "./load-env";
import { makePrisma } from "./_bootstrap";
import { nameCandidates, scoreMatch } from "@/lib/nameMatch";
import { formatNum as som } from "@/lib/platform/format";

interface Proposal {
  channelId: string;
  channelLabel: string;
  channelType: string;
  /** Shu kanaldan chiqqan oylik qatorlari (nechta / qancha). */
  salaryCount: number;
  salarySum: number;
  candidates: { id: string; fullName: string; tier: string }[];
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma, pool } = makePrisma();

  const [channels, users] = await Promise.all([
    prisma.disbursementChannel.findMany({
      where: { employeeId: null },
      select: { id: true, label: true, type: true },
    }),
    // Ishdan bo'shaganlar ham kiradi: kanal o'tgan oyning pulini olgan
    // xodimga tegishli bo'lishi mumkin.
    prisma.user.findMany({ select: { id: true, fullName: true } }),
  ]);

  // Har kanaldan qancha oylik chiqqani — muhimlik tartibi uchun.
  const salary = await prisma.kassaEntry.groupBy({
    by: ["channelId"],
    where: { deletedAt: null, type: "expense", channelId: { in: channels.map((c) => c.id) } },
    _count: true,
    _sum: { amount: true },
  });
  const salaryBy = new Map(salary.map((s) => [s.channelId!, s]));

  const proposals: Proposal[] = channels.map((c) => {
    const exact = users.filter((u) => scoreMatch(nameCandidates(c.label), u.fullName).tier === "exact");
    const near = users.filter((u) => scoreMatch(nameCandidates(c.label), u.fullName).tier === "near");
    const hits = exact.length > 0 ? exact : near;
    const tier = exact.length > 0 ? "exact" : "near";
    const agg = salaryBy.get(c.id);
    return {
      channelId: c.id,
      channelLabel: c.label,
      channelType: c.type,
      salaryCount: agg?._count ?? 0,
      salarySum: Number(agg?._sum.amount ?? 0),
      candidates: hits.map((h) => ({ id: h.id, fullName: h.fullName, tier })),
    };
  });

  const sure = proposals.filter((p) => p.candidates.length === 1);
  const ambiguous = proposals.filter((p) => p.candidates.length > 1);
  const none = proposals.filter((p) => p.candidates.length === 0);

  console.log("═".repeat(70));
  console.log(`KANAL → XODIM BOG'LANISHI  (${apply ? "--apply" : "DRY-RUN"})`);
  console.log("═".repeat(70));
  console.log(`Egasi belgilanmagan kanal: ${channels.length} ta`);

  console.log(`\n── ANIQ MOSLIK — ${sure.length} ta ${"─".repeat(40)}`);
  for (const p of sure.sort((a, b) => b.salarySum - a.salarySum)) {
    const c = p.candidates[0];
    console.log(`   ${p.channelLabel.padEnd(38)} → ${c.fullName}  [${c.tier}]`);
    if (p.salaryCount > 0) console.log(`       ${p.salaryCount} ta chiqim · ${som(p.salarySum)} so'm`);
  }

  if (ambiguous.length > 0) {
    console.log(`\n── KO'P NOMZOD — ${ambiguous.length} ta (QO'LDA) ${"─".repeat(28)}`);
    for (const p of ambiguous) {
      console.log(`   ${p.channelLabel.padEnd(38)} → ${p.candidates.map((c) => c.fullName).join(" · ")}`);
    }
  }
  if (none.length > 0) {
    console.log(`\n── MOSLIK YO'Q — ${none.length} ta (QO'LDA) ${"─".repeat(30)}`);
    for (const p of none.sort((a, b) => b.salarySum - a.salarySum)) {
      console.log(`   ${p.channelLabel.padEnd(38)} ${p.salaryCount > 0 ? `${p.salaryCount} ta · ${som(p.salarySum)}` : ""}`);
    }
  }

  if (!apply) {
    console.log(`\n  DRY-RUN — hech narsa yozilmadi. Bog'lash uchun: --apply`);
    console.log(`  (faqat yuqoridagi ${sure.length} ta ANIQ moslik yoziladi)`);
  } else {
    let done = 0;
    for (const p of sure) {
      await prisma.disbursementChannel.update({
        where: { id: p.channelId },
        data: { employeeId: p.candidates[0].id },
      });
      done++;
    }
    console.log(`\n✓ ${done} ta kanal egasiga bog'landi.`);
    console.log(`  Qolgani qo'lda: ko'p nomzod ${ambiguous.length} · moslik yo'q ${none.length}`);
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error("XATO:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
