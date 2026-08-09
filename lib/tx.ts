// lib/tx.ts
// =====================================================
// SERIALIZABLE TRANZAKSIYA + QAYTA URINISH
// =====================================================
//
// NIMA UCHUN KERAK. Auditda aniqlandi: pul chiqadigan HAR BIR amalda balans
// tekshiruvi (`assertSufficientFunds`) tranzaksiyadan TASHQARIDA turardi:
//
//     await assertSufficientFunds(...)        // ← balansni o'qidi
//     await prisma.$transaction(async (tx) => // ← keyin yozdi
//
// Ikki amal bir vaqtda kelsa, ikkalasi ham AYNAN BIR XIL balansni ko'radi va
// ikkalasi ham o'tib ketadi. Balans 10 mln bo'lsa, ikkita 8 mln lik chiqim
// birgalikda 16 mln chiqarib yuboradi — ya'ni tekshiruv aslida hech nimani
// kafolatlamas edi. Bu "check-then-act" (TOCTOU) poyga holati.
//
// YECHIM. O'qish ham, yozish ham bitta Serializable tranzaksiyada bo'lsin.
// Postgres Serializable rejimida o'qilgan qatorlarga predikat qulf qo'yadi:
// ikkinchi tranzaksiya o'sha ma'lumotni o'zgartirsa, biri 40001 xatosi bilan
// bekor qilinadi. Ya'ni "ikkalasi ham o'tib ketdi" holati fizikaviy mumkin
// emas bo'ladi.
//
// Bekor qilingan tranzaksiya — xato emas, QAYTA URINISH signali. Callback sof
// DB amallaridan iborat, shuning uchun uni qayta ishga tushirish xavfsiz.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/** Prisma yozuv konflikti kodi + Postgres serialization_failure. */
function isRetryable(e: unknown): boolean {
  const err = e as { code?: string; meta?: { code?: string }; message?: string };
  return (
    err?.code === "P2034" || // Prisma: write conflict / deadlock
    err?.code === "40001" || // Postgres: could not serialize access
    err?.meta?.code === "40001" ||
    /could not serialize|deadlock detected|write conflict/i.test(err?.message ?? "")
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Serializable tranzaksiya; konfliktda qayta uriniladi.
 *
 * @param fn        Tranzaksiya tanasi. Bekor qilinsa QAYTA CHAQIRILADI —
 *                  ichida DB'dan tashqari nojo'ya ta'sir bo'lmasin
 *                  (email, Telegram, fayl yozish tranzaksiyadan keyin).
 * @param attempts  Umumiy urinishlar soni (standart 4).
 */
export async function serializable<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  attempts = 4
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: "Serializable",
        // Balans tekshiruvi 5 ta agregat so'rov qiladi — standart 5s qisqalik
        // qiladi, sekin tarmoqda o'z-o'zidan yiqilib qolmasin.
        timeout: 15_000,
      });
    } catch (e) {
      if (!isRetryable(e)) throw e;
      last = e;
      // Eksponensial + tasodifiy kechikish: ikki urinish qайta to'qnashmasin.
      await sleep(25 * 2 ** i + Math.random() * 40);
    }
  }
  throw new Error(
    "Amal bir vaqtda bajarilgan boshqa amal bilan to'qnashdi. " +
      "Bir necha soniyadan keyin qayta urinib ko'ring." +
      (process.env.NODE_ENV === "development" ? ` (${(last as Error)?.message})` : "")
  );
}
