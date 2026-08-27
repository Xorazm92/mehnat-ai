// lib/reportColumns.ts
// Hisobot (amallar) matritsasi ustunlarining YAGONA manbai.
// OperationModule (ko'rsatish) va admin editor (sozlash) shundan foydalanadi.
// Muhim: config faqat mavjud ustunlarni yoqadi/o'chiradi/tartiblaydi/nomlaydi —
// yangi kalit qo'shmaydi (har kalit MonthlyReport DB ustuniga bog'langan).

export interface ReportColumn {
  key: string;
  label: string;
  short: string;
  group: string;
  isSplit?: boolean;
  payKey?: string;
  payShort?: string;
  /**
   * FAQAT TO'LOV ustuni — hisobot yarmi yo'q.
   *
   * Mol-mulk / yer / suv soliqlarida oyiga hech qanday hisobot topshirilmaydi,
   * faqat avans TO'LANADI (hisoboti — yillik: ma'lumotnoma va yakuniy
   * hisob-kitob). Shuning uchun ularning yorlig'i so'z emas, byudjet kodi.
   */
  isPaymentOnly?: boolean;
}

// isSplit ustunlarda _tolov (payKey) juftligi bor.
export const BASE_REPORT_COLUMNS: ReportColumn[] = [
  // ═══ OYLIK ISH (ichki reglament — soliq emas) ═══
  { key: "didox", label: "Didox", short: "DD", group: "Oylik ish" },
  { key: "xatlar", label: "Xatlar", short: "XT", group: "Oylik ish" },
  { key: "avtokameral", label: "Avtokameral", short: "AK", group: "Oylik ish" },
  { key: "my_mehnat", label: "My Mehnat", short: "MM", group: "Oylik ish" },
  { key: "one_c", label: "1C", short: "1C", group: "Oylik ish" },
  { key: "pul_oqimlari", label: "Pul Oqimlari", short: "PO", group: "Oylik ish" },
  { key: "chiqadigan_soliqlar", label: "Chiq. Soliqlar", short: "CS", group: "Oylik ish" },
  { key: "hisoblangan_oylik", label: "His. Oylik", short: "HO", group: "Oylik ish" },
  { key: "debitor_kreditor", label: "Deb/Kred", short: "DK", group: "Oylik ish" },
  { key: "foyda_va_zarar", label: "Foyda/Zarar", short: "FZ", group: "Oylik ish" },
  { key: "tovar_ostatka", label: "Tovar Ost.", short: "TO", group: "Oylik ish" },

  // ═══ SOLIQ — REESTR BO'YICHA (davriylik + to'lov kodi) ═══
  //
  // Manba: docs/SOLIQ_TOLOV_KODLARI.md — buxgalteriya bo'limi bergan reestr.
  // Ikki qoida shundan keladi:
  //   1) GURUH = DAVRIYLIK (oylik / kvartal / yillik), texnik belgi emas.
  //      Buxgalter "shu oy nima topshiriladi" deb ishlaydi.
  //   2) BYUDJET KODI BOR HAR BIR SOLIQ — hisobot + to'lov JUFTLIGI.
  //      Ilgari aksiz, nedro, norezidentlar, yer/suv/mol-mulk, jism. ijara va
  //      bo'nak yakka katak edi: hisobot topshirilgani belgilanardi, PUL
  //      to'langani esa hech qayerda kuzatilmasdi.

  // ── OYLIK SOLIQ (reestr 1-bo'lim) ────────────────────────────
  { key: "qqs", label: "QQS Hisobot", short: "QQh", group: "Oylik soliq", isSplit: true, payKey: "qqs_tolov", payShort: "QQt" },
  { key: "daromad_soliq", label: "DS Hisobot", short: "DSh", group: "Oylik soliq", isSplit: true, payKey: "daromad_soliq_tolov", payShort: "DSt" },
  // Aylanma soliq OYLIK (reestr 1-bo'lim, 3-qator). Shabloni ham oylikka
  // keltirildi — matritsa va "Ishlar" bir xil taqvimni aytishi shart.
  { key: "aylanma", label: "Aylanma Hisobot", short: "AYh", group: "Oylik soliq", isSplit: true, payKey: "aylanma_tolov", payShort: "AYt" },
  { key: "inps", label: "INPS Hisobot", short: "INh", group: "Oylik soliq", isSplit: true, payKey: "inps_tolov", payShort: "INt" },
  { key: "aksiz_soligi", label: "Aksiz Hisobot", short: "AXh", group: "Oylik soliq", isSplit: true, payKey: "aksiz_soligi_tolov", payShort: "AXt" },
  { key: "nedro_soligi", label: "Nedro Hisobot", short: "NDh", group: "Oylik soliq", isSplit: true, payKey: "nedro_soligi_tolov", payShort: "NDt" },
  { key: "norezident_foyda", label: "Nor. Foyda Hisobot", short: "NFh", group: "Oylik soliq", isSplit: true, payKey: "norezident_foyda_tolov", payShort: "NFt" },
  { key: "norezident_nds", label: "Nor. NDS Hisobot", short: "NNh", group: "Oylik soliq", isSplit: true, payKey: "norezident_nds_tolov", payShort: "NNt" },
  // Mol-mulk / yer / suv — OYLIK avans: ma'lumotnoma + avans to'lovi.
  // Yillik yakuniy hisob-kitobi alohida ustun (pastda, "Yillik hisobot").
  { key: "mol_mulk_soligi", label: "#44", short: "44", group: "Oylik soliq", isPaymentOnly: true },
  { key: "yer_soligi", label: "#53", short: "53", group: "Oylik soliq", isPaymentOnly: true },
  { key: "suv_soligi", label: "#52", short: "52", group: "Oylik soliq", isPaymentOnly: true },
  { key: "jismoniy_ijara", label: "Jism. Ijara", short: "JIh", group: "Oylik soliq", isSplit: true, payKey: "jismoniy_ijara_tolov", payShort: "JIt" },
  { key: "dividend_soligi", label: "Dividend Hisobot", short: "DVh", group: "Oylik soliq", isSplit: true, payKey: "dividend_soligi_tolov", payShort: "DVt" },
  // Bo'nak — foyda solig'i bo'yicha OYLIK avans (reestr 1-bo'lim, 14-qator).
  // Uning CHORAKLIK ma'lumotnomasi alohida ustun: `foyda_avans_hisobot`.
  { key: "bonak", label: "Bo'nak (foyda avansi)", short: "BNh", group: "Oylik soliq", isSplit: true, payKey: "bonak_tolov", payShort: "BNt" },

  // ── KVARTAL SOLIQ (reestr 2-bo'lim) ──────────────────────────
  { key: "foyda_soliq", label: "FS Hisobot", short: "FSh", group: "Kvartal soliq", isSplit: true, payKey: "foyda_soliq_tolov", payShort: "FSt" },
  // Keyingi chorak uchun bo'nak ma'lumotnomasi — TO'LOVI YO'Q (pul oylik
  // "Bo'nak" katagi orqali chiqadi), shuning uchun yagona katak va kodsiz.
  { key: "foyda_avans_hisobot", label: "Foyda avans hisoboti", short: "FAv", group: "Kvartal soliq" },

  // ── YILLIK HISOBOT (reestr 3-bo'lim) ─────────────────────────
  { key: "buxgalteriya_balansi", label: "Bux. Balansi (1-shakl)", short: "BB", group: "Yillik hisobot" },
  { key: "moliyaviy_natija", label: "Mol. Natija (2-shakl)", short: "MN", group: "Yillik hisobot" },
  // Yillik YAKUNIY hisob-kitoblar — oylik avans katagidan ayri: avans to'lab
  // borilgan-u, yil oxiridagi hisob-kitob topshirilmagan holat eng ko'p
  // uchraydigani va bitta katakda u ko'rinmasdi.
  // Mol-mulk va suv soliqlarida yil BOSHIDA ma'lumotnoma, yil OXIRIDA yakuniy
  // hisob-kitob (raschyot) topshiriladi — ikki ayri ish, ikki katak.
  { key: "mol_mulk_malumotnoma", label: "Mol-mulk ma'lumotnomasi", short: "MSm", group: "Yillik hisobot" },
  { key: "suv_malumotnoma", label: "Suv solig'i ma'lumotnomasi", short: "SSm", group: "Yillik hisobot" },
  { key: "mol_mulk_yillik", label: "Mol-mulk (yillik)", short: "MSy", group: "Yillik hisobot" },
  { key: "yer_yillik", label: "Yer solig'i (yillik)", short: "YSy", group: "Yillik hisobot" },
  { key: "suv_yillik", label: "Suv solig'i (yillik)", short: "SSy", group: "Yillik hisobot" },

  // ═══ STATISTIKA ═══
  { key: "stat_12_invest", label: "12-invest", short: "12I", group: "Statistika" },
  { key: "stat_12_moliya", label: "12-moliya", short: "12M", group: "Statistika" },
  { key: "stat_12_korxona", label: "12-korxona", short: "12K", group: "Statistika" },
  { key: "stat_12_narx", label: "12-narx", short: "12N", group: "Statistika" },
  { key: "stat_4_invest", label: "4-invest", short: "4I", group: "Statistika" },
  { key: "stat_4_mehnat", label: "4-mehnat", short: "4M", group: "Statistika" },
  { key: "stat_4_korxona_miz", label: "4-korxona(miz)", short: "4KM", group: "Statistika" },
  { key: "stat_4_kb_qur_sav_xiz", label: "4-kb (q/s/x)", short: "4KB", group: "Statistika" },
  { key: "stat_4_kb_sanoat", label: "4-kb sanoat", short: "4KS", group: "Statistika" },
  { key: "stat_1_invest", label: "1-invest", short: "1I", group: "Statistika" },
  { key: "stat_1_ih", label: "1-ih", short: "1IH", group: "Statistika" },
  { key: "stat_1_energiya", label: "1-energiya", short: "1E", group: "Statistika" },
  { key: "stat_1_korxona", label: "1-korxona", short: "1KR", group: "Statistika" },
  { key: "stat_1_korxona_tif", label: "1-korxona(tif)", short: "1KT", group: "Statistika" },
  { key: "stat_1_moliya", label: "1-moliya", short: "1ML", group: "Statistika" },
  { key: "stat_1_akt", label: "1-akt", short: "1AK", group: "Statistika" },
  { key: "stat_1_tib", label: "1-tib (aholi)", short: "1TB", group: "Statistika" },
  { key: "stat_1_turizm", label: "1-turizm", short: "1TR", group: "Statistika" },
  { key: "stat_4_moliya", label: "4-moliya", short: "4ML", group: "Statistika" },
  { key: "stat_1_nnt", label: "1-nnt", short: "1NT", group: "Statistika" },
  { key: "stat_1_hisobot_mazmuni", label: "1-hisobot (mazmun so'rovnomasi)", short: "1HM", group: "Statistika" },
  { key: "stat_4_qx", label: "4-qx (qishloq x.)", short: "4QX", group: "Statistika" },
  { key: "stat_1_qx", label: "1-qx (qishloq x., yillik)", short: "1QX", group: "Statistika" },
  { key: "stat_1_fx", label: "1-fx (fermer x., yillik)", short: "1FX", group: "Statistika" },
  { key: "stat_4_fx", label: "4-fx (fermer x.)", short: "4FX", group: "Statistika" },
  { key: "stat_1_fan", label: "1-fan (ilmiy-tadqiqot, yillik)", short: "1FN", group: "Statistika" },

  // ═══ IT PARK ═══
  { key: "itpark_oylik", label: "IT Park Oylik", short: "ITO", group: "IT Park" },
  { key: "itpark_chorak", label: "IT Park Chorak", short: "ITC", group: "IT Park" },

  // ═══ KOMUNALKA ═══
  { key: "kom_suv", label: "Suv", short: "S💧", group: "Komunalka" },
  { key: "kom_gaz", label: "Gaz", short: "G🔥", group: "Komunalka" },
  { key: "kom_svet", label: "Svet", short: "E⚡", group: "Komunalka" },

  // ═══ MAXSUS ═══
  { key: "ekologiya", label: "Ekologiya", short: "EK", group: "Maxsus" },
];

// ── DAVLAT BYUDJETI TO'LOV KODLARI ───────────────────────────────
//
// NEGA SHU YERDA: buxgalter to'lov topshiriqnomasini to'ldirayotganda kodni
// tashqi qog'ozdan qidirardi va adashganda pul boshqa soliq turiga tushib
// ketardi (qaytarish — soliq organi orqali, haftalar). Kod ustun kalitiga
// bog'landi, chunki matritsadagi "to'lov" yarmi aynan shu to'lovni bildiradi.
//
// Manba: soliq_hisobotlari_va_kodlari.md (byudjet daromadlari klassifikatori).
// Kod O'ZGARSA shu yer yangilanadi — UI hech qayerda kodni qo'lda yozmaydi.
export const TAX_PAYMENT_CODES: Record<string, string> = {
  qqs: "1",
  daromad_soliq: "46",
  aylanma: "100",
  inps: "101",
  aksiz_soligi: "43",
  nedro_soligi: "50",
  norezident_foyda: "137",
  norezident_nds: "29",
  mol_mulk_soligi: "44",
  yer_soligi: "53",
  suv_soligi: "52",
  jismoniy_ijara: "186",
  dividend_soligi: "138",
  // Foyda solig'i: yillik/choraklik hisobot ham, oylik bo'nak ham bitta kodga.
  foyda_soliq: "32",
  bonak: "32",
};

/** Ustun (yoki uning to'lov yarmi) uchun byudjet to'lov kodi. */
export function paymentCodeFor(key: string): string | undefined {
  return TAX_PAYMENT_CODES[key] ?? TAX_PAYMENT_CODES[key.replace(/_tolov$/, "")];
}

// Admin editor jadval qatori (barcha baza ustunlari + joriy sozlama)
export interface OperationColumnRow {
  key: string;
  label: string; // amaldagi nom (override yoki asl)
  baseLabel: string; // asl nom (o'zgarmas)
  short: string;
  group: string;
  enabled: boolean;
  order: number;
  isSplit: boolean;
}

// Admin editorda saqlanadigan sozlama (SystemSetting key: "operationColumns")
export interface OperationColumnConfig {
  key: string;
  enabled?: boolean; // false = yashiriladi (default: ko'rinadi)
  order?: number; // ko'rsatish tartibi
  label?: string; // nom override (bo'sh bo'lsa asl nom)
  group?: string; // guruh override
}

const baseIndex = new Map(BASE_REPORT_COLUMNS.map((c, i) => [c.key, i]));

/**
 * Baza ustunlarga saqlangan configni qo'llaydi: o'chirilganlarni chiqarib
 * tashlaydi, tartiblaydi, nom/guruhni almashtiradi. Config bo'sh bo'lsa —
 * baza o'zgarishsiz qaytadi.
 */
export function applyColumnConfig(
  base: ReportColumn[],
  config?: OperationColumnConfig[] | null
): ReportColumn[] {
  if (!config || config.length === 0) return base;
  const byKey = new Map(config.map((c) => [c.key, c]));
  return base
    .filter((col) => byKey.get(col.key)?.enabled !== false)
    .map((col) => {
      const c = byKey.get(col.key);
      if (!c) return col;
      return {
        ...col,
        label: c.label?.trim() ? c.label.trim() : col.label,
        group: c.group?.trim() ? c.group.trim() : col.group,
      };
    })
    .sort((a, b) => {
      const oa = byKey.get(a.key)?.order ?? baseIndex.get(a.key) ?? 0;
      const ob = byKey.get(b.key)?.order ?? baseIndex.get(b.key) ?? 0;
      return oa - ob;
    });
}

// ── XIZMAT (activeServices) KALITLARI ────────────────────────────
//
// `Company.activeServices` matritsa ustun kalitlarining ro'yxati: bo'sh bo'lsa
// "hamma ustun ko'rinsin", to'ldirilgan bo'lsa faqat sanab o'tilganlar.
//
// NEGA SHU YERDA: bu ro'yxat UCH joyda QO'LDA takrorlangan edi
// (`OnboardingWizard.ALL_SERVICE_KEYS`, CompanyDrawer'dagi "Hammasini yoqish"
// va uning katakchalar jadvali) va uchalasi ham eskirgan edi — ularda
// `*_tolov` kalitlari YO'Q. Natijada xizmatlari to'ldirilgan firmada
// (7-NINE misoli) "QQS to'lov", "DS to'lov", "INPS to'lov", "FS to'lov"
// kataklari BUTUNLAY qulflanib, "—" bo'lib qolardi: hisobot yarmi ishlaydi,
// to'lov yarmi esa hech qanday yo'l bilan belgilanmasdi.
//
// Endi manba bitta — BASE_REPORT_COLUMNS.

/** Barcha xizmat kalitlari — to'lov yarmi bilan birga. */
export const ALL_SERVICE_KEYS: string[] = BASE_REPORT_COLUMNS.flatMap((c) =>
  c.payKey ? [c.key, c.payKey] : [c.key],
);

/** Guruhlangan xizmat kalitlari (sozlash ekranlari uchun). */
export function serviceGroups(): { group: string; keys: string[] }[] {
  const out: { group: string; keys: string[] }[] = [];
  for (const c of BASE_REPORT_COLUMNS) {
    let g = out.find((x) => x.group === c.group);
    if (!g) {
      g = { group: c.group, keys: [] };
      out.push(g);
    }
    g.keys.push(c.key);
    if (c.payKey) g.keys.push(c.payKey);
  }
  return out;
}

/** Xizmat kaliti → qisqa nom. */
//
// TO'LOV YARMI — FAQAT BYUDJET KODI ("#1", "#46").
// "QQS — to'lov" degan matn hech qanday yangi ma'lumot bermasdi: u hisobot
// katagining yonida turadi va nomi allaqachon o'sha yerda yozilgan. Kod esa
// buxgalterga to'lov topshiriqnomasini to'ldirishda aynan kerak bo'lgan yagona
// raqam. Kodi yo'q to'lov (bo'lsa) eski matnli nomiga qaytadi.
export const SERVICE_LABELS: Record<string, string> = Object.fromEntries(
  BASE_REPORT_COLUMNS.flatMap((c) => {
    if (!c.payKey) return [[c.key, c.label] as [string, string]];
    const code = TAX_PAYMENT_CODES[c.key];
    const payLabel = code ? `#${code}` : `${c.label.replace(/ Hisobot$/, "")} — to'lov`;
    return [
      [c.key, c.label] as [string, string],
      [c.payKey, payLabel] as [string, string],
    ];
  }),
);

/** Faqat-to'lov ustunlarining to'liq nomi — yorlig'ida kod turadi. */
export const PAYMENT_ONLY_NAMES: Record<string, string> = {
  mol_mulk_soligi: "Mol-mulk solig'i avans to'lovi",
  yer_soligi: "Yer solig'i avans to'lovi",
  suv_soligi: "Suv solig'i avans to'lovi",
};

/** To'lov yarmining to'liq nomi — tooltip/aria uchun ("QQS to'lovi (#1)"). */
export function serviceFullLabel(key: string): string {
  const only = BASE_REPORT_COLUMNS.find((c) => c.isPaymentOnly && c.key === key);
  if (only) return `${PAYMENT_ONLY_NAMES[key] ?? key} (byudjet kodi ${TAX_PAYMENT_CODES[key]})`;
  const col = BASE_REPORT_COLUMNS.find((c) => c.payKey === key);
  if (!col) return SERVICE_LABELS[key] ?? key;
  const name = col.label.replace(/ Hisobot$/, "");
  const code = TAX_PAYMENT_CODES[col.key];
  return code ? `${name} to'lovi (byudjet kodi ${code})` : `${name} to'lovi`;
}

/**
 * Ustun shu firmada YOQILGANMI.
 *
 * `parentKey` — bo'linadigan ustunning to'lov yarmi uchun. To'lov yarmining
 * o'z katakchasi hech qaysi sozlash ekranida YO'Q, shuning uchun u hisobot
 * yarmidan meros oladi: aks holda "QQS" yoqilgan firmada "QQS to'lov"
 * o'chirilgan bo'lib qolardi va uni yoqishning iloji bo'lmasdi.
 */
export function serviceEnabled(
  activeServices: readonly string[] | null | undefined,
  key: string,
  parentKey?: string,
): boolean {
  if (!activeServices || activeServices.length === 0) return true;
  return activeServices.includes(key) || (!!parentKey && activeServices.includes(parentKey));
}
