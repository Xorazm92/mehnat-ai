/**
 * FIRMA NOMINI O'ZGARTIRISH: HOME SPOT STORY → FININFO
 * ====================================================
 *
 *   npx tsx scripts/rename-firm.ts            # DRY-RUN
 *   npx tsx scripts/rename-firm.ts --apply
 *
 * Uch joyda bir vaqtda (nomlar turli jadvallarda takrorlangan):
 *   · Company.name        (isOwnFirma)
 *   · DisbursementChannel.label   (kassa manbasi ko'rinishi)
 *   · BankAccount.label           (vipiska hisobi yorlig'i)
 */
import "./load-env";
import { prisma } from "@/lib/prisma";

const NEW = "FININFO";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const companies = await prisma.company.findMany({
    where: { name: { contains: "HOME SPOT" } },
    select: { id: true, name: true, isOwnFirm: true },
  });
  const channels = await prisma.disbursementChannel.findMany({
    where: { label: { contains: "HOME SPOT" } },
    select: { id: true, label: true },
  });
  const accounts = await prisma.bankAccount.findMany({
    where: { OR: [{ label: { contains: "HOME SPOT" } }] },
    select: { id: true, label: true, accountNumber: true },
  });

  console.log("═".repeat(60));
  console.log(apply ? "REJIM: --apply" : "REJIM: DRY-RUN");
  console.log(`Company : ${companies.map((c) => c.name).join(", ") || "yo'q"}`);
  console.log(`Kanal   : ${channels.map((c) => c.label).join(", ") || "yo'q"}`);
  console.log(`Hisob   : ${accounts.map((a) => a.label ?? a.accountNumber).join(", ") || "yo'q"}`);
  if (!apply) {
    console.log("\nBajarish: npx tsx scripts/rename-firm.ts --apply");
    return;
  }

  for (const c of companies) {
    await prisma.company.update({ where: { id: c.id }, data: { name: NEW } });
  }
  for (const c of channels) {
    await prisma.disbursementChannel.update({ where: { id: c.id }, data: { label: NEW } });
  }
  for (const a of accounts) {
    await prisma.bankAccount.update({ where: { id: a.id }, data: { label: NEW } });
  }
  console.log(`\n✓ ${NEW} deb o'zgartirildi.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
