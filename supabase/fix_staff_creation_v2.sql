-- =====================================================
-- REFINED FIX: Staff Management & RLS Restoration
-- =====================================================

-- Step 1: Restore the non-recursive security function (just in case)
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_role text;
BEGIN
    SELECT role INTO user_role FROM profiles WHERE id = auth.uid();
    RETURN user_role;
END;
$$;

-- Step 2: Create the RPC function for staff management (Bypass RLS)
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
    -- Check caller role using the security definer function to be safe
    v_caller_role := get_auth_role();
    
    IF v_caller_role != 'super_admin' THEN
        RAISE EXCEPTION 'Faqat Super Adminlar xodimlarni boshqarishi mumkin.';
    END IF;

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

-- Step 3: FIX PROFILES POLICIES (Remove recursion)
DROP POLICY IF EXISTS "Admins direct access" ON profiles;
DROP POLICY IF EXISTS "Profiles self select" ON profiles;
DROP POLICY IF EXISTS "Profiles admin select" ON profiles;
DROP POLICY IF EXISTS "Profiles self update" ON profiles;
DROP POLICY IF EXISTS "Public profiles read" ON profiles;

-- 1. Everyone can see their own profile (Fastest check)
CREATE POLICY "Profiles self select" ON profiles 
FOR SELECT USING (id = auth.uid());

-- 2. Everyone can update their own profile
CREATE POLICY "Profiles self update" ON profiles 
FOR UPDATE USING (id = auth.uid());

-- 3. Admins/Supervisors can see all profiles (Using non-recursive function)
CREATE POLICY "Profiles staff viewing" ON profiles 
FOR SELECT USING (
    get_auth_role() IN ('super_admin', 'manager', 'supervisor', 'chief_accountant')
);

-- 4. Admins can manage all profiles (Full access)
CREATE POLICY "Profiles admin management" ON profiles 
FOR ALL USING (
    get_auth_role() = 'super_admin'
);

-- 5. Public name visibility (Essential for many UI parts)
CREATE POLICY "Profiles public visibility" ON profiles 
FOR SELECT USING (true);

-- Step 4: Employee Salaries Restoration
CREATE TABLE IF NOT EXISTS public.employee_salaries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    month VARCHAR(7) NOT NULL,
    base_salary NUMERIC NOT NULL DEFAULT 0,
    kpi_bonus NUMERIC NOT NULL DEFAULT 0,
    kpi_penalty NUMERIC NOT NULL DEFAULT 0,
    total_salary NUMERIC NOT NULL DEFAULT 0,
    breakdown JSONB,
    is_approved BOOLEAN DEFAULT true,
    approved_by UUID REFERENCES public.profiles(id),
    approved_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(employee_id, month)
);

ALTER TABLE public.employee_salaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all users" ON employee_salaries;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON employee_salaries;
CREATE POLICY "Enable read access for all users" ON employee_salaries FOR SELECT USING (true);
CREATE POLICY "Enable all for authenticated users" ON employee_salaries FOR ALL USING (auth.role() = 'authenticated');

-- Step 5: Ensure Permissions
GRANT EXECUTE ON FUNCTION public.upsert_staff_v1 TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_role TO authenticated;
GRANT ALL ON public.employee_salaries TO authenticated;
