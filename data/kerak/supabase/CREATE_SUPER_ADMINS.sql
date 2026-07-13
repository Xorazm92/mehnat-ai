-- CREATE_SUPER_ADMINS.sql
-- URGENT: Create these users in the "Authentication" tab of Supabase FIRST.
-- Then run this script to grant them full access.

DO $$
DECLARE
    gozaloy_id UUID;
    muslimbek_id UUID;
    musobek_id UUID;
BEGIN
    -- 1. Get IDs from auth.users (Must exist there first!)
    SELECT id INTO gozaloy_id FROM auth.users WHERE email = 'gozaloy@asos.uz';
    IF gozaloy_id IS NULL THEN RAISE EXCEPTION 'Xatolik: gozaloy@asos.uz topilmadi. Avval uni "Authentication" bo''limida yarating!'; END IF;
    
    SELECT id INTO muslimbek_id FROM auth.users WHERE email = 'muslimbek@asos.uz';
    IF muslimbek_id IS NULL THEN RAISE EXCEPTION 'Xatolik: muslimbek@asos.uz topilmadi. Avval uni "Authentication" bo''limida yarating!'; END IF;

    SELECT id INTO musobek_id FROM auth.users WHERE email = 'musobek@asos.uz';
    IF musobek_id IS NULL THEN RAISE EXCEPTION 'Xatolik: musobek@asos.uz topilmadi. Avval uni "Authentication" bo''limida yarating!'; END IF;

    -- 2. Update/Insert Profiles
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (gozaloy_id, 'gozaloy@asos.uz', 'Go''zaloy', 'super_admin')
    ON CONFLICT (id) DO UPDATE SET role = 'super_admin';

    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (muslimbek_id, 'muslimbek@asos.uz', 'Muslimbek', 'super_admin')
    ON CONFLICT (id) DO UPDATE SET role = 'super_admin';

    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (musobek_id, 'musobek@asos.uz', 'Musobek', 'super_admin')
    ON CONFLICT (id) DO UPDATE SET role = 'super_admin';

    -- 3. Update Staff table
    INSERT INTO public.staff (id, name, role, email)
    VALUES (gozaloy_id, 'Go''zaloy', 'supervisor', 'gozaloy@asos.uz')
    ON CONFLICT (id) DO UPDATE SET role = 'supervisor';

    INSERT INTO public.staff (id, name, role, email)
    VALUES (muslimbek_id, 'Muslimbek', 'supervisor', 'muslimbek@asos.uz')
    ON CONFLICT (id) DO UPDATE SET role = 'supervisor';

    INSERT INTO public.staff (id, name, role, email)
    VALUES (musobek_id, 'Musobek', 'supervisor', 'musobek@asos.uz')
    ON CONFLICT (id) DO UPDATE SET role = 'supervisor';

    RAISE NOTICE 'Muvaffaqiyatli: Go''zaloy, Muslimbek va Musobeklarga Full Access berildi!';
END $$;
