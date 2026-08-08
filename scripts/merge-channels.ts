/**
 * TAKRORLANGAN TRANZIT KANALLARINI BIRLASHTIRISH.
 *
 *   npx tsx scripts/merge-channels.ts --dry-run
 *   npx tsx scripts/merge-channels.ts
 *
 * MUAMMO: kanallar ikki manbadan paydo bo'lgan —
 *   (a) vipiskadan avtomat (`autoCreateChannelsFromStatements`), nomi
 *       o'tkazma matnidan olingan: "ABRORBEK BOBOJONOV";
 *   (b) "Band qilganlar" reyestridan: "BOBOJONOV ABRORBEK".
 * Natijada bitta odam bir nechta kanal bo'lib, tranzit qoldig'i bo'linib
 * ketgan.
 *
 * BU SKRIPT PULGA TEGADI, shuning uchun qoida ATAYIN QAT'IY: ikki kanal
 * faqat ism BELGILARI AYNAN mos kelganda birlashtiriladi (so'zlar tartibi
 * va transliteratsiya farqi hisobga olinadi, boshqasi emas). Shubhali
 * juftliklar birlashtirilmaydi — ro'yxatga chiqariladi.
 *
 * Noto'g'ri birlashtirish bir odamning pulini boshqasiga o'tkazib yuboradi.
 */
import "./load-env"; // birinchi bo'lishi shart
import { prisma } from "@/lib/prisma";

/**
 * Ismni solishtirish uchun normallashtiradi.
 *
 * O'zbek ismlari ikki xil transliteratsiyada yoziladi (rus/lotin):
 *   KHIKMATULLAEVA MAHMUDAKHON  ↔  XIKMATULLAYEVA MAHMUDAXON
 * `kh→x`, `ye→e`, apostroflar olib tashlanadi, so'zlar SARALANADI —
 * shunda "ABROR BOBOJONOV" va "BOBOJONOV ABROR" bir xil kalit beradi.
 */
export function nameKey(raw: string): string {
  const folded = raw
    .toLowerCase()
    .replace(/[`'‘’"]/g, "")
    .replace(/kh/g, "x")
    .replace(/ye/g, "e")
    .replace(/\s+/g, " ")
    .trim();
  return folded.split(" ").filter(Boolean).sort().join(" ");
}

interface ChannelRow {
  id: string;
  label: string;
  cardMask: string | null;
  employeeId: string | null;
  ownFirmId: string | null;
  certificateNo: string | null;
  pinfl: string | null;
  transitAccount: string | null;
  createdAt: Date;
  _count: { entries: number; cards: number };
}

/** Qaysi kanal saqlanadi: reyestr ma'lumoti borligi, keyin harakat soni. */
function pickSurvivor(group: ChannelRow[]): ChannelRow {
  return [...group].sort((a, b) => {
    const richA = (a.certificateNo || a.pinfl || a.transitAccount) ? 1 : 0;
    const richB = (b.certificateNo || b.pinfl || b.transitAccount) ? 1 : 0;
    if (richA !== richB) return richB - richA;
    if (a._count.entries !== b._count.entries) return b._count.entries - a._count.entries;
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0];
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const channels = (await prisma.disbursementChannel.findMany({
    select: {
      id: true, label: true, cardMask: true, employeeId: true, ownFirmId: true,
      certificateNo: true, pinfl: true, transitAccount: true, createdAt: true,
      _count: { select: { entries: true, cards: true } },
    },
    orderBy: { label: "asc" },
  })) as ChannelRow[];

  const groups = new Map<string, ChannelRow[]>();
  for (const c of channels) {
    const key = nameKey(c.label);
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }

  const duplicates = [...groups.entries()].filter(([, g]) => g.length > 1);
  const singles = [...groups.values()].filter((g) => g.length === 1).length;

  console.log(`Kanal: ${channels.length} · noyob odam: ${groups.size} · birlashtiriladi: ${duplicates.length} guruh`);

  if (duplicates.length === 0) {
    console.log("Takrorlanish topilmadi.");
  }

  let moved = 0;
  let removed = 0;

  for (const [key, group] of duplicates) {
    const survivor = pickSurvivor(group);
    const losers = group.filter((c) => c.id !== survivor.id);

    console.log(`\n▸ ${key}`);
    console.log(`   SAQLANADI  ${survivor.label.padEnd(34)} ${(survivor.cardMask ?? "kartasiz").padEnd(14)} ${survivor._count.entries} harakat`);
    for (const l of losers) {
      console.log(`   qo'shiladi ${l.label.padEnd(34)} ${(l.cardMask ?? "kartasiz").padEnd(14)} ${l._count.entries} harakat`);
    }

    if (dryRun) continue;

    for (const loser of losers) {
      await prisma.$transaction(async (tx) => {
        // Kartani saqlab qolamiz — bank o'tkazmasi shu karta orqali keladi.
        if (loser.cardMask) {
          const taken = await tx.channelCard.findUnique({ where: { cardMask: loser.cardMask } });
          if (taken) {
            await tx.channelCard.update({ where: { id: taken.id }, data: { channelId: survivor.id, isPrimary: false } });
          } else {
            await tx.channelCard.create({
              data: { channelId: survivor.id, cardMask: loser.cardMask, isPrimary: false },
            });
          }
        }
        await tx.transitEntry.updateMany({ where: { channelId: loser.id }, data: { channelId: survivor.id } });
        await tx.channelCard.updateMany({ where: { channelId: loser.id }, data: { channelId: survivor.id } });

        // Yetishmayotgan reyestr ma'lumotini omon qolgan kanalga ko'chiramiz.
        await tx.disbursementChannel.update({
          where: { id: survivor.id },
          data: {
            employeeId: survivor.employeeId ?? loser.employeeId,
            ownFirmId: survivor.ownFirmId ?? loser.ownFirmId,
            certificateNo: survivor.certificateNo ?? loser.certificateNo,
            pinfl: survivor.pinfl ?? loser.pinfl,
            transitAccount: survivor.transitAccount ?? loser.transitAccount,
          },
        });

        await tx.disbursementChannel.delete({ where: { id: loser.id } });
      });
      moved += loser._count.entries;
      removed++;
    }
  }

  // ── Birlashmagan, lekin shubhali juftliklar ────────────────────────────
  // Qat'iy qoida familiya/patronim farqini o'tkazmaydi. Ularni KO'RSATAMIZ,
  // lekin avtomatik tegmaymiz.
  const remaining = await prisma.disbursementChannel.findMany({
    select: { id: true, label: true, cardMask: true, _count: { select: { entries: true } } },
    orderBy: { label: "asc" },
  });
  const suspicious: string[] = [];
  for (let i = 0; i < remaining.length; i++) {
    for (let j = i + 1; j < remaining.length; j++) {
      const a = nameKey(remaining[i].label).split(" ");
      const b = nameKey(remaining[j].label).split(" ");
      const shared = a.filter((t) => t.length > 3 && b.includes(t));
      if (shared.length > 0) {
        suspicious.push(`${remaining[i].label}  ↔  ${remaining[j].label}   (umumiy: ${shared.join(", ")})`);
      }
    }
  }
  if (suspicious.length > 0) {
    console.log(`\n📋 QO'LDA KO'RIB CHIQISH — o'xshash, lekin avtomatik birlashtirilmadi (${suspicious.length}):`);
    for (const s of suspicious) console.log(`   ${s}`);
  }

  if (dryRun) {
    console.log("\n--dry-run: hech narsa o'zgarmadi.");
    return;
  }

  console.log(`\n✓ ${removed} ta kanal birlashtirildi, ${moved} harakat ko'chirildi`);
  const after = await prisma.disbursementChannel.count();
  const cards = await prisma.channelCard.count();
  console.log(`Qoldi: ${after} kanal, ${cards} karta`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
