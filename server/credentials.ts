"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { assertCompanyPermission } from "@/lib/platform/access";
import { serialize } from "@/lib/serialize";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { PRIMARY_SERVICE } from "@/lib/credentials";

// =====================================================
// CLIENT CREDENTIALS (Soliq/Didox/Bank kirish ma'lumotlari)
// Parollar bazada AES-256-GCM bilan shifrlanadi (lib/crypto.ts).
// =====================================================

// Firma parollariga kirish huquqi: ADMIN, yoki aynan shu firmaning
// buxgalteri/bank-klienti. Nazoratchi va bosh buxgalter parol bilan ishlamaydi.
/**
 * Firma kirish ma'lumotlariga (soliq.uz paroli va h.k.) ruxsat.
 *
 * Ilgari bu yerda ALOHIDA scope qoidasi bor edi va u faqat `accountantId`
 * bilan `bankClientId` ni tekshirardi. Natijada:
 *   - nazoratchi va bosh buxgalter O'Z firmasining parolini ko'ra olmasdi;
 *   - "Jamoa" tabidan (`ContractAssignment`) biriktirilgan xodim ham;
 *   - va tizimda ikkita bir-biridan ajralib ketadigan scope qoidasi qolgandi.
 *
 * Endi yagona manba — `lib/access.ts` `assertCompanyPermission`, u oltita
 * biriktiruv yo'lini ham qamraydi.
 */
async function assertCompanyAccess(companyId: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  await assertCompanyPermission(
    prisma,
    { id: session.user.id, role: session.user.role as string },
    companyId,
    "company:credentials"
  );
  return session;
}

export async function getClientCredentials(companyId: string) {
  await assertCompanyAccess(companyId);

  const rows = await prisma.clientCredential.findMany({
    where: { companyId },
    orderBy: { updatedAt: "desc" },
  });

  // Ko'rish huquqi bor foydalanuvchiga parol ochiq qaytadi (UI "ko'z" tugmasi uchun)
  return serialize(
    rows.map((r) => ({ ...r, encryptedPassword: decryptSecret(r.encryptedPassword) }))
  );
}

export async function createClientCredential(data: {
  companyId: string;
  serviceName: string;
  loginId: string;
  password?: string;
  notes?: string;
}) {
  const session = await assertCompanyAccess(data.companyId);

  if (!data.serviceName?.trim() || !data.loginId?.trim()) {
    throw new Error("Xizmat nomi va login kiritilishi shart");
  }

  const row = await prisma.clientCredential.create({
    data: {
      companyId: data.companyId,
      serviceName: data.serviceName.trim(),
      loginId: data.loginId.trim(),
      encryptedPassword: data.password ? encryptSecret(data.password) : "",
      notes: data.notes || null,
      updatedBy: session.user.id,
    },
  });

  return serialize({ ...row, encryptedPassword: data.password ?? "" });
}

// =====================================================
// ASOSIY (soliq.uz) CREDENTIAL
// =====================================================
// Tarixan bu firma kirish ma'lumoti `Company.login` / `Company.password`
// ustunlarida OCHIQ MATNDA yotardi va `getCompanies()` uni har bir
// foydalanuvchi brauzeriga yuborardi. Endi u boshqa har qanday mijoz
// credential'i kabi shifrlangan vault'da (`ClientCredential`) saqlanadi —
// `PRIMARY_SERVICE` (lib/credentials.ts) nomi bilan ajratiladi.

/**
 * Firmaning asosiy soliq.uz credential'ini o'rnatadi (upsert).
 * `(companyId, serviceName)` bo'yicha unique cheklov YO'Q (tarixiy dublikatlar
 * bo'lishi mumkin), shuning uchun eng oxirgi qatorni yangilaymiz.
 */
export async function setPrimaryCredential(companyId: string, login: string, password: string) {
  return setServiceCredential(companyId, PRIMARY_SERVICE, login, password);
}

/**
 * Ixtiyoriy xizmat uchun credential upsert (soliq, bank_client, ...).
 * `setPrimaryCredential` shuning ustidagi nom — soliq uchun.
 */
export async function setServiceCredential(
  companyId: string,
  serviceName: string,
  login: string,
  password: string
) {
  const session = await assertCompanyAccess(companyId);

  const existing = await prisma.clientCredential.findFirst({
    where: { companyId, serviceName },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  const data = {
    loginId: login.trim(),
    encryptedPassword: password ? encryptSecret(password) : "",
    updatedBy: session.user.id,
  };

  const row = existing
    ? await prisma.clientCredential.update({ where: { id: existing.id }, data })
    : await prisma.clientCredential.create({
        data: { companyId, serviceName, notes: null, ...data },
      });

  return serialize({ ...row, encryptedPassword: password ?? "" });
}

export async function deleteClientCredential(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const row = await prisma.clientCredential.findUnique({
    where: { id },
    select: { companyId: true },
  });
  if (!row) throw new Error("Ma'lumot topilmadi");

  await assertCompanyAccess(row.companyId);
  await prisma.clientCredential.delete({ where: { id } });
  return { ok: true };
}
