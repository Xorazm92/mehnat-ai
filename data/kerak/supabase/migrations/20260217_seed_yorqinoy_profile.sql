-- Seed profile for Bosh Buxgalter (Yorqinoy)
-- IMPORTANT:
-- 1) Create the user in Supabase Dashboard -> Authentication first (email/password)
-- 2) Then run this migration to upsert the profile row with correct role.

DO $$
DECLARE
  yorqinoy_id UUID;
  yorqinoy_email TEXT;
  similar_emails TEXT;
BEGIN
  -- Get Yorqinoy user id from auth.users (must exist there first!)
  SELECT id, email INTO yorqinoy_id, yorqinoy_email
  FROM auth.users
  WHERE lower(trim(email)) = lower('yorqinoy@asos.uz')
  LIMIT 1;

  IF yorqinoy_id IS NULL THEN
    SELECT COALESCE(string_agg(email, ', '), 'topilmadi') INTO similar_emails
    FROM auth.users
    WHERE lower(email) LIKE '%yorqinoy%';

    RAISE EXCEPTION 'Xatolik: yorqinoy@asos.uz topilmadi. Auth.users ichida oxshashlar: %', similar_emails;
  END IF;

  RAISE NOTICE 'Topildi: % (%)', yorqinoy_id, yorqinoy_email;

  -- Upsert profile
  INSERT INTO public.profiles (id, email, full_name, role, is_active)
  VALUES (yorqinoy_id, 'yorqinoy@asos.uz', 'Yorqinoy', 'chief_accountant', true)
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    is_active = EXCLUDED.is_active;
END $$;
