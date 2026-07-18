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
}

export interface MonthlyAttendanceSummary {
  workedDays: number;
  presentDays: number;
  lateDays: number;
  absentDays: number;
  excusedDays: number;
  /** KPI: 08:30 gacha kelgan kunlar (bonus). */
  earlyDays: number;
  /** KPI: jami kechikkan daqiqalar. */
  lateMinutes: number;
}

/**
 * Bir oylik `Attendance` yozuvlaridan KPI ko'rsatkichlarini yig'adi. Kelish
 * vaqti (checkIn) bor bo'lsa — u haqiqat manbai (yuz-skaneri); yo'q bo'lsa —
 * saqlangan `status`/`lateMinutes` ga ishonadi. `excused` (sababli) jarima emas.
 */
export function aggregateMonthlyAttendance(
  rows: DailyAttendance[],
  t: AttendanceThresholds = DEFAULT_ATTENDANCE_THRESHOLDS,
): MonthlyAttendanceSummary {
  const s: MonthlyAttendanceSummary = {
    workedDays: 0,
    presentDays: 0,
    lateDays: 0,
    absentDays: 0,
    excusedDays: 0,
    earlyDays: 0,
    lateMinutes: 0,
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

  return s;
}
