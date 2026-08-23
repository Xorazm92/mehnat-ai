/**
 * XODIMGA ROLLAR BERISH / KO'RISH
 * ================================
 *
 *   npx tsx scripts/set-user-roles.ts <email>                    # joriy holat
 *   npx tsx scripts/set-user-roles.ts <email> --add bank_manager  # qo'shish
 *   npx tsx scripts/set-user-roles.ts <email> --remove supervisor # olib tashlash
 *   npx tsx scripts/set-user-roles.ts <email> --clear             # faqat asosiy rol
 *
 * MISOL — Ruslan: asosiy bank-klient + buxgalter:
 *   npx tsx scripts/set-user-roles.ts ruslan@asro.uz --add chief_accountant
 */
import "./load-env";
import { prisma } from "@/lib/prisma";

const KNOWN = [
  "super_admin",
  "admin",
  "chief_accountant",
  "bank_manager",
  "supervisor",
  "accountant",
];

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email) {
    console.error("Email kerak: npx tsx scripts/set-user-roles.ts <email> [--add ROL | --remove ROL | --clear]");
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: { email: { contains: email } },
    select: { id: true, email: true, fullName: true, role: true, extraRoles: true, isActive: true },
  });
  if (!user) {
    console.error(`Xodim topilmadi: ${email}`);
    process.exit(1);
  }

  const add = process.argv.includes("--add")
    ? process.argv[process.argv.indexOf("--add") + 1]
    : null;
  const remove = process.argv.includes("--remove")
    ? process.argv[process.argv.indexOf("--remove") + 1]
    : null;
  const clear = process.argv.includes("--clear");

  let extra = [...(user.extraRoles ?? [])];

  if (add) {
    const role = add.trim().toLowerCase();
    if (!KNOWN.includes(role)) {
      console.error(`Noma'lum rol: ${role}. Mavjud: ${KNOWN.join(", ")}`);
      process.exit(1);
    }
    if (role === user.role) {
      console.log(`"${role}" allaqachon ASOSIY rol — extraRoles ga shart emas.`);
      await prisma.$disconnect();
      return;
    }
    if (!extra.includes(role)) extra.push(role);
  }
  if (remove) {
    const role = remove.trim().toLowerCase();
    extra = extra.filter((r) => r !== role);
  }
  if (clear) extra = [];

  await prisma.user.update({ where: { id: user.id }, data: { extraRoles: extra.sort() } });

  console.log("═".repeat(56));
  console.log(`${user.fullName} (${user.email})${user.isActive ? "" : " [BLOKLANGAN]"}`);
  console.log(`Asosiy rol     : ${user.role}`);
  console.log(`Qo'shimcha     : ${extra.length ? extra.join(", ") : "yo'q"}`);
  console.log(`Jami rollar    : ${[user.role, ...extra].join(", ")}`);
  console.log("O'zgarish sessiyada 5 daqiqada yoki qayta kirganda kuchga kiradi.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
