"use client";

import React from "react";
import Link from "next/link";
import { Avatar, type AvatarSize } from "./Avatar";

/**
 * IDENTITY CELL — jadval va ro'yxatlardagi "kim bu" katagi.
 *
 * Auditdagi holat: ism + rol juftligi o'nlab joyda qo'lda terilgan —
 * `<span className="block text-xs font-semibold truncate">` + ostiga
 * `text-micro` — har safar boshqa o'lcham, ba'zisida `truncate` unutilgan
 * (uzun firma nomi ustunni cho'zib yuborardi).
 *
 * Bu yerda bitta naqsh: doira + asosiy qator + ikkinchi darajali qator.
 * Ikkala qator ham `truncate` — zich jadvalda kenglik qat'iy.
 */

export interface IdentityCellProps {
  name: string;
  /** Ikkinchi qator: rol, lavozim, STIR — nima kontekstga mos bo'lsa. */
  secondary?: React.ReactNode;
  /** `User.avatarColor`. */
  color?: string | null;
  /** Xodim `id` si — `avatarRef` bilan birga berilsa rasm yuklanadi. */
  userId?: string | null;
  /** `User.avatarRef` — rasm bor-yo'qligi va uning versiyasi. */
  avatarRef?: string | null;
  size?: AvatarSize;
  /** Berilsa butun katak havolaga aylanadi. */
  href?: string;
  className?: string;
}

export function IdentityCell({
  name,
  secondary,
  color,
  userId,
  avatarRef,
  size = "sm",
  href,
  className = "",
}: IdentityCellProps) {
  const body = (
    <>
      <Avatar name={name} color={color} userId={userId} avatarRef={avatarRef} size={size} />
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold truncate" style={{ color: "var(--text-primary)" }}>
          {name}
        </span>
        {secondary != null && secondary !== "" && (
          <span className="block text-micro truncate" style={{ color: "var(--text-muted)" }}>
            {secondary}
          </span>
        )}
      </span>
    </>
  );

  const base = `flex items-center gap-2.5 min-w-0 ${className}`;

  if (!href) return <span className={base}>{body}</span>;
  return (
    <Link href={href} className={`${base} hover:opacity-80`}>
      {body}
    </Link>
  );
}

export default IdentityCell;
