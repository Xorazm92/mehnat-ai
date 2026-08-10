-- Vazifa → Majburiyat bog'lami (unifikatsiya: MANBA = Obligation).
-- Ad-hoc topshiriq endi majburiyatning ustidagi qadam bo'la oladi, alohida
-- parallel ish emas. NULL — ichki/mustaqil vazifa (avvalgidek ishlaydi).
--
-- IDEMPOTENT: lokal bazada bu ustun avvalroq `db push` bilan paydo bo'lgan
-- (migratsiya tarixida esa yo'q edi). Toza bazada — oddiy yaratish, drift
-- bo'lgan bazada — jimgina o'tib ketadi. Ikki holatda ham natija bir xil.

ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "obligationId" TEXT;

CREATE INDEX IF NOT EXISTS "Task_obligationId_idx" ON "Task"("obligationId");

-- Majburiyat o'chirilsa vazifa YO'QOLMAYDI, faqat bog'lam uziladi: vazifa
-- tarixi (kim, qachon, nima qildi) audit uchun saqlanishi shart.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Task_obligationId_fkey'
  ) THEN
    ALTER TABLE "Task"
      ADD CONSTRAINT "Task_obligationId_fkey"
      FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
