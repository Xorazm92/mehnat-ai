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
}

// isSplit ustunlarda _tolov (payKey) juftligi bor.
export const BASE_REPORT_COLUMNS: ReportColumn[] = [
  // ═══ OYLIK ═══
  { key: "didox", label: "Didox", short: "DD", group: "Oylik" },
  { key: "xatlar", label: "Xatlar", short: "XT", group: "Oylik" },
  { key: "avtokameral", label: "Avtokameral", short: "AK", group: "Oylik" },
  { key: "my_mehnat", label: "My Mehnat", short: "MM", group: "Oylik" },
  { key: "one_c", label: "1C", short: "1C", group: "Oylik" },
  { key: "pul_oqimlari", label: "Pul Oqimlari", short: "PO", group: "Oylik" },
  { key: "chiqadigan_soliqlar", label: "Chiq. Soliqlar", short: "CS", group: "Oylik" },
  { key: "hisoblangan_oylik", label: "His. Oylik", short: "HO", group: "Oylik" },
  { key: "debitor_kreditor", label: "Deb/Kred", short: "DK", group: "Oylik" },
  { key: "foyda_va_zarar", label: "Foyda/Zarar", short: "FZ", group: "Oylik" },
  { key: "tovar_ostatka", label: "Tovar Ost.", short: "TO", group: "Oylik" },
  { key: "jismoniy_ijara", label: "Jism. Ijara", short: "JI", group: "Oylik" },

  // ═══ SOLIQLAR (Umumiy) ═══
  { key: "yer_soligi", label: "Yer Solig'i", short: "YS", group: "Soliqlar" },
  { key: "mol_mulk_soligi", label: "Mol-mulk Sol.", short: "MS", group: "Soliqlar" },
  { key: "suv_soligi", label: "Suv Solig'i", short: "SS", group: "Soliqlar" },
  { key: "bonak", label: "Bo'nak", short: "BN", group: "Soliqlar" },
  { key: "aksiz_soligi", label: "AKSIZ", short: "AX", group: "Soliqlar" },
  { key: "nedro_soligi", label: "NEDRO", short: "ND", group: "Soliqlar" },
  { key: "norezident_foyda", label: "Nor. Foyda", short: "NF", group: "Soliqlar" },
  { key: "norezident_nds", label: "Nor. NDS", short: "NN", group: "Soliqlar" },

  // ═══ SOLIQLAR (Hisobot + To'lov) ═══
  // "Aylanma/QQS" IKKIGA BO'LINDI. Ular bitta katakda turolmaydi: QQS oylik
  // (20-kun, faqat QQS to'lovchilarda), aylanma soliq esa choraklik (15-kun,
  // faqat aylanma rejimida). Majburiyat dvigatelida ular allaqachon alohida
  // shablon edi (QQS_DECL / AYLANMA_SOLIQ) — matritsa ulardan orqada qolgan edi.
  { key: "qqs", label: "QQS Hisobot", short: "QQh", group: "Soliq H/T", isSplit: true, payKey: "qqs_tolov", payShort: "QQt" },
  { key: "aylanma", label: "Aylanma Hisobot", short: "AYh", group: "Soliq H/T", isSplit: true, payKey: "aylanma_tolov", payShort: "AYt" },
  { key: "daromad_soliq", label: "DS Hisobot", short: "DSh", group: "Soliq H/T", isSplit: true, payKey: "daromad_soliq_tolov", payShort: "DSt" },
  { key: "inps", label: "INPS Hisobot", short: "INh", group: "Soliq H/T", isSplit: true, payKey: "inps_tolov", payShort: "INt" },
  { key: "foyda_soliq", label: "FS Hisobot", short: "FSh", group: "Soliq H/T", isSplit: true, payKey: "foyda_soliq_tolov", payShort: "FSt" },

  // ═══ YILLIK ═══
  { key: "moliyaviy_natija", label: "Mol. Natija", short: "MN", group: "Yillik" },
  { key: "buxgalteriya_balansi", label: "Bux. Balansi", short: "BB", group: "Yillik" },

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
export const SERVICE_LABELS: Record<string, string> = Object.fromEntries(
  BASE_REPORT_COLUMNS.flatMap((c) =>
    c.payKey
      ? [
          [c.key, c.label] as [string, string],
          [c.payKey, `${c.label.replace(/ Hisobot$/, "")} — to'lov`] as [string, string],
        ]
      : [[c.key, c.label] as [string, string]],
  ),
);

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
