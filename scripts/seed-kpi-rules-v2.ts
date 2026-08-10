/**
 * Seed the KPI v2 rule set (three-state: bonus / neutral / penalty).
 *
 * Source of truth: data/kerak/public/kpi-rules-v2.json (spec) reconciled with
 * the real monthly data in data/kerak/kpi-oylik.json (212 rows). Where the
 * spec and the real data disagree on coefficients, the REAL DATA wins so the
 * seeded rules stay consistent with the historical KPI records:
 *   - automation items (didox/mehnat/soliq_xat/avtokameral) use ±0.25 (4×0.25 = 1.0
 *     budget) rather than the spec's 0.33/0.34
 *   - `acc_avtokameral` exists in the data but not the spec → added here
 *   - `acc_group` in the data is a legacy alias of `acc_group_response` → not seeded
 *     as a separate rule (data seeder maps it across)
 *   - rule `name`s match the data keys exactly (bank_personal_resp, sup_tax_reports,
 *     sup_unresolved) so monthly-data seeding can join on them.
 *
 * Salary envelopes (from spec.salary_structure):
 *   accountant  base 20% + KPI max 5%
 *   bank_client base  5% + KPI max 2.5%
 *   supervisor  base  5% + KPI max 1%
 *
 * Idempotent: upserts by unique `name`; removes any rule not in this canonical set
 * (safe — MonthlyPerformance is empty / references are checked before seeding data).
 *
 * Run:  npx tsx scripts/seed-kpi-rules-v2.ts
 */
import "./load-env"; // must be first: loads DATABASE_URL before Prisma is used
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

type Opt = {
  key: string;
  label_uz: string;
  color: "green" | "yellow" | "red";
  coeff?: number | null;
  coeff_per_unit?: number;
  max_coeff?: number | null;
  note?: string;
};

type RuleSeed = {
  name: string;
  nameUz: string;
  role: "accountant" | "bank_client" | "supervisor";
  category: string;
  inputTypeV2: "select" | "counter" | "checkbox_bonus" | "checkbox_penalty" | "amount_penalty";
  scope: "global" | "per_company" | "per_group";
  sortOrder: number;
  descriptionUz: string;
  maxBonus: number;
  maxPenalty: number | null;
  options: Opt[];
};

// --- reusable option groups ------------------------------------------------
const threeState = (bonus: number, penalty: number): Opt[] => [
  { key: "green", label_uz: "Bajarildi / o'z vaqtida", color: "green", coeff: bonus },
  { key: "yellow", label_uz: "Qisman / neytral", color: "yellow", coeff: 0 },
  { key: "red", label_uz: "Bajarilmadi / kechikdi", color: "red", coeff: penalty },
];

// Exported so test/kpi-rule-envelope.test.ts can assert the reglament envelopes
// (5% / 2.5% / 1%) without a database.
export const RULES: RuleSeed[] = [
  // ===================== BUXGALTER (20% + max 5% KPI) =====================
  {
    name: "acc_attendance", nameUz: "Ishga kelish (08:30 gacha)", role: "accountant",
    category: "attendance", inputTypeV2: "counter", scope: "global", sortOrder: 1,
    descriptionUz: "Har kuni 08:30 gacha kelish +0.04%/kun (max +1%). Uzrsiz 09:00 dan kech kelish har 5 daqiqa uchun -0.1%.",
    maxBonus: 1.0, maxPenalty: null,
    options: [
      { key: "early_days", label_uz: "08:30 gacha kelgan kunlar", color: "green", coeff_per_unit: 0.04, max_coeff: 1.0, note: "Har kun +0.04%, max +1%" },
      { key: "late_5min", label_uz: "Kechikkan har 5 daqiqa (09:00 dan)", color: "red", coeff_per_unit: -0.1, max_coeff: null },
    ],
  },
  {
    name: "acc_group_response", nameUz: "Guruhda javob berish (10 daqiqa)", role: "accountant",
    category: "communication", inputTypeV2: "select", scope: "per_company", sortOrder: 2,
    descriptionUz: "Oy davomida uzluksiz 10 daqiqada javob berish. Tizimli kechikish har safar -0.5%.",
    maxBonus: 1.0, maxPenalty: -0.5,
    options: [
      { key: "green", label_uz: "Oy davomida uzluksiz bajarildi", color: "green", coeff: 1.0 },
      { key: "yellow", label_uz: "Ba'zi holatlar o'tkazildi", color: "yellow", coeff: 0 },
      { key: "red", label_uz: "Tizimli kechikish (-0.5%)", color: "red", coeff: -0.5 },
    ],
  },
  {
    name: "acc_1c_base", nameUz: "1C Baza (o'tgan oy)", role: "accountant",
    category: "automation", inputTypeV2: "select", scope: "per_company", sortOrder: 3,
    descriptionUz: "O'tgan oyning 1C bazasi 5-sanagacha tayyor bo'lishi kerak.",
    maxBonus: 1.0, maxPenalty: -1.0,
    options: [
      { key: "green", label_uz: "5-sanagacha tayyor", color: "green", coeff: 1.0 },
      { key: "yellow", label_uz: "5–15 sana orasida tayyor", color: "yellow", coeff: 0 },
      { key: "red", label_uz: "15-dan keyin yoki yo'q", color: "red", coeff: -1.0 },
    ],
  },
  {
    name: "acc_mehnat", nameUz: "my.mehnat.uz (xodimlar vaqtida)", role: "accountant",
    category: "automation", inputTypeV2: "select", scope: "per_company", sortOrder: 4,
    descriptionUz: "my.mehnat.uz da qabul qilingan/bo'shagan xodimlar vaqtida kiritilishi.",
    maxBonus: 0.25, maxPenalty: -0.25, options: threeState(0.25, -0.25),
  },
  {
    name: "acc_didox", nameUz: "Didox.uz (shartnomalar, s/f)", role: "accountant",
    category: "automation", inputTypeV2: "select", scope: "per_company", sortOrder: 5,
    descriptionUz: "Didox.uz da qabul qilinmagan shartnoma, s/f va hujjatlar yo'qligi.",
    maxBonus: 0.25, maxPenalty: -0.25, options: threeState(0.25, -0.25),
  },
  {
    name: "acc_soliq_xat", nameUz: "my.soliq.uz (xatlar va javoblar)", role: "accountant",
    category: "automation", inputTypeV2: "select", scope: "per_company", sortOrder: 6,
    descriptionUz: "my.soliq.uz da o'qilmagan/javob berilmagan xatlar yo'qligi.",
    maxBonus: 0.25, maxPenalty: -0.25, options: threeState(0.25, -0.25),
  },
  {
    name: "acc_avtokameral", nameUz: "Avtokameral tekshiruv", role: "accountant",
    category: "automation", inputTypeV2: "select", scope: "per_company", sortOrder: 7,
    descriptionUz: "Avtokameral (kameral tekshiruv) xatlariga o'z vaqtida javob berish va yopish.",
    maxBonus: 0.25, maxPenalty: -0.25, options: threeState(0.25, -0.25),
  },
  {
    name: "acc_cashflow", nameUz: "Pul oqimi hisoboti", role: "accountant",
    category: "reports", inputTypeV2: "select", scope: "per_company", sortOrder: 8,
    descriptionUz: "Pul oqimi hisoboti guruhga vaqtida yuborilishi.",
    maxBonus: 0.2, maxPenalty: -0.2, options: threeState(0.2, -0.2),
  },
  {
    name: "acc_debitor", nameUz: "Debitor-kreditor hisoboti", role: "accountant",
    category: "reports", inputTypeV2: "select", scope: "per_company", sortOrder: 9,
    descriptionUz: "Debitor-kreditor hisoboti guruhga vaqtida yuborilishi.",
    maxBonus: 0.2, maxPenalty: -0.2, options: threeState(0.2, -0.2),
  },
  {
    name: "acc_taxes_report", nameUz: "Soliqlar hisobi", role: "accountant",
    category: "reports", inputTypeV2: "select", scope: "per_company", sortOrder: 10,
    descriptionUz: "Soliqlar hisobi guruhga vaqtida yuborilishi va soliqlar o'z vaqtida to'langani.",
    maxBonus: 0.2, maxPenalty: -0.2, options: threeState(0.2, -0.2),
  },
  {
    name: "acc_payroll_report", nameUz: "Ish haqi hisoboti", role: "accountant",
    category: "reports", inputTypeV2: "select", scope: "per_company", sortOrder: 11,
    descriptionUz: "Ish haqi hisoboti (raschyot) guruhga vaqtida yuborilishi.",
    maxBonus: 0.2, maxPenalty: -0.2, options: threeState(0.2, -0.2),
  },
  {
    name: "acc_pnl_report", nameUz: "Foyda va zarar hisoboti", role: "accountant",
    category: "reports", inputTypeV2: "select", scope: "per_company", sortOrder: 12,
    descriptionUz: "Foyda va zarar hisoboti guruhga vaqtida yuborilishi (max +0.1%).",
    maxBonus: 0.1, maxPenalty: -0.1, options: threeState(0.1, -0.1),
  },
  {
    name: "acc_materials", nameUz: "Material hisoboti (o'tgan oy)", role: "accountant",
    category: "reports", inputTypeV2: "select", scope: "per_company", sortOrder: 13,
    descriptionUz: "Materiallar hisoboti 15-sanagacha tayyor bo'lishi va topshirilishi.",
    maxBonus: 0.1, maxPenalty: -0.1, options: threeState(0.1, -0.1),
  },
  {
    name: "acc_letters", nameUz: "Xatlar hisobi", role: "accountant",
    category: "automation", inputTypeV2: "counter", scope: "per_company", sortOrder: 14,
    descriptionUz: "Kelib tushgan xatlar va uning ijobiy hal etilishi ko'rsatkichi.",
    maxBonus: 0.0, maxPenalty: null,
    options: [
      { key: "received_letters", label_uz: "Kelgan xatlar soni", color: "yellow", coeff_per_unit: 0 },
      { key: "resolved_letters", label_uz: "Ijobiy hal bo'lgan xatlar", color: "green", coeff_per_unit: 0 },
    ],
  },
  {
    name: "acc_payroll_posted", nameUz: "Oylik chiqdi + 6710 Kt tekshiruv", role: "accountant",
    category: "reports", inputTypeV2: "select", scope: "per_company", sortOrder: 15,
    // Kuzatuv bandi, alohida jarima EMAS: oylikning o'z vaqtidaligi allaqachon
    // acc_payroll_report (0.2) da baholanadi — bu yerda ham foiz qo'yilsa, bitta
    // kechikish uchun ikki marta jarima yechilardi. Reglamentda bunday band yo'q.
    descriptionUz: "Oylik o'z vaqtida chiqdimi va 6710 hisobida Kt qoldiq qolmadimi — tekshiruv (pulga ta'sir qilmaydi).",
    maxBonus: 0.0, maxPenalty: 0.0,
    options: [
      { key: "green", label_uz: "Oylik chiqdi, 6710 da Kt qoldiq yo'q", color: "green", coeff: 0 },
      { key: "yellow", label_uz: "Qisman / aniqlanmadi", color: "yellow", coeff: 0 },
      { key: "red", label_uz: "Oylik chiqmadi yoki 6710 da Kt qoldiq bor", color: "red", coeff: 0 },
    ],
  },
  {
    name: "acc_critical_error", nameUz: "Tuzatib bo'lmaydigan xato", role: "accountant",
    category: "penalty_only", inputTypeV2: "checkbox_penalty", scope: "per_company", sortOrder: 16,
    descriptionUz: "Firmaga tuzatib bo'lmaydigan zarar keltiruvchi xatolar.",
    maxBonus: 0.0, maxPenalty: -1.0,
    options: [
      { key: "green", label_uz: "Xato yo'q", color: "green", coeff: 0 },
      { key: "red", label_uz: "Xato bo'ldi (-1%)", color: "red", coeff: -1.0 },
    ],
  },
  {
    name: "acc_absence", nameUz: "Ish kuni kelmay qolish (uzrsiz)", role: "accountant",
    category: "attendance", inputTypeV2: "counter", scope: "global", sortOrder: 17,
    descriptionUz: "Uzrsiz kelmagan har kun uchun -1%. O'sha kuni ish qilgan nazoratchi maoshiga qo'shiladi.",
    maxBonus: 0.0, maxPenalty: null,
    options: [{ key: "absent_days", label_uz: "Kelmagan kunlar soni", color: "red", coeff_per_unit: -1.0, max_coeff: null }],
  },

  // ===================== BANK-KLIENT (5% + max 2.5% KPI) =====================
  {
    name: "bank_attendance", nameUz: "Ishga kelish (08:30 gacha)", role: "bank_client",
    category: "attendance", inputTypeV2: "counter", scope: "global", sortOrder: 20,
    descriptionUz: "Har kuni 08:30 gacha kelish +0.04%/kun (max +1%). Uzrsiz kechikish har 5 daqiqa uchun -0.2%.",
    maxBonus: 1.0, maxPenalty: null,
    options: [
      { key: "early_days", label_uz: "08:30 gacha kelgan kunlar", color: "green", coeff_per_unit: 0.04, max_coeff: 1.0 },
      { key: "late_5min", label_uz: "Kechikkan har 5 daqiqa (09:00 dan)", color: "red", coeff_per_unit: -0.2, max_coeff: null },
    ],
  },
  {
    name: "bank_group_response", nameUz: "Guruhda javob berish (5 daqiqa)", role: "bank_client",
    category: "communication", inputTypeV2: "select", scope: "per_company", sortOrder: 21,
    descriptionUz: "Oy davomida uzluksiz 5 daqiqada javob berish (Swift mustasno). Tizimli kechikish -0.5%.",
    maxBonus: 1.0, maxPenalty: -0.5,
    options: [
      { key: "green", label_uz: "Oy davomida uzluksiz bajarildi", color: "green", coeff: 1.0 },
      { key: "yellow", label_uz: "Ba'zi holatlar o'tkazildi", color: "yellow", coeff: 0 },
      { key: "red", label_uz: "Tizimli kechikish (-0.5%)", color: "red", coeff: -0.5 },
    ],
  },
  {
    name: "bank_personal_resp", nameUz: "Shaxsiy mas'uliyat", role: "bank_client",
    category: "bonus_only", inputTypeV2: "checkbox_bonus", scope: "global", sortOrder: 22,
    descriptionUz: "Vypisklarni vaqtida olish, muammoga yechim topish. Bosh hisob-kitobchi tavsiyasi bilan +0.5%.",
    maxBonus: 0.5, maxPenalty: 0.0,
    options: [
      { key: "green", label_uz: "Bosh hisob-kitobchi tavsiyasi bor", color: "green", coeff: 0.5 },
      { key: "yellow", label_uz: "Tavsiya berilmagan", color: "yellow", coeff: 0 },
    ],
  },
  {
    name: "bank_wrong_transfer", nameUz: "Noto'g'ri pul o'tkazma", role: "bank_client",
    category: "penalty_only", inputTypeV2: "amount_penalty", scope: "per_company", sortOrder: 23,
    descriptionUz: "Noto'g'ri pul o'tkazma — xatoni bartaraf etish xarajati miqdorida jarima (so'mda qo'lda kiritiladi).",
    maxBonus: 0.0, maxPenalty: null,
    options: [
      { key: "green", label_uz: "Xato yo'q", color: "green", coeff: 0 },
      { key: "red", label_uz: "Xato miqdori (so'mda)", color: "red", coeff: null, note: "Jarima summasi qo'lda kiritiladi" },
    ],
  },
  {
    name: "bank_absence", nameUz: "Ish kuni kelmay qolish (uzrsiz)", role: "bank_client",
    category: "attendance", inputTypeV2: "counter", scope: "global", sortOrder: 24,
    descriptionUz: "Uzrsiz kelmagan har kun uchun -0.25%. O'sha kuni ish qilgan xodimga o'tkaziladi.",
    maxBonus: 0.0, maxPenalty: null,
    options: [{ key: "absent_days", label_uz: "Kelmagan kunlar soni", color: "red", coeff_per_unit: -0.25, max_coeff: null }],
  },

  // ===================== NAZORATCHI (5% + max 1% KPI) =====================
  {
    name: "sup_group_response", nameUz: "Guruhda javob berish (5-10 daqiqa)", role: "supervisor",
    category: "communication", inputTypeV2: "select", scope: "per_group", sortOrder: 30,
    descriptionUz: "Buxgalter va bank-klient bilan 5-10 daqiqada javob berish reglamentini ushlab turish.",
    maxBonus: 0.5, maxPenalty: -0.5,
    options: [
      { key: "green", label_uz: "Oy davomida ushlab turildi", color: "green", coeff: 0.5 },
      { key: "yellow", label_uz: "Ba'zi o'tkazishlar bo'ldi", color: "yellow", coeff: 0 },
      { key: "red", label_uz: "Tizimli muammolar (-0.5%)", color: "red", coeff: -0.5 },
    ],
  },
  {
    name: "sup_reports_deadline", nameUz: "Hisobotlar 12/18-sanada tugatilishi", role: "supervisor",
    category: "reports", inputTypeV2: "select", scope: "per_group", sortOrder: 31,
    descriptionUz: "Oylik hisobotlar 12-sanada, kvartal hisobotlar 18-sanada tugallanishi kerak.",
    maxBonus: 0.5, maxPenalty: -0.5,
    options: [
      { key: "green", label_uz: "O'z vaqtida (12/18) tugatildi", color: "green", coeff: 0.5 },
      { key: "yellow", label_uz: "Ba'zilari kechikdi", color: "yellow", coeff: 0 },
      { key: "red", label_uz: "Ko'pchiligi kechikdi (-0.5%)", color: "red", coeff: -0.5 },
    ],
  },
  {
    name: "sup_tax_reports", nameUz: "Guruhda soliqlar va hisobotlar vaqtida", role: "supervisor",
    category: "reports", inputTypeV2: "select", scope: "per_group", sortOrder: 32,
    descriptionUz: "Guruhidagi firmalarda soliqlar/hisobotlar kechiksa jarima.",
    maxBonus: 0.0, maxPenalty: -0.5,
    options: [
      { key: "green", label_uz: "Hammasi vaqtida", color: "green", coeff: 0 },
      { key: "red", label_uz: "Guruhda kechikish bo'ldi (-0.5%)", color: "red", coeff: -0.5 },
    ],
  },
  {
    name: "sup_attendance", nameUz: "Ishga kelish (09:00 gacha)", role: "supervisor",
    category: "attendance", inputTypeV2: "counter", scope: "global", sortOrder: 33,
    descriptionUz: "Uzrsiz 09:00 dan kech kelish: har 5 daqiqa uchun -0.1%.",
    maxBonus: 0.0, maxPenalty: null,
    options: [{ key: "late_5min", label_uz: "Kechikkan har 5 daqiqa", color: "red", coeff_per_unit: -0.1, max_coeff: null }],
  },
  {
    name: "sup_unresolved", nameUz: "Muammolarni yechimisiz qoldirish", role: "supervisor",
    category: "communication", inputTypeV2: "select", scope: "per_group", sortOrder: 34,
    descriptionUz: "Guruhida vaqtida javob bermaslik yoki muammolarni yechimisiz qoldirish.",
    maxBonus: 0.0, maxPenalty: -0.5,
    options: [
      { key: "green", label_uz: "Barcha muammolar hal qilindi", color: "green", coeff: 0 },
      { key: "red", label_uz: "Ba'zilari yechilmadi (-0.5%)", color: "red", coeff: -0.5 },
    ],
  },
  {
    name: "sup_absence", nameUz: "Ish kuni kelmay qolish (uzrsiz)", role: "supervisor",
    category: "attendance", inputTypeV2: "counter", scope: "global", sortOrder: 35,
    descriptionUz: "Uzrsiz kelmagan har kun uchun -0.25%. O'sha kuni ish qilgan bosh hisob-kitobchiga o'tkaziladi.",
    maxBonus: 0.0, maxPenalty: null,
    options: [{ key: "absent_days", label_uz: "Kelmagan kunlar soni", color: "red", coeff_per_unit: -0.25, max_coeff: null }],
  },
];

// Legacy inputType (non-null column) derived from v2 type
const legacyInputType = (v2: RuleSeed["inputTypeV2"]): string =>
  v2 === "counter" ? "counter" : v2 === "amount_penalty" ? "number" : "checkbox";

async function main() {
  const names = RULES.map((r) => r.name);

  // Remove any rule not in the canonical set.
  // Guard: refuse if a real (approved/submitted) performance references it; then
  // clear dependent CompanyKpiRule / draft-performance rows before deleting.
  const stale = await prisma.kpiRule.findMany({ where: { name: { notIn: names } }, select: { id: true } });
  const staleIds = stale.map((s) => s.id);
  if (staleIds.length > 0) {
    const realRefs = await prisma.monthlyPerformance.count({
      where: { ruleId: { in: staleIds }, status: { in: ["submitted", "approved"] } },
    });
    if (realRefs > 0) throw new Error(`Aborting cleanup: ${realRefs} submitted/approved performances reference rules being removed.`);
    await prisma.monthlyPerformance.deleteMany({ where: { ruleId: { in: staleIds } } });
    await prisma.companyKpiRule.deleteMany({ where: { ruleId: { in: staleIds } } });
  }
  const removed = await prisma.kpiRule.deleteMany({ where: { name: { notIn: names } } });
  console.log(`Removed ${removed.count} non-canonical rule(s).`);

  let created = 0;
  let updated = 0;
  for (const r of RULES) {
    const data = {
      nameUz: r.nameUz,
      role: r.role,
      category: r.category,
      inputType: legacyInputType(r.inputTypeV2),
      inputTypeV2: r.inputTypeV2,
      scope: r.scope,
      sortOrder: r.sortOrder,
      description: r.descriptionUz,
      descriptionUz: r.descriptionUz,
      rewardPercent: new Prisma.Decimal(r.maxBonus),
      penaltyPercent: new Prisma.Decimal(Math.abs(r.maxPenalty ?? 0)),
      maxBonus: new Prisma.Decimal(r.maxBonus),
      maxPenalty: r.maxPenalty === null ? null : new Prisma.Decimal(r.maxPenalty),
      options: r.options as unknown as Prisma.InputJsonValue,
      isActive: true,
    };
    const existing = await prisma.kpiRule.findUnique({ where: { name: r.name } });
    await prisma.kpiRule.upsert({ where: { name: r.name }, create: { name: r.name, ...data }, update: data });
    if (existing) updated++;
    else created++;
  }

  const byRole = await prisma.kpiRule.groupBy({ by: ["role"], _count: true, orderBy: { role: "asc" } });
  console.log(`\n✅ KPI v2 rules seeded — created ${created}, updated ${updated}, total ${RULES.length}`);
  console.log(byRole.map((x) => `  ${x.role}: ${x._count}`).join("\n"));
}

/**
 * `main()` FAQAT fayl to'g'ridan-to'g'ri ishga tushirilganda yuguradi.
 *
 * Ilgari u modul darajasida chaqirilardi, ya'ni bu fayldan BIRON NARSA import
 * qilishning o'zi butun seed'ni ishga tushirardi — jumladan "non-canonical"
 * qoidalarni O'CHIRISHNI. `test/kpi-rule-envelope.test.ts` shu fayldan faqat
 * `RULES` konstantasini oladi (u DB'siz test), lekin import paytida seed ishchi
 * bazada yurib, bitta KpiRule qatorini o'chirib yuborgan.
 *
 * Import — yon ta'sirsiz bo'lishi kerak. Bu qo'riqchi shuni kafolatlaydi.
 */
const isEntrypoint = process.argv[1]?.endsWith("seed-kpi-rules-v2.ts") ?? false;

if (isEntrypoint) {
  main()
    .catch((e) => {
      console.error("ERROR:", e.message);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
