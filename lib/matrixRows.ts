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

// ── Qatorlarni birlashtirish (havolalarni saqlab qolish) ─────────

/** Matritsa qatorining bu modulga kerakli qismi: kalit → katak qiymati. */
export type MatrixRowLike = Record<string, unknown>;

/** Katak qiymati massiv ham bo'lishi mumkin (`activeServices`). */
function cellsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return false;
}

/** Ikki qator MAZMUNAN bir xilmi. */
export function rowsEqual(a: MatrixRowLike, b: MatrixRowLike): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    // `key in b` — ikkala qatorda kalitlar SONI bir xil bo'lib, to'plami
    // farq qilishi mumkin (ustunlar ro'yxati o'zgarsa). Busiz ikkala tomonda
    // `undefined` bo'lgan kalit "bir xil" deb hisoblanardi.
    if (!(key in b) || !cellsEqual(a[key], b[key])) return false;
  }
  return true;
}

/**
 * Yangi qurilgan qatorlarni ESKILARI bilan birlashtiradi: mazmuni
 * o'zgarmagan qator eski OBYEKTI bilan qoladi.
 *
 * NEGA KERAK. Sahifa har yangilanganda (`router.refresh()` yoki katak
 * yozuvidan keyingi server render'i) qatorlar noldan quriladi va hammasi
 * yangi obyekt bo'ladi. `OperationRow`/`StatusCell` `React.memo` bilan
 * o'ralgan, lekin memo taqqoslashi HAVOLA bo'yicha ishlaydi — natijada bitta
 * katak o'zgarganda ham ko'rinadigan barcha qator va ~1500 katak qaytadan
 * chizilardi. Bu ekranning "sakrashi" va bosilgan katakning boshqasiga
 * tushib qolishining bevosita sababi edi.
 *
 * Massivning O'ZI ham hech narsa o'zgarmagan bo'lsa eski havolasi bilan
 * qaytadi — bunda React umuman qayta chizmaydi.
 *
 * Qatorlar O'RIN bo'yicha solishtiriladi: ro'yxat tartibi bitta so'rovdan
 * keladi va barqaror; tartib o'zgarsa qatorlar yangi obyekt bo'ladi, ya'ni
 * eng yomon holatda hozirgi xatti-harakat qaytadi.
 */
export function mergeRows<T extends MatrixRowLike>(prev: readonly T[], next: T[]): T[] {
  let changed = prev.length !== next.length;
  const out = next.map((row, i) => {
    const old = prev[i];
    if (old && rowsEqual(old, row)) return old;
    changed = true;
    return row;
  });
  return changed ? out : (prev as T[]);
}
