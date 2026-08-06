-- Firma murakkabligi — KPI hajmini normallashtirish uchun (lib/fairKpi.ts).
-- "Raqamli egizak" (twin) ballari shu og'irlikka tayanadi.
DO $$ BEGIN
  CREATE TYPE "CompanyComplexity" AS ENUM ('simple', 'standard', 'complex', 'enterprise');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "complexity" "CompanyComplexity" NOT NULL DEFAULT 'standard';
