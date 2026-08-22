-- QARZDORLIK KESIMIDA FIRMA HAM KALITNING BIR QISMI
--
-- Unikal kalit `(asOf, rawCustomer, rawContract)` edi. 1C hisobotida esa
-- bitta mijozning AYNAN BIR XIL "Без договора" qatori IKKI MARTA uchraydi —
-- har biri boshqa firmamiz nomidan:
--
--   "Siddiq Biznes Group" Mchj / Без договора / "Sardorbek House" Mchj → 10 000 000
--   "Siddiq Biznes Group" Mchj / Без договора / Plastik               →  1 000 000
--
-- Upsert ularni bitta qatorga birlashtirib, 1 000 000 so'mni jimgina
-- yo'qotardi. Firma nomi shartnomasiz qoldiqni ajratadigan YAGONA belgi,
-- shuning uchun u kalitga kiradi.
--
-- `ownFirmName` NULL bo'lsa Postgres qatorlarni farqli deb hisoblaydi va
-- kalit umuman ishlamaydi — shuning uchun import bo'sh satr yozadi
-- (`scripts/import-debt-snapshot.ts`), NULL emas.

UPDATE "DebtSnapshot" SET "ownFirmName" = '' WHERE "ownFirmName" IS NULL;

DROP INDEX IF EXISTS "DebtSnapshot_asOf_rawCustomer_rawContract_key";

CREATE UNIQUE INDEX IF NOT EXISTS "DebtSnapshot_asOf_rawCustomer_rawContract_ownFirmName_key"
  ON "DebtSnapshot"("asOf", "rawCustomer", "rawContract", "ownFirmName");
