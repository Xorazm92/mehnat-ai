// =====================================================
// ATTENDANCE — kelish chegaralari va oylik agregatsiya (sof mantiq)
// =====================================================
// Davomat ma'lumoti e-jurnal (Hikvision yuz-skaneri) yoki qo'lda kiritishdan
// keladi va `Attendance` jadvalida saqlanadi. Bu modul KPI uchun kerakli
// ko'rsatkichlarni (earlyDays / lateMinutes / absentDays) shu jadvaldan HISOBLAB
// beradi — endi nazoratchi qo'lda sanamaydi. Sof va DB'siz test qilinadi.

export interface AttendanceThresholds {
  /** Shu daqiqada yoki undan oldin kelish — "erta" (bonus kuni). 08:30 → 510. */
  earlyBeforeMin: number;
  /** Shu daqiqadan keyin kelish — "kechikish". 09:00 → 540. */
  lateAfterMin: number;
}

/**
 * Ish kuni bo'lmagan sanalar ("YYYY-MM-DD") — shanba/yakshanbadan tashqari.
 * 31.08.2026 — Xotira va qadrlash kuni.
 */
export const NON_WORKING_DAYS = new Set(["2026-08-31"]);

/** Shanba, yakshanba yoki bayram bo'lmagan kunmi. */
export function isWorkday(iso: string): boolean {
  if (NON_WORKING_DAYS.has(iso)) return false;
  const wd = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
  return wd !== 0 && wd !== 6;
}

/** Oydagi ish kunlari soni. `month` — 1..12. */
export function countWorkdays(year: number, month: number): number {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let n = 0;
  for (let d = 1; d <= last; d++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (isWorkday(iso)) n++;
  }
  return n;
}

/** ASRO reglamenti: 08:30 gacha — erta, 09:00 dan keyin — kechikish. */
export const DEFAULT_ATTENDANCE_THRESHOLDS: AttendanceThresholds = {
  earlyBeforeMin: 8 * 60 + 30,
  lateAfterMin: 9 * 60,
};

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export interface ArrivalClassification {
  status: "present" | "late";
  /** Kechikkan daqiqalar (09:00 dan keyin), aks holda 0. */
  lateMinutes: number;
  /** 08:30 gacha kelgan bo'lsa — bonus kuni. */
  isEarly: boolean;
}

/**
 * Bitta kelish vaqtini chegaralarga solishtiradi. Kelish vaqti yo'q kunlar
 * (absent/excused) uchun chaqirilmaydi — buni chaqiruvchi hal qiladi.
 */
export function classifyArrival(
  checkIn: Date,
  t: AttendanceThresholds = DEFAULT_ATTENDANCE_THRESHOLDS,
): ArrivalClassification {
  const m = minutesOfDay(checkIn);
  if (m > t.lateAfterMin) {
    return { status: "late", lateMinutes: m - t.lateAfterMin, isEarly: false };
  }
  return { status: "present", lateMinutes: 0, isEarly: m <= t.earlyBeforeMin };
}

export interface DailyAttendance {
  status: string; // 'present' | 'late' | 'absent' | 'excused'
  checkIn: Date | null;
  lateMinutes?: number | null;
  /**
   * Kechikish uzrli deb tasdiqlanganmi (shifokor, xizmat safari, rahbar
   * ruxsati). Reglament kechikishni faqat "узрли сабабсиз" bo'lganda
   * jarimalaydi — bu bayroq qo'yilgan kun jarimaga kirmaydi.
   */
  lateExcused?: boolean | null;
}

export interface MonthlyAttendanceSummary {
  workedDays: number;
  presentDays: number;
  lateDays: number;
  absentDays: number;
  excusedDays: number;
  /** KPI: 08:30 gacha kelgan kunlar (bonus). */
  earlyDays: number;
  /** KPI: jami kechikkan daqiqalar (uzrli deb belgilanganlari kirmaydi). */
  lateMinutes: number;
  /** Uzrli deb tasdiqlangan kechikish kunlari — hisobotda ko'rsatiladi. */
  excusedLateDays: number;
  /**
   * Ishlangan HAR kun 08:30 gacha kelinganmi (va uzrsiz yo'qlik yo'qmi).
   * Reglament shu holatda to'liq +1% beradi; kunbay hisob (0.04×20=0.80)
   * hech qachon o'sha 1% ga yetmasdi, chunki oyda 25 ish kuni bo'lmaydi.
   */
  allEarly: boolean;
}

/**
 * Bir oylik `Attendance` yozuvlaridan KPI ko'rsatkichlarini yig'adi. Kelish
 * vaqti (checkIn) bor bo'lsa — u haqiqat manbai (yuz-skaneri); yo'q bo'lsa —
 * saqlangan `status`/`lateMinutes` ga ishonadi. `excused` (sababli) jarima emas.
 */
export function aggregateMonthlyAttendance(
  rows: DailyAttendance[],
  t: AttendanceThresholds = DEFAULT_ATTENDANCE_THRESHOLDS,
  /**
   * Oydagi ish kunlari soni. Berilsa, `allEarly` (to'liq bonus) uchun xodimning
   * HAR ish kunida yozuvi bo'lishi ham talab qilinadi — aks holda Face ID dan
   * ikki kun o'tib, ikkalasida ham erta kelgan odam "uzilishsiz oy" bonusini
   * olib ketardi.
   */
  expectedWorkdays?: number,
): MonthlyAttendanceSummary {
  const s: MonthlyAttendanceSummary = {
    workedDays: 0,
    presentDays: 0,
    lateDays: 0,
    absentDays: 0,
    excusedDays: 0,
    earlyDays: 0,
    lateMinutes: 0,
    excusedLateDays: 0,
    allEarly: false,
  };

  for (const r of rows) {
    if (r.status === "absent") {
      s.absentDays++;
      continue;
    }
    if (r.status === "excused") {
      s.excusedDays++;
      continue;
    }

    // present | late — worked day.
    s.workedDays++;

    // Uzrli kechikish: kun ishlangan deb sanaladi, lekin daqiqalari jarimaga
    // qo'shilmaydi. Erta kelish ham bo'lmaydi — 08:30 dan keyin kelgan.
    if (r.lateExcused) {
      s.excusedLateDays++;
      s.presentDays++;
      continue;
    }

    if (r.checkIn) {
      const c = classifyArrival(r.checkIn, t);
      if (c.status === "late") {
        s.lateDays++;
        s.lateMinutes += c.lateMinutes;
      } else {
        s.presentDays++;
        if (c.isEarly) s.earlyDays++;
      }
    } else if (r.status === "late") {
      s.lateDays++;
      s.lateMinutes += r.lateMinutes ?? 0;
    } else {
      s.presentDays++;
    }
  }

  s.allEarly =
    s.workedDays > 0 &&
    s.earlyDays === s.workedDays &&
    s.absentDays === 0 &&
    (expectedWorkdays === undefined || s.workedDays >= expectedWorkdays);

  return s;
}
