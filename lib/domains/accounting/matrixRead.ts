// =====================================================
// MAJBURIYAT → MATRITSA KATAGI (o'qish yo'li)
// =====================================================
// `matrixWrite.ts` ning teskarisi: u katak qiymatini majburiyat holatiga
// tarjima qiladi, bu esa holatni yana katak qiymatiga qaytaradi.
//
// NEGA PROYEKSIYA EMAS, USTMA-UST QO'YISH.
// Reja "o'qish almashtirish" deydi, lekin almashtirish bir shartda xavfsiz:
// matritsaning HAR ustunida faol template bo'lishi kerak. Bugun 42 ustundan
// 14 tasi qoplangan. Sof proyeksiya qolgan 28 ustunni jimgina bo'shatardi —
// ya'ni bayroqni yoqish ma'lumot yo'qotgandek ko'rinardi va uni hech kim
// yoqmasdi. Shuning uchun asos `MonthlyReport` dan qoladi, majburiyat esa
// FAQAT o'zi qoplagan ustunlarni bosadi. Qamrov 42/42 ga yetganda asos
// tabiiy ravishda ortiqcha bo'lib qoladi va uni o'chirish bir qatorlik ish.
//
// DAVR OYNASI. Yillik majburiyat 12 oyning HAMMASIGA tushadi, choraklik —
// uchtasiga. Bu yozish yo'li bilan simmetrik: `matrixWrite` yilning istalgan
// oyidan yozilgan qiymatni bitta yillik majburiyatga olib boradi, demak o'sha
// yilning istalgan oyi o'qilganda ham o'sha holat ko'rinishi kerak.
//
// LUG'AT TESHIGI. `in_progress` (kartotekasiz) va `ready` — matritsada SO'Z
// YO'Q. Ular bo'sh katak bo'lib qaytadi: ish boshlangan, lekin topshirilmagan.
// Eski matritsada ham bu holat bo'sh katak edi.
import type { ObligationStatus, DelayReason } from "@prisma/client";
import { CELL_APPROVED, CELL_SUBMITTED, CELL_FAILED, CELL_KARTOTEKA } from "@/lib/reportPermissions";
import { toYearMonthKey } from "@/lib/periods";
import type { OperationEntry } from "@/types";

export interface ObligationCell {
  companyId: string;
  /** `DeadlineTemplate.matrixKey` — qaysi ustunga tushadi. */
  matrixKey: string;
  periodStart: Date;
  /** Chegara EMAS — [start, end) yarim ochiq oraliq. */
  periodEnd: Date;
  status: ObligationStatus;
  delayReason: DelayReason | null;
  updatedAt: Date;
}

/**
 * Holat → katak qiymati. `null` — katak bo'sh qoladi.
 *
 * `meaningOf` bilan qasddan aylanma: `cellValueOf(meaningOf(v)) === v` beshta
 * matritsa qiymatining har biri uchun (`test/matrix-read.test.ts` tekshiradi).
 */
export function cellValueOf(o: { status: ObligationStatus; delayReason: DelayReason | null }): string | null {
  switch (o.status) {
    case "accepted":
      return CELL_APPROVED;
    case "sent":
      return CELL_SUBMITTED;
    case "rejected":
      return CELL_FAILED;
    case "in_progress":
      // Kechikish sababi belgilangan bo'lsagina — `kartoteka` aynan shu.
      return o.delayReason ? CELL_KARTOTEKA : null;
    default:
      return null;
  }
}

/** Yillikdan ko'p oy qamragan majburiyat — ma'lumot nuqsoni; kesiladi. */
const MAX_MONTHS = 12;

/** `[periodStart, periodEnd)` qamragan oylar, `"YYYY-MM"` ko'rinishida. */
export function monthsCovered(periodStart: Date, periodEnd: Date): string[] {
  const out: string[] = [];
  let y = periodStart.getUTCFullYear();
  let m = periodStart.getUTCMonth();
  while (out.length < MAX_MONTHS && Date.UTC(y, m, 1) < periodEnd.getTime()) {
    out.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    if (++m > 11) {
      m = 0;
      y++;
    }
  }
  return out;
}

const keyOf = (companyId: string, ym: string) => `${companyId}|${ym}`;

/**
 * Majburiyat holatlarini matritsa satrlariga bosadi.
 *
 * `base` TEGILMAYDI — nusxa qaytariladi.
 *
 * Ziddiyat qoidasi (bir ustunga ikki majburiyat tushsa — masalan QQS va
 * aylanma solig'i bir ustunni bo'lishsa): keyin YANGILANGANI yutadi, va bo'sh
 * qiymat hech qachon to'ldirilganini o'chirmaydi. Amalda firma uchun ikkalasi
 * bir vaqtda amal qilmaydi — bu himoya, siyosat emas.
 */
export function overlayObligations(base: OperationEntry[], cells: ObligationCell[]): OperationEntry[] {
  const out = base.map((e) => ({ ...e }));
  const index = new Map<string, OperationEntry>();
  for (const e of out) {
    const ym = toYearMonthKey(e.period);
    if (ym) index.set(keyOf(e.companyId, ym), e);
  }

  // Qaysi katakni qaysi majburiyat yozgani — ziddiyatni hal qilish uchun.
  const wroteAt = new Map<string, number>();

  for (const c of cells) {
    const value = cellValueOf(c);
    for (const ym of monthsCovered(c.periodStart, c.periodEnd)) {
      const rowKey = keyOf(c.companyId, ym);
      let entry = index.get(rowKey);
      if (!entry) {
        // Majburiyat bor, `MonthlyReport` qatori yo'q — bu ODATIY hol:
        // generator hisobot qatoridan oldin ishlaydi.
        entry = {
          id: `obligation:${rowKey}`,
          companyId: c.companyId,
          period: ym,
          updatedAt: c.updatedAt.toISOString(),
          history: [],
        } as unknown as OperationEntry;
        index.set(rowKey, entry);
        out.push(entry);
      }

      const cellKey = `${rowKey}|${c.matrixKey}`;
      const prev = wroteAt.get(cellKey);
      if (prev !== undefined && prev >= c.updatedAt.getTime()) continue;

      const rec = entry as unknown as Record<string, unknown>;
      if (value === null) {
        if (prev === undefined) delete rec[c.matrixKey];
      } else {
        rec[c.matrixKey] = value;
        wroteAt.set(cellKey, c.updatedAt.getTime());
      }
    }
  }

  return out;
}
