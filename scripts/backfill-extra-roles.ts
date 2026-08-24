import "./load-env";
import { prisma } from "@/lib/prisma";

// IKKI ROLLI XODIMLAR — `User.extraRoles` BACKFILL.
//
// MUAMMO: rol almashtirgich (server/activeRole.ts) `User.extraRoles`dan
// oziqlanadi, lekin bu maydon HR biriktiruv qilganda QO'LDA to'ldirilishi
// kerak edi va ko'p hollarda unutilgan — odam firmalarga ikkinchi rol
// sifatida (masalan buxgalter) biriktirilgan, lekin bazada bu rol
// ro'yxatga olinmagan, shuning uchun almashtirgich chizilmagan va odam
// faqat asosiy roli (masalan bank-klient) bilan qolib ketgan.
//
// BU SKRIPT: haqiqiy biriktiruvlarga (Company.accountantId/bankClientId/
// supervisorId/chiefAccountantId) qarab, qaysi qo'shimcha rollar
// YETISHMASLIGINI topadi va `extraRoles`ga qo'shadi. Faqat QO'SHADI —
// hech qachon olib tashlamaydi (extraRoles'ga qo'lda yozilgan boshqa
// narsa bo'lsa unga tegilmaydi).
//
// Ishga tushirish: npx tsx scripts/backfill-extra-roles.ts          (dry-run)
//                   npx tsx scripts/backfill-extra-roles.ts --apply (yozadi)

const RELATION_ROLE = {
  assignedCompanies: "accountant",
  bankClientCompanies: "bank_manager",
  supervisedCompanies: "supervisor",
  chiefCompanies: "chief_accountant",
} as const;

async function main() {
  const apply = process.argv.includes("--apply");

  const users = await prisma.user.findMany({
    where: { isActive: true, role: { notIn: ["super_admin", "admin"] } },
    select: {
      id: true, fullName: true, email: true, role: true, extraRoles: true,
      _count: {
        select: { assignedCompanies: true, bankClientCompanies: true, supervisedCompanies: true, chiefCompanies: true },
      },
    },
  });

  let fixed = 0;
  for (const u of users) {
    const implied = (Object.keys(RELATION_ROLE) as (keyof typeof RELATION_ROLE)[])
      .filter((k) => u._count[k] > 0)
      .map((k) => RELATION_ROLE[k]);
    const missing = [...new Set(implied)].filter((r) => r !== u.role && !u.extraRoles.includes(r));
    if (missing.length === 0) continue;

    const nextExtraRoles = [...new Set([...u.extraRoles, ...missing])];
    console.log(
      `${apply ? "YOZILDI" : "TOPILDI"}: ${u.fullName} <${u.email}> role=${u.role} ` +
      `extraRoles: [${u.extraRoles.join(",")}] → [${nextExtraRoles.join(",")}]`
    );
    if (apply) {
      await prisma.user.update({ where: { id: u.id }, data: { extraRoles: nextExtraRoles } });
    }
    fixed++;
  }

  console.log(`\n${fixed} ta xodim ${apply ? "yangilandi" : "topildi (--apply bilan yoziladi)"}.`);
}

main().finally(() => process.exit(0));
