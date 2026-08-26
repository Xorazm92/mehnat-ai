// Server-ichki audit yozuvi. ATAYIN "use server" fayli EMAS: server/audit.ts
// dagi eksport public endpoint bo'lib qolar edi va istalgan autentifikatsiyalangan
// foydalanuvchi ixtiyoriy tableName/oldData/newData bilan audit jurnalini
// zaharlashi mumkin edi. Bu modul faqat server kodidan chaqiriladi.
import { prisma } from "@/lib/prisma";
import type { AuditAction, Prisma } from "@prisma/client";
import { logServerError } from "@/lib/logger";
import { clientIpFromHeaders } from "@/lib/rateLimit";

/**
 * So'rov konteksti — IP va brauzer.
 *
 * `AuditLog` sxemasida `ipAddress` va `userAgent` ustunlari BOR, lekin ular
 * hech qachon to'ldirilmagan: `recordAuditLog` ularni yozmasdi, ekran esa
 * bo'sh qiymatni `"0.0.0.0"` bilan almashtirardi. Natijada moliyaviy
 * tizimning audit izida har bir qatorda `0.0.0.0` turadi — ya'ni "kim,
 * qayerdan" savolining yarmi yo'q.
 *
 * `clientIpFromHeaders` allaqachon yozilgan va kirish cheklovida ishlaydi —
 * shu yerda ham o'shani ishlatamiz, ikkinchi nusxa yozmaymiz.
 *
 * `headers()` faqat so'rov doirasida mavjud: bot, cron va skriptlardan
 * chaqirilganda u xato tashlaydi. Shuning uchun butun blok yutiladi —
 * audit yozuvi kontekst yo'qligi sababli YO'QOLMASLIGI kerak.
 */
async function requestContext(): Promise<{ ipAddress?: string; userAgent?: string }> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const ip = clientIpFromHeaders(h);
    const ua = h.get("user-agent") ?? undefined;
    return {
      ipAddress: ip && ip !== "unknown" ? ip : undefined,
      userAgent: ua ? ua.slice(0, 512) : undefined,
    };
  } catch {
    return {};
  }
}

export async function recordAuditLog(data: {
  userId: string | null;
  action: AuditAction;
  tableName: string;
  recordId?: string;
  oldData?: Prisma.InputJsonValue;
  newData?: Prisma.InputJsonValue;
}): Promise<void> {
  const ctx = await requestContext();

  // Audit izi asosiy operatsiyani hech qachon yiqitmasligi kerak.
  await prisma.auditLog
    .create({
      data: {
        userId: data.userId,
        action: data.action,
        tableName: data.tableName,
        recordId: data.recordId,
        oldData: data.oldData,
        newData: data.newData,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      },
    })
    .catch((e) => logServerError("auditTrail.write", e));
}
