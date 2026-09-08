/**
 * MATRITSA VIZUAL QATLAMI — rang, belgi va menyu yorlig'i.
 *
 * Bu yerda QAROR yo'q: qaysi qiymat qaysi holat ekanini `lib/reportStatus`,
 * kimga qaysi amal ko'rinishini `lib/reportPermissions` hal qiladi. Bu fayl
 * faqat o'sha qarorlarning KO'RINISHINI saqlaydi.
 *
 * Nega ajratildi: `OperationModule.tsx` 2 444 qator edi va ranglar jadval
 * qatori, katak menyusi va asosiy komponent orasida aralashib yotardi.
 */
import type { ReportColumn } from "@/lib/reportColumns";
import { classifyCell, type CellStatus } from "@/lib/reportStatus";
import { allowedCellActions, canApproveCell, type CellAction } from "@/lib/reportPermissions";
import type { CompanyRelation } from "@/lib/platform/access";

// ── Report Column Definitions ──────────────────────────────────
// Ustunlar ta'rifi endi lib/reportColumns.ts da (BASE_REPORT_COLUMNS) — yagona manba.
// Amaldagi (config qo'llangan) ro'yxat `reportColumns` prop orqali keladi;
// prop bo'lmasa BASE_REPORT_COLUMNS ishlatiladi.

// ── Status Rendering ───────────────────────────────────────────
// Fon ranglari endi TEMA TOKENLARIDAN (color-mix orqali) — avval bu yerda
// eski "GitHub" temasidan qolgan qattiq rgba qiymatlar bor edi
// (#34D058, #FF6B6B, #FFD700, #4DA3FF), ular yumshatilgan palitraga mos
// kelmasdi. Bo'sh katak endi SHAFFOF: 212×46 li matritsada aksariyat
// kataklar bo'sh, shuning uchun ular chekinadi va TO'LDIRILGAN statuslar
// ajralib chiqadi (kulrang tabletkalar devori o'rniga).
export const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

// ── Kategoriya va Guruh ranglari (Visual Contrast System) ──────
export interface GroupStyle {
  headerBg: string;
  subHeaderBg: string;
  cellBg: string;
  text: string;
  border: string;
}

// Guruh ranglari TOKENLARDAN (`app/globals.css` → `--matrix-*`).
//
// Ilgari bu yerda Tailwind palitrasidan qattiq hex qiymatlar turardi
// (#3b82f6, #10b981, #f59e0b …), matn rangi esa tokenlardan olinardi:
// bitta sarlavhada FON bir ko'k, MATN boshqa ko'k bo'lardi. Qorong'u
// temada qattiq ranglar umuman aylanmasdi. Yana: "Soliq H/T" va
// "Komunalka" ikkalasi ham sariq edi va yonma-yon turganda farqlanmasdi.
//
// Endi fon ham, chegara ham, matn ham BITTA manbadan.
const GROUP_STYLE_MAP: Record<string, GroupStyle> = {
  // Guruh nomlari davriylikka ko'chdi ("Oylik" → "Oylik ish",
  // "Soliqlar"/"Soliq H/T" → "Oylik soliq"/"Kvartal soliq"). Eski kalitlar ham
  // qoldirilgan: admin `group` override bilan eski nomni yozib qo'ygan
  // bo'lsa, ustun rangsiz kulrangga tushib qolmasin.
  "Oylik ish": {
    headerBg: "color-mix(in srgb, var(--matrix-oylik) 18%, var(--surface-2))",
    subHeaderBg: "color-mix(in srgb, var(--matrix-oylik) 10%, var(--surface-2))",
    cellBg: "color-mix(in srgb, var(--matrix-oylik) 3.5%, transparent)",
    text: "var(--matrix-oylik)",
    border: "color-mix(in srgb, var(--matrix-oylik) 45%, transparent)",
  },
  "Oylik soliq": {
    headerBg: "color-mix(in srgb, var(--matrix-soliq) 18%, var(--surface-2))",
    subHeaderBg: "color-mix(in srgb, var(--matrix-soliq) 10%, var(--surface-2))",
    cellBg: "color-mix(in srgb, var(--matrix-soliq) 3.5%, transparent)",
    text: "var(--matrix-soliq)",
    border: "color-mix(in srgb, var(--matrix-soliq) 45%, transparent)",
  },
  "Kvartal soliq": {
    headerBg: "color-mix(in srgb, var(--matrix-soliq-ht) 22%, var(--surface-2))",
    subHeaderBg: "color-mix(in srgb, var(--matrix-soliq-ht) 12%, var(--surface-2))",
    cellBg: "color-mix(in srgb, var(--matrix-soliq-ht) 4.5%, transparent)",
    text: "var(--matrix-soliq-ht)",
    border: "color-mix(in srgb, var(--matrix-soliq-ht) 50%, transparent)",
  },
  "Yillik hisobot": {
    headerBg: "color-mix(in srgb, var(--matrix-yillik) 18%, var(--surface-2))",
    subHeaderBg: "color-mix(in srgb, var(--matrix-yillik) 10%, var(--surface-2))",
    cellBg: "color-mix(in srgb, var(--matrix-yillik) 3.5%, transparent)",
    text: "var(--matrix-yillik)",
    border: "color-mix(in srgb, var(--matrix-yillik) 45%, transparent)",
  },
  "Statistika": {
    headerBg: "color-mix(in srgb, var(--matrix-statistika) 18%, var(--surface-2))",
    subHeaderBg: "color-mix(in srgb, var(--matrix-statistika) 10%, var(--surface-2))",
    cellBg: "color-mix(in srgb, var(--matrix-statistika) 3.5%, transparent)",
    text: "var(--matrix-statistika)",
    border: "color-mix(in srgb, var(--matrix-statistika) 45%, transparent)",
  },
  "IT Park": {
    headerBg: "color-mix(in srgb, var(--matrix-itpark) 18%, var(--surface-2))",
    subHeaderBg: "color-mix(in srgb, var(--matrix-itpark) 10%, var(--surface-2))",
    cellBg: "color-mix(in srgb, var(--matrix-itpark) 3.5%, transparent)",
    text: "var(--matrix-itpark)",
    border: "color-mix(in srgb, var(--matrix-itpark) 45%, transparent)",
  },
  "Komunalka": {
    headerBg: "color-mix(in srgb, var(--matrix-komunal) 18%, var(--surface-2))",
    subHeaderBg: "color-mix(in srgb, var(--matrix-komunal) 10%, var(--surface-2))",
    cellBg: "color-mix(in srgb, var(--matrix-komunal) 3.5%, transparent)",
    text: "var(--matrix-komunal)",
    border: "color-mix(in srgb, var(--matrix-komunal) 45%, transparent)",
  },
  "Maxsus": {
    headerBg: "color-mix(in srgb, var(--matrix-maxsus) 18%, var(--surface-2))",
    subHeaderBg: "color-mix(in srgb, var(--matrix-maxsus) 10%, var(--surface-2))",
    cellBg: "color-mix(in srgb, var(--matrix-maxsus) 3.5%, transparent)",
    text: "var(--matrix-maxsus)",
    border: "color-mix(in srgb, var(--matrix-maxsus) 45%, transparent)",
  },
};

// Eski guruh nomlari — admin sozlamasidagi `group` override uchun taqlid.
GROUP_STYLE_MAP["Oylik"] = GROUP_STYLE_MAP["Oylik ish"];
GROUP_STYLE_MAP["Soliqlar"] = GROUP_STYLE_MAP["Oylik soliq"];
GROUP_STYLE_MAP["Soliq H/T"] = GROUP_STYLE_MAP["Kvartal soliq"];
GROUP_STYLE_MAP["Yillik"] = GROUP_STYLE_MAP["Yillik hisobot"];

export const getGroupStyle = (groupName: string): GroupStyle => {
  return GROUP_STYLE_MAP[groupName] ?? {
    headerBg: "var(--surface-2)",
    subHeaderBg: "var(--surface-2)",
    cellBg: "transparent",
    text: "var(--text-secondary)",
    border: "var(--border)",
  };
};

export const buildGroupEdges = (cols: readonly ReportColumn[]): Set<string> => {
  const edges = new Set<string>();
  cols.forEach((c, i) => {
    const next = cols[i + 1];
    if (next && c.group !== next.group) edges.add(c.key);
  });
  return edges;
};
/**
 * Katak ko'rinishi. Qaysi qiymat qaysi holat ekanini bu yer HAL QILMAYDI —
 * `lib/reportStatus.classifyCell` hal qiladi, bu yerda faqat rang va belgi.
 * Ilgari tasnif shu funksiyada VA yana uch joyda alohida yozilgani uchun ular
 * bir-biridan farq qilardi (masalan 'topshirmaydi' bu yerda izoh, statistikada
 * esa "shart emas" edi).
 */
export const STATUS_STYLE: Record<CellStatus, { bg: string; text: string; icon: string; tooltip: string }> = {
  none: { bg: 'transparent', text: 'var(--text-muted)', icon: '—', tooltip: "Bo'sh" },
  // `missing` katakda HECH QACHON chizilmaydi (u faqat hisobda paydo bo'ladi),
  // lekin `Record<CellStatus, …>` to'liq bo'lishi shart.
  missing: { bg: tint('var(--danger)', 8), text: 'var(--danger)', icon: '—', tooltip: 'Talab qilinadi, belgilanmagan' },
  approved: { bg: tint('var(--success)', 13), text: 'var(--success)', icon: '✓', tooltip: 'Bajarildi (+)' },
  failed: { bg: tint('var(--danger)', 13), text: 'var(--danger)', icon: '✗', tooltip: 'Bajarilmadi (-)' },
  submitted: { bg: tint('var(--info)', 13), text: 'var(--info)', icon: '·', tooltip: 'Topshirildi (Kutilmoqda)' },
  blocked: { bg: tint('var(--warning)', 15), text: 'var(--warning)', icon: '!', tooltip: 'Kartoteka' },
  error: { bg: tint('var(--danger)', 13), text: 'var(--danger)', icon: '!', tooltip: 'Xatolik' },
  // NOL HISOBOT — topshirilgan, ichida raqam nol. "0" (shart emas) dan farqli:
  // u ish BAJARILGANINI bildiradi, shuning uchun belgisi ham boshqa.
  zero: { bg: tint('var(--brand)', 13), text: 'var(--brand)', icon: 'Ø', tooltip: 'Nol hisobot topshirildi' },
  /**
   * ERKIN MATN (izoh).
   *
   * Katakda matnning O'ZI qisqartirilib chiziladi, `icon` esa faqat ZAXIRA
   * (matn bo'sh bo'lib qolgan holat uchun).
   *
   * TARIX — ikkita qarama-qarshi xato:
   *   1. Avval to'liq matn chizilardi: uzun izoh ustunni cho'zib, butun jadval
   *      qatorini kengaytirib yuborardi.
   *   2. Keyin matn butunlay olib tashlanib, o'rniga faqat "✎" qo'yildi. Ammo
   *      izoh oynasi FAQAT o'qish huquqidagilar uchun ochilardi — tahrirlay
   *      oladigan odam katakni bossa, menyu chiqardi va matn hech qayerda
   *      ko'rinmasdi. Buxgalterlar buni "izoh yozsak uchib ketyapti" deb
   *      xabar qildi va bir izohni qayta-qayta yozib chiqdi.
   * Yechim ikkalasini ham qoplaydi: katakda `max-w` + `truncate` (ustun
   * cho'zilmaydi), to'liq matn esa menyuning tepasida turadi.
   */
  note: { bg: tint('var(--info)', 13), text: 'var(--info)', icon: '✎', tooltip: '', },
};

/**
 * Serverdan tasdiq kelmagan katak yozuvi shuncha vaqt ekranda ushlab turiladi.
 * Bu — himoya chegarasi: server umuman javob bermay qolsa, eskirgan optimistik
 * qiymat abadiy qotib qolmasligi kerak.
 */
export const PENDING_TTL_MS = 60_000;

// ── Ustun kengliklari — YAGONA MANBA ────────────────────────────

/**
 * MATRITSA USTUNLARI QAT'IY KENGLIKDA.
 *
 * MUAMMO. Jadval `table-layout: auto` edi, ya'ni brauzer ustun kengligini
 * AYNI PAYTDA DOM'da turgan qatorlarning MAZMUNIDAN hisoblardi. Matritsa esa
 * virtualizatsiyalangan — 279 qatordan DOM'da ~34 tasi bo'ladi va ular doim
 * almashib turadi. Har almashuvda:
 *
 *   qatorlar to'plami o'zgardi → ustun kengligi qayta hisoblandi → jadval
 *   umumiy kengligi o'zgardi → gorizontal skroll paydo bo'ldi/yo'qoldi →
 *   konteyner o'lchami o'zgardi → virtualizator boshqa qatorlarni chizdi → …
 *
 * Bu o'z-o'zini qo'zg'atuvchi halqa: ekranda u "sahifa qayta yuklanayapti"
 * bo'lib ko'rinadi — ustunlar sakraydi, bosilgan katak boshqasiga tushadi.
 *
 * IKKINCHI OQIBAT. Muzlatilgan to'rt ustunning `left` siljishi QO'LDA
 * yozilgan piksel edi. U faqat ustun kengligi AYNAN o'sha qiymat bo'lgandagina
 * to'g'ri; avtomatik kenglikda 14 xonali INN yoki uzun firma nomi ustunni
 * kengaytirardi va muzlatilgan ustunlar bir-birining ustiga chiqib ketardi.
 *
 * YECHIM: `table-layout: fixed` + `<colgroup>`. Kenglik mazmunga umuman
 * bog'liq emas, siljishlar esa SHU YERDAN hisoblanadi — sarlavha
 * (`OperationModule`) va qator (`OperationRow`) bitta manbadan o'qiydi,
 * ya'ni ular boshqa ajralib keta olmaydi.
 */
export const MATRIX_COL_W = {
  /** Tartib raqami — uch xonagacha. */
  index: 40,
  /** Firma nomi — uzuni kesiladi (`truncate`). */
  name: 192,
  /** INN — eng uzuni 14 xona (jismoniy shaxs STIR'i). */
  inn: 96,
  /** Buxgalter ismi — kesiladi. */
  accountant: 96,
  /** "To'lov" ustuni — uch qatorli katak. */
  payment: 96,
  /** Hisobot yoki to'lov katagi. */
  data: 40,
} as const;

/** Muzlatilgan ustunlarning chapdan siljishi — kengliklardan HISOBLANADI. */
export const MATRIX_COL_LEFT = {
  index: 0,
  name: MATRIX_COL_W.index,
  inn: MATRIX_COL_W.index + MATRIX_COL_W.name,
  accountant: MATRIX_COL_W.index + MATRIX_COL_W.name + MATRIX_COL_W.inn,
} as const;

/** Muzlatilgan blokning to'liq kengligi — guruh sarlavhasi shuni egallaydi. */
export const MATRIX_FROZEN_W = MATRIX_COL_LEFT.accountant + MATRIX_COL_W.accountant;

export interface StatusStyle {
  bg: string;
  text: string;
  icon: string;
  tooltip: string;
  /** Erkin matnli katak — bosilganda to'liq matn oynasi ochiladi. */
  isNote?: boolean;
}

export const getStatusStyle = (value: string): StatusStyle => {
  const status = classifyCell(value);
  const base = STATUS_STYLE[status];
  if (status === 'note') return { ...base, tooltip: value, isNote: true };
  return base;
};

// Katak amallarining ko'rinishi. Qaysi biri KIMGA ko'rinishi
// lib/reportPermissions.ts da hal qilinadi — bu yerda faqat vizual meta.
export const STATUS_META: Record<CellAction, { label: string; icon: string; color: string }> = {
  '+': { label: 'Tasdiqlash (✓)', icon: '✓', color: 'text-[var(--success)]' },
  'topshirildi': { label: 'Topshirildi', icon: '·', color: 'text-[var(--brand)]' },
  '-': { label: 'Bajarilmadi (-)', icon: '✗', color: 'text-[var(--danger)]' },
  'kartoteka': { label: 'Kartoteka', icon: '!', color: 'text-[var(--warning)]' },
  'nol': { label: 'Nol hisobot (Ø)', icon: 'Ø', color: 'text-[var(--brand)]' },
  'izoh': { label: 'Matn yozish...', icon: '✎', color: 'text-[var(--brand)]' },
  '0': { label: 'Tozalash', icon: '—', color: 'text-[var(--text-muted)]' },
};

/**
 * Rolga mos amallar ro'yxati + kontekstga qarab aniqroq nom.
 * - Buxgalter: "Tasdiqlash" YO'Q; "Topshirildi" → skrinshot oynasini ochadi.
 * - Nazoratchi, dalil kutilayotgan katakda: "+/-" → tekshirish oynasiga boradi.
 */
export const statusesForRole = (role: string, relations: CompanyRelation[], hasPendingProof: boolean) => {
  // "isAccountant" = SHU firmada tasdiqlash huquqi yo'q degani.
  const isAccountant = !canApproveCell(role, relations);
  return allowedCellActions(role, relations).map((value) => {
    const meta = STATUS_META[value];
    if (isAccountant && value === 'topshirildi') {
      return { value, ...meta, label: 'Topshirish (skrinshot)' };
    }
    if (!isAccountant && hasPendingProof && value === '+') {
      return { value, ...meta, label: 'Tekshirib tasdiqlash' };
    }
    if (!isAccountant && hasPendingProof && value === '-') {
      return { value, ...meta, label: 'Tekshirib rad etish' };
    }
    return { value, ...meta };
  });
};

/**
 * To'lov katagining rangi — PUL YO'NALISHI emas, YOPILGANLIK darajasi:
 * qizil = bir tiyin kelmagan, sariq = qisman, yashil = yopilgan.
 * Kutilgan summa nol bo'lsa (shartnoma summasi kiritilmagan) rang berilmaydi —
 * "to'lanmagan" deb ko'rsatish yolg'on bo'lardi.
 */
export function paymentCellBg(p?: { expected: number; collected: number }): string {
  if (!p || p.expected <= 0) return 'var(--surface)';
  if (p.collected <= 0) return 'color-mix(in srgb, var(--danger) 8%, var(--surface))';
  if (p.collected + 1 < p.expected) return 'color-mix(in srgb, var(--warning) 8%, var(--surface))';
  return 'color-mix(in srgb, var(--success) 8%, var(--surface))';
}

export function paymentCellColor(p?: { expected: number; collected: number }): string {
  if (!p || p.expected <= 0) return 'var(--text-3)';
  if (p.collected <= 0) return 'var(--danger)';
  if (p.collected + 1 < p.expected) return 'var(--warning)';
  return 'var(--success)';
}
