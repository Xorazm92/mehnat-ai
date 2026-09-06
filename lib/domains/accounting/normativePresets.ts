// =====================================================
// NORMATIV MEHNAT — TAXMINIY TARIF JADVALI (P1)
// =====================================================
// Bu fayl HUJJAT, qaror emas. Raqamlar bosh buxgalter bilan uchrashuvgacha
// qo'yilgan TAXMIN (docs/plan/deadline-templates-v2.md §5.1 — intervyuning
// birinchi savoli aynan shu). Tasdiqlangach shu yerda o'zgartiriladi.
//
// ⚠️ BU JADVAL BAZAGA EKILGANDA "TAXMINIY" BAYROG'I YO'QOLADI.
//
// `lib/domains/accounting/normativeEffort.ts` ataylab boshqacha ishlaydi:
// `normativeMinutes` BO'SH bo'lsa ish turiga ko'ra standart qiymat beriladi
// va `estimated: true` qaytariladi — UI uni "taxminiy" deb belgilaydi
// (Konstitutsiya, 7-modda). O'sha faylning izohi buni ochiq aytadi:
// "NEGA BAZAGA EKILMAYDI. Ekilgan taxmin — qaror bo'lib ko'rinadi: keyin uni
// kim qo'ygani, o'ylab qo'yilganmi yoki standartmi — bilib bo'lmaydi."
//
// Ya'ni `scripts/seed-normative-minutes.ts --apply` yurgizilsa, sig'im hisobi
// bu taxminlarni bosh buxgalter TASDIQLAGAN qiymat sifatida ko'rsata
// boshlaydi. Bu — ongli savdo, tasodif emas: taxminni ekish "yuklama
// o'lchandi" degan taassurot beradi. Skript shuning uchun DRY-RUN da
// ishlaydi va `--apply` ataylab qo'lda beriladi.
//
// NEGA `domains/accounting/`, `engines/` EMAS. Bu — O'zbekiston buxgalteriya
// amaliyotining bilimi (qaysi hisobot qancha vaqt oladi), domen-neytral
// mexanika emas. `normativeEffort.ts` ham xuddi shu sababdan shu yerda;
// ikkalasini ajratish bitta tushunchani ikki qatlamga bo'lardi (AGENTS.md
// "`lib/` qatlam qoidasi").

/**
 * Tarif jadvali — guruh → daqiqa.
 *
 * Kod bo'yicha jadval (pastda) shundan quriladi, teskarisi emas: yangi
 * shablon qo'shilganda avval "u qaysi guruhga tushadi?" degan savolga
 * javob beriladi, keyin raqam o'z-o'zidan chiqadi.
 */
export const NORMATIVE_RATES = {
  /** Oylik deklaratsiya — takrorlanuvchi, shakl tanish. */
  monthlyDeclaration: 30,
  /** Oylik to'lov — deklaratsiya tayyor, faqat o'tkazma. */
  monthlyPayment: 20,
  /** Choraklik hisobot — yig'ma, tekshiruv talab qiladi. */
  quarterlyReport: 90,
  /** Choraklik to'lov. */
  quarterlyPayment: 60,
  /** Yillik hisobot — eng og'iri. */
  annualReport: 240,
  /** Yillik soliq deklaratsiyasi (yer/suv/mol-mulk) — hajmi turlicha. */
  annualPropertyTax: 240,
  annualLandTax: 90,
  annualWaterTax: 60,
  /** Statistik shakl — qisqa, lekin ma'lumot yig'ish kerak. */
  statisticsForm: 45,
  /**
   * Choraklik statistika hisoboti (buxgalter tayyorlaydi) — 60.
   *
   * `statisticsForm` (45) dan og'irroq, `quarterlyReport` (90) dan yengil:
   * u yillik shakl emas, lekin oddiy statistik so'rovnoma ham emas.
   * Raqam P4A topshirig'ida aniq berilgan.
   */
  quarterlyStatistics: 60,
  /** Mehnat hujjati (ro'yxat, jadval). */
  laborDocument: 60,
  /** Ichki ish (1C, sverka, xat) — normadan tashqari, lekin vaqt oladi. */
  internalTask: 45,
} as const;

/** Kod jadvalda ham, guruhda ham topilmasa. */
export const DEFAULT_PRESET_MINUTES = 45;

const R = NORMATIVE_RATES;

/**
 * Kod → daqiqa.
 *
 * ⚠️ KODLAR BAZADAN OLINGAN (2026-09-06, 40 ta shablon). Topshiriqdagi
 * dastlabki ro'yxat `AYL_DECL`, `IJT_SUG_DECL`, `STAT_HISOBOT`, `1-TOMOR`
 * kabi kodlarni sanagan edi — ular ASROda YO'Q. Agar o'sha ro'yxat
 * ishlatilsa 21 kalitdan 5 tasi mos kelib, qolgan 35 shablon jimgina
 * standart 45 ga tushardi va jadval "to'ldirilgan" bo'lib ko'rinardi.
 */
export const NORMATIVE_PRESETS: Record<string, number> = {
  // ── Oylik deklaratsiya ──────────────────────────────────────────────
  QQS_DECL: R.monthlyDeclaration,
  AYLANMA_SOLIQ: R.monthlyDeclaration,
  DAROMAD_AGENT: R.monthlyDeclaration,
  DIVIDEND_DECL: R.monthlyDeclaration,
  INPS_IJTIMOIY: R.monthlyDeclaration,
  EKOLOGIYA: R.monthlyDeclaration,

  // ── Oylik to'lov ────────────────────────────────────────────────────
  QQS_TOLOV: R.monthlyPayment,
  AYLANMA_TOLOV: R.monthlyPayment,
  DAROMAD_TOLOV: R.monthlyPayment,
  DIVIDEND_TOLOV: R.monthlyPayment,
  INPS_TOLOV: R.monthlyPayment,
  BONAK: R.monthlyPayment,

  // ── Choraklik ───────────────────────────────────────────────────────
  FOYDA_AVANS: R.quarterlyReport,
  FOYDA_YILLIK: R.quarterlyReport,
  BUX_BALANS: R.quarterlyReport,
  FOYDA_TOLOV: R.quarterlyPayment,

  // ── Yillik ──────────────────────────────────────────────────────────
  MOLIYAVIY_YILLIK: R.annualReport,
  MOL_MULK_SOLIQ: R.annualPropertyTax,
  YER_SOLIQ: R.annualLandTax,
  SUV_SOLIQ: R.annualWaterTax,

  // ── Statistika ──────────────────────────────────────────────────────
  STAT_1_FAN: R.statisticsForm,
  STAT_1_FX: R.statisticsForm,
  STAT_1_HISOBOT_MAZMUNI: R.statisticsForm,
  STAT_1_QX: R.statisticsForm,
  STAT_4_FX: R.statisticsForm,
  STAT_4_MOLIYA: R.statisticsForm,
  STAT_4_QX: R.statisticsForm,

  // ── Ichki ish ───────────────────────────────────────────────────────
  AR_AP: R.internalTask,
  AVTOKAMERAL: R.internalTask,
  CASHFLOW: R.internalTask,
  DIDOX_FLOW: R.internalTask,
  ITPARK_OYLIK: R.internalTask,
  LETTERS: R.internalTask,
  MATERIALS: R.internalTask,
  MY_MEHNAT: R.internalTask,
  ONEC_BASE: R.internalTask,
  PAYROLL_CALC: R.internalTask,
  PAYROLL_POSTED: R.internalTask,
  PNL_REPORT: R.internalTask,
  TAX_SCHEDULE: R.internalTask,

  // ── P4A da qo'shiladiganlar ─────────────────────────────────────────
  STAT_BUXGALT: R.quarterlyStatistics,
  MEHNAT_SHARTNOMA_ROYXAT: R.laborDocument,

  // ── Intervyudan keyin qo'shiladigan nomzodlar ───────────────────────
  TATIL_JADVAL: R.laborDocument,
  KASABA_UYUSHMA: R.laborDocument,
};

/**
 * Bitta ish kuni — 8 soat. Undan uzun normativ bir ishni bir kunga
 * sig'dirmaydi va sig'im hisobini ma'nosiz qiladi.
 */
export const MAX_NORMATIVE_MINUTES = 480;

/** Kod bo'yicha taxminiy normativ. Noma'lum kod — standart. */
export function presetFor(code: string): number {
  return NORMATIVE_PRESETS[code] ?? DEFAULT_PRESET_MINUTES;
}
