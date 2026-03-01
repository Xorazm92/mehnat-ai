DO $$
DECLARE
    table_exists boolean;
    profiles_rls boolean;
BEGIN
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'employee_salaries'
    ) INTO table_exists;
    
    RAISE NOTICE 'Table employee_salaries exists: %', table_exists;

    SELECT relrowsecurity INTO profiles_rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'profiles';

    RAISE NOTICE 'Profiles RLS enabled: %', profiles_rls;
END $$;
