// lib/reportTemplateMap.ts
// Matritsa ustuni ↔ muddat shabloni XARITASI — sof ma'lumot, bog'liqliksiz.
//
// NEGA ALOHIDA FAYL: bu xarita `lib/obligationBridge.ts` ichida edi, u esa
// `@/lib/prisma` ni import qiladi. Xaritani KLIENT komponentidan (matritsa)
// ishlatishga urinilganda Prisma butun brauzer to'plamiga tortildi va prod
// build "Module not found: dns / fs / net / tls" bilan yiqildi.
//
// Bu yerda hech qanday server bog'liqligi BO'LMASLIGI kerak.

export const COL_KEY_TO_TEMPLATE_CODES: Record<string, string[]> = {
  // ── Oylik ichki reglament ────────────────────────────────
  pul_oqimlari: ["CASHFLOW"],
  debitor_kreditor: ["AR_AP"],
  tovar_ostatka: ["MATERIALS"],
  one_c: ["ONEC_BASE"],
  xatlar: ["LETTERS"],
  hisoblangan_oylik: ["PAYROLL_CALC"],
  chiqadigan_soliqlar: ["TAX_SCHEDULE"],
  foyda_va_zarar: ["PNL_REPORT"],
  didox: ["DIDOX_FLOW"],
  avtokameral: ["AVTOKAMERAL"],
  my_mehnat: ["MY_MEHNAT"],

  // ── Soliq deklaratsiyalari ───────────────────────────────
  inps: ["INPS_IJTIMOIY"],
  daromad_soliq: ["DAROMAD_AGENT"],
  // Har ustun O'Z shabloniga. Ilgari bitta ustun ikkalasini ko'targani uchun
  // maxraj "QQS to'lovchilar + aylanma rejimidagilar" bo'lib, foiz ikki xil
  // majburiyatni aralashtirardi.
  qqs: ["QQS_DECL"],
  aylanma: ["AYLANMA_SOLIQ"],
  foyda_soliq: ["FOYDA_YILLIK"],

  // ── Soliq TO'LOVI (bo'linadigan ustunlarning `payKey` yarmi) ──
  //
  // 2026-08 gacha bu yarmi HECH QANDAY shablonga bog'lanmagan edi va buni
  // hech narsa ushlamasdi: `check-matrix-obligation-link` faqat "shablon
  // ustunga ulanganmi" deb tekshirardi, teskarisini emas. Oqibati (7-NINE
  // misolida ko'rindi): "QQS to'lov" katagi ekranda bor, lekin
  //   * /deadlines — "Ishlar" ro'yxatida QQS to'lov muddati umuman yo'q,
  //   * katakni belgilash hech qanday majburiyatni harakatga keltirmaydi,
  //   * `isCellRequired` false — foiz maxrajiga kirmaydi, belgilanmagani
  //     "missing" bo'lib qizarmaydi, ya'ni to'lanmagan QQS jimgina yo'qoladi.
  // Deklaratsiya va to'lov muddati bir kunda bo'lsa ham, ular AYRIM ish:
  // hisobot topshirilgan, pul to'lanmagan holat eng ko'p uchraydigani.
  qqs_tolov: ["QQS_TOLOV"],
  aylanma_tolov: ["AYLANMA_TOLOV"],
  daromad_soliq_tolov: ["DAROMAD_TOLOV"],
  inps_tolov: ["INPS_TOLOV"],
  foyda_soliq_tolov: ["FOYDA_TOLOV"],
  dividend_soligi: ["DIVIDEND_DECL"],
  dividend_soligi_tolov: ["DIVIDEND_TOLOV"],
  // Reestrdagi qolgan soliqlarning to'lov yarmi. Shablonlari hali SEED
  // QILINMAGAN (muddat kuni tasdiqlanmagan) — xarita tayyor turadi, shablon
  // qo'shilishi bilan "Ishlar" ro'yxatiga o'zidan chiqadi. Xuddi shu holat
  // YER_SOLIQ / SUV_SOLIQ / MOL_MULK_SOLIQ / BONAK da ham bor.
  aksiz_soligi_tolov: ["AKSIZ_TOLOV"],
  nedro_soligi_tolov: ["NEDRO_TOLOV"],
  norezident_foyda_tolov: ["NOREZ_FOYDA_TOLOV"],
  norezident_nds_tolov: ["NOREZ_NDS_TOLOV"],
  jismoniy_ijara_tolov: ["JISM_IJARA_TOLOV"],
  bonak_tolov: ["BONAK_TOLOV"],
  foyda_avans_hisobot: ["FOYDA_AVANS"],
  mol_mulk_yillik: ["MOL_MULK_YILLIK"],
  yer_yillik: ["YER_YILLIK"],
  suv_yillik: ["SUV_YILLIK"],
  mol_mulk_malumotnoma: ["MOL_MULK_MALUMOTNOMA"],
  suv_malumotnoma: ["SUV_MALUMOTNOMA"],
  // Mol-mulk / yer / suv — matritsada FAQAT to'lov katagi (oyiga hisobot
  // topshirilmaydi), shuning uchun to'lov shabloniga bog'lanadi.
  yer_soligi: ["YER_TOLOV"],
  suv_soligi: ["SUV_TOLOV"],
  mol_mulk_soligi: ["MOL_MULK_TOLOV"],
  bonak: ["BONAK"],
  ekologiya: ["EKOLOGIYA"],

  // ── Statistika ───────────────────────────────────────────
  // Statistika ustunlarining ko'pchiligi matritsa-only (muddat dvigatelida
  // shabloni yo'q). 4-moliya istisno: uning muddati aniq belgilangan
  // (18-mart/iyun/sentabr/dekabr) va u chorak ICHIDA tugaydi.
  stat_4_moliya: ["STAT_4_MOLIYA"],

  // ── Moliyaviy hisobotlar ─────────────────────────────────
  moliyaviy_natija: ["MOLIYAVIY_YILLIK"],
  buxgalteriya_balansi: ["BUX_BALANS"],

  // ── IT Park ──────────────────────────────────────────────
  // Shablon kodi "OYLIK", lekin davriyligi CHORAKLIK (IT Park rezidenti ish
  // haqi hisobotini chorakda topshiradi) — shuning uchun choraklik ustunga
  // bog'lanadi. `itpark_oylik` katagi oylik kuzatuv bo'lib qoladi.
  itpark_chorak: ["ITPARK_OYLIK"],
};

/**
 * ATAYLAB matritsaga bog'lanmagan shablonlar — bu ro'yxat "unutilgan" bilan
 * "qasddan" ni ajratadi (test shu ro'yxatga tayanadi).
 */
export const UNMAPPED_TEMPLATE_CODES: Record<string, string> = {
  // "Oylik chiqdi + 6710 Kt" — matritsada katagi yo'q, manbasi oylik moduli
  // (`/payroll`). `hisoblangan_oylik` allaqachon PAYROLL_CALC'ni ko'taradi;
  // ikkalasini bitta katakka bog'lash qaysi majburiyat harakatlanishini
  // noaniq qilardi.
  PAYROLL_POSTED: "Oylik moduli (Payout) orqali yuritiladi",
};

/** Eski nom — chaqiruv joylari uchun (bitta kod qaytaradi). */
export const COL_KEY_TO_TEMPLATE_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(COL_KEY_TO_TEMPLATE_CODES).map(([k, v]) => [k, v[0]]),
);