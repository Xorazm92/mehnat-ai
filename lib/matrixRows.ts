// lib/matrixRows.ts
// Matritsa QATORINI qurishning sof mantig'i — katak qiymatlarini o'qish va
// serverdan tasdiq kutayotgan yozuvlarni solishtirish.
//
// NEGA `OperationModule` dan ajratildi: ikkala mantiq ham "yozganim o'chib
// ketdi" turkumidagi shikoyatlarning bevosita sababi bo'lgan, komponent esa
// 2200 qatorli va React'siz sinab bo'lmaydi. Bu yerda ular DOM'siz
// tekshiriladi (`lib/**/*.spec.ts`).

/** Matritsa ustunidan bu modulga kerak bo'ladigan qismi. */
export interface MatrixColumnKeys {
  key: string;
  /** Bo'linadigan ustunning TO'LOV yarmi (AQt, DSt, INt, FSt). */
  payKey?: string;
}

/**
 * Bitta firma-davr yozuvidan katak qiymatlarini o'qiydi.
 *
 * `payKey` HAM o'qiladi. Busiz bo'linadigan ustunlarning to'lov yarmi jadvalga
 * hech qachon qaytmasdi: server uni to'g'ri saqlardi (`FIELD_TO_DB_COLUMN` da
 * `aylanma_qqs_tolov` bor), lekin qator quruvchisi faqat `col.key` ni
 * ko'chirgani uchun katak ekranda bo'sh qolaverardi — buxgalter uchun bu
 * "to'lovni belgiladim, o'chib ketdi" degani edi.
 *
 * `null`/`undefined` — bo'sh satrga aylanadi ("shart emas" holati).
 */
export function readRowCells(
  op: Record<string, unknown> | undefined | null,
  columns: readonly MatrixColumnKeys[],
): Record<string, string> {
  const read = (key: string): string => {
    const v = op ? op[key] : undefined;
    return v === undefined || v === null ? "" : String(v);
  };
  const out: Record<string, string> = {};
  for (const col of columns) {
    out[col.key] = read(col.key);
    if (col.payKey) out[col.payKey] = read(col.payKey);
  }
  return out;
}

// ── Serverdan tasdiq kutayotgan kataklar ─────────────────────────

/** Kutilayotgan yozuv: kutilgan qiymat + qachon yuborilgani. */
export interface PendingCell {
  value: string;
  at: number;
}

export const pendingCellKey = (companyId: string, colKey: string): string =>
  `${companyId}::${colKey}`;

/** Kalitni ortga ajratish (kalitda `::` faqat ajratgich sifatida uchraydi). */
export function parsePendingCellKey(key: string): { companyId: string; colKey: string } {
  const sep = key.indexOf("::");
  return { companyId: key.slice(0, sep), colKey: key.slice(sep + 2) };
}

export interface PendingReconcileResult {
  /** `companyId` → (`colKey` → qiymat): server javobi USTIDAN qo'yiladi. */
  overrides: Map<string, Map<string, string>>;
  /** Kuzatuvdan chiqadigan kalitlar — server yetib keldi yoki muddat o'tdi. */
  settled: string[];
}

/**
 * Kutilayotgan yozuvlarni server ma'lumoti bilan solishtiradi.
 *
 * MUAMMO SHU EDI: `useAutoRefresh` har 15 soniyada `router.refresh()` chaqiradi.
 * Yozuvdan bir lahza OLDIN boshlangan yangilanish javobini yozuvdan KEYIN olib
 * keladi, javob esa eski keshga tayanadi (`getCachedOperations` — 5 daqiqa).
 * Ilgari himoya bitta martalik `skipNextSync` bayrog'i edi va u birinchi
 * (yozuvning o'z) yangilanishida sarflanardi, kechikkan eski javob esa katakni
 * bo'shatib ketardi. Ekranda bu "yozdim — o'chdi" bo'lib ko'rinardi.
 *
 * Endi qiymat server UNGA YETMAGUNCHA ekranda ushlanadi. `ttlMs` — himoya
 * chegarasi: server umuman javob bermay qolsa, eskirgan optimistik qiymat
 * abadiy qotib qolmasligi kerak.
 *
 * Sof funksiya: `pending` o'zgartirilmaydi, tozalanadigan kalitlar
 * `settled` da qaytariladi.
 */
export function reconcilePendingCells(
  pending: ReadonlyMap<string, PendingCell>,
  serverValueOf: (companyId: string, colKey: string) => string,
  now: number,
  ttlMs: number,
): PendingReconcileResult {
  const overrides = new Map<string, Map<string, string>>();
  const settled: string[] = [];

  for (const [key, entry] of pending) {
    const { companyId, colKey } = parsePendingCellKey(key);
    if (serverValueOf(companyId, colKey) === entry.value || now - entry.at > ttlMs) {
      settled.push(key);
      continue;
    }
    let byCol = overrides.get(companyId);
    if (!byCol) {
      byCol = new Map();
      overrides.set(companyId, byCol);
    }
    byCol.set(colKey, entry.value);
  }

  return { overrides, settled };
}
