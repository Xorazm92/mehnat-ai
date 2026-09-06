-- M5.3 — AI/cron tavsiyalari va ular ustidagi qarorlar.
--
-- QO'LDA yozilgan (AGENTS.md: `prisma migrate dev` ISHLATILMAYDI — u
-- schema'dagi commit qilinmagan modellarni ham "drift" deb hisoblab, bazani
-- qayta tiklashni taklif qiladi).
--
-- Faqat QO'SHADI: yangi jadval + ikkita tashqi kalit. Mavjud ustunga,
-- indeksga yoki ma'lumotga tegmaydi, shuning uchun orqaga qaytarish
-- `DROP TABLE "Recommendation"` bilan cheklanadi.
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "claims" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- Direktor ekrani: doiradagi pendinglar, eng eskisi birinchi.
CREATE INDEX "Recommendation_status_createdAt_idx" ON "Recommendation"("status", "createdAt");
CREATE INDEX "Recommendation_companyId_status_idx" ON "Recommendation"("companyId", "status");
CREATE INDEX "Recommendation_kind_idx" ON "Recommendation"("kind");

-- Firma o'chsa tavsiya ham ketadi: u firmasiz ma'nosiz (payload ichidagi
-- majburiyat ham o'sha firmaniki edi).
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Xodim o'chsa QAROR QOLADI (AuditLog bilan bir xil qoida) — 5-va'da
-- o'lchovi tarixdan hisoblanadi va uni xodim o'chirish buzmasligi kerak.
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_decidedBy_fkey"
    FOREIGN KEY ("decidedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
