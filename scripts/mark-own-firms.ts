/**
 * O'Z FIRMALARNI BELGILASH va ularning bank hisoblarini ro'yxatga olish.
 *
 * Muammo: mijozlarning to'lovi ASRO'ning 10 ta yuridik shaxsi hisobiga
 * tushadi, lekin bu firmalar bazada oddiy mijoz sifatida turibdi — har birida
 * "contractAmount = 1 mln" va biriktirilgan buxgalter bilan. Natijada ular
 * mijozlar ro'yxatida, qarzdorlikda va payrollda qatnashib qolgan.
 *
 * Bu skript:
 *   1) STIR bo'yicha topib `isOwnFirm = true` qo'yadi;
 *   2) har biriga `BankAccount` yozuvini yaratadi (hisob raqami vipiskadan);
 *   3) bazada yo'q firmani (HOME SPOT STORY) qo'shadi.
 *
 * Idempotent: qayta ishga tushirilsa dublikat yaratmaydi.
 *
 *   npx tsx scripts/mark-own-firms.ts --dry-run
 *   npx tsx scripts/mark-own-firms.ts
 */
import "./load-env"; // birinchi bo'lishi shart: Prisma'dan oldin DATABASE_URL
import { prisma } from "@/lib/prisma";

/**
 * O'z firmalarimiz — STIR, hisob raqami va vipiskadagi nomi.
 * Manba: cash_json_files/ dagi 10 ta vipiska sarlavhasi (07.2026).
 */
const OWN_FIRMS = [
  { inn: "304868808", account: "20208000600767792001", label: "BAROKAT TEAM", file: "BAROKAT" },
  { inn: "310844581", account: "20208000005723186001", label: "HOME SPOT STORY", file: "FIN INFO" },
  { inn: "302672452", account: "20208000600247427001", label: "FINANCE COUNCIL", file: "FINANCE COUNCIL" },
  { inn: "307077420", account: "20208000905169375001", label: "MOLIYA AI", file: "MOLIA AI" },
  { inn: "310224847", account: "20208000505693968001", label: "THE POWERFUL TEAM", file: "POWERFUL" },
  { inn: "308435425", account: "20208000205381534001", label: "SARDORBEK HOUSE", file: "SARDORBEK" },
  { inn: "306918663", account: "20208000405149695001", label: "SEVEN'S UP", file: "SEVEN'S UP" },
  { inn: "309058750", account: "20208000905462530001", label: "SOFYTEAM", file: "SOFY TEAM" },
  { inn: "307609477", account: "20208000805261461001", label: "TASTIFY", file: "TASTIFY" },
  { inn: "309850241", account: "20208000805572940001", label: "TOOLSTREK CA", file: "TOOLSTREAK" },
] as const;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) console.log("--dry-run: hech narsa yozilmaydi\n");

  let marked = 0;
  let created = 0;
  let accounts = 0;
  const review: string[] = [];

  for (const firm of OWN_FIRMS) {
    // STIR unikal emas — bir nechta mos kelsa qo'lda ko'rib chiqiladi.
    const matches = await prisma.company.findMany({
      where: { inn: firm.inn },
      select: { id: true, name: true, isOwnFirm: true, isActive: true },
    });

    if (matches.length > 1) {
      review.push(
        `${firm.label} (${firm.inn}): bazada ${matches.length} ta firma bor — ` +
          matches.map((m) => `${m.name}[${m.id.slice(0, 8)}]`).join(", ")
      );
    }

    let companyId: string;
    if (matches.length === 0) {
      console.log(`  + YANGI firma: ${firm.label} (${firm.inn}) — bazada yo'q edi`);
      if (dryRun) {
        companyId = "(dry-run)";
      } else {
        const c = await prisma.company.create({
          data: { name: firm.label, inn: firm.inn, isOwnFirm: true },
          select: { id: true },
        });
        companyId = c.id;
      }
      created++;
    } else {
      const target = matches[0];
      companyId = target.id;
      if (target.isOwnFirm) {
        console.log(`  = ${firm.label} — allaqachon o'z firma`);
      } else {
        console.log(`  ✓ ${firm.label} (${target.name}) → isOwnFirm`);
        marked++;
        if (!dryRun) {
          await prisma.company.update({
            where: { id: target.id },
            data: { isOwnFirm: true },
          });
        }
      }
    }

    // Bank hisobi — accountNumber unikal, shuning uchun upsert xavfsiz.
    const existing = await prisma.bankAccount.findUnique({
      where: { accountNumber: firm.account },
      select: { id: true },
    });
    if (existing) {
      console.log(`      hisob ${firm.account} allaqachon bor`);
    } else {
      console.log(`      + hisob ${firm.account}`);
      accounts++;
      if (!dryRun && companyId !== "(dry-run)") {
        await prisma.bankAccount.create({
          data: {
            accountNumber: firm.account,
            ownerCompanyId: companyId,
            inn: firm.inn,
            label: firm.label,
          },
        });
      }
    }
  }

  console.log(
    `\nXulosa: ${marked} ta firma belgilandi, ${created} ta yangi qo'shildi, ` +
      `${accounts} ta bank hisobi yaratildi.`
  );

  if (review.length > 0) {
    console.log("\n⚠️  QO'LDA KO'RIB CHIQISH KERAK:");
    review.forEach((r) => console.log("   " + r));
  }

  const totalOwn = await prisma.company.count({ where: { isOwnFirm: true } });
  const totalClients = await prisma.company.count({ where: { isOwnFirm: false, isActive: true } });
  console.log(`\nHozirgi holat: ${totalOwn} ta o'z firma, ${totalClients} ta faol mijoz.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
