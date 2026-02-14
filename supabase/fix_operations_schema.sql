-- !!! IMPORTANT !!!
-- This file has been split into TWO SEPARATE FILES to fix the PostgreSQL Transaction Error ("unsafe use of new value").

-- Please run these files in order:

-- 1. supabase/migrations/20260214_step1_add_roles.sql
--    (Adds the enum values safely)

-- 2. supabase/migrations/20260214_step2_schema_policies.sql
--    (Updates the table structure and policies)

-- Do NOT run this file. Run the new files instead.
