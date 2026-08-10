-- KONSOLIDATSIYA — takrorlanuvchi va hech qachon ishlatilmagan qatlamlarni yig'ishtirish.
--
-- Uch guruh:
--
--  1) ISH YOZUVI BITTA MANBAGA KELDI.
--     `Operation` (yillik/choraklik hisobotlar) — jadval bazada UMUMAN
--     yaratilmagan bo'lsa ham modeli va 13 ta kod refi turgan edi; uning ishini
--     `Obligation` qiladi. `FinancialReport` esa o'zining `deadline` va
--     `assignedTo` ustunlarini yo'qotadi — bitta hisobot ikki xil muddat va
--     ikki xil mas'ul bilan yurmasligi uchun ular endi majburiyatdan o'qiladi
--     (`obligationId`).
--
--  2) IKKINCHI KECHIKISH TIZIMI OLIB TASHLANDI.
--     `SlaPolicy`/`SlaBreach` hech qachon sozlanmagan (0 qator), lekin
--     `Obligation.delayReason` bilan yonma-yon turib "kim kechikdi?" savoliga
--     ikkinchi javob berardi. Vazifadagi SLA soatlari ham shu bilan ketadi.
--
--  3) QOG'OZDA QOLGAN FAZALAR.
--     1C integratsiyasi (Faza B), mijoz portali (Faza F), vaqt/tannarx hisobi,
--     hisob-faktura, firma-darajali majburiyat istisnosi, inventar va hujjat
--     arxivi — hammasi 0 qator. Kod git tarixida qoladi.

-- ── 1) Ish yozuvi ────────────────────────────────────────────
ALTER TABLE "FinancialReport" ADD COLUMN IF NOT EXISTS "obligationId" TEXT;
CREATE INDEX IF NOT EXISTS "FinancialReport_obligationId_idx" ON "FinancialReport"("obligationId");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FinancialReport_obligationId_fkey') THEN
    ALTER TABLE "FinancialReport"
      ADD CONSTRAINT "FinancialReport_obligationId_fkey"
      FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Mavjud qatorlarda muddat/mas'ul YO'QOLMASIN: ustunlar tushishidan oldin ular
-- hujjatning o'z `data` maydoniga ko'chiriladi. Bu qiymatlar endi ish holatini
-- boshqarmaydi (uni majburiyat boshqaradi), lekin tarix sifatida o'qiladi —
-- ma'lumotni indamay o'chirish mumkin emas.
UPDATE "FinancialReport"
SET "data" = jsonb_set(
      COALESCE("data", '{}'::jsonb),
      '{legacy}',
      jsonb_build_object(
        'deadline', to_jsonb("deadline"),
        'assignedTo', to_jsonb("assignedTo"),
        'note', to_jsonb('obligationId bog''lanishidan oldingi qiymatlar'::text)
      )
    )
WHERE "deadline" IS NOT NULL OR "assignedTo" IS NOT NULL;

ALTER TABLE "FinancialReport" DROP COLUMN IF EXISTS "deadline";
ALTER TABLE "FinancialReport" DROP COLUMN IF EXISTS "assignedTo";

DROP TABLE IF EXISTS "Operation";
DROP TYPE IF EXISTS "ReportStatus";

-- ── 2) SLA qatlami ───────────────────────────────────────────
ALTER TABLE "Task" DROP COLUMN IF EXISTS "slaPolicyId";
ALTER TABLE "Task" DROP COLUMN IF EXISTS "responseDueAt";
ALTER TABLE "Task" DROP COLUMN IF EXISTS "resolutionDueAt";
ALTER TABLE "Task" DROP COLUMN IF EXISTS "firstResponseAt";

DROP TABLE IF EXISTS "SlaBreach" CASCADE;
DROP TABLE IF EXISTS "SlaPolicy" CASCADE;
DROP TYPE IF EXISTS "SlaBreachType";

-- ── 3) Ishlatilmagan fazalar ─────────────────────────────────
-- 1C integratsiyasi. CASCADE ataylab: bu jadvallar bir-biriga tashqi kalit
-- bilan bog'langan (IntegrationEvent → SyncRun → OneCConnection), ya'ni ular
-- BIRGA yashaydi va birga ketadi. Tashqarida ularga bog'langan hech nima yo'q.
DROP TABLE IF EXISTS "SyncError" CASCADE;
DROP TABLE IF EXISTS "IntegrationEvent" CASCADE;
DROP TABLE IF EXISTS "SyncRun" CASCADE;
DROP TABLE IF EXISTS "OneCCompanyMapping" CASCADE;
DROP TABLE IF EXISTS "OneCConnection" CASCADE;
DROP TYPE IF EXISTS "IntegrationEventStatus";
DROP TYPE IF EXISTS "SyncRunStatus";

-- Mijoz portali
DROP TABLE IF EXISTS "ClientRequest" CASCADE;
DROP TABLE IF EXISTS "ClientUser" CASCADE;

-- Vaqt va tannarx
DROP TABLE IF EXISTS "TimeEntry";
DROP TABLE IF EXISTS "EmployeeCostRate";
DROP TYPE IF EXISTS "TimeSource";

-- Hisob-faktura (qarzdorlik `Contract` + `DebtSnapshot` dan hisoblanadi)
DROP TABLE IF EXISTS "Invoice";
DROP TYPE IF EXISTS "InvoiceStatus";

-- Firma-darajali majburiyat istisnosi (UI'ga hech qachon ulanmagan)
DROP TABLE IF EXISTS "CompanyObligationOverride";

-- Inventar va hujjat arxivi
DROP TABLE IF EXISTS "InventoryItem";
DROP TABLE IF EXISTS "Document";
