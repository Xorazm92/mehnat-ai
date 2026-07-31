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
import { nameCandidates, scoreMatch } from "@/lib/nameMatch";
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
  // Bazadagi "Azizbek" 70 ta firmada bank-klient — u "Azizbek Banking".
  // Bu esa IKKINCHI Azizbek, buxgalteri. Ismi ataylab boshqacha: ikkita
  // "Azizbek" bo'lsa telefon moslashtirish ularni hech qachon ajrata olmasdi.
  {
    fullName: "Azizbek (buxgalter)",
    role: "accountant",
    phone: "+998 94 390 41 66",
    username: "Azizbek_Accountant",
  },
  // Guruh belgisi yo'q — bo'lim qo'yilmaydi (taxmin qilmaymiz).
  { fullName: "Sevinch", role: "accountant", phone: "+998 93 828 41 66", username: "Sevinch_Buxgalter" },
  // Alisher — kompaniya rahbari (CEO), shuning uchun `admin`: butun tizimni
  // ko'radi, bitta firmaga biriktirilmaydi. Buxgalter emas, ya'ni unga
  // majburiyat ham biriktirilmaydi (generator faqat `accountantId` ni oladi).
  { fullName: "Alisher", role: "admin", phone: "+998 93 123 41 66" },
  // Bo'shash arafasida: kartochka yaratiladi, ketsa isActive=false yetarli —
  // linkTelegramByPhone nofaol kartochkani o'zi e'tiborsiz qoldiradi.
  { fullName: "Otabek", role: "accountant", phone: "+998 93 500 41 66", username: "Otabek_Buxgalter" },
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
  // Raqam MO'LJALLANGAN odamda turgan bo'lsa — bu takroriy ishga tushirish,
  // xato emas. Faqat BOSHQA odamning kartochkasida bo'lsa to'xtatamiz: bot
  // bir raqamga ikki xodim to'g'ri kelsa bog'lashni rad etadi.
  const owners = await prisma.user.findMany({
    where: { phoneNormalized: { in: keys as string[] } },
    select: { fullName: true, phone: true, phoneNormalized: true },
  });
  const intended = new Map(NEW_STAFF.map((s, i) => [keys[i] as string, s.fullName]));
  const clash = owners.filter((o) => intended.get(o.phoneNormalized!) !== o.fullName);
  if (clash.length) {
    console.error(`⛔ Bu raqamlar BOSHQA kartochkada:`);
    for (const c of clash) console.error(`   ${c.fullName} — ${c.phone}`);
    console.error(`   Avval ularni hal qiling, aks holda bot bog'lashni rad etadi.`);
    process.exitCode = 1;
    return;
  }

  // 2) Ism bo'yicha mavjud kartochka. Bazada NOFAOL bo'sh qobiqlar bor —
  //    yaratilgan-u, hech qachon to'ldirilmagan. Ular uchun yangi kartochka
  //    ochish takror hosil qilardi, shuning uchun bo'shi to'ldirilib
  //    faollashtiriladi. Tarixi bor kartochkaga esa TEGILMAYDI.
  const cards = await prisma.user.findMany({
    where: { NOT: { OR: [{ fullName: { startsWith: "TEST" } }, { fullName: { startsWith: "vitest" } }] } },
    select: {
      id: true, fullName: true, isActive: true, phone: true, telegramUserId: true,
      _count: {
        select: {
          assignedCompanies: true, supervisedCompanies: true, chiefCompanies: true,
          bankClientCompanies: true, contractAssignments: true, performanceRecords: true,
          chiefDepartments: true,
        },
      },
    },
  });
  const byName = new Map(cards.map((e) => [e.fullName, e]));

  /**
   * BO'SH QOBIQ — yaratilgan-u hech qachon ishlatilmagan kartochka: nofaol,
   * raqamsiz, Telegramsiz va HECH QANDAY bog'lanishsiz. Bunday kartochkaning
   * yo'qotadigan tarixi yo'q, shuning uchun uni egallash xavfsiz.
   */
  const isEmptyShell = (c: (typeof cards)[number]) =>
    !c.isActive && !c.phone && c.telegramUserId == null &&
    Object.values(c._count).every((n) => n === 0);

  /**
   * Ism aynan mos kelmasa ham qobiqni topamiz: ro'yxatda familiya bilan
   * ("Elbek Ismatillayev"), bazada esa faqat ism ("Elbek") bo'lishi mumkin.
   * Faqat BO'SH qobiqqa ruxsat — tarixi bor kartochkaga hech qachon
   * tegilmaydi, u haqiqatan boshqa odam bo'lishi mumkin (mavjud "Azizbek"
   * 70 firmada bank-klient, ro'yxatdagi "Azizbek (buxgalter)" esa boshqa odam).
   */
  function findShell(fullName: string) {
    const exact = byName.get(fullName);
    if (exact) return isEmptyShell(exact) ? exact : null;
    const cand = nameCandidates(fullName);
    const fuzzy = cards.filter((c) => isEmptyShell(c) && scoreMatch(cand, c.fullName).tier === "exact");
    // Bittadan ko'p qobiq mos kelsa — qaysi biri ekani noaniq, tegmaymiz.
    return fuzzy.length === 1 ? fuzzy[0] : null;
  }

  const shellOf = new Map<string, (typeof cards)[number]>();
  for (const s of NEW_STAFF) {
    const shell = findShell(s.fullName);
    if (shell) shellOf.set(s.fullName, shell);
  }

  const revive = NEW_STAFF.filter((s) => shellOf.has(s.fullName));
  const skipped = NEW_STAFF.filter((s) => !shellOf.has(s.fullName) && byName.has(s.fullName));
  const todo = NEW_STAFF.filter((s) => !shellOf.has(s.fullName) && !byName.has(s.fullName));

  // 3) EHTIMOLIY TAKROR: ismi boshqacha yozilgan, lekin o'zagi bir xil
  //    kartochka bormi? ("Mohirbek" ↔ "Mohirbek Yo'ldoshov"). Bu yerda
  //    to'xtatmaymiz — ba'zan ular haqiqatan turli odam — lekin ogohlantiramiz,
  //    aks holda takror jimgina paydo bo'lardi.
  const nearDupes: Array<{ want: string; existing: string; active: boolean }> = [];
  for (const s of todo) {
    const cand = nameCandidates(s.fullName);
    for (const c of cards) {
      if (c.fullName === s.fullName) continue;
      if (scoreMatch(cand, c.fullName).tier === "exact") {
        nearDupes.push({ want: s.fullName, existing: c.fullName, active: c.isActive });
      }
    }
  }

  const dept = await prisma.department.findUnique({ where: { name: FINCO2 } });

  console.log(`\n🏢 Bo'lim "${FINCO2}": ${dept ? `mavjud (${dept.isActive ? "faol" : "NOFAOL"})` : "yaratiladi"}`);
  console.log(`\n👤 Yaratiladigan kartochkalar (${todo.length}):`);
  for (const s of todo) {
    console.log(
      `   ${s.fullName.padEnd(22)} ${s.role.padEnd(17)} ${formatPhone(s.phone)}  ${s.department ?? "(bo'limsiz)"}${s.departmentChief ? "  ← bo'lim boshlig'i" : ""}`,
    );
  }
  if (revive.length) {
    console.log(`\n♻️  BO'SH QOBIQ TO'LDIRILADI (${revive.length}) — nofaol, raqamsiz, tarixsiz kartochka:`);
    for (const s of revive) {
      const shell = shellOf.get(s.fullName)!;
      const renamed = shell.fullName !== s.fullName ? `  ("${shell.fullName}" → "${s.fullName}")` : "";
      console.log(
        `   ${s.fullName.padEnd(22)} ${s.role.padEnd(17)} ${formatPhone(s.phone)}  ${s.department ?? "(bo'limsiz)"}${renamed}`,
      );
    }
  }
  if (skipped.length) {
    console.log(`\n⏭  Tegilmaydi (${skipped.length}): ${skipped.map((s) => s.fullName).join(", ")}`);
  }
  if (nearDupes.length) {
    console.log(`\n⚠️  EHTIMOLIY TAKROR — ism o'zagi bir xil kartochka bor:`);
    for (const d of nearDupes) {
      console.log(`   yangi "${d.want}"  ↔  mavjud "${d.existing}" (${d.active ? "faol" : "nofaol"})`);
    }
    console.log(`   Agar bir odam bo'lsa — yangisini yaratmang, mavjudini tahrirlang.`);
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

  let revived = 0;
  for (const s of revive) {
    const card = shellOf.get(s.fullName)!;
    await prisma.user.update({
      where: { id: card.id },
      data: {
        // Qobiq ismi qisqa bo'lishi mumkin ("Elbek") — to'liq ismga
        // yangilaymiz, aks holda ikkita "Elbek" ni ajratib bo'lmaydi va
        // import-staff-phones.ts ularni abadiy "shubhali" deb belgilardi.
        fullName: s.fullName,
        isActive: true,
        role: s.role,
        phone: formatPhone(s.phone),
        phoneNormalized: phoneKey(s.phone),
        telegramUsername: s.username ?? null,
        ...(s.department ? { department: s.department } : {}),
      },
    });
    if (s.departmentChief) {
      await prisma.department.update({
        where: { id: department.id },
        data: { chiefAccountantId: card.id },
      });
    }
    revived++;
  }

  console.log(
    `\n✅ ${created.length} ta kartochka yaratildi${revived ? `, ${revived} tasi to'ldirib faollashtirildi` : ""}, bo'lim "${FINCO2}" tayyor.`,
  );
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
