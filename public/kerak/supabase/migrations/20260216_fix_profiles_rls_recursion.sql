-- Fix infinite recursion in profiles RLS policies by avoiding self-referential SELECTs

-- 1) Helper function to check current user's role without triggering RLS recursion
--    SECURITY DEFINER allows the function to read profiles while bypassing RLS.
CREATE OR REPLACE FUNCTION public.has_role(required_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role::text = ANY(required_roles)
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_role(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(text[]) TO anon;

-- 2) Replace profiles policies that self-query profiles (causes 42P17 recursion)
DROP POLICY IF EXISTS "Admins and managers can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins and supervisors can view all profiles" ON public.profiles;

CREATE POLICY "Admins and supervisors can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.has_role(ARRAY['super_admin','chief_accountant']));

-- INSERT policy: avoid selecting from profiles
DROP POLICY IF EXISTS "Only super admins can insert profiles" ON public.profiles;
CREATE POLICY "Only super admins can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (public.has_role(ARRAY['super_admin']));

-- DELETE policy: avoid selecting from profiles
DROP POLICY IF EXISTS "Only super admins can delete profiles" ON public.profiles;
CREATE POLICY "Only super admins can delete profiles"
  ON public.profiles FOR DELETE
  USING (public.has_role(ARRAY['super_admin']));
