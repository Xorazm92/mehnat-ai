"use client";

import React, { useState } from "react";
import { User } from "lucide-react";

/**
 * AVATAR — odamning yuzi yoki initsial doirasi.
 *
 * IKKI SHAKL YONMA-YON yashaydi va bu ataylab:
 *   · `userId` berilgan va o'sha xodim rasm yuklagan bo'lsa — rasm;
 *   · aks holda rangli doira ichida ikki harf.
 * Ya'ni rasm yuklash MAJBURIY emas — rasmsiz xodim ro'yxatda bo'sh katak
 * bo'lib qolmaydi. Rasm 404 qaytarsa ham komponent jimgina doiraga qaytadi
 * (`onError`), chunki "avatar yo'q" xato emas, oddiy holat.
 *
 * Bu mantiq `DashboardTopBar`, `StaffModule` va `PayrollTable` da uch marta
 * mustaqil yozilgan edi — har biri o'z rang formulasi bilan. Uchinchi nusxa
 * yozilmasin: kerak bo'lsa bu yerga `size` qo'shing.
 */

export type AvatarSize = "sm" | "md" | "lg" | "xl";

const SIZE: Record<AvatarSize, { box: string; text: string; icon: number }> = {
  sm: { box: "w-6 h-6", text: "text-micro", icon: 12 },
  md: { box: "w-8 h-8", text: "text-meta", icon: 14 },
  lg: { box: "w-9 h-9", text: "text-body", icon: 16 },
  // Profil sarlavhasi — bu yerda avatar bezak emas, sahifaning mavzusi.
  xl: { box: "w-16 h-16", text: "text-2xl", icon: 28 },
};

/**
 * Ismdan BARQAROR rang. Bir xil ism har doim bir xil rang beradi, ya'ni odam
 * ekrandan ekranga ko'chganda uning doirasi o'zgarmaydi.
 *
 * Nega kerak: `User.avatarColor` ning Prisma default'i — `hsl(200, 50%, 50%)`,
 * ya'ni maydon to'ldirilmagan HAMMA odam bir xil ko'k doira oladi va rang
 * hech kimni hech kimdan ajratmaydi. Bu fallback esa ajratadi.
 *
 * Ohang qat'iy: to'yinganlik 45%, yorug'lik 42% — oq matn har burchakda AA
 * kontrastda qoladi. Faqat rang burchagi (hue) o'zgaradi.
 */
function hueFromName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h}, 45%, 42%)`;
}

/** "Aliyev Karim" → "AK". Bo'sh ism `null` qaytaradi — chaqiruvchi ikonka chizadi. */
export function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export interface AvatarProps {
  name: string;
  /** `User.avatarColor`; bo'lmasa ismdan hisoblanadi. */
  color?: string | null;
  /** Xodim `id` si — rasm manzilini yasash uchun. */
  userId?: string | null;
  /**
   * `User.avatarRef` — rasm BOR-YO'QLIGINING yagona belgisi va uning
   * versiyasi. `userId` bilan BIRGA berilgandagina rasm so'raladi.
   *
   * Nega faqat `userId` yetmaydi: u holda rasmsiz xodim uchun ham so'rov
   * ketib, 404 qaytardi — 57 qatorli ro'yxatda 57 ta befoyda so'rov. Endi
   * "rasm yo'q" javobi serverdan emas, chaqiruvchidan ma'lum.
   *
   * Nega versiya kerak: manzil (`/api/avatar/<id>`) rasm almashtirilganda
   * O'ZGARMAYDI, javob esa bir sutkaga keshlanadi — ya'ni yangi rasm
   * qo'ygan odam ertagacha eskisini ko'rardi. Ombor mazmun-adresli, shuning
   * uchun havolaning o'zi versiya bo'lib xizmat qiladi.
   */
  avatarRef?: string | null;
  /** Rasmni to'g'ridan-to'g'ri berish — yuklashdan oldingi ko'rinish uchun. */
  src?: string | null;
  size?: AvatarSize;
  className?: string;
}

/** `disk://2026/09/048effdd…9835.jpg` → `048effdd` — kesh uchun qisqa versiya. */
function versionOf(avatarRef: string): string {
  return (avatarRef.split("/").pop() ?? avatarRef).slice(0, 8);
}

export function Avatar({ name, color, userId, avatarRef, src, size = "md", className = "" }: AvatarProps) {
  const s = SIZE[size];
  const initials = initialsOf(name);
  // Rasm topilmasa (404) yoki buzuq bo'lsa — doiraga qaytamiz. Holat shu
  // yerda saqlanadi, aks holda React har renderda rasmni qayta so'rardi.
  const [failed, setFailed] = useState(false);

  const imageUrl =
    src ?? (userId && avatarRef ? `/api/avatar/${userId}?v=${versionOf(avatarRef)}` : null);
  const base = `${s.box} ${s.text} rounded-full flex items-center justify-center flex-shrink-0 select-none overflow-hidden ${className}`;

  if (imageUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        className={`${base} object-cover`}
        onError={() => setFailed(true)}
        // Ism yonidagi qatorda allaqachon yozilgan — ekran o'quvchi uni ikki
        // marta o'qimasligi uchun rasm bezak sifatida qoladi.
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      className={`${base} font-mono font-bold`}
      style={{ background: color || hueFromName(name), color: "var(--text-white)" }}
      aria-hidden="true"
    >
      {initials || <User size={s.icon} />}
    </span>
  );
}

export default Avatar;
