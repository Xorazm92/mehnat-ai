-- =========================================================================
-- FINAL FIX FOR STAFF CREATION 
-- 1) Drops the blocking Foreign Key constraint (profiles_id_fkey)
-- 2) Recreates the upsert_staff_v1 RPC with perfect user_role type casting
-- =========================================================================

-- Step 1: Drop the Strict Foreign Key
-- This allows us to save staff members even if Supabase Auth blocks signup (Rate Limit)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Step 2: Ensure upsert_staff_v1 natively handles Enum string casting
CREATE OR REPLACE FUNCTION public.upsert_staff_v1(
    p_id UUID,
    p_email TEXT,
    p_full_name TEXT,
    p_role TEXT,
    p_avatar_color TEXT,
    p_phone TEXT,
    p_is_active BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
BEGIN
    -- Check caller role
    SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
    IF v_caller_role != 'super_admin' THEN
        RAISE EXCEPTION 'Faqat Super Adminlar xodimlarni boshqarishi mumkin.';
    END IF;

    -- Upsert without failing on the text-to-enum role comparison
    INSERT INTO public.profiles (
        id, email, full_name, role, avatar_color, phone, is_active
    )
    VALUES (
        p_id, p_email, p_full_name, p_role::public.user_role, p_avatar_color, p_phone, p_is_active
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        avatar_color = EXCLUDED.avatar_color,
        phone = EXCLUDED.phone,
        is_active = EXCLUDED.is_active;
END;
$$;
