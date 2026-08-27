// =====================================================
// FIRMA KIRISH MA'LUMOTLARINI O'QISH QATLAMI
// =====================================================
// Vault (`ClientCredential`) shifrlangan, Company ustunlari esa ochiq matn va
// deprecated. Ro'yxat so'rovlari (`lib/cached-queries.ts`) cache'da yashaydi va
// `auth()` ni chaqira olmaydi, shuning uchun parol ular ICHIDA emas, cache'dan
// KEYIN, foydalanuvchi kim ekani ma'lum bo'lganda qo'shiladi.

import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { isAdminRole } from "@/lib/permissions";
import { BANK_SERVICE } from "@/lib/credentials";

interface BankCredentialCarrier {
  id: string;
  accountantId?: string | null;
  bankClientId?: string | null;
  bankClientLogin?: string | null;
  bankClientPassword?: string | null;
}

/**
 * Faqat ADMIN, yoki AYNAN shu firmaning buxgalteri/bank-klienti — bu
 * `server/companies.ts#canSeeCredentials` (soliq paroli) bilan bir xil qoida.
 */
function canSeeBankCredential(row: BankCredentialCarrier, userId: string, role: string): boolean {
  return isAdminRole(role) || row.accountantId === userId || row.bankClientId === userId;
}

/**
 * `bankClientLogin` / `bankClientPassword` ni vault'dan to'ldiradi.
 * Huquqi yo'q foydalanuvchida ikkalasi ham `null` bo'ladi.
 * Vault'da qator yo'q bo'lsa — hali ko'chirilmagan firma, eski ustun qoladi.
 */
export async function hydrateBankCredentials<T extends BankCredentialCarrier>(
  rows: T[],
  userId: string,
  role: string
): Promise<T[]> {
  const visibleIds = rows.filter((r) => canSeeBankCredential(r, userId, role)).map((r) => r.id);

  const creds = visibleIds.length
    ? await prisma.clientCredential.findMany({
        where: { companyId: { in: visibleIds }, serviceName: BANK_SERVICE },
        orderBy: { updatedAt: "desc" },
        select: { companyId: true, loginId: true, encryptedPassword: true },
      })
    : [];

  const byCompany = new Map<string, (typeof creds)[number]>();
  for (const c of creds) if (!byCompany.has(c.companyId)) byCompany.set(c.companyId, c);

  const visible = new Set(visibleIds);
  return rows.map((r) => {
    if (!visible.has(r.id)) return { ...r, bankClientLogin: null, bankClientPassword: null };
    const c = byCompany.get(r.id);
    if (!c) return r;
    return {
      ...r,
      bankClientLogin: c.loginId || null,
      bankClientPassword: decryptSecret(c.encryptedPassword) || null,
    };
  });
}
