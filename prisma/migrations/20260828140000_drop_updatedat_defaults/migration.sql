-- `updatedAt` ustunidagi DEFAULT ni olib tashlaydi.
--
-- Qo'lda yozilgan migratsiyalarda (service_catalog, documents, pos_sverka,
-- invoices) `updatedAt` ga `DEFAULT CURRENT_TIMESTAMP` qo'shilgan edi.
-- `schema.prisma` da bu ustun `@updatedAt` bilan belgilangan va DEFAULT
-- kutilmaydi — natijada baza schema'dan farq qilib, `scripts/preflight.ts`
-- deploy'ni to'xtatardi. Qiymatni Prisma har yozuvda o'zi beradi, ya'ni
-- DEFAULT olib tashlanishi xatti-harakatni o'zgartirmaydi.
ALTER TABLE "CompanyService" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Document" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "FiscalDailyReport" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "FiscalDevice" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Invoice" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "PosSettlement" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "PosTerminal" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Service" ALTER COLUMN "updatedAt" DROP DEFAULT;
