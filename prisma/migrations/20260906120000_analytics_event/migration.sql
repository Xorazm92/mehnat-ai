-- =====================================================
-- FOYDALANISH O'LCHOVI — AnalyticsEvent (M4.2)
-- =====================================================
--
-- MUAMMO. "Direktor kokpitga haftada necha kun kiradi?" degan savolga javob
-- beradigan hech narsa yo'q edi: na model, na hodisa. Mahsulot va'dasi (P3)
-- aynan shu bilan tekshiriladi, ya'ni o'lchovsiz uni tasdiqlab ham,
-- rad etib ham bo'lmasdi.
--
-- NEGA `AuditLog` GA QO'SHILMADI. Audit jurnali O'ZGARISHNI yozadi va
-- `AuditAction` enumida `read` ATAYLAB yo'q — har ochilgan sahifani unga
-- yozish moliyaviy o'zgarishlarni shovqin ichida ko'mib yuborardi. Ikki
-- savolning saqlash muddati ham boshqa: audit yillar, foydalanish o'lchovi
-- oylar.
--
-- `actorId` NULLABLE + SET NULL — `AuditLog` bilan bir xil qoida: xodim
-- o'chirilsa hodisa QOLADI (haftalik hisob orqaga o'zgarmaydi), faqat egasi
-- uziladi. `actorRole` esa snapshot, ya'ni rol keyin o'zgarsa ham o'sha
-- paytda kim sifatida kirgani saqlanadi.

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- "Shu haftada nechta direktor tashrifi bo'ldi" — asosiy so'rov shakli.
CREATE INDEX "AnalyticsEvent_kind_createdAt_idx" ON "AnalyticsEvent"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_actorId_idx" ON "AnalyticsEvent"("actorId");

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
