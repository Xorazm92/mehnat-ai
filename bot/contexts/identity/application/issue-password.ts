// =====================================================
// SAYT PAROLINI BOT ORQALI BERISH
// =====================================================
// Xodim botga telefon raqami bilan bog'langan, ya'ni u kimligi ALLAQACHON
// isbotlangan. Shunga qaramay mavjud parolni ko'rsatib bo'lmaydi: u bcrypt
// hash sifatida saqlanadi va qaytarilmaydi (bu to'g'ri — hech kim, hatto
// administrator ham, xodimning parolini o'qiy olmasligi kerak).
//
// Shuning uchun tugma YANGI parol yaratadi va eskisini bekor qiladi. Ya'ni bu
// "parolni ko'rsatish" emas, "parolni tiklash" — foydalanuvchiga ham shunday
// tushuntiriladi, aks holda u eski parolini kutib qoladi.
//
// XAVFSIZLIK QAROLARI:
//   1. FAQAT shaxsiy chat. Guruhda bosilsa rad etiladi — aks holda parol
//      mijoz guruhidagi hammaga ko'rinardi.
//   2. Xabar o'tkinchi (EPHEMERAL_MS). Parol Telegram tarixida qolsa, u ham
//      "oylab saqlanadi" — aynan qochmoqchi bo'lgan xavf.
//   3. Chastota chegarasi. Ketma-ket bosish parolni qayta-qayta almashtirib,
//      xodimni tizimdan qulflab qo'yishi mumkin edi.
//   4. AuditLog yozuvi: parol qachon va kim tomonidan almashtirilgani qoladi.
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import type { CallbackOutcome } from "../../interaction/domain/outbound";

/** Parol chatda shuncha turadi, so'ng bot uni o'chiradi. */
export const EPHEMERAL_MS = 2 * 60_000;

/** Shu oraliqda qayta so'rab bo'lmaydi. */
export const REISSUE_COOLDOWN_MS = 60_000;

/** Oxirgi berilgan vaqt — jarayon xotirasida. */
const lastIssued = new Map<string, number>();

/**
 * O'qishga qulay parol: chalkashadigan belgilar (0/O, 1/l/I) yo'q, chunki uni
 * odam ekrandan ko'chirib yozadi.
 */
const ALPHABET = "abcdefghijkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePassword(length = 12): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export interface IssuePasswordDeps {
  /** Tugma bosilgan chat. Shaxsiy chatda u foydalanuvchi id'siga teng. */
  chatId: bigint;
  /** Tugmani bosgan Telegram foydalanuvchisi. */
  fromUserId: bigint;
  now?: number;
}

/**
 * Chaqiruvchiga yangi sayt paroli beradi va uni shaxsiy chatga yuboradi.
 */
export async function issueWebPassword(
  prisma: PrismaClient,
  user: { id: string },
  deps: IssuePasswordDeps,
): Promise<CallbackOutcome> {
  const now = deps.now ?? Date.now();

  // 1) Faqat shaxsiy chat. Telegramda shaxsiy chat id'si foydalanuvchi
  //    id'siga teng; guruhda esa u manfiy bo'ladi va hech qachon mos kelmaydi.
  if (deps.chatId !== deps.fromUserId) {
    return {
      answer:
        "Parol faqat shaxsiy chatda beriladi. Botga yakka o'zingiz yozing va menyuni oching.",
      alert: true,
    };
  }

  // 2) Chastota chegarasi.
  const last = lastIssued.get(user.id) ?? 0;
  if (now - last < REISSUE_COOLDOWN_MS) {
    const wait = Math.ceil((REISSUE_COOLDOWN_MS - (now - last)) / 1000);
    return { answer: `Yangi parol ${wait} soniyadan keyin so'ralsin.`, alert: true };
  }

  // Login — bu xodimning email'i. `ResolvedUser` uni olib kelmaydi, shuning
  // uchun shu yerda o'qiymiz: bu yo'l kamdan-kam bosiladi, umumiy tipni
  // kengaytirib har bir tugma bosilishiga ortiqcha maydon qo'shish shart emas.
  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true },
  });
  if (!record) return { answer: "Hisobingiz topilmadi.", alert: true };

  const password = generatePassword();
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 12) },
  });
  lastIssued.set(user.id, now);

  // 3) Audit izi. Parolning O'ZI yozilmaydi — faqat almashtirilgani fakti.
  try {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "update",
        tableName: "User",
        recordId: user.id,
        newData: { event: "password_issued_via_bot", channel: "telegram" },
      },
    });
  } catch {
    // Audit yozuvi yozilmasa ham parol berilgan — bu yerda to'xtash
    // foydalanuvchini parolsiz qoldirardi.
  }

  const minutes = Math.round(EPHEMERAL_MS / 60_000);
  const text = [
    "🔑 Saytga kirish ma'lumotlari",
    "",
    `Login: ${record.email}`,
    `Parol: ${password}`,
    "",
    `⚠️ Bu xabar ${minutes} daqiqadan keyin o'chadi — parolni hozir ko'chirib oling.`,
    "⚠️ Eski parol endi ishlamaydi.",
  ].join("\n");

  return {
    answer: "Parol shaxsiy chatga yuborildi.",
    send: [{ chatId: deps.chatId, text, ephemeralMs: EPHEMERAL_MS, bestEffort: true }],
  };
}
