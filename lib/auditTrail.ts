// Server-ichki audit yozuvi. ATAYIN "use server" fayli EMAS: server/audit.ts
// dagi eksport public endpoint bo'lib qolar edi va istalgan autentifikatsiyalangan
// foydalanuvchi ixtiyoriy tableName/oldData/newData bilan audit jurnalini
// zaharlashi mumkin edi. Bu modul faqat server kodidan chaqiriladi.
import { prisma } from "@/lib/prisma";
import type { AuditAction, Prisma } from "@prisma/client";

export async function recordAuditLog(data: {
  userId: string | null;
  action: AuditAction;
  tableName: string;
  recordId?: string;
  oldData?: Prisma.InputJsonValue;
  newData?: Prisma.InputJsonValue;
}): Promise<void> {
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
      },
    })
    .catch((e) => console.error("[auditTrail] yozuv xatosi:", e));
}
