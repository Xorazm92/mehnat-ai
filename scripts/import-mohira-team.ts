/**
 * MOHIRA JAMOASINING FIRMALARINI BAZAGA KIRITISH.
 *
 * Manba: "Фирмалар 31.05.2026 Mohira.xlsx" → 'Royxat' varag'i (55 qator).
 * Ma'lumot skript ichiga ko'chirilgan — Excel prod serverda yo'q, va shu
 * ko'rinishda o'zgarish diff'da ko'rinadi.
 *
 * NEGA KERAK: Mohira Yuldashevna (bosh buxgalter) va uning jamoasi — Hasan,
 * Elbek, Mohirbek, Azizbek, Umid, Muxriddin — bazada foydalanuvchi sifatida bor,
 * lekin BIRORTA firmaga biriktirilmagan. Portfel scope'i biriktiruv bo'yicha
 * ishlagani uchun (lib/access.ts) ular tizimga kirsa 0 ta firma ko'radi.
 *
 *   npx tsx scripts/import-mohira-team.ts            # nima bo'lishini ko'rsatadi
 *   npx tsx scripts/import-mohira-team.ts --apply    # yozadi
 *
 * Idempotent: STIR bo'yicha mavjud firma qayta yaratilmaydi.
 *
 * TARIF (varaqdagi foizlar bilan aynan mos, STANDARD_TARIFF ga teng):
 *   buxgalter 20% (bitta firmada 25%) · Yorqinoy 7% · Mohira 5% · bank 5%
 */
import "./load-env"; // birinchi bo'lishi shart
import { prisma } from "@/lib/prisma";
import { ASSIGNMENT_ROLE_LABELS, type AssignmentRole } from "@/lib/permissions";

interface SourceRow {
  name: string;
  /** STIR yo'q qatorlar uchun NO-STIR-0NN (bazadagi mavjud kelishuv). */
  inn: string;
  vat: boolean;
  /** Varaqdagi ism — TEAM orqali User.email ga o'giriladi. */
  accountant: string;
  bank: string | null;
  amount: number | null;
  /** Buxgalter ulushi foizda. */
  pct: number;
  /** Varaqdagi STIR katagi buzuq bo'lsa — o'sha matn shu yerda saqlanadi. */
  notes?: string;
}

/**
 * Varaqdagi ism → User.email.
 *
 * Email bo'yicha qidiriladi, ism bo'yicha emas: bazada bir xil ismli ikkita
 * yozuv bor ("Elbek" nofaol / "Elbek Ismatillayev" faol, xuddi shunday
 * "Mohirbek"). Faol yozuv ataylab tanlangan.
 */
const TEAM: Record<string, string> = {
  "Azizbek shogird": "azizbekbuxgalt_3d7a@mehnat.uz",
  Mohirbek: "mohirbekyoldos_91f4@mehnat.uz",
  Hasan: "hasan_95ce@mehnat.uz",
  Elbek: "elbekismatilla_2597@mehnat.uz",
  Umid: "umid_def3@mehnat.uz",
  Muxriddin: "muxriddin_c6b4@mehnat.uz",
};

/** Har bir firmada bir xil: nazoratchi Mohira, bosh buxgalter Yorqinoy. */
const SUPERVISOR_EMAIL = "mohirayuldashe_eebe@mehnat.uz";
const CHIEF_EMAIL = "yorqinoy@mehnat.uz";

/** Varaqdagi ulushlar. */
const PCT_CHIEF = 7;
const PCT_SUPERVISOR = 5;
const PCT_BANK = 5;

/** Hasan bazada nofaol; ro'yxatda 9 ta firmaning buxgalteri — qayta yoqiladi. */
const REACTIVATE = ["hasan_95ce@mehnat.uz"];

const FIRMS: SourceRow[] = [
  { name: "MONTAJ TEPLO ENERGO MCHJ", inn: "306033555", vat: true, accountant: "Azizbek shogird", bank: "Muxriddin", amount: 500000, pct: 20 },
  { name: "СП \"ZIL-BAX\"", inn: "307972154", vat: false, accountant: "Mohirbek", bank: "Muxriddin", amount: 700000, pct: 20 },
  { name: "\"AL-AZIZ ACADEMY\" НОУ", inn: "306784151", vat: true, accountant: "Azizbek shogird", bank: "Muxriddin", amount: 4000000, pct: 20 },
  { name: "\"AVIA GORODOK\"", inn: "307688389", vat: true, accountant: "Mohirbek", bank: "Muxriddin", amount: 1500000, pct: 20 },
  { name: "\"AVTOMATLASHTIRILGAN ELEKTRIK YURITMA\"", inn: "201250775", vat: false, accountant: "Azizbek shogird", bank: null, amount: 500000, pct: 20 },
  { name: "ООО \"AVTO LUXUSARY TRADE\"", inn: "307043621", vat: false, accountant: "Mohirbek", bank: "Muxriddin", amount: 1000000, pct: 20 },
  { name: "\"SHIRIN LYUKS TAOM\" 01.09.2021", inn: "302813323", vat: true, accountant: "Azizbek shogird", bank: null, amount: null, pct: 20 },
  { name: "\"KESH LOGIST\"", inn: "307947611", vat: true, accountant: "Azizbek shogird", bank: "Muxriddin", amount: 500000, pct: 20 },
  { name: "Raximjonova Dilnoza YATT", inn: "NO-STIR-005", vat: false, accountant: "Umid", bank: null, amount: 300000, pct: 20 },
  { name: "NURDEVAI", inn: "310327837", vat: false, accountant: "Azizbek shogird", bank: "Muxriddin", amount: 500000, pct: 25 },
  // Varaqda ИНН katagiga STIR o'rniga izoh yozilgan — izoh `notes` ga o'tkazildi.
  { name: "ROYAL BEAUTY", inn: "NO-STIR-007", vat: false, accountant: "Hasan", bank: null, amount: 1000000, pct: 20,
    notes: "YATT larni tez tez almashtirib ishlaydi — haqiqiy STIR aniqlanishi kerak" },
  { name: "PATRONUM", inn: "311429581", vat: false, accountant: "Hasan", bank: "Muxriddin", amount: 2000000, pct: 20 },
  { name: "DINAR CLASS", inn: "311490690", vat: false, accountant: "Hasan", bank: "Muxriddin", amount: 1000000, pct: 20 },
  { name: "HUMMA", inn: "311925187", vat: false, accountant: "Mohirbek", bank: "Muxriddin", amount: 1500000, pct: 20 },
  { name: "MASHXUR TAOM", inn: "305883924", vat: false, accountant: "Azizbek shogird", bank: "Muxriddin", amount: 1000000, pct: 20 },
  { name: "ООО \"SHIRIN SUPER TAOM\"", inn: "308543061", vat: true, accountant: "Azizbek shogird", bank: "Muxriddin", amount: 2000000, pct: 20 },
  // Varaqda nomi ham, STIRi ham yozilmagan qator — kim ekani aniqlangach nomi tuzatilsin.
  { name: "YATT (nomi aniqlanmagan — Umid, 31.05.2026)", inn: "NO-STIR-006", vat: false, accountant: "Umid", bank: null, amount: 300000, pct: 20 },
  { name: "HOMEBAZAAR YATT", inn: "52608006700020", vat: false, accountant: "Hasan", bank: null, amount: 500000, pct: 20 },
  { name: "Ohangaron Rustam Fayz", inn: "302595327", vat: false, accountant: "Elbek", bank: "Muxriddin", amount: 1500000, pct: 20 },
  { name: "Jizzakh Majic Star", inn: "309314757", vat: false, accountant: "Umid", bank: null, amount: 750000, pct: 20 },
  { name: "Vazifa Venchur", inn: "311910064", vat: false, accountant: "Elbek", bank: "Muxriddin", amount: 1200000, pct: 20 },
  { name: "GRAYD GROUP MCHJ", inn: "312391054", vat: false, accountant: "Elbek", bank: "Muxriddin", amount: 1000000, pct: 20 },
  { name: "\"SALOHIDDIN SFX\" MCHJ", inn: "312305364", vat: false, accountant: "Elbek", bank: "Muxriddin", amount: 500000, pct: 20 },
  { name: "Saidbek Mustafo MCHJ", inn: "304219671", vat: false, accountant: "Elbek", bank: "Muxriddin", amount: 6000000, pct: 20 },
  { name: "FOREST SCHOOL", inn: "311250245", vat: false, accountant: "Elbek", bank: "Muxriddin", amount: 700000, pct: 20 },
  { name: "BEST BROOMS", inn: "312405929", vat: false, accountant: "Elbek", bank: null, amount: 700000, pct: 20 },
  { name: "\"Dilsevar Hojakbar\" MCHJ", inn: "311985232", vat: false, accountant: "Umid", bank: "Muxriddin", amount: 500000, pct: 20 },
  { name: "\"Dashtobod aloqa-service\" MCHJ", inn: "301844182", vat: false, accountant: "Umid", bank: null, amount: 800000, pct: 20 },
  { name: "\"Corsa' MChJ", inn: "311817724", vat: false, accountant: "Umid", bank: "Muxriddin", amount: 800000, pct: 20 },
  { name: "\"Iftixor Holding\" MChJ", inn: "312168908", vat: false, accountant: "Mohirbek", bank: "Muxriddin", amount: 800000, pct: 20 },
  { name: "ASIA PRO GROUP", inn: "301502362", vat: false, accountant: "Elbek", bank: null, amount: 700000, pct: 20 },
  { name: "TOSHMI DIAGNOSTIKA", inn: "309580515", vat: false, accountant: "Elbek", bank: "Muxriddin", amount: 2500000, pct: 20 },
  { name: "HALOL OSHPAZ", inn: "310190353", vat: false, accountant: "Elbek", bank: "Muxriddin", amount: 1200000, pct: 20 },
  { name: "HALOL OSHPAZ JAMOASI", inn: "310832408", vat: false, accountant: "Elbek", bank: "Muxriddin", amount: null, pct: 20 },
  { name: "FAXRIDDIN SAODAT FARM", inn: "312338330", vat: false, accountant: "Hasan", bank: "Muxriddin", amount: 2500000, pct: 20 },
  { name: "ALIMXANOV ABDURAZZOQ YATT", inn: "31302986520050", vat: false, accountant: "Mohirbek", bank: null, amount: 300000, pct: 20 },
  { name: "SUHROBBEK PARIZODA", inn: "311636451", vat: false, accountant: "Elbek", bank: null, amount: 1000000, pct: 20 },
  { name: "HARDPRESS CNC", inn: "312340250", vat: false, accountant: "Mohirbek", bank: "Muxriddin", amount: 500000, pct: 20 },
  { name: "SAHARA UTD", inn: "311757809", vat: false, accountant: "Mohirbek", bank: null, amount: null, pct: 20 },
  { name: "REGAL FARR PARTNERS (RF BUILDINGS)", inn: "312079170", vat: false, accountant: "Umid", bank: null, amount: 500000, pct: 20 },
  { name: "INFINITY GROUP OF INDUSTRY", inn: "312545350", vat: false, accountant: "Mohirbek", bank: null, amount: 500000, pct: 20 },
  { name: "TASHMATOV GROUP", inn: "308725278", vat: false, accountant: "Mohirbek", bank: "Muxriddin", amount: 1500000, pct: 20 },
  { name: "EFFSARI", inn: "311346630", vat: false, accountant: "Hasan", bank: "Muxriddin", amount: 1200000, pct: 20 },
  { name: "YULDUZ ALIBAYEVA YATT", inn: "42706701810028", vat: false, accountant: "Umid", bank: "Muxriddin", amount: 500000, pct: 20 },
  { name: "GRAND CANYON HOTEL", inn: "305085072", vat: false, accountant: "Mohirbek", bank: "Muxriddin", amount: 500000, pct: 20 },
  { name: "XASHAMATLI SAROY", inn: "312137605", vat: false, accountant: "Mohirbek", bank: null, amount: 500000, pct: 20 },
  { name: "TRUCKTEC SUPPLIES", inn: "312789371", vat: false, accountant: "Hasan", bank: "Muxriddin", amount: 3000000, pct: 20 },
  { name: "IGAMBERDIYEV BERDIYOR GROUP", inn: "312554474", vat: false, accountant: "Mohirbek", bank: null, amount: 1000000, pct: 20 },
  { name: "BANANA SCHOOL", inn: "312910284", vat: false, accountant: "Azizbek shogird", bank: "Muxriddin", amount: 1500000, pct: 20 },
  { name: "AGAS-SFERA SERVIS MCHJ", inn: "301565474", vat: true, accountant: "Azizbek shogird", bank: null, amount: 7000000, pct: 20 },
  { name: "QUALITY MARKET", inn: "313004216", vat: false, accountant: "Elbek", bank: "Muxriddin", amount: 2000000, pct: 20 },
  { name: "ALFRAGANUS CARDIO HOSPITAL", inn: "312932186", vat: true, accountant: "Elbek", bank: "Muxriddin", amount: 700000, pct: 20 },
  { name: "VOLTGO", inn: "312731365", vat: false, accountant: "Hasan", bank: null, amount: 2000000, pct: 20 },
  { name: "X PRO TEAM", inn: "312233724", vat: false, accountant: "Hasan", bank: null, amount: null, pct: 20 },
  // Bitta katakda TO'RTTA STIR — bu aslida to'rtta YATT. Birinchisi asosiy
  // qilib olindi, qolgani izohda; keyinchalik alohida firmalarga ajratilsin.
  { name: "Abdukarim aka YATT", inn: "52904065730038", vat: false, accountant: "Mohirbek", bank: null, amount: 300000, pct: 20,
    notes: "Yana 3 ta STIR: 52111065730069, 51908065730051, 51603025730024 — alohida firmalarga ajratilsin" },
];

const som = (n: number) => n.toLocaleString("en-US");

async function main() {
  const apply = process.argv.includes("--apply");

  // ── 1. Jamoa a'zolarini yechish ───────────────────────────────────────
  const emails = [...new Set([...Object.values(TEAM), SUPERVISOR_EMAIL, CHIEF_EMAIL])];
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true, fullName: true, role: true, isActive: true },
  });
  const byEmail = new Map(users.map((u) => [u.email, u]));

  const missing = emails.filter((e) => !byEmail.has(e));
  if (missing.length) {
    console.error("Bu foydalanuvchilar topilmadi:\n  " + missing.join("\n  "));
    process.exit(1);
  }

  console.log("JAMOA");
  for (const [sheetName, email] of Object.entries(TEAM)) {
    const u = byEmail.get(email)!;
    const asAccountant = FIRMS.filter((f) => f.accountant === sheetName).length;
    const asBank = FIRMS.filter((f) => f.bank === sheetName).length;
    const what = [
      asAccountant ? `${asAccountant} ta buxgalter` : "",
      asBank ? `${asBank} ta bank-klient` : "",
    ]
      .filter(Boolean)
      .join(" + ");
    console.log(
      `  ${sheetName.padEnd(18)} → ${u.fullName.padEnd(22)} ${u.isActive ? "faol " : "NOFAOL"}  ${what}`
    );
  }
  console.log(`  ${"(nazoratchi)".padEnd(18)} → ${byEmail.get(SUPERVISOR_EMAIL)!.fullName}`);
  console.log(`  ${"(bosh buxgalter)".padEnd(18)} → ${byEmail.get(CHIEF_EMAIL)!.fullName}`);

  // ── 2. Qaysi firma allaqachon bor ─────────────────────────────────────
  const existing = await prisma.company.findMany({
    where: { inn: { in: FIRMS.map((f) => f.inn) } },
    select: { inn: true, name: true },
  });
  const existingInn = new Set(existing.map((c) => c.inn));
  const toCreate = FIRMS.filter((f) => !existingInn.has(f.inn));

  console.log(`\nFIRMALAR: ${FIRMS.length} ta manbada, ${existingInn.size} ta allaqachon bazada, ${toCreate.length} ta yaratiladi.`);
  for (const c of existing) console.log(`  = ${c.inn}  ${c.name}`);

  const noBankButPaid = toCreate.filter((f) => !f.bank);
  const noAmount = toCreate.filter((f) => !f.amount);
  if (noAmount.length) {
    console.log(`\n⚠️  Shartnoma summasi ko'rsatilmagan (${noAmount.length}) — contractAmount bo'sh qoladi, KPI ulushi hisoblanmaydi:`);
    for (const f of noAmount) console.log(`     ${f.name}`);
  }
  if (noBankButPaid.length) {
    console.log(`\nℹ️  Bank-klient biriktirilmagan (${noBankButPaid.length}) — bankClientId bo'sh.`);
  }

  const total = toCreate.reduce((s, f) => s + (f.amount ?? 0), 0);
  console.log(`\nJami shartnoma summasi: ${som(total)} so'm`);

  if (!apply) {
    console.log(`\n${"─".repeat(64)}`);
    console.log("Hech narsa yozilmadi. Yozish uchun:");
    console.log("   npx tsx scripts/import-mohira-team.ts --apply");
    return;
  }

  // ── 3. Nofaol jamoa a'zosini qayta yoqish ─────────────────────────────
  for (const email of REACTIVATE) {
    const u = byEmail.get(email);
    if (u && !u.isActive) {
      await prisma.user.update({ where: { id: u.id }, data: { isActive: true } });
      console.log(`\n✓ ${u.fullName} qayta faollashtirildi.`);
    }
  }

  // ── 4. Firmalarni yaratish ────────────────────────────────────────────
  const supervisorId = byEmail.get(SUPERVISOR_EMAIL)!.id;
  const chiefId = byEmail.get(CHIEF_EMAIL)!.id;

  let created = 0;
  for (const f of toCreate) {
    const accountantId = byEmail.get(TEAM[f.accountant])!.id;
    const bankClientId = f.bank ? byEmail.get(TEAM[f.bank])!.id : null;

    // Firma ustunlari va ContractAssignment qatorlari BIRGA yoziladi —
    // kartochka ustunlarni, "Jamoa" tabi esa biriktiruvlarni o'qiydi
    // (server/companies.ts createCompany bilan bir xil tartib).
    const assignments: { role: AssignmentRole; userId: string; pct: number }[] = [
      { role: "accountant", userId: accountantId, pct: f.pct },
      { role: "chief_accountant", userId: chiefId, pct: PCT_CHIEF },
      { role: "controller", userId: supervisorId, pct: PCT_SUPERVISOR },
    ];
    if (bankClientId) assignments.push({ role: "bank_manager", userId: bankClientId, pct: PCT_BANK });

    await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: f.name,
          inn: f.inn,
          taxRegime: f.vat ? "vat" : "turnover",
          contractAmount: f.amount ?? null,
          riskNotes: f.notes ?? null,
          isActive: true,
          isOwnFirm: false,
          accountantId,
          accountantPerc: f.pct,
          chiefAccountantId: chiefId,
          chiefAccountantPerc: PCT_CHIEF,
          supervisorId,
          supervisorPerc: PCT_SUPERVISOR,
          bankClientId,
          bankClientPerc: bankClientId ? PCT_BANK : null,
        },
        select: { id: true },
      });

      for (const a of assignments) {
        await tx.contractAssignment.create({
          data: {
            companyId: company.id,
            userId: a.userId,
            role: a.role,
            salaryType: "percent",
            salaryValue: a.pct,
            startDate: new Date(),
            isActive: true,
          },
        });
      }
    });

    created++;
    const roles = assignments.map((a) => ASSIGNMENT_ROLE_LABELS[a.role][0]).join("");
    console.log(`  + ${f.inn.padEnd(11)} ${f.name.slice(0, 40).padEnd(42)} [${roles}] ${som(f.amount ?? 0).padStart(10)}`);
  }

  console.log(`\n✓ ${created} ta firma yaratildi, har birida ${3}–4 ta biriktiruv.`);
  console.log("\nTekshirish uchun: npx tsx scripts/verify-scoping.ts");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
