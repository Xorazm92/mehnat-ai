-- MIGRATION STEP 1: Add missing roles to user_role enum
-- Run this file FIRST and ensure it completes successfully.

-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction block with other statements using the new value.
-- We isolate these commands here.

DO $$
BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin';
EXCEPTION
  WHEN duplicate_object THEN null; -- Ignore if exists
END $$;

DO $$
BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'supervisor';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$
BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'bank_manager';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
