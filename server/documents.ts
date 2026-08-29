"use server";

// =====================================================
// FIRMA HUJJATLARI ARXIVI
// =====================================================
//
// Fayl base64 holida bazada saqlanadi (`ReportProof` bilan bir xil usul).
// RO'YXAT SO'ROVI `fileData` NI HECH QACHON TANLAMAYDI: bitta 5 MB lik
// shartnoma skani ro'yxatga qo'shilsa, o'nta hujjatli firma kartochkasi
// 50 MB javob qaytarardi. Fayl faqat `/api/documents/[id]/file` orqali,
// bitta-bittadan beriladi.

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { assertCompanyPermission } from "@/lib/platform/access";
import { isSeniorRole } from "@/lib/platform/permissions";
import { serialize } from "@/lib/serialize";
import { recordAuditLog } from "@/lib/platform/auditTrail";
import { updateTag } from "next/cache";

const DOCUMENT_TYPES = [
  "shartnoma",
  "akt",
  "litsenziya",
  "guvohnoma",
  "pasport",
  "boshqa",
] as const;

// 5 MB — `ReportProof` dagi 2 MB dan kattaroq, chunki bu yerda skrinshot
// emas, ko'p sahifali shartnoma skani turadi. Cheksiz qoldirilsa baza
// zaxirasi (`scripts/backup.sh`) boshqarib bo'lmas darajada shishardi.
const FILE_MAX_BYTES = 5 * 1024 * 1024;

const FILE_ALLOWED = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

function assertFile(fileData: string, fileType: string) {
  if (!fileData || !fileData.startsWith("data:")) throw new Error("Fayl formati noto'g'ri");
  if (!FILE_ALLOWED.includes(fileType)) {
    throw new Error("Faqat PDF, Word, Excel yoki rasm yuklash mumkin");
  }
  if (fileData.length > FILE_MAX_BYTES) {
    const mb = (fileData.length / 1024 / 1024).toFixed(1);
    throw new Error(`Fayl juda katta (${mb} MB). Chegara — 5 MB.`);
  }
}

async function sessionFor(companyId: string, permission: "company:read" | "company:update") {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  await assertCompanyPermission(
    prisma,
    { id: session.user.id as string, role: session.user.role as string },
    companyId,
    permission
  );
  return session;
}

export async function listDocuments(companyId: string) {
  await sessionFor(companyId, "company:read");
  return serialize(
    await prisma.document.findMany({
      where: { companyId, deletedAt: null },
      // fileData ATAYLAB yo'q — yuqoridagi izohga qarang.
      select: {
        id: true,
        docType: true,
        title: true,
        note: true,
        fileName: true,
        fileType: true,
        fileSize: true,
        issuedAt: true,
        expiresAt: true,
        uploadedByName: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }],
    })
  );
}

export async function uploadDocument(input: {
  companyId: string;
  docType: string;
  title: string;
  note?: string | null;
  fileData: string;
  fileName: string;
  fileType: string;
  issuedAt?: string | null;
  expiresAt?: string | null;
}) {
  const session = await sessionFor(input.companyId, "company:update");

  const title = input.title.trim();
  if (!title) throw new Error("Hujjat nomi bo'sh bo'lmasin");
  if (!DOCUMENT_TYPES.includes(input.docType as (typeof DOCUMENT_TYPES)[number])) {
    throw new Error("Hujjat turi noto'g'ri");
  }
  assertFile(input.fileData, input.fileType);

  // base64 uzunligidan haqiqiy o'lchamni chiqarish — ro'yxatda ko'rsatish
  // uchun. Taxminiy: har 4 belgi 3 baytga to'g'ri keladi.
  const comma = input.fileData.indexOf(",");
  const b64 = comma >= 0 ? input.fileData.slice(comma + 1) : "";
  const fileSize = Math.floor((b64.length * 3) / 4);

  const created = await prisma.document.create({
    data: {
      companyId: input.companyId,
      docType: input.docType,
      title,
      note: input.note?.trim() || null,
      fileData: input.fileData,
      fileName: input.fileName.slice(0, 200),
      fileType: input.fileType,
      fileSize,
      issuedAt: input.issuedAt ? new Date(input.issuedAt) : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      uploadedById: session.user.id as string,
      uploadedByName: (session.user.name as string) ?? null,
    },
    select: { id: true, title: true, docType: true },
  });

  await recordAuditLog({
    userId: session.user.id as string,
    action: "create",
    tableName: "Document",
    recordId: created.id,
    newData: { companyId: input.companyId, title, docType: input.docType, fileSize },
  });

  updateTag("companies");
  return serialize(created);
}

/**
 * Yumshoq o'chirish. Jismonan o'chirilmaydi — shartnoma skani xato bilan
 * o'chirilsa uni qaytarib bo'lmasdi.
 */
export async function deleteDocument(id: string, reason?: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const doc = await prisma.document.findUnique({
    where: { id },
    select: { id: true, companyId: true, title: true, deletedAt: true },
  });
  if (!doc) throw new Error("Hujjat topilmadi");
  if (doc.deletedAt) return serialize(doc);

  await assertCompanyPermission(
    prisma,
    { id: session.user.id as string, role: session.user.role as string },
    doc.companyId,
    "company:update"
  );
  if (!isSeniorRole(session.user.role as string)) {
    throw new Error("Hujjatni faqat rahbariyat o'chira oladi");
  }

  const updated = await prisma.document.update({
    where: { id },
    data: { deletedAt: new Date(), deletedBy: session.user.id as string },
    select: { id: true, title: true },
  });

  await recordAuditLog({
    userId: session.user.id as string,
    action: "delete",
    tableName: "Document",
    recordId: id,
    oldData: { title: doc.title, companyId: doc.companyId, reason: reason ?? null },
  });

  updateTag("companies");
  return serialize(updated);
}

export interface ExpiringDocument {
  id: string;
  companyId: string;
  companyName: string;
  title: string;
  docType: string;
  expiresAt: string;
  daysLeft: number;
}

/**
 * Muddati tugayotgan hujjatlar (litsenziya, guvohnoma).
 *
 * Bu — arxivning "bo'sh ekran" bo'lmasligini ta'minlaydigan qism: hujjat
 * shunchaki yotmaydi, muddati yaqinlashganda o'zi ko'rinadi. Muddati
 * ALLAQACHON o'tganlar ham qaytariladi (`daysLeft` manfiy) — ular eng
 * shoshilinch holat, ro'yxatdan tushib qolmasligi kerak.
 */
export async function getExpiringDocuments(withinDays = 60): Promise<ExpiringDocument[]> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const now = new Date();
  const until = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);

  const rows = await prisma.document.findMany({
    where: {
      deletedAt: null,
      expiresAt: { not: null, lte: until },
      company: { isActive: true },
    },
    select: {
      id: true,
      companyId: true,
      docType: true,
      title: true,
      expiresAt: true,
      company: { select: { name: true } },
    },
    orderBy: { expiresAt: "asc" },
    take: 100,
  });

  return rows.map((r) => ({
    id: r.id,
    companyId: r.companyId,
    companyName: r.company.name,
    title: r.title,
    docType: r.docType,
    expiresAt: r.expiresAt!.toISOString(),
    daysLeft: Math.ceil((r.expiresAt!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
  }));
}
