/**
 * MIJOZ KETDI — FIRMANI ARXIVLASH
 * ===============================
 * Shartnoma tugaganda firmani shunchaki "unutib qo'yish" ikki muammo qoldiradi:
 *
 *   1. `isCompanyEligible` faol firmaga har oy yangi majburiyat yaratadi —
 *      ya'ni ketgan mijoz uchun buxgalter cheksiz muddat ogohlantirish oladi;
 *   2. billing uni qarzdor deb hisoblab, guruhga to'lov talabi yuboradi.
 *
 * Shuning uchun arxivlash IKKI ishni birga qiladi: firmani nofaol qiladi va
 * uning OCHIQ majburiyatlarini bekor qiladi. Bekor qilingan majburiyat
 * o'chirilmaydi — `OPEN_OBLIGATION_STATUSES` uni sweep'dan chiqaradi, lekin
 * "yaratilgan edi, keyin bekor qilindi" izi qoladi.
 *
 * Yakunlangan (`accepted`) majburiyatlarga TEGILMAYDI — ular bajarilgan ish.
 *
 * ISHLATISH (standart holat — QURUQ, hech narsa yozilmaydi):
 *   npx tsx scripts/deactivate-company.ts "FIRMA NOMI" "BOSHQA FIRMA"
 *   npx tsx scripts/deactivate-company.ts "FIRMA NOMI" --apply
 *   npx tsx scripts/deactivate-company.ts "FIRMA" --apply --reason=archived_left
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { OPEN_OBLIGATION_STATUSES } from "@/lib/engines/workflow/obligationWorkflow";

/** `companyStatus` — nima uchun arxivlangani (dedupe-companies.ts uslubi). */
const DEFAULT_REASON = "archived_left";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const reasonArg = process.argv.find((a) => a.startsWith("--reason="));
  const reason = reasonArg ? reasonArg.split("=")[1] : DEFAULT_REASON;
  const names = process.argv.slice(2).filter((a) => !a.startsWith("--"));

  if (names.length === 0) {
    console.error('✗ Firma nomi berilmadi.\n    npx tsx scripts/deactivate-company.ts "FIRMA NOMI"');
    process.exit(1);
  }

  const companies = await prisma.company.findMany({
    where: { name: { in: names } },
    select: { id: true, name: true, isActive: true, companyStatus: true, accountantId: true },
  });

  const missing = names.filter((n) => !companies.some((c) => c.name === n));
  if (missing.length) {
    console.error(`✗ Bazada topilmadi: ${missing.join(", ")}`);
    console.error("    Nomni AYNAN bazadagidek yozing (katta-kichik harf muhim).");
    process.exit(1);
  }

  console.log(`\n📦 FIRMANI ARXIVLASH (sabab: "${reason}")\n`);
  let totalOpen = 0;
  let totalDone = 0;
  for (const c of companies) {
    const open = await prisma.obligation.count({
      where: { companyId: c.id, status: { in: OPEN_OBLIGATION_STATUSES } },
    });
    const done = await prisma.obligation.count({
      where: { companyId: c.id, status: { notIn: OPEN_OBLIGATION_STATUSES } },
    });
    totalOpen += open;
    totalDone += done;
    console.log(`  ${c.name}`);
    console.log(`     holat: isActive=${c.isActive} companyStatus=${c.companyStatus ?? "-"}`);
    console.log(`     majburiyat: ${open} ochiq → bekor qilinadi | ${done} yakunlangan → tegilmaydi`);
  }
  console.log(`\n  JAMI: ${companies.length} firma, ${totalOpen} ochiq majburiyat bekor qilinadi.`);

  if (!apply) {
    console.log(`\n— Quruq ishlash, hech narsa o'zgarmadi.\n  Yozish uchun: --apply qo'shing.`);
    await prisma.$disconnect();
    return;
  }

  const ids = companies.map((c) => c.id);
  const [comp, obl] = await prisma.$transaction([
    prisma.company.updateMany({
      where: { id: { in: ids } },
      data: { isActive: false, companyStatus: reason },
    }),
    prisma.obligation.updateMany({
      where: { companyId: { in: ids }, status: { in: OPEN_OBLIGATION_STATUSES } },
      data: { status: "cancelled", completedAt: new Date() },
    }),
  ]);

  console.log(`\n✅ ${comp.count} firma arxivlandi, ${obl.count} majburiyat bekor qilindi.`);
  console.log("   Endi ularga yangi majburiyat yaratilmaydi va billing eslatmasi bormaydi.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("deactivate-company failed:", e);
  process.exit(1);
});
