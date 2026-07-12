import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load directly from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("🛠️ Attempting to drop profiles_id_fkey restriction...");

    // Since we cannot run raw ALTER TABLE through standard anon RPC without a wrapped function, 
    // and the user hasn't successfully run our wrapped functions, we might be stuck.
    // Wait, if we use the REST API, we can't do DDL.

    // Actually, we can just print the exact SQL they need to run to fix BOTH issues:
    const exactSql = `
-- Drop the strict auth dependency so we can create profiles even if Auth is rate-limited
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Ensure our Upsert RPC perfectly casts to public.user_role to fix the 400 Error
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
    SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
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
`;

    console.log("\n==========================================\n");
    console.log(exactSql);
    console.log("\n==========================================\n");
    console.log("👆 You must run the exact SQL above in your Supabase SQL Editor!");
}

run();
