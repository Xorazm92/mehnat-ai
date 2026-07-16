"use server";

// =====================================================
// E-JURNAL (ejurnal.uz) — davomat integratsiyasi
// =====================================================
// E-jurnal — Hikvision yuz-skaneri asosidagi davomat tizimi. Bu modul undan
// kunlik davomatni olib, ASRO xodimlariga moslab, Attendance jadvaliga yozadi.
//
// SOZLASH (.env yoki .env.local):
//   EJURNAL_API_URL=https://usp.ejurnal.uz/api      # e-jurnal API bazaviy manzili
//   EJURNAL_API_TOKEN=...                            # kabinetdagi API kalit/token
//
// Faqat `fetchEjurnalAttendance` funksiyasi e-jurnalning haqiqiy API shakliga
// bog'liq — endpoint yo'li va JSON maydon nomlarini o'sha yerda moslang.

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/permissions";

const EJURNAL_API_URL = process.env.EJURNAL_API_URL;
const EJURNAL_API_TOKEN = process.env.EJURNAL_API_TOKEN;

/** E-jurnaldan kelgan bitta davomat yozuvi (normallashtirilgan). */
export interface EjurnalRecord {
  fullName: string;
  phone?: string;
  status: string; // e-jurnal xom holati
  checkIn?: string; // "HH:mm" yoki ISO
  checkOut?: string;
}

// ─── ADAPTER — e-jurnalning haqiqiy API spetsifikatsiyasini kutadigan YAGONA joy ───
// .env da URL/token to'ldirilgach, quyidagi endpoint yo'li va `.map()` ichidagi
// maydon nomlarini e-jurnal javobiga qarab moslang.
async function fetchEjurnalAttendance(date: string): Promise<EjurnalRecord[]> {
  if (!EJURNAL_API_URL || !EJURNAL_API_TOKEN) {
    throw new Error(
      "E-jurnal API sozlanmagan. .env da EJURNAL_API_URL va EJURNAL_API_TOKEN ni kiriting.",
    );
  }

  const res = await fetch(`${EJURNAL_API_URL}/attendance?date=${date}`, {
    headers: {
      Authorization: `Bearer ${EJURNAL_API_TOKEN}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`E-jurnal API xatosi: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  // Javob to'g'ridan-to'g'ri massiv, yoki { data: [...] } / { results: [...] } bo'lishi mumkin.
  const rows: Record<string, unknown>[] = Array.isArray(data)
    ? data
    : ((data.data ?? data.results ?? []) as Record<string, unknown>[]);

  return rows.map((r) => ({
    fullName: String(r.full_name ?? r.fullName ?? r.name ?? "").trim(),
    phone: r.phone ? String(r.phone) : undefined,
    status: String(r.status ?? "present"),
    checkIn: (r.check_in ?? r.checkIn ?? undefined) as string | undefined,
    checkOut: (r.check_out ?? r.checkOut ?? undefined) as string | undefined,
  }));
}

/** E-jurnal holatini ASRO holatiga o'giradi: present | late | excused | absent. */
function mapStatus(raw: string): string {
  const v = raw.toLowerCase();
  if (["late", "kech", "kechikdi"].some((k) => v.includes(k))) return "late";
  if (["excused", "sababli", "ta'til", "tatil", "otpusk"].some((k) => v.includes(k))) return "excused";
  if (["absent", "kelmadi", "yo'q", "yoq"].some((k) => v.includes(k))) return "absent";
  if (["present", "keldi", "ishda", "attend", "in"].some((k) => v.includes(k))) return "present";
  return "present";
}

const digitsOnly = (s?: string) => (s ?? "").replace(/\D/g, "");

/** "HH:mm", "HH:mm:ss" yoki ISO ichidan "HH:mm" ni ajratadi. */
function timeOnly(t?: string): string | undefined {
  if (!t) return undefined;
  const m = t.match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : undefined;
}

/**
 * E-jurnaldan berilgan kun uchun davomatni olib, ASRO xodimlariga (telefon →
 * to'liq ism bo'yicha) moslab, Attendance jadvaliga yozadi (upsert).
 * Faqat senior rollar ishlata oladi. Natija: nechta yozildi va kim topilmadi.
 */
export async function syncEjurnalAttendance(date: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!isSeniorRole(session.user.role as string)) {
    throw new Error("Davomatni import qilish uchun ruxsat yo'q");
  }

  const records = await fetchEjurnalAttendance(date);

  // ASRO xodimlarini telefon va ism bo'yicha indekslash.
  const users = await prisma.user.findMany({
    select: { id: true, fullName: true, phone: true },
  });
  const byPhone = new Map(
    users.filter((u) => u.phone).map((u) => [digitsOnly(u.phone!), u.id]),
  );
  const byName = new Map(users.map((u) => [u.fullName.trim().toLowerCase(), u.id]));

  const day = new Date(date);
  let imported = 0;
  const unmatched: string[] = [];

  for (const rec of records) {
    const userId =
      (rec.phone ? byPhone.get(digitsOnly(rec.phone)) : undefined) ??
      byName.get(rec.fullName.toLowerCase());

    if (!userId) {
      unmatched.push(rec.fullName || rec.phone || "?");
      continue;
    }

    const ci = timeOnly(rec.checkIn);
    const co = timeOnly(rec.checkOut);
    const payload = {
      status: mapStatus(rec.status),
      checkIn: ci ? new Date(`${date}T${ci}:00`) : null,
      checkOut: co ? new Date(`${date}T${co}:00`) : null,
      notes: "E-jurnaldan import qilingan",
    };

    const existing = await prisma.attendance.findFirst({
      where: { userId, date: { gte: day, lt: new Date(day.getTime() + 86400000) } },
    });
    if (existing) {
      await prisma.attendance.update({ where: { id: existing.id }, data: payload });
    } else {
      await prisma.attendance.create({ data: { userId, date: day, ...payload } });
    }
    imported++;
  }

  return { imported, total: records.length, unmatched };
}
