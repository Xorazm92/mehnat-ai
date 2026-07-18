/**
 * Barcha faol xodimlarga eslab qolinadigan parol o'rnatadi va ro'yxatini chiqaradi.
 * Ishga tushirish:  npx tsx scripts/reset-all-passwords.ts
 *
 * Joriy super-admin (admin@mehnat.uz) o'zgartirilmaydi — sessiya buzilmasligi uchun.
 * Parollar DB'da hash bo'lib saqlanadi; ochiq matn faqat shu ro'yxatda ko'rinadi —
 * uni xodimlarga tarqating va saqlab qo'ying (qayta ko'rib bo'lmaydi).
 */
import "./load-env"; // must be first: loads DATABASE_URL before Prisma is used
import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";
import { generateMemorablePassword } from "../lib/passwordUtils";

const KEEP_EMAILS = ["admin@mehnat.uz"]; // o'zgartirilmaydigan hisoblar

async function main() {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, fullName: true, email: true, role: true },
    orderBy: [{ role: "asc" }, { fullName: "asc" }],
  });

  const rows: { name: string; email: string; role: string; password: string }[] = [];

  for (const u of users) {
    if (KEEP_EMAILS.includes(u.email)) {
      rows.push({ name: u.fullName, email: u.email, role: u.role, password: "(o'zgarmadi)" });
      continue;
    }
    const password = generateMemorablePassword(u.fullName);
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({ where: { id: u.id }, data: { passwordHash } });
    rows.push({ name: u.fullName, email: u.email, role: u.role, password });
  }

  // Chiroyli jadval
  const w = (s: string, n: number) => (s + " ".repeat(n)).slice(0, n);
  console.log("\n" + w("F.I.SH", 28) + w("LOGIN (email)", 34) + w("ROL", 18) + "PAROL");
  console.log("-".repeat(96));
  for (const r of rows) {
    console.log(w(r.name, 28) + w(r.email, 34) + w(r.role, 18) + r.password);
  }
  console.log("-".repeat(96));
  console.log(`Jami: ${rows.length} ta xodim.\n`);
}

main()
  .catch((e) => {
    console.error("XATO:", e?.message || e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
