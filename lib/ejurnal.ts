// =====================================================
// E-JURNAL — sof mantiq (normalizatsiya, status xaritasi, moslashtirish)
// =====================================================
// server/ejurnal.ts ("use server") faqat async server-action'larni eksport qila
// oladi, shuning uchun sof yordamchi funksiyalar shu yerda — DB'siz test uchun.

import {
  classifyArrival,
  DEFAULT_ATTENDANCE_THRESHOLDS,
  type AttendanceThresholds,
} from "./attendance";

/** E-jurnaldan kelgan bitta davomat yozuvi (normallashtirilgan). */
export interface EjurnalRecord {
  fullName: string;
  phone?: string;
  status: string; // e-jurnal xom holati
  checkIn?: string; // "HH:mm" yoki ISO
  checkOut?: string;
}

/** Xom API javobini (massiv / {data} / {results}) EjurnalRecord'larga o'giradi. */
export function normalizeEjurnalRows(data: unknown): EjurnalRecord[] {
  const rows: Record<string, unknown>[] = Array.isArray(data)
    ? (data as Record<string, unknown>[])
    : (((data as { data?: unknown; results?: unknown })?.data ??
        (data as { results?: unknown })?.results ??
        []) as Record<string, unknown>[]);

  return rows.map((r) => ({
    fullName: String(r.full_name ?? r.fullName ?? r.name ?? "").trim(),
    phone: r.phone ? String(r.phone) : undefined,
    status: String(r.status ?? "present"),
    checkIn: (r.check_in ?? r.checkIn ?? undefined) as string | undefined,
    checkOut: (r.check_out ?? r.checkOut ?? undefined) as string | undefined,
  }));
}

/** E-jurnal holatini ASRO holatiga o'giradi: present | late | excused | absent. */
export function mapStatus(raw: string): string {
  const v = raw.toLowerCase();
  if (["late", "kech", "kechikdi"].some((k) => v.includes(k))) return "late";
  if (["excused", "sababli", "ta'til", "tatil", "otpusk"].some((k) => v.includes(k)))
    return "excused";
  if (["absent", "kelmadi", "yo'q", "yoq"].some((k) => v.includes(k))) return "absent";
  if (["present", "keldi", "ishda", "attend", "in"].some((k) => v.includes(k)))
    return "present";
  return "present";
}

export const digitsOnly = (s?: string): string => (s ?? "").replace(/\D/g, "");

/** "HH:mm", "HH:mm:ss" yoki ISO ichidan "HH:mm" ni ajratadi. */
export function timeOnly(t?: string): string | undefined {
  if (!t) return undefined;
  const m = t.match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : undefined;
}

export interface EjurnalAttendancePayload {
  status: string;
  checkIn: Date | null;
  checkOut: Date | null;
  lateMinutes: number;
  source: string;
  notes: string;
}

/**
 * Bir yozuv uchun Attendance payload'ini quradi. Kelish vaqti bo'lsa — status va
 * kechikish daqiqasi undan hisoblanadi (yuz-skaneri = haqiqat manbai), aks holda
 * e-jurnal xom statusiga ishonadi.
 */
export function buildEjurnalPayload(
  rec: EjurnalRecord,
  date: string,
  t: AttendanceThresholds = DEFAULT_ATTENDANCE_THRESHOLDS,
): EjurnalAttendancePayload {
  const ci = timeOnly(rec.checkIn);
  const co = timeOnly(rec.checkOut);
  const checkIn = ci ? new Date(`${date}T${ci}:00`) : null;
  const checkOut = co ? new Date(`${date}T${co}:00`) : null;

  const mapped = mapStatus(rec.status);
  let status = mapped;
  let lateMinutes = 0;
  if (checkIn && (mapped === "present" || mapped === "late")) {
    const c = classifyArrival(checkIn, t);
    status = c.status;
    lateMinutes = c.lateMinutes;
  }

  return {
    status,
    checkIn,
    checkOut,
    lateMinutes,
    source: "ejurnal",
    notes: "E-jurnaldan import qilingan",
  };
}

/** E-jurnal yozuvini ASRO foydalanuvchisiga (telefon → ism) moslaydi. */
export function matchUserId(
  rec: EjurnalRecord,
  byPhone: Map<string, string>,
  byName: Map<string, string>,
): string | undefined {
  return (
    (rec.phone ? byPhone.get(digitsOnly(rec.phone)) : undefined) ??
    byName.get(rec.fullName.trim().toLowerCase())
  );
}
