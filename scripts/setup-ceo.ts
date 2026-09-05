/**
 * RAHBAR (CEO) HISOBINI YARATISH.
 *
 * Ruzmetov Otabek — korxona egasi: "Band qilganlar" faylining `Firmalar`
 * varag'iga ko'ra 5 ta o'z firmaning ta'sischisi, 4 tasining direktori.
 * Bazada uning hisobi UMUMAN yo'q edi.
 *
 *   npx tsx scripts/setup-ceo.ts --dry-run
 *   npx tsx scripts/setup-ceo.ts
 *
 * DIQQAT — ISM CHALKASHLIGI: bazada allaqachon "Otabek" degan xodim bor,
 * lekin u BUXGALTER (telegram: @Otabek_Buxgalter, tel +998 93 500 41 66).
 * Rahbar boshqa odam: @otabek_FinCo, tel +998 97 777 59 66. Shuning uchun
 * skript hech qachon mavjud "Otabek" ni ko'tarmaydi — faqat EMAIL bo'yicha
 * ishlaydi va boshqa hisobga tegmaydi.
 *
 * NEGA super_admin: u egasi. `lib/permissions.ts` `effectiveViewsForRole`
 * super_admin uchun HAR DOIM ALL_VIEWS qaytaradi va uni RBAC sozlamasi
 * bilan bloklab bo'lmaydi — egasi o'z tizimidan chetlatilib qolmasligi kerak.
 *
 * Yon ta'siri (ataylab): `lib/directorReport.ts` `collectDirectorRecipients`
 * super_admin/admin ni tanlaydi, ya'ni u 09:00 hisobotini avtomat oladi.
 *
 * Idempotent: hisob bor bo'lsa profili yangilanadi, PAROL TEGILMAYDI.
 */
import "./load-env"; // birinchi bo'lishi shart
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { findImportFile } from "./import-source";
import { phoneKey } from "@/lib/phone";
import { SYSTEM_SETTING_DEFAULTS } from "@/lib/admin/system-settings-config";

const CEO = {
  email: "otabek@asro.uz",
  fullName: "Ruzmetov Otabek",
  role: "super_admin" as const,
  phone: "+998 97 777 59 66",
  telegramUsername: "otabek_FinCo",
  department: "Rahbariyat",
  status: "active",
  avatarColor: "#7c3aed",
};

/** Bu hisobga TEGILMAYDI — u boshqa odam (buxgalter). */
const ACCOUNTANT_EMAIL = "otabek_e419@mehnat.uz";

// Fayl bo'lmasa ham skript ishlashda davom etadi (89-qatordagi tekshiruv).
const REGISTRY = findImportFile("Band qilganlar.json") ?? "";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  // ── 0. Buxgalter Otabek tegilmaganini tasdiqlaymiz ─────────────────────
  const accountant = await prisma.user.findUnique({
    where: { email: ACCOUNTANT_EMAIL },
    select: { fullName: true, role: true, telegramUsername: true },
  });
  if (accountant) {
    console.log(
      `Buxgalter (tegilmaydi): ${accountant.fullName} [${accountant.role}] @${accountant.telegramUsername ?? "—"}`
    );
    if (accountant.role !== "accountant") {
      console.error(`\n⚠️  Buxgalterning roli "${accountant.role}" — kutilgani "accountant".`);
      console.error("   Bu oldingi xato izi bo'lishi mumkin. Avval uni tekshiring.");
      process.exit(1);
    }
  }

  // ── 1. Rahbar hisobi ───────────────────────────────────────────────────
  const existing = await prisma.user.findUnique({
    where: { email: CEO.email },
    select: { id: true, fullName: true, role: true, telegramUserId: true },
  });

  const settings = await prisma.systemSetting.findUnique({ where: { key: "defaultUserPassword" } });
  const password =
    typeof settings?.value === "string" ? settings.value : SYSTEM_SETTING_DEFAULTS.defaultUserPassword;

  console.log(`\nRahbar: ${CEO.fullName} <${CEO.email}>`);
  console.log(`   rol      : ${CEO.role}`);
  console.log(`   telefon  : ${CEO.phone}`);
  console.log(`   Telegram : @${CEO.telegramUsername} (botga /start bosishi kerak)`);
  console.log(`   holat    : ${existing ? `mavjud [${existing.role}] — profil yangilanadi` : "YANGI yaratiladi"}`);
  if (!existing) console.log(`   parol    : tizim standarti — birinchi kirishda o'zgartirilsin`);

  // ── 2. O'z firmalardagi egalik (reyestrdan) ────────────────────────────
  const ownership: { firm: string; inn: string | null; founder: string | null; director: string | null }[] = [];
  if (fs.existsSync(REGISTRY)) {
    const registry = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
    for (const row of registry["Firmalar"] ?? []) {
      const firm = String(row["Firmalar"] ?? "").trim();
      if (!firm) continue;
      ownership.push({
        firm,
        // STIR — ishonchli kalit. Nom bo'yicha uchtasi yiqiladi:
        // "THE POWERFUL TEAM" bazada ikki L bilan, "SOFYTEAM" → "SOFI TEAM",
        // "FININFO BEST" → "HOME SPOT STORY".
        inn: String(row["INN"] ?? "").trim() || null,
        founder: String(row["Ta'sischi"] ?? "").trim() || null,
        director: String(row["Direktor"] ?? "").trim() || null,
      });
    }
  }

  const ownFirms = await prisma.company.findMany({
    where: { isOwnFirm: true },
    select: { id: true, name: true, inn: true, founderName: true, directorName: true },
  });
  const norm = (s: string) => s.toLowerCase().replace(/[`'‘’"]/g, "").replace(/\s+/g, " ").trim();

  const firmUpdates: { id: string; name: string; founder: string | null; director: string | null }[] = [];
  for (const o of ownership) {
    const match =
      (o.inn ? ownFirms.find((f) => f.inn === o.inn) : null) ??
      ownFirms.find((f) => norm(f.name) === norm(o.firm));
    if (!match) continue;
    if (match.founderName === o.founder && match.directorName === o.director) continue;
    firmUpdates.push({ id: match.id, name: match.name, founder: o.founder, director: o.director });
  }

  const ceoFirms = ownership.filter(
    (o) => norm(o.founder ?? "") === norm(CEO.fullName) || norm(o.director ?? "") === norm(CEO.fullName)
  );
  console.log(`\nEgalik qiladigan/boshqaradigan firmalar: ${ceoFirms.length} ta`);
  for (const f of ceoFirms) {
    const rolePart = [
      norm(f.founder ?? "") === norm(CEO.fullName) ? "ta'sischi" : null,
      norm(f.director ?? "") === norm(CEO.fullName) ? "direktor" : null,
    ]
      .filter(Boolean)
      .join(" + ");
    console.log(`   ${f.firm.padEnd(22)} ${rolePart}`);
  }
  if (firmUpdates.length > 0) {
    console.log(`\nFirma kartochkalariga yoziladi: ${firmUpdates.length} ta`);
  }

  if (dryRun) {
    console.log("\n--dry-run: hech narsa yozilmadi.");
    return;
  }

  // ── 3. Yozamiz ─────────────────────────────────────────────────────────
  const profile = {
    fullName: CEO.fullName,
    role: CEO.role,
    phone: CEO.phone,
    phoneNormalized: phoneKey(CEO.phone),
    telegramUsername: CEO.telegramUsername,
    department: CEO.department,
    status: CEO.status,
    avatarColor: CEO.avatarColor,
    isActive: true,
  };

  if (existing) {
    // Parol ATAYIN yangilanmaydi — qayta ishga tushirish rahbarni tizimdan
    // chiqarib yubormasligi kerak.
    await prisma.user.update({ where: { id: existing.id }, data: profile });
    console.log(`\n✓ Profil yangilandi (parol tegilmadi)`);
  } else {
    await prisma.user.create({
      data: { ...profile, email: CEO.email, passwordHash: await bcrypt.hash(password, 12) },
    });
    console.log(`\n✓ Hisob yaratildi`);
    console.log(`   login : ${CEO.email}`);
    console.log(`   parol : ${password}   ← birinchi kirishdan keyin o'zgartirilsin`);
  }

  for (const f of firmUpdates) {
    await prisma.company.update({
      where: { id: f.id },
      data: { founderName: f.founder, directorName: f.director },
    });
  }
  if (firmUpdates.length > 0) console.log(`✓ ${firmUpdates.length} ta firmada ta'sischi/direktor yozildi`);

  // ── 4. Tekshirish ──────────────────────────────────────────────────────
  const directors = await prisma.user.findMany({
    where: { isActive: true, role: { in: ["super_admin", "admin"] } },
    select: { fullName: true, email: true, role: true, telegramUserId: true },
    orderBy: { fullName: "asc" },
  });
  console.log(`\nKunlik hisobotni oladiganlar (${directors.length}):`);
  for (const d of directors) {
    console.log(
      `   ${d.fullName.padEnd(20)} ${d.role.padEnd(12)} ${d.telegramUserId != null ? "Telegram ✓" : "faqat sayt"}`
    );
  }

  const after = await prisma.user.findUnique({
    where: { email: ACCOUNTANT_EMAIL },
    select: { fullName: true, role: true },
  });
  if (after) console.log(`\nBuxgalter o'z holida: ${after.fullName} [${after.role}] ✓`);

  console.log(
    `\n⚠️  Telegram: @${CEO.telegramUsername} hali bog'lanmagan. Kunlik hisobot saytda ko'rinadi,\n` +
      `   Telegramga borishi uchun botga /start bosib, /link_me buyrug'ini yuborishi kerak.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
