import type { PrismaClient } from "@prisma/client";
import { phoneKey, sameNumber, formatPhone } from "../../../../lib/phone";
import { bindTelegramToUser, type LinkUserResult } from "./link-user";

export interface LinkByPhoneInput {
  telegramUserId: bigint;
  telegramUsername?: string | null;
  /** As Telegram sent it: "+998901234567" or "998901234567". */
  phone: string;
  /** From `parseContact` — false when a third party's card was forwarded. */
  isOwnContact: boolean;
}

export type LinkByPhoneReason =
  | "not_own_contact"
  | "unusable_phone"
  | "not_found"
  | "ambiguous"
  | "inactive";

export interface LinkByPhoneResult extends LinkUserResult {
  /** Set only on failure — lets the caller offer the right fallback. */
  reason?: LinkByPhoneReason;
}

/**
 * One-tap onboarding: the employee shares their own contact and the bot finds
 * their record by phone number. No email, no PINFL, no typing.
 *
 * Two guards make this safe enough to be self-service:
 *  - the contact must BE the sender (Telegram sets `user_id` only then), so you
 *    cannot claim a colleague's record by forwarding their card;
 *  - an ambiguous number (2+ employees) is refused rather than guessed — with
 *    `phoneNormalized` deliberately non-unique, duplicates are possible.
 */
export async function linkTelegramByPhone(
  prisma: PrismaClient,
  input: LinkByPhoneInput,
): Promise<LinkByPhoneResult> {
  if (!input.isOwnContact) {
    return {
      ok: false,
      reason: "not_own_contact",
      message:
        "Faqat o'zingizning raqamingizni yuborishingiz mumkin. \"📱 Raqamni yuborish\" tugmasidan foydalaning.",
    };
  }

  const key = phoneKey(input.phone);
  if (key == null) {
    return {
      ok: false,
      reason: "unusable_phone",
      message: "Raqamni o'qib bo'lmadi. Administrator bilan bog'laning.",
    };
  }

  const candidates = await prisma.user.findMany({
    where: { phoneNormalized: key },
    select: { id: true, fullName: true, telegramUserId: true, phone: true, isActive: true },
  });

  // The index key is only the last 9 digits; confirm the full numbers agree so
  // a foreign number sharing that tail cannot match.
  const matches = candidates.filter((u) => sameNumber(u.phone, input.phone));
  const active = matches.filter((u) => u.isActive);

  if (matches.length === 0) {
    return {
      ok: false,
      reason: "not_found",
      message:
        `${formatPhone(input.phone)} raqami bo'yicha xodim topilmadi.\n` +
        "Administrator kartochkangizga bu raqamni kiritishi kerak.",
    };
  }
  if (active.length === 0) {
    return {
      ok: false,
      reason: "inactive",
      message: "Kartochkangiz faol emas. Administrator bilan bog'laning.",
    };
  }
  if (active.length > 1) {
    return {
      ok: false,
      reason: "ambiguous",
      message:
        "Bu raqam bir nechta xodimga biriktirilgan. Administrator bilan bog'laning.",
    };
  }

  return bindTelegramToUser(prisma, active[0], {
    telegramUserId: input.telegramUserId,
    telegramUsername: input.telegramUsername ?? null,
    byUserId: null,
    // Self-service: never take over a record already bound to someone else.
    requireUnlinkedTarget: true,
    label: formatPhone(input.phone),
  });
}
