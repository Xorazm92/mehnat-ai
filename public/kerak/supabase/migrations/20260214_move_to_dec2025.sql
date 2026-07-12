
-- Migration: Safely move all existing monthly reports to "2025 Dekabr"
-- This version handles the "duplicate key" error by prioritizing the most recent data.

-- 1. Remove ANY existing records for '2025 Dekabr' to make room for the "moved" data.
DELETE FROM company_monthly_reports
WHERE period = '2025 Dekabr';

-- 2. If a company has data in MULTIPLE other periods (e.g., 2026 Yillik AND 2025 Q4),
-- we must keep only ONE and delete others to avoid unique constraint violations
-- when moving them all to the same period. We'll keep the most recently updated one.
WITH ranked_reports AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY updated_at DESC) as rn
  FROM company_monthly_reports
)
DELETE FROM company_monthly_reports
WHERE id IN (SELECT id FROM ranked_reports WHERE rn > 1);

-- 3. Now move everything to '2025 Dekabr'
UPDATE company_monthly_reports
SET period = '2025 Dekabr'
WHERE period != '2025 Dekabr';
