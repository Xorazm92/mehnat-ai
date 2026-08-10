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
 * Idempotent va MOSLASHTIRUVCHI: STIR bo'yicha firma topilsa qayta
 * yaratilmaydi, lekin biriktiruvlari quyidagi holatga keltiriladi. Shu sabab
 * skriptni lokalda ham, prodda ham xuddi shu buyruq bilan ishlatish mumkin.
 *
 * TUZILMA: 55 firma — Mohiraning "FinCo 2" bo'limi.
 *   buxgalter 20% (bitta firmada 25%) · Mohira (bosh buxgalter) 7% · bank 5%
 *
 * Nazoratchi o'rni ATAYLAB bo'sh: jamoani Mohira bosh buxgalter sifatida
 * boshqaradi. Varaqda 7% "Ёркиной" ustunida turgan, lekin bu firmalar
 * Yorqinoyning bo'limiga kirmaydi — 7% bo'lim boshlig'iga tegishli.
 */
import "./load-env"; // birinchi bo'lishi shart
import { prisma } from "@/lib/prisma";
import { formatNum as som } from "@/lib/format";
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
interface TeamMember {
  /**
   * ASOSIY KALIT — telefon (oxirgi 9 raqam, `User.phoneNormalized`).
   *
   * Email ATAYLAB asosiy kalit EMAS: u import paytida tasodifiy suffiks bilan
   * generatsiya qilingan (`umid_def3@`, `umid_88a4@`) va HAR BAZADA BOSHQACHA.
   * Shu sabab skript lokalda ishlab, prodda "foydalanuvchi topilmadi" deb
   * to'xtardi. Telefon esa odamning haqiqiy identifikatori — ikkala bazada
   * bir xil (tekshirilgan).
   */
  phone?: string;
  /** Telefoni yo'q a'zo uchun zaxira kalit. */
  email?: string;
  /** Nofaol bo'lsa qayta yoqiladi. */
  reactivate?: true;
}

/** Varaqdagi ism → jamoa a'zosi. */
const TEAM: Record<string, TeamMember> = {
  "Azizbek shogird": { phone: "943904166" },
  Mohirbek: { phone: "508774166" },
  // Hasan'da telefon yo'q; uning emaili ikkala bazada mos keladi.
  Hasan: { email: "hasan_95ce@mehnat.uz", reactivate: true },
  Elbek: { phone: "509994166" },
  Umid: { phone: "948184166" },
  Muxriddin: { phone: "930774166" },
};

/** Jamoaning bosh buxgalteri — har 55 firmada bir xil. */
const CHIEF: TeamMember = { phone: "946234166" };

/** Firmalar shu bo'limga tegishli (boshlig'i — CHIEF). */
const DEPARTMENT_NAME = "FinCo 2";

/** Ulushlar. Nazoratchi o'rni bo'sh, shuning uchun 5% taqsimlanmaydi. */
const PCT_CHIEF = 7;
const PCT_BANK = 5;

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


/** Firmaning kutilgan holati — manba qatoridan hisoblanadi. */
interface Desired {
  accountantId: string;
  accountantPerc: number;
  chiefAccountantId: string;
  bankClientId: string | null;
  departmentId: string;
}

async function main() {
  const apply = process.argv.includes("--apply");

  // ── 1. Jamoa a'zolarini yechish ───────────────────────────────────────
  // Telefon bo'yicha, email — zaxira. Sabab: TeamMember izohiga qarang.
  const entries: [string, TeamMember][] = [
    ...Object.entries(TEAM),
    ["(bosh buxgalter)", CHIEF],
  ];
  const phones = [...new Set(entries.map(([, m]) => m.phone).filter((p): p is string => !!p))];
  const emails = [...new Set(entries.map(([, m]) => m.email).filter((e): e is string => !!e))];

  const users = await prisma.user.findMany({
    where: {
      OR: [
        ...(phones.length ? [{ phoneNormalized: { in: phones } }] : []),
        ...(emails.length ? [{ email: { in: emails } }] : []),
      ],
    },
    select: { id: true, email: true, fullName: true, role: true, isActive: true, phoneNormalized: true },
  });

  type TeamUser = (typeof users)[number];
  const resolved = new Map<string, TeamUser>();
  const problems: string[] = [];

  for (const [label, m] of entries) {
    let found: TeamUser[] = [];
    let via = "";

    if (m.phone) {
      found = users.filter((u) => u.phoneNormalized === m.phone);
      via = `telefon ${m.phone}`;
    }
    // Telefon natija bermasa — email bilan urinamiz (Hasan shu yo'l bilan topiladi).
    if (found.length === 0 && m.email) {
      found = users.filter((u) => u.email === m.email);
      via = `email ${m.email}`;
    }

    if (found.length === 0) {
      problems.push(`${label}: topilmadi (${via || "kalit yo'q"})`);
      continue;
    }
    // NOANIQLIK — taxmin qilmaymiz. Bitta telefonda ikkita yozuv bo'lsa,
    // qaysi biri to'g'ri ekanini faqat odam hal qila oladi.
    if (found.length > 1) {
      problems.push(
        `${label}: ${found.length} ta mos yozuv (${via}) — ` +
          found.map((u) => `${u.fullName} <${u.email}>`).join(", "),
      );
      continue;
    }
    resolved.set(label, found[0]);
  }

  if (problems.length) {
    console.error("Jamoa a'zolarini aniqlab bo'lmadi:\n  " + problems.join("\n  "));
    process.exit(1);
  }

  const chief = resolved.get("(bosh buxgalter)")!;
  const department = await prisma.department.findFirst({
    where: { name: DEPARTMENT_NAME },
    select: { id: true, name: true, chiefAccountantId: true },
  });
  if (!department) {
    console.error(`"${DEPARTMENT_NAME}" bo'limi topilmadi.`);
    process.exit(1);
  }
  if (department.chiefAccountantId !== chief.id) {
    console.error(
      `"${DEPARTMENT_NAME}" bo'limining boshlig'i ${chief.fullName} emas — avval bo'lim sozlansin.`
    );
    process.exit(1);
  }

  console.log("JAMOA");
  for (const sheetName of Object.keys(TEAM)) {
    const u = resolved.get(sheetName)!;
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
  console.log(`  ${"(bosh buxgalter)".padEnd(18)} → ${chief.fullName}  ·  bo'lim: ${department.name}`);
  console.log(`  ${"(nazoratchi)".padEnd(18)} → yo'q (ataylab bo'sh)`);

  const desiredFor = (f: SourceRow): Desired => ({
    accountantId: resolved.get(f.accountant)!.id,
    accountantPerc: f.pct,
    chiefAccountantId: chief.id,
    bankClientId: f.bank ? resolved.get(f.bank)!.id : null,
    departmentId: department.id,
  });

  // ── 2. Mavjud holat bilan solishtirish ────────────────────────────────
  const existing = await prisma.company.findMany({
    where: { inn: { in: FIRMS.map((f) => f.inn) } },
    select: {
      id: true, inn: true, name: true, departmentId: true,
      accountantId: true, accountantPerc: true,
      chiefAccountantId: true, supervisorId: true, bankClientId: true,
    },
  });
  const byInn = new Map(existing.map((c) => [c.inn, c]));

  const toCreate = FIRMS.filter((f) => !byInn.has(f.inn));
  const toFix: { row: SourceRow; company: (typeof existing)[number]; diffs: string[] }[] = [];

  for (const f of FIRMS) {
    const c = byInn.get(f.inn);
    if (!c) continue;
    const d = desiredFor(f);
    const diffs: string[] = [];
    if (c.accountantId !== d.accountantId) diffs.push("buxgalter");
    if (Number(c.accountantPerc ?? 0) !== d.accountantPerc) diffs.push("buxgalter %");
    if (c.chiefAccountantId !== d.chiefAccountantId) diffs.push("bosh buxgalter");
    if (c.supervisorId !== null) diffs.push("nazoratchi bo'shatiladi");
    if (c.bankClientId !== d.bankClientId) diffs.push("bank-klient");
    if (c.departmentId !== d.departmentId) diffs.push("bo'lim");
    if (diffs.length) toFix.push({ row: f, company: c, diffs });
  }

  console.log(
    `\nFIRMALAR: ${FIRMS.length} ta manbada · ${toCreate.length} ta yaratiladi · ` +
      `${toFix.length} ta moslashtiriladi · ${existing.length - toFix.length} ta allaqachon to'g'ri.`
  );
  for (const { company, diffs } of toFix.slice(0, 60)) {
    console.log(`  ~ ${company.inn.padEnd(15)} ${company.name.slice(0, 38).padEnd(40)} ${diffs.join(", ")}`);
  }

  const noAmount = FIRMS.filter((f) => !f.amount);
  if (noAmount.length) {
    console.log(`\n⚠️  Shartnoma summasi ko'rsatilmagan (${noAmount.length}) — KPI ulushi hisoblanmaydi:`);
    for (const f of noAmount) console.log(`     ${f.name}`);
  }
  const noBank = FIRMS.filter((f) => !f.bank).length;
  console.log(`\nℹ️  Bank-klient biriktirilmagan: ${noBank} ta firma.`);
  console.log(`Jami shartnoma summasi: ${som(FIRMS.reduce((s, f) => s + (f.amount ?? 0), 0))} so'm`);

  if (!apply) {
    console.log(`\n${"─".repeat(64)}`);
    console.log("Hech narsa yozilmadi. Yozish uchun:");
    console.log("   npx tsx scripts/import-mohira-team.ts --apply");
    return;
  }

  // ── 3. Nofaol jamoa a'zosini qayta yoqish ─────────────────────────────
  for (const [sheetName, m] of Object.entries(TEAM)) {
    if (!m.reactivate) continue;
    const u = resolved.get(sheetName);
    if (u && !u.isActive) {
      await prisma.user.update({ where: { id: u.id }, data: { isActive: true } });
      console.log(`\n✓ ${u.fullName} qayta faollashtirildi.`);
    }
  }

  /**
   * Biriktiruv qatorlarini kutilgan holatga keltiradi.
   *
   * Mavjud qatorlar O'CHIRILIB qayta yoziladi: `ContractAssignment` da
   * (companyId, userId, role) bo'yicha unikal cheklov yo'q, shuning uchun
   * "yangilash" o'rniga to'liq almashtirish yagona ishonchli yo'l. Bu faqat
   * shu ro'yxatdagi firmalarga tegadi.
   */
  const syncAssignments = async (
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    companyId: string,
    f: SourceRow,
    d: Desired
  ) => {
    const rows: { role: AssignmentRole; userId: string; pct: number }[] = [
      { role: "accountant", userId: d.accountantId, pct: d.accountantPerc },
      { role: "chief_accountant", userId: d.chiefAccountantId, pct: PCT_CHIEF },
    ];
    if (d.bankClientId) rows.push({ role: "bank_manager", userId: d.bankClientId, pct: PCT_BANK });

    await tx.contractAssignment.deleteMany({ where: { companyId } });
    for (const a of rows) {
      await tx.contractAssignment.create({
        data: {
          companyId,
          userId: a.userId,
          role: a.role,
          salaryType: "percent",
          salaryValue: a.pct,
          startDate: new Date(),
          isActive: true,
        },
      });
    }
    return rows.length;
  };

  // ── 4. Yaratish ───────────────────────────────────────────────────────
  let created = 0;
  for (const f of toCreate) {
    const d = desiredFor(f);
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
          departmentId: d.departmentId,
          accountantId: d.accountantId,
          accountantPerc: d.accountantPerc,
          chiefAccountantId: d.chiefAccountantId,
          chiefAccountantPerc: PCT_CHIEF,
          supervisorId: null,
          supervisorPerc: null,
          bankClientId: d.bankClientId,
          bankClientPerc: d.bankClientId ? PCT_BANK : null,
        },
        select: { id: true },
      });
      await syncAssignments(tx, company.id, f, d);
    });
    created++;
    console.log(`  + ${f.inn.padEnd(15)} ${f.name.slice(0, 40).padEnd(42)} ${som(f.amount ?? 0).padStart(10)}`);
  }

  // ── 5. Moslashtirish ──────────────────────────────────────────────────
  let fixed = 0;
  for (const { row: f, company } of toFix) {
    const d = desiredFor(f);
    await prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: company.id },
        data: {
          departmentId: d.departmentId,
          accountantId: d.accountantId,
          accountantPerc: d.accountantPerc,
          chiefAccountantId: d.chiefAccountantId,
          chiefAccountantPerc: PCT_CHIEF,
          supervisorId: null,
          supervisorPerc: null,
          bankClientId: d.bankClientId,
          bankClientPerc: d.bankClientId ? PCT_BANK : null,
        },
      });
      await syncAssignments(tx, company.id, f, d);
    });
    fixed++;
    console.log(`  ~ ${f.inn.padEnd(15)} ${f.name.slice(0, 40).padEnd(42)} moslashtirildi`);
  }

  console.log(`\n✓ ${created} ta yaratildi, ${fixed} ta moslashtirildi.`);
  console.log("\nTekshirish uchun: npx tsx scripts/verify-scoping.ts");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
