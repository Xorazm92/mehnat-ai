"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { evidenceStore, parseDataUrl } from "@/lib/evidenceStore";
import { logServerError } from "@/lib/platform/logger";

/**
 * AVATAR RASMI.
 *
 * Fayl BAZAGA yozilmaydi — `lib/evidenceStore` omboriga tushadi va `User`
 * da faqat havola qoladi. Bu `ReportProof` bilan bir xil yo'l: `pg_dump`
 * ichida base64 rasm bo'lmaydi va zaxira ikki qismli qoladi.
 *
 * Rasm yuklamagan xodim uchun hech narsa buzilmaydi: `avatarColor` o'z
 * o'rnida qoladi va `<Avatar>` initsial doirasini chizaveradi.
 */

/** Faqat brauzer o'zi ko'rsata oladigan formatlar. PDF/SVG bu yerda emas. */
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

/** 2 MB — 256px avatar uchun bundan ko'pi hech qachon kerak emas. */
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Kim kimning avatarini o'zgartira oladi: har kim o'zinikini, admin —
 * hammanikini. Buxgalter hamkasbining rasmini almashtira olmasligi kerak.
 */
function canEdit(actorId: string, actorRole: string, targetId: string): boolean {
  return actorId === targetId || actorRole === "admin" || actorRole === "super_admin";
}

export async function uploadAvatar(userId: string, dataUrl: string): Promise<{ ok: true }> {
  const session = await auth();
  if (!session) throw new Error("Avtorizatsiya kerak");

  const actorId = session.user.id as string;
  const actorRole = session.user.role as string;
  if (!canEdit(actorId, actorRole, userId)) {
    throw new Error("Bu xodimning avatarini o'zgartirish huquqi yo'q");
  }

  const { bytes, mime } = parseDataUrl(dataUrl);
  if (!ALLOWED.has(mime)) {
    throw new Error("Faqat JPG, PNG yoki WEBP rasm qabul qilinadi");
  }
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error("Rasm 2 MB dan katta bo'lmasin");
  }

  const stored = await evidenceStore.put(bytes, mime);
  await prisma.user.update({
    where: { id: userId },
    data: { avatarRef: stored.storageRef },
  });

  // Avatar bir necha ekranda ko'rinadi — yuklagandan keyin eskisi qolmasin.
  revalidatePath("/staff");
  revalidatePath("/cabinet");
  return { ok: true };
}

export async function removeAvatar(userId: string): Promise<{ ok: true }> {
  const session = await auth();
  if (!session) throw new Error("Avtorizatsiya kerak");

  const actorId = session.user.id as string;
  const actorRole = session.user.role as string;
  if (!canEdit(actorId, actorRole, userId)) {
    throw new Error("Bu xodimning avatarini o'zgartirish huquqi yo'q");
  }

  // Faylning O'ZI o'chirilmaydi: ombor mazmun-adresli, ya'ni bitta faylga
  // bir necha yozuv ishora qilishi mumkin. Havolani uzish yetarli —
  // egasiz fayllarni tozalash alohida, rejali ish.
  await prisma.user.update({ where: { id: userId }, data: { avatarRef: null } });
  revalidatePath("/staff");
  revalidatePath("/cabinet");
  return { ok: true };
}

/**
 * `id → avatarRef` xaritasi. Rasmi yo'q xodim xaritaga TUSHMAYDI.
 *
 * Bayroq (`true/false`) emas, HAVOLANING o'zi qaytadi: `<Avatar>` uni ham
 * "rasm bormi" belgisi, ham kesh versiyasi sifatida ishlatadi — havola
 * mazmun-adresli, ya'ni rasm almashsa u ham o'zgaradi.
 */
export async function getAvatarRefs(userIds: string[]): Promise<Record<string, string>> {
  try {
    const rows = await prisma.user.findMany({
      where: { id: { in: userIds }, avatarRef: { not: null } },
      select: { id: true, avatarRef: true },
    });
    return Object.fromEntries(rows.map((r) => [r.id, r.avatarRef as string]));
  } catch (e) {
    logServerError("avatar.refs", e);
    return {};
  }
}
