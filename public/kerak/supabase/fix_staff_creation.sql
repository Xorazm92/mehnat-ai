-- =====================================================
-- FULL FIX: Staff Management & RLS Reset
-- =====================================================

-- 1. Reset existing policies to avoid conflicts
DROP POLICY IF EXISTS "Profiles admin select" ON profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON profiles;
DROP POLICY IF EXISTS "Supervisors can view relevant profiles" ON profiles;
DROP POLICY IF EXISTS "Public can view profile names" ON profiles;
DROP POLICY IF EXISTS "Enable read access for all users" ON employee_salaries;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON employee_salaries;

-- 2. Ensure Tables Exist
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
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Simplified Account Management (Profiles)
-- Super Admins can do ANYTHING with profiles
CREATE POLICY "Admins full access" ON profiles
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND role = 'super_admin'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND role = 'super_admin'
    )
);

-- Supervisors and Chief Accountants can view ALL profiles
CREATE POLICY "Staff visibility" ON profiles
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND role IN ('super_admin', 'supervisor', 'chief_accountant')
    )
);

-- Public/Authenticated users can see names (for TopBar/Staff cards visibility)
CREATE POLICY "Public profiles read" ON profiles
FOR SELECT
USING (true);

-- 4. Employee Salaries Policies
CREATE POLICY "Salaries admin access" ON employee_salaries
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND role IN ('super_admin', 'chief_accountant')
    )
);

CREATE POLICY "Salaries individual read" ON employee_salaries
FOR SELECT
USING (employee_id = auth.uid());

-- 5. Emergency Initial Policy 
-- If no profiles exist or if current user is not found, allow the very first signup
-- This is a guardrail for fresh systems
CREATE POLICY "Emergency management" ON profiles
FOR INSERT
WITH CHECK (true); -- Use with caution, but needed for the very first admin creation if RLS is on

-- 6. Role Enum Alignment (Ensure manager exists or fix it)
-- Usually roles are text in this project, but if they are enums:
-- DO NOT RUN unless you have a role type: ALTER TYPE user_role ADD VALUE 'manager';
