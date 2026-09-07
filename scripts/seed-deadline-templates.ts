// =====================================================
// DEADLINE TEMPLATE SEED + OBLIGATION GENERATSIYA (Faza A)
// =====================================================
// IDEMPOTENT: qayta ishga tushirish xavfsiz.
//  1) contractDate yo'q faol firmalarga standart sana (backfill) — aks holda
//     isCompanyEligible ularni chetlab o'tadi.
//  2) Standart O'zbekiston deadline shablonlari (upsert, HAMMASI `draft`).
//
// SEED HECH QACHON TASDIQLAMAYDI. Ilgari bu yerda `lifecycle: "active"` va
// `approvedById: createdBy` yozilardi — ya'ni skript Superadmin nomidan
// O'ZIGA tasdiq qo'yardi. Bazada bu shunday ko'rinardi: 30 ta shablonda
// `approvedById = createdBy` va `approvedAt = createdAt` soniyasigacha bir xil.
// Audit izi "bosh buxgalter ko'rib chiqdi" deb turardi, holbuki hech kim
// ko'rmagan — va o'sha shablonlar 213 firmaga oyiga ~6 000 majburiyat
// yaratadi.
//
// Endi seed faqat SPRAVOCHNIK beradi. `active` holatga o'tkazish — odamning
// ishi: `/admin/deadline-templates` → tasdiqlash, va o'shanda
// `server/deadlineTemplates.ts` haqiqiy `approvedById` ni yozadi.
//  3) Joriy davr uchun majburiyat generatsiyasi (catch-up=0 → tarixiy
//     "kechikkan" uyumi yaratilmaydi; muddatlar oldinga qarab toza chiqadi).
//
// Ishga tushirish:
//   npx tsx scripts/seed-deadline-templates.ts                # seed + generatsiya
//   npx tsx scripts/seed-deadline-templates.ts --no-generate  # faqat shablon
//
// `--no-generate` clean-start uchun: shablon reset'dan OLDIN ekiladi (u
// spravochnik, tozalashdan omon qoladi), majburiyat esa reset'dan KEYIN
// `scripts/generate-obligations.ts` bilan yaratiladi. Aks holda bu yerda
// yaratilgan majburiyatlarni reset darhol o'chirib yuborardi.
import "./load-env";
import { prisma } from "@/lib/prisma";
import { runGenerationLocked } from "@/lib/engines/obligation/obligationRun";
import { loadCompanySubjects } from "@/lib/domains/accounting/subjects";
import type { Periodicity, DeadlineAnchorType } from "@prisma/client";

// contractDate yo'q firmalar uchun taxminiy xizmat-boshlanish sanasi.
// EFFECTIVE_FROM dan oldin bo'lishi shart, aks holda isCompanyEligible
// firmani "hali shartnoma yo'q" deb chetlab o'tadi.
const CONTRACT_BACKFILL = new Date(Date.UTC(2026, 0, 1)); // 2026-01-01

/**
 * CLEAN-START CHEGARASI — bu sana shunchaki "shablon qachondan amal qiladi"
 * emas, u catch-up'ni ham to'sadi.
 *
 * Kunlik 06:00 generatsiyasi `catchUpMonths: 2` bilan ishlaydi
 * (bot/queues/obligation.worker.ts) va `ref` ni 0, 1, 2 oy orqaga suradi
 * (lib/obligationRun.ts). Generator esa shablonlarni `effectiveFrom <= ref`
 * bo'yicha filtrlaydi (lib/obligations.ts). Ya'ni sana 2026-01-01 bo'lsa,
 * 1-avgustdagi cron IYUN davrini ham yaratardi — uning muddatlari 5–25 iyul,
 * darhol kechikkan. NotificationDelivery (dedup jurnali) tozalashda o'chgani
 * uchun hech narsa to'smaydi va soatlik sweep har firma × har shablon uchun
 * qizil eskalatsiya yuborardi.
 *
 * 2026-07-01: iyun va undan oldingi davrlar HECH QACHON yaratilmaydi, iyul
 * davri (avgustda topshiriladigan real ish) esa yaratiladi.
 */
const EFFECTIVE_FROM = new Date(Date.UTC(2026, 6, 1)); // 2026-07-01

/**
 * `period_end_offset` shablonlari uchun alohida chegara. Ularning iyul davri
 * muddati 31-iyul, ya'ni tizim xodimlarga topshirilgan kunning o'zida
 * allaqachon o'tgan bo'lardi (212 firma × 2 shablon = 424 ta "kechikkan").
 * Bu ish iyulda, tizimsiz bajarilgan — uni kechikkan deb yozish noto'g'ri.
 * Shuning uchun ular avgust davridan boshlanadi (muddat: 31-avgust).
 */
const EFFECTIVE_FROM_IN_MONTH = new Date(Date.UTC(2026, 7, 1)); // 2026-08-01

/**
 * To'lov shablonlari uchun chegara — ular 2026-08 da qo'shildi, shuning uchun
 * avgust davridan boshlanadi. Oldingi davrlar uchun to'lov majburiyati
 * yaratilsa, u yaratilgan zahoti kechikkan bo'lib qizarardi (to'lovlar
 * amalda qilingan, faqat tizimda kuzatilmagan).
 */
const PAYMENTS_EFFECTIVE_FROM = new Date(Date.UTC(2026, 7, 1)); // 2026-08-01

interface TplSeed {
  code: string;
  name: string;
  obligationType: string;
  periodicity: Periodicity;
  anchorType: DeadlineAnchorType;
  dueDay?: number;
  dueMonth?: number;
  offsetDays?: number;
  /** Standart EFFECTIVE_FROM dan farq qilsa. */
  effectiveFrom?: Date;
  applicability?: { criteriaType: string; criteriaValue: string }[];
  /** Matritsa ustuni kaliti (`OperationFieldKey`). null = ustuni yo'q. */
  matrixKey?: string | null;
  /**
   * SAQLANGAN, LEKIN ENDI TA'SIRI YO'Q.
   *
   * Seed hamma shablonni `draft` qilib yaratadi (fayl boshidagi izohga
   * qarang) — generator uni olmaydi va majburiyat yaratilmaydi. Bosh
   * buxgalter `/admin/deadline-templates` dan tasdiqlaydi.
   *
   * Maydon ro'yxatlarda yozilgan holicha qoldirildi: u qaysi shablon
   * "tayyor deb hisoblangan", qaysi biri "yangi taklif" ekanini hujjatlashtiradi
   * va tasdiqlash navbatini tartiblashda foydali.
   */
  lifecycle?: "draft" | "active";
}

// Tasdiqlangan to'plam (foydalanuvchi 2026-07-24). Sanalar = keyingi davr kuni.
const TEMPLATES: TplSeed[] = [
  {
    code: "QQS_DECL",
    // Birlashgan `aylanma_qqs` ustuni bu shoxda IKKIGA bo'lingan (QQS oylik /
    // aylanma alohida). Eski kalit hech qanday ustunga mos kelmasdi.
    matrixKey: "qqs",
    name: "QQS deklaratsiyasi",
    obligationType: "tax_declaration",
    periodicity: "monthly",
    anchorType: "fixed_day_of_month",
    dueDay: 20,
    applicability: [{ criteriaType: "tax_regime", criteriaValue: "vat" }],
  },
  {
    code: "AYLANMA_SOLIQ",
    matrixKey: "aylanma",
    name: "Aylanma soliq",
    obligationType: "tax_declaration",
    periodicity: "monthly",
    anchorType: "fixed_day_of_month",
    dueDay: 15,
    applicability: [{ criteriaType: "tax_regime", criteriaValue: "turnover" }],
  },
  {
    code: "INPS_IJTIMOIY",
    matrixKey: "inps",
    name: "INPS va ijtimoiy soliq",
    obligationType: "tax_declaration",
    periodicity: "monthly",
    anchorType: "fixed_day_of_month",
    dueDay: 15,
  },
  {
    code: "DAROMAD_AGENT",
    matrixKey: "daromad_soliq",
    name: "Daromad solig'i (soliq agenti)",
    obligationType: "tax_declaration",
    periodicity: "monthly",
    anchorType: "fixed_day_of_month",
    dueDay: 15,
  },
  {
    code: "FOYDA_YILLIK",
    matrixKey: "foyda_soliq",
    name: "Foyda solig'i hisoboti (choraklik)",
    obligationType: "tax_declaration",
    periodicity: "quarterly",
    anchorType: "fixed_day_of_month",
    dueDay: 20,
  },
  {
    code: "MOLIYAVIY_YILLIK",
    matrixKey: "moliyaviy_natija",
    name: "Moliyaviy hisobot",
    obligationType: "financial_statement",
    periodicity: "annual",
    anchorType: "fixed_day_of_month",
    dueMonth: 2,
    dueDay: 15,
  },
  // ── SOLIQ TO'LOVI ────────────────────────────────────────────
  //
  // Matritsadagi "…To'lov" yarmi (`qqs_tolov`, `aylanma_tolov`, …) shu
  // shablonlarga bog'lanadi (lib/reportTemplateMap.ts). Ilgari to'lov
  // ustunlarining shabloni YO'Q edi: katak ekranda bor edi, lekin muddati
  // "Ishlar" ro'yxatiga chiqmasdi va foizga kirmasdi.
  //
  // Muddat deklaratsiya bilan bir kun — O'zbekistonda topshirish va to'lash
  // sanasi ustma-ust tushadi — lekin ish AYRIM: hisobot topshirilib, pul
  // to'lanmagan holat eng ko'p uchraydigani.
  //
  // `PAYMENTS_EFFECTIVE_FROM` — joriy oydan. Standart EFFECTIVE_FROM
  // (2026-07-01) qo'yilsa, kunlik catch-up iyul davri uchun ham majburiyat
  // yaratib, ular tug'ilishi bilanoq "kechikkan" bo'lib qizarardi.
  {
    code: "QQS_TOLOV",
    name: "QQS to'lovi",
    obligationType: "tax_payment",
    periodicity: "monthly",
    anchorType: "fixed_day_of_month",
    dueDay: 20,
    effectiveFrom: PAYMENTS_EFFECTIVE_FROM,
    applicability: [{ criteriaType: "tax_regime", criteriaValue: "vat" }],
  },
  {
    code: "AYLANMA_TOLOV",
    name: "Aylanma soliq to'lovi",
    obligationType: "tax_payment",
    periodicity: "monthly",
    anchorType: "fixed_day_of_month",
    dueDay: 15,
    effectiveFrom: PAYMENTS_EFFECTIVE_FROM,
    applicability: [{ criteriaType: "tax_regime", criteriaValue: "turnover" }],
  },
  {
    code: "DAROMAD_TOLOV",
    name: "Daromad solig'i to'lovi",
    obligationType: "tax_payment",
    periodicity: "monthly",
    anchorType: "fixed_day_of_month",
    dueDay: 15,
    effectiveFrom: PAYMENTS_EFFECTIVE_FROM,
  },
  {
    code: "INPS_TOLOV",
    name: "INPS va ijtimoiy soliq to'lovi",
    obligationType: "tax_payment",
    periodicity: "monthly",
    anchorType: "fixed_day_of_month",
    dueDay: 15,
    effectiveFrom: PAYMENTS_EFFECTIVE_FROM,
  },
  {
    code: "FOYDA_TOLOV",
    name: "Foyda solig'i to'lovi (choraklik)",
    obligationType: "tax_payment",
    periodicity: "quarterly",
    anchorType: "fixed_day_of_month",
    dueDay: 20,
    effectiveFrom: PAYMENTS_EFFECTIVE_FROM,
  },
  // Dividend solig'i (byudjet kodi 138) — soliq agenti sifatida ushlab
  // qolinadi, shuning uchun FAQAT ta'sischiga taqsimot qilgan firmada
  // ma'noga ega: `service_key` bilan chegaralanadi, aks holda 279 firmaning
  // hammasida har oy bo'sh majburiyat tug'ilardi.
  {
    code: "DIVIDEND_DECL",
    name: "Dividend solig'i hisoboti",
    obligationType: "tax_declaration",
    periodicity: "monthly",
    anchorType: "fixed_day_of_month",
    dueDay: 20,
    effectiveFrom: PAYMENTS_EFFECTIVE_FROM,
    applicability: [{ criteriaType: "service_key", criteriaValue: "dividend_soligi" }],
  },
  {
    code: "DIVIDEND_TOLOV",
    name: "Dividend solig'i to'lovi",
    obligationType: "tax_payment",
    periodicity: "monthly",
    anchorType: "fixed_day_of_month",
    dueDay: 20,
    effectiveFrom: PAYMENTS_EFFECTIVE_FROM,
    applicability: [{ criteriaType: "service_key", criteriaValue: "dividend_soligi" }],
  },
  // Keyingi chorak uchun bo'nak ma'lumotnomasi — to'lovi yo'q (pul oylik
  // "Bo'nak" katagi orqali chiqadi), shuning uchun faqat deklaratsiya.
  {
    code: "FOYDA_AVANS",
    name: "Foyda solig'i avans (bo'nak) ma'lumotnomasi",
    obligationType: "tax_declaration",
    periodicity: "quarterly",
    anchorType: "fixed_day_of_month",
    dueDay: 20,
    effectiveFrom: PAYMENTS_EFFECTIVE_FROM,
  },
  // ── STATISTIKA ───────────────────────────────────────────────
  //
  // Statistika hisobotlari HAMMA firmada topshirilmaydi — ular faoliyat turi
  // va statistika guruhiga bog'liq. Shuning uchun `service_key` bilan
  // chegaralanadi: majburiyat FAQAT shu ustun yoqilgan firmada tug'iladi.
  // Universal qilinsa, 283 firmaning hammasiga topshirmaydigan hisobot
  // muddati yaratilib, "Ishlar" ro'yxati shovqinga aylanardi.
  {
    code: "STAT_4_MOLIYA",
    name: "4-moliya (choraklik)",
    obligationType: "statistics",
    periodicity: "quarterly",
    // Muddat CHORAK ICHIDA: 1-mart/iyun/sentabr/dekabr holatiga → 18-sanagacha.
    anchorType: "period_end_month_day",
    dueDay: 18,
    effectiveFrom: PAYMENTS_EFFECTIVE_FROM,
    applicability: [{ criteriaType: "service_key", criteriaValue: "stat_4_moliya" }],
  },

  // Telegram'da (Buxgalter Mirabbos) so'ralgan qo'shimcha statistika
  // hisobotlari — 2026-08-24. Har biri `service_key` bilan chegaralangan:
  // faqat admin shu ustunni yoqqan firmada majburiyat tug'iladi.
  {
    code: "STAT_1_HISOBOT_MAZMUNI",
    name: "1-hisobot mazmuni (so'rovnoma)",
    obligationType: "statistics",
    periodicity: "annual",
    anchorType: "fixed_day_of_month",
    dueMonth: 7,
    dueDay: 1,
    effectiveFrom: PAYMENTS_EFFECTIVE_FROM,
    applicability: [{ criteriaType: "service_key", criteriaValue: "stat_1_hisobot_mazmuni" }],
  },
  {
    code: "STAT_4_QX",
    name: "4-qx (tashkilot, qishloq xo'jaligi)",
    obligationType: "statistics",
    periodicity: "quarterly",
    anchorType: "fixed_day_of_month",
    dueDay: 5,
    effectiveFrom: PAYMENTS_EFFECTIVE_FROM,
    applicability: [{ criteriaType: "service_key", criteriaValue: "stat_4_qx" }],
  },
  {
    code: "STAT_1_QX",
    name: "1-qx (tashkilot, qishloq xo'jaligi, yillik)",
    obligationType: "statistics",
    periodicity: "annual",
    anchorType: "fixed_day_of_month",
    dueMonth: 4,
    dueDay: 10,
    effectiveFrom: PAYMENTS_EFFECTIVE_FROM,
    applicability: [{ criteriaType: "service_key", criteriaValue: "stat_1_qx" }],
  },
  {
    code: "STAT_1_FX",
    name: "1-fx (fermer xo'jaligi, yillik)",
    obligationType: "statistics",
    periodicity: "annual",
    anchorType: "fixed_day_of_month",
    dueMonth: 3,
    dueDay: 10,
    effectiveFrom: PAYMENTS_EFFECTIVE_FROM,
    applicability: [{ criteriaType: "service_key", criteriaValue: "stat_1_fx" }],
  },
  {
    code: "STAT_4_FX",
    name: "4-fx (fermer xo'jaligi)",
    obligationType: "statistics",
    periodicity: "quarterly",
    anchorType: "fixed_day_of_month",
    dueDay: 5,
    effectiveFrom: PAYMENTS_EFFECTIVE_FROM,
    applicability: [{ criteriaType: "service_key", criteriaValue: "stat_4_fx" }],
  },
  {
    code: "STAT_1_FAN",
    name: "1-fan (ilmiy-tadqiqot, yillik)",
    obligationType: "statistics",
    periodicity: "annual",
    anchorType: "fixed_day_of_month",
    dueMonth: 4,
    dueDay: 8,
    effectiveFrom: PAYMENTS_EFFECTIVE_FROM,
    applicability: [{ criteriaType: "service_key", criteriaValue: "stat_1_fan" }],
  },

  // ASRO Reglament ichki oylik takrorlanuvchi vazifalari.
  //
  // ANCHOR TANLOVI — diqqat: `fixed_day_of_month` davrdan KEYINGI oyning N-kuniga
  // bog'lanadi (rawDueDate `window.periodEnd` dan hisoblaydi). Shuning uchun:
  //   - "o'tgan oy uchun" vazifalar (soliq, pul oqimi, material, 1C baza va
  //     hisobotlar) → `fixed_day_of_month`, ya'ni iyun davri → iyul N-kuni. To'g'ri.
  //   - Oyning O'ZIDA, oy oxirida bajariladigan vazifalar (raschot zarplata 25-31,
  //     oylik chiqdimi) → `period_end_offset` + offsetDays 0, ya'ni iyun davri →
  //     30-iyun. `fixed_day_of_month` + dueDay 31 ishlatilsa, ular bir oy kech
  //     tushardi va KPI kechikkanni "o'z vaqtida" deb baholardi.
  // Bonus: period_end_offset da fevral 31-kun muammosi umuman tug'ilmaydi.
  {
    code: "PAYROLL_CALC",
    matrixKey: "hisoblangan_oylik",
    name: "Raschot zarplata (ish haqi)",
    obligationType: "internal_task",
    periodicity: "monthly",
    anchorType: "period_end_offset",
    offsetDays: 0,
    effectiveFrom: EFFECTIVE_FROM_IN_MONTH,
  },
  {
    code: "TAX_SCHEDULE",
    matrixKey: "chiqadigan_soliqlar",
    name: "Soliq sana+summa (o'tgan oy)",
    obligationType: "internal_task",
    periodicity: "monthly",
    anchorType: "fixed_day_of_month",
    dueDay: 9,
  },
  {
    code: "AR_AP",
    matrixKey: "debitor_kreditor",
    name: "Debitor-kreditor hisoboti",
    obligationType: "internal_task",
    periodicity: "monthly",
    anchorType: "fixed_day_of_month",
    dueDay: 25,
  },
  {
    code: "PNL_REPORT",
    matrixKey: "foyda_va_zarar",
    name: "Foyda va zarar hisoboti",
    obligationType: "internal_task",
    periodicity: "monthly",
    anchorType: "fixed_day_of_month",
    dueDay: 25,
  },
  {
    code: "CASHFLOW",
    matrixKey: "pul_oqimlari",
    name: "Pul oqimlari hisoboti",
    obligationType: "internal_task",
    periodicity: "monthly",
    anchorType: "fixed_day_of_month",
    dueDay: 5,
  },
  {
    code: "MATERIALS",
    matrixKey: "tovar_ostatka",
    name: "Material hisoboti (o'tgan oy)",
    obligationType: "internal_task",
    periodicity: "monthly",
    anchorType: "fixed_day_of_month",
    dueDay: 15,
  },
  {
    code: "LETTERS",
    matrixKey: "xatlar",
    name: "Xatlar hisobi",
    obligationType: "internal_task",
    periodicity: "monthly",
    anchorType: "fixed_day_of_month",
    dueDay: 10,
  },
  {
    code: "ONEC_BASE",
    matrixKey: "one_c",
    name: "1C baza tayyor (o'tgan oy)",
    obligationType: "internal_task",
    periodicity: "monthly",
    anchorType: "fixed_day_of_month",
    dueDay: 5,
  },
  {
    code: "PAYROLL_POSTED",
    matrixKey: null, // matritsada ustuni yo'q — bu ichki reglament
    name: "Oylik chiqdi + 6710 Kt tekshiruvi",
    obligationType: "internal_task",
    periodicity: "monthly",
    anchorType: "period_end_offset",
    offsetDays: 0,
    effectiveFrom: EFFECTIVE_FROM_IN_MONTH,
  },

  // ── QORALAMALAR ────────────────────────────────────────────────────────
  // Manba: `lib/operationTemplates.ts:OPERATION_TEMPLATES` — firmaning O'Z
  // muddat bilimi, u yerda 25 kalit uchun `deadlineDay` + `frequency` yozilgan
  // va bugungacha HECH KIM o'qimagan (o'lik kod). Bu yerga ko'chirilgach u
  // ishlaydigan ma'lumotga aylanadi.
  //
  // Hammasi `lifecycle: "draft"` — generator faqat `active` ni oladi, ya'ni
  // BIRORTA majburiyat yaratilmaydi. Bosh buxgalter har birini ko'rib chiqib
  // `/admin/deadline-templates` dan `active` ga o'tkazadi.
  //
  // Applicability ATAYLAB bo'sh qoldirilgan: "kimga tegishli" savoli aynan
  // intervyu talab qiladigan qism, va bo'sh applicability = universal, ya'ni
  // uni `draft` holatida qoldirish xavfsiz. `active` ga o'tkazishdan OLDIN
  // to'ldirilishi shart — aks holda 213 firmaga tegib ketadi.
  //
  // TO'RTTASIDA QOIDA ALLAQACHON BOR (2026-09-07, bosh buxgalter tasdig'i):
  // YER_SOLIQ, MOL_MULK_SOLIQ, SUV_SOLIQ, ITPARK_OYLIK. Ular prodga
  // `scripts/migrate-service-key-applicability.ts` orqali qo'llandi va SHU
  // YERGA ham yozildi — 551-qatordagi `deleteMany` har deploy'da shablonning
  // applicability'sini QAYTA QURADI, ya'ni bu yerda yozilmagan qoida
  // keyingi `deploy.sh` da jimgina yo'q bo'lardi.
  // Qamrov manbai: scripts/data/service-key-mappings.json (confirmed=true).
  { code: "BUX_BALANS", matrixKey: "buxgalteriya_balansi", name: "Buxgalteriya balansi",
    obligationType: "financial_statement", periodicity: "quarterly",
    anchorType: "fixed_day_of_month", dueDay: 30, lifecycle: "draft" },
  { code: "YER_SOLIQ", matrixKey: "yer_soligi", name: "Yer solig'i",
    obligationType: "tax_declaration", periodicity: "annual",
    anchorType: "fixed_day_of_month", dueDay: 25, lifecycle: "draft",
    applicability: [{ criteriaType: "service_key", criteriaValue: "yer_soligi" }] },
  { code: "MOL_MULK_SOLIQ", matrixKey: "mol_mulk_soligi", name: "Mol-mulk solig'i",
    obligationType: "tax_declaration", periodicity: "annual",
    anchorType: "fixed_day_of_month", dueDay: 25, lifecycle: "draft",
    applicability: [{ criteriaType: "service_key", criteriaValue: "mol_mulk_soligi" }] },
  { code: "SUV_SOLIQ", matrixKey: "suv_soligi", name: "Suv solig'i",
    obligationType: "tax_declaration", periodicity: "annual",
    anchorType: "fixed_day_of_month", dueDay: 25, lifecycle: "draft",
    applicability: [{ criteriaType: "service_key", criteriaValue: "suv_soligi" }] },
  { code: "BONAK", matrixKey: "bonak", name: "Bo'nak (avans)",
    obligationType: "tax_payment", periodicity: "monthly",
    anchorType: "fixed_day_of_month", dueDay: 10, lifecycle: "draft" },
  { code: "ITPARK_OYLIK", matrixKey: "itpark_oylik", name: "IT Park hisoboti",
    obligationType: "client_service", periodicity: "quarterly",
    anchorType: "fixed_day_of_month", dueDay: 10, lifecycle: "draft",
    applicability: [{ criteriaType: "service_key", criteriaValue: "itpark_oylik" }] },
  { code: "DIDOX_FLOW", matrixKey: "didox", name: "Didox (e-aylanma)",
    obligationType: "internal_task", periodicity: "monthly",
    anchorType: "fixed_day_of_month", dueDay: 10, lifecycle: "draft" },
  { code: "AVTOKAMERAL", matrixKey: "avtokameral", name: "Avtokameral nazorat",
    obligationType: "internal_task", periodicity: "monthly",
    anchorType: "fixed_day_of_month", dueDay: 15, lifecycle: "draft" },
  { code: "MY_MEHNAT", matrixKey: "my_mehnat", name: "my.mehnat.uz nazorati",
    obligationType: "internal_task", periodicity: "monthly",
    anchorType: "fixed_day_of_month", dueDay: 10, lifecycle: "draft" },
  { code: "EKOLOGIYA", matrixKey: "ekologiya", name: "Ekologiya hisoboti",
    obligationType: "tax_declaration", periodicity: "monthly",
    anchorType: "fixed_day_of_month", dueDay: 15, lifecycle: "draft" },
];

async function main() {
  const noGenerate = process.argv.includes("--no-generate");

  const admin = await prisma.user.findFirst({
    where: { role: { in: ["super_admin", "admin"] }, isActive: true },
    select: { id: true },
  });
  const createdBy = admin?.id;

  // ── 1) contractDate backfill ────────────────────────────────
  const backfill = await prisma.company.updateMany({
    where: { isActive: true, contractDate: null },
    data: { contractDate: CONTRACT_BACKFILL },
  });
  console.log(`1) contractDate backfill: ${backfill.count} firma → ${CONTRACT_BACKFILL.toISOString().slice(0, 10)}`);

  // ── 2) Shablonlar (upsert + applicability reconcile) ────────
  for (const t of TEMPLATES) {
    const effectiveFrom = t.effectiveFrom ?? EFFECTIVE_FROM;
    const tpl = await prisma.deadlineTemplate.upsert({
      where: { code_version: { code: t.code, version: 1 } },
      create: {
        code: t.code,
        version: 1,
        name: t.name,
        obligationType: t.obligationType,
        periodicity: t.periodicity,
        anchorType: t.anchorType,
        dueDay: t.dueDay ?? null,
        dueMonth: t.dueMonth ?? null,
        offsetDays: t.offsetDays ?? null,
        matrixKey: t.matrixKey ?? null,
        adjustmentPolicy: "next_workday",
        effectiveFrom,
        effectiveTo: null,
        // HAR DOIM `draft`, tasdiqlovchisiz. Skript o'ziga tasdiq yoza
        // olmaydi — fayl boshidagi izohga qarang.
        lifecycle: "draft",
        active: true,
        approvedById: null,
        approvedAt: null,
        createdBy: createdBy ?? null,
      },
      update: {
        name: t.name,
        obligationType: t.obligationType,
        periodicity: t.periodicity,
        anchorType: t.anchorType,
        dueDay: t.dueDay ?? null,
        dueMonth: t.dueMonth ?? null,
        offsetDays: t.offsetDays ?? null,
        matrixKey: t.matrixKey ?? null,
        adjustmentPolicy: "next_workday",
        effectiveFrom,
        // Qayta ekishda lifecycle TEGILMAYDI: bosh buxgalter `active` ga
        // o'tkazgan qoralamani skript orqaga qaytarmasin.
        active: true,
      },
    });

    // Applicability'ni har run'da qayta quramiz (idempotent).
    await prisma.templateApplicability.deleteMany({ where: { templateId: tpl.id } });
    if (t.applicability?.length) {
      await prisma.templateApplicability.createMany({
        data: t.applicability.map((a) => ({
          templateId: tpl.id,
          criteriaType: a.criteriaType,
          criteriaValue: a.criteriaValue,
        })),
      });
    }
    const scope = t.applicability?.length
      ? t.applicability.map((a) => `${a.criteriaType}=${a.criteriaValue}`).join(", ")
      : "universal";
    const from = effectiveFrom.toISOString().slice(0, 10);
    console.log(`   ✓ ${t.code.padEnd(18)} ${t.periodicity.padEnd(9)} ${from} → ${scope}`);
  }

  // Seed hech qachon tasdiqlamagani uchun YANGI muhitda faol shablon NOL
  // bo'ladi va generator hech narsa yaratmaydi. Bu kutilgan holat, lekin
  // jimgina bo'lmasligi kerak — aks holda operator "nega majburiyat yo'q?"
  // deb kod ichidan qidirardi.
  const [activeCount, draftCount] = await Promise.all([
    prisma.deadlineTemplate.count({ where: { lifecycle: "active", active: true } }),
    prisma.deadlineTemplate.count({ where: { lifecycle: "draft", active: true } }),
  ]);
  if (activeCount === 0 && draftCount > 0) {
    console.log(
      `\n⚠️  ${draftCount} ta shablon QORALAMA holatida — generator ularni olmaydi.\n` +
        "    Seed ataylab tasdiqlamaydi: majburiyat yaratadigan shablonni odam\n" +
        "    ko'rikdan o'tkazishi kerak (audit izi haqiqiy bo'lsin).\n" +
        "    Tasdiqlash:  /admin/deadline-templates → shablonni 'Faol' ga o'tkazing.",
    );
  }

  if (noGenerate) {
    console.log(
      `\n2) Shablon: ${activeCount} ta faol, ${draftCount} ta qoralama. ` +
        "Generatsiya o'tkazib yuborildi (--no-generate).",
    );
    console.log("   Majburiyatlarni keyin yarating:  npx tsx scripts/generate-obligations.ts");
    await prisma.$disconnect();
    return;
  }

  // ── 3) Generatsiya (faqat joriy davr, catch-up yo'q) ─────────
  const gen = await runGenerationLocked(prisma as any, { catchUpMonths: 0, createdBy, loadSubjects: loadCompanySubjects });
  if (gen.skipped === "locked") {
    console.log("3) Generatsiya: boshqa jarayon lock ushlab turibdi — o'tkazib yuborildi");
  } else {
    const r = gen.results?.[0];
    console.log(`3) Generatsiya (ref=${r?.ref?.slice(0, 10)}):`);
    console.log(`   templatelar=${r?.templatesConsidered}  yaroqli firma=${r?.companiesEligible}`);
    console.log(`   yaratildi=${r?.created}  mavjud(skip)=${r?.skippedExisting}  mos emas(skip)=${r?.skippedNotApplicable}  bekor=${r?.cancelledNotApplicable}  eski-qoida=${r?.cancelledStaleRule}`);
  }

  // ── Yakuniy tekshiruv ───────────────────────────────────────
  const total = await prisma.obligation.count();
  const sample = await prisma.obligation.findMany({
    orderBy: { dueAt: "asc" },
    take: 6,
    include: { company: { select: { name: true } }, template: { select: { name: true } } },
  });
  console.log(`\nJami Obligation: ${total}`);
  console.log("Eng yaqin 6 muddat:");
  for (const o of sample) {
    console.log(`   ${o.dueAt.toISOString().slice(0, 10)}  ${o.periodKey.padEnd(8)} ${o.template.name} — ${o.company.name}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
