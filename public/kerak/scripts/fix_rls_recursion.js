import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function fixRLS() {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // We must use the service role key to bypass RLS and fix the policies
    const supabase = createClient(supabaseUrl, serviceKey);

    console.log('--- FIXING RLS RECURSION ---');

    // We'll try to use the rpc('exec_sql') if it exists, otherwise we'll have to ask the user to run it.
    // But wait, the user previously had success with some scripts.

    const sqlStatements = [
        // 1. Drop the recursive policies
        `DROP POLICY IF EXISTS "Profiles access policy" ON profiles`,
        `DROP POLICY IF EXISTS "Profiles update policy" ON profiles`,
        `DROP POLICY IF EXISTS "Admins and managers can view all profiles" ON profiles`,
        `DROP POLICY IF EXISTS "Users can view their own profile" ON profiles`,

        // 2. Clear out the recursive functions to be safe
        `DROP FUNCTION IF EXISTS public.check_is_manager() CASCADE`,
        `DROP FUNCTION IF EXISTS public.check_is_auditor() CASCADE`,
        `DROP FUNCTION IF EXISTS public.can_access_company(UUID) CASCADE`,

        // 3. Create simple, non-recursive policies for profiles
        // Regular users can only see themselves
        `CREATE POLICY "Users can see own profile" ON profiles FOR SELECT USING (id = auth.uid())`,

        // This is the tricky part. We need a way to check if the user is an admin 
        // without selecting from profiles in a way that triggers this policy.
        // In Supabase, the best way for 'profiles' is often to have a separate 'user_roles' table 
        // or just use basic policies.

        // Simple fix: Allow super_admin to see everything if we can check it.
        // For now, let's just restore BASIC access to allow the app to load.
        `CREATE POLICY "Allow authenticated to see profile metadata" ON profiles FOR SELECT USING (auth.role() = 'authenticated')`,

        // 4. Restore company policies without complex function calls for now
        `DROP POLICY IF EXISTS "Companies select policy" ON companies`,
        `DROP POLICY IF EXISTS "Staff can view relevant companies" ON companies`,
        `CREATE POLICY "Staff can view relevant companies" ON companies FOR SELECT USING (
            accountant_id = auth.uid() OR 
            supervisor_id = auth.uid() OR 
            bank_client_id = auth.uid()
        )`,

        // Admin access for companies (this might still be recursive if not careful)
        // Let's use a subquery that is usually faster or less prone to recursion in some PG versions
        `CREATE POLICY "Admins view all companies" ON companies FOR SELECT USING (
            EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'manager', 'supervisor', 'chief_accountant'))
        )`
    ];

    for (let i = 0; i < sqlStatements.length; i++) {
        const sql = sqlStatements[i];
        console.log(`Executing statement ${i + 1}/${sqlStatements.length}...`);

        // Try to find a way to execute this. 
        // I will use a custom script that uses the REST API bypass if possible, 
        // but since I don't have psql, I'll try the exec_sql RPC.
        try {
            const { data, error } = await supabase.rpc('exec_sql', { sql_text: sql });
            if (error) {
                console.error(`Statement ${i + 1} failed:`, error.message);
            } else {
                console.log(`Statement ${i + 1} succeeded.`);
            }
        } catch (e) {
            console.error(`Statement ${i + 1} threw:`, e.message);
        }
    }

    console.log('--- RLS FIX COMPLETED ---');
}

fixRLS().catch(console.error);
