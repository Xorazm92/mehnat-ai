-- =====================================================
-- Payout.channelId — oylik QAYSI kassadan berildi
-- =====================================================
--
-- NEGA. Oylik allaqachon kassa chiqimi (`lib/balance.ts` uni `Payout` dan
-- sanaydi), lekin PUL QAYSI HISOBDAN chiqqani hech qayerda yozilmasdi:
-- `createPayout` jurnalga kanalsiz CASH oyog'i yozardi. Natijada
-- `getCashDeskReport` har bir oylik to'lovini "Kanali ko'rsatilmagan"
-- qatoriga qo'yardi — ya'ni "qaysi manbadan qaysi xodimga berildi" savolining
-- birinchi yarmiga tizimda javob yo'q edi.
--
-- Xodim tomoni (`employeeId`) boshidan bor; endi manba tomoni ham yoziladi
-- va jurnal CASH oyog'i shu kanal bilan tushadi.
--
-- MA'LUMOTGA TEGILMAYDI. Ustun NULL bo'lib qo'shiladi: mavjud to'lovlar
-- o'z holicha o'qiladi va kassalar jadvalida hozirgidek "kanalsiz" qatorda
-- qoladi. Ularni bog'lash — alohida, qaytariladigan qadam:
--   npx tsx scripts/backfill-payout-channel.ts          (DRY-RUN)
--   npx tsx scripts/backfill-payout-channel.ts --apply
--
-- ORQAGA QAYTARISH:
--   DROP INDEX "Payout_channelId_idx";
--   ALTER TABLE "Payout" DROP COLUMN "channelId";

-- AlterTable
ALTER TABLE "Payout" ADD COLUMN "channelId" TEXT;

-- CreateIndex
CREATE INDEX "Payout_channelId_idx" ON "Payout"("channelId");
