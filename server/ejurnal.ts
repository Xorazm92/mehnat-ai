"use server";

// =====================================================
// E-JURNAL (ejurnal.uz) — davomat integratsiyasi
// =====================================================
// E-jurnal — Hikvision yuz-skaneri asosidagi davomat tizimi. Bu modul undan
// kunlik davomatni olib, ASRO xodimlariga moslab, Attendance jadvaliga yozadi.
// Sof mantiq (status xaritasi, kechikish hisobi, moslashtirish) lib/ejurnal.ts
// da — bu yerda faqat API adapteri va DB yozuvi.
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
import {
  normalizeEjurnalRows,
  buildEjurnalPayload,
  matchUserId,
  digitsOnly,
  type EjurnalRecord,
} from "@/lib/ejurnal";

const EJURNAL_API_URL = process.env.EJURNAL_API_URL;
const EJURNAL_API_TOKEN = process.env.EJURNAL_API_TOKEN;

// ─── ADAPTER — e-jurnalning haqiqiy API spetsifikatsiyasini kutadigan YAGONA joy ───
// .env da URL/token to'ldirilgach, endpoint yo'lini e-jurnal hujjatiga qarab
// moslang. JSON maydon nomlari lib/ejurnal.ts `normalizeEjurnalRows` da moslanadi.
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

  return normalizeEjurnalRows(await res.json());
}

/**
 * E-jurnaldan berilgan kun uchun davomatni olib, ASRO xodimlariga (telefon →
 * to'liq ism bo'yicha) moslab, Attendance jadvaliga yozadi (upsert). Kelish
 * vaqtidan status va kechikish daqiqasi hisoblanadi; manba `source='ejurnal'`.
 * Faqat senior rollar ishlata oladi. Natija: nechta yozildi va kim topilmadi.
 */
export async function syncEjurnalAttendance(date: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!isSeniorRole(session.user.role as string)) {
    throw new Error("Davomatni import qilish uchun ruxsat yo'q");
  }

  const records = await fetchEjurnalAttendance(date);

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
    const userId = matchUserId(rec, byPhone, byName);
    if (!userId) {
      unmatched.push(rec.fullName || rec.phone || "?");
      continue;
    }

    const payload = buildEjurnalPayload(rec, date);

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
