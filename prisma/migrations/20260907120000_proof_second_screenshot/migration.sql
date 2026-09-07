-- =====================================================
-- ReportProof.imageRef2 — bir katakka ikkinchi skrinshot
-- =====================================================
--
-- NEGA. `my_mehnat` katagi ikki ekran bilan tasdiqlanadi (buxgalteriya
-- bo'limi talabi), lekin dalil yozuvida bitta rasm havolasi bor edi. Ikkinchi
-- rasmni "hujjat fayli" (`fileRef`) slotiga qo'yish yechim emas: u ixtiyoriy
-- va qayta topshirishda TOZALANADI, ya'ni majburiy dalil jimgina yo'qolardi.
--
-- Ustunlar ro'yxati kodda: `lib/reportColumns.ts` → `PROOF_SCREENS`.
--
-- MA'LUMOTGA TEGILMAYDI. Yangi ustun NULL bo'lib qo'shiladi; mavjud dalillar
-- (bitta skrinshotli) o'z holicha o'qiladi.
--
-- ORQAGA QAYTARISH:
--   ALTER TABLE "ReportProof" DROP COLUMN "imageRef2";

-- AlterTable
ALTER TABLE "ReportProof" ADD COLUMN "imageRef2" TEXT;
