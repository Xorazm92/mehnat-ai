/**
 * YETISHMAYOTGAN XODIM KARTOCHKALARINI YARATISH (+ FinCo 2 bo'limi)
 * ================================================================
 * `import-staff-phones.ts` faqat MAVJUD kartochkaga raqam yozadi. Ikkinchi
 * guruh (FinCo 2) xodimlari umuman bazada yo'q — ular shu skript bilan
 * yaratiladi va "FinCo 2" bo'limiga biriktiriladi.
 *
 * MODELLASH ESLATMASI: `Department` FIRMALARNI guruhlaydi
 * (`Company.departmentId`), xodimni emas. Xodimdagi `User.department` — oddiy
 * matn yorlig'i. Shuning uchun bu skript ikkalasini ham qiladi:
 *   1. `Department { name: "FinCo 2" }` yaratadi va boshlig'ini belgilaydi —
 *      firmalar kiritilganda ular shu bo'limga biriktiriladi;
 *   2. xodim kartochkalariga `department: "FinCo 2"` yorlig'ini qo'yadi.
 *
 * ISHLATISH (standart holat — QURUQ, hech narsa yozilmaydi):
 *   npx tsx scripts/seed-staff-cards.ts
 *   npx tsx scripts/seed-staff-cards.ts --apply
 *   PRINT_PASSWORDS=1 npx tsx scripts/seed-staff-cards.ts --apply
 *
 * Parol tasodifiy generatsiya qilinadi va ATAYIN chiqarilmaydi (prod loglariga
 * tushmasligi uchun — scripts/create-admin.ts bilan bir xil qoida). Xodimlar
 * botga telefon orqali kiradi; veb kerak bo'lsa admin paneldan parol tiklanadi.
 */
import "./load-env";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { phoneKey, formatPhone } from "@/lib/phone";
import type { UserRole } from "@/lib/permissions";

/** Ikkinchi guruh bo'limi. `Department.name` unique — qayta ishga tushirish xavfsiz. */
const FINCO2 = "FinCo 2";

interface NewStaff {
  /** Kartochkadagi to'liq ism. Familiya bor joyda saqlanadi — ikki xil
   *  "Azizbek" ni ajratish uchun ism NOYOB bo'lishi kerak, aks holda
   *  import-staff-phones.ts ularni abadiy "shubhali" deb belgilaydi. */
  fullName: string;
  role: UserRole;
  phone: string;
  username?: string;
  /** `User.department` matn yorlig'i. */
  department?: string;
  /** true ⇒ shu odam bo'limning bosh buxgalteri qilib belgilanadi. */
  departmentChief?: boolean;
}

const NEW_STAFF: NewStaff[] = [
  // ── FinCo 2 (ikkinchi guruh) ────────────────────────────────────────────
  {
    fullName: "Mohira Yuldashevna",
    role: "chief_accountant",
    phone: "+998 94 623 41 66",
    username: "BoshBuxgalter_Mohira",
    department: FINCO2,
    departmentChief: true,
  },
  {
    fullName: "Muxriddin",
    role: "bank_manager",
    phone: "+998 93 077 41 66",
    username: "Muxriddin_Accountant",
    department: FINCO2,
  },
  {
    fullName: "Umid",
    role: "accountant",
    phone: "+998 94 818 41 66",
    username: "Umid_accountant",
    department: FINCO2,
  },
  {
    fullName: "Elbek Ismatillayev",
    role: "accountant",
    phone: "+998 50 999 41 66",
    username: "elbek_ismatillayev_accountant",
    department: FINCO2,
  },
  {
    fullName: "Mohirbek Yo'ldoshov",
    role: "accountant",
    phone: "+998 50 877 41 66",
    username: "mohirbek_accountant",
    department: FINCO2,
  },

  // ── Bo'limsiz ───────────────────────────────────────────────────────────
  // Bazadagi "Azizbek" — Azizbek Buxgalter. Bu IKKINCHI Azizbek, shuning uchun
  // ismi ataylab boshqacha: ikkita "Azizbek" bo'lsa telefon moslashtirish
  // ularni hech qachon ajrata olmasdi.
  {
    fullName: "Azizbek (bank-klient)",
    role: "bank_manager",
    phone: "+998 93 555 41 66",
    username: "Accountant_Azizbek",
  },
];

/** mehnat.uz konventsiyasi: <ism>_<4 hex>@mehnat.uz */
function makeEmail(fullName: string): string {
  const slug = fullName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z]/g, "")
    .slice(0, 14);
  return `${slug}_${randomBytes(2).toString("hex")}@mehnat.uz`;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const showPasswords = process.env.PRINT_PASSWORDS === "1";

  // 1) Raqam to'qnashuvi — bot bunday holatda bog'lashni rad etadi, shuning
  //    uchun kartochka yaratishdan OLDIN tekshiramiz.
  const keys = NEW_STAFF.map((s) => phoneKey(s.phone));
  const bad = NEW_STAFF.filter((_, i) => keys[i] == null);
  if (bad.length) {
    console.error(`⛔ Raqamni o'qib bo'lmadi: ${bad.map((b) => b.fullName).join(", ")}`);
    process.exitCode = 1;
    return;
  }
  const clash = await prisma.user.findMany({
    where: { phoneNormalized: { in: keys as string[] } },
    select: { fullName: true, phone: true, phoneNormalized: true },
  });
  if (clash.length) {
    console.error(`⛔ Bu raqamlar allaqachon boshqa kartochkada:`);
    for (const c of clash) console.error(`   ${c.fullName} — ${c.phone}`);
    console.error(`   Avval ularni hal qiling, aks holda bot bog'lashni rad etadi.`);
    process.exitCode = 1;
    return;
  }

  // 2) Ism bo'yicha takror — qayta ishga tushirishda ikkinchi nusxa yaratmaslik.
  const existing = await prisma.user.findMany({
    where: { fullName: { in: NEW_STAFF.map((s) => s.fullName) } },
    select: { fullName: true },
  });
  const already = new Set(existing.map((e) => e.fullName));

  const todo = NEW_STAFF.filter((s) => !already.has(s.fullName));
  const skipped = NEW_STAFF.filter((s) => already.has(s.fullName));

  const dept = await prisma.department.findUnique({ where: { name: FINCO2 } });

  console.log(`\n🏢 Bo'lim "${FINCO2}": ${dept ? `mavjud (${dept.isActive ? "faol" : "NOFAOL"})` : "yaratiladi"}`);
  console.log(`\n👤 Yaratiladigan kartochkalar (${todo.length}):`);
  for (const s of todo) {
    console.log(
      `   ${s.fullName.padEnd(22)} ${s.role.padEnd(17)} ${formatPhone(s.phone)}  ${s.department ?? "(bo'limsiz)"}${s.departmentChief ? "  ← bo'lim boshlig'i" : ""}`,
    );
  }
  if (skipped.length) {
    console.log(`\n⏭  Allaqachon bor (${skipped.length}): ${skipped.map((s) => s.fullName).join(", ")}`);
  }

  if (!apply) {
    console.log(`\n— Quruq ishlash. Yozish uchun: npx tsx scripts/seed-staff-cards.ts --apply`);
    await prisma.$disconnect();
    return;
  }

  // 3) Bo'lim. `name` unique — upsert takroriy ishga tushirishda xavfsiz.
  //    Nofaol bo'lsa qayta faollashtiriladi.
  const department = await prisma.department.upsert({
    where: { name: FINCO2 },
    create: { name: FINCO2, isActive: true },
    update: { isActive: true },
    select: { id: true },
  });

  const created: Array<{ fullName: string; email: string; password: string }> = [];
  for (const s of todo) {
    const password = randomBytes(9).toString("base64url"); // 12 belgi
    const user = await prisma.user.create({
      data: {
        email: makeEmail(s.fullName),
        fullName: s.fullName,
        passwordHash: await bcrypt.hash(password, 12),
        role: s.role,
        phone: formatPhone(s.phone),
        phoneNormalized: phoneKey(s.phone),
        telegramUsername: s.username ?? null,
        department: s.department ?? null,
        hiredAt: new Date(),
        isActive: true,
      },
      select: { id: true, email: true },
    });
    created.push({ fullName: s.fullName, email: user.email, password });

    if (s.departmentChief) {
      await prisma.department.update({
        where: { id: department.id },
        data: { chiefAccountantId: user.id },
      });
    }
  }

  console.log(`\n✅ ${created.length} ta kartochka yaratildi, bo'lim "${FINCO2}" tayyor.`);
  if (showPasswords) {
    console.log(`\n🔑 Kirish ma'lumotlari (FAQAT SHU YERDA ko'rsatiladi):`);
    for (const c of created) console.log(`   ${c.fullName.padEnd(22)} ${c.email}  ${c.password}`);
  } else {
    console.log(
      `\nℹ️  Parollar chiqarilmadi (PRINT_PASSWORDS=1 bilan ko'rsatiladi).\n` +
        `   Xodimlar botga telefon orqali kiradi — veb parol faqat kerak bo'lsa,\n` +
        `   admin paneldan tiklanadi.`,
    );
  }
  console.log(`\nKeyingi qadam: firmalar kiritilganda ularni "${FINCO2}" bo'limiga biriktiring.`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("seed-staff-cards failed:", e);
  process.exit(1);
});
