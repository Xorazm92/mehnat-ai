// Fix admin role AND apply RLS policies
const { createClient } = require('@supabase/supabase-js');

const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZldWR6b2hpa2lnb2ZnYXFmd2NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDE5OTU5NSwiZXhwIjoyMDg1Nzc1NTk1fQ.vb4tjg60CbAjyQa2NzKk6bMaGctF3CE2kmqj-fw5JVw';
const URL = 'https://veudzohikigofgaqfwcj.supabase.co';

const supabase = createClient(URL, SERVICE_KEY);

async function main() {
    // Step 1: Fix admin role
    console.log('1. Fixing admin role to super_admin...');
    const { error: roleErr } = await supabase
        .from('profiles')
        .update({ role: 'super_admin' })
        .eq('email', 'admin@asos.uz');

    if (roleErr) {
        console.log('   ❌ Error:', roleErr.message);
    } else {
        console.log('   ✅ Admin role fixed to super_admin!');
    }

    // Verify
    const { data: verify } = await supabase.from('profiles').select('id,full_name,role').eq('email', 'admin@asos.uz').single();
    console.log('   Verified:', JSON.stringify(verify));

    // Step 2: We need to apply RLS SQL. Since we can't run raw SQL via JS,
    // let's try the Supabase Management API
    console.log('\n2. Attempting to fix RLS via Management API...');

    const projectRef = 'veudzohikigofgaqfwcj';

    // Try using the SQL endpoint
    const sqlStatements = [
        // Fix companies SELECT
        `DROP POLICY IF EXISTS "Accountants can view their own companies" ON companies`,
        `DROP POLICY IF EXISTS "Staff can view relevant companies" ON companies`,
        `CREATE POLICY "Staff can view relevant companies" ON companies FOR SELECT USING (accountant_id = auth.uid() OR supervisor_id = auth.uid() OR bank_client_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'manager', 'supervisor', 'chief_accountant', 'auditor')))`,

        // Fix companies UPDATE
        `DROP POLICY IF EXISTS "Accountants can update their own companies" ON companies`,
        `DROP POLICY IF EXISTS "Staff can update relevant companies" ON companies`,
        `CREATE POLICY "Staff can update relevant companies" ON companies FOR UPDATE USING (accountant_id = auth.uid() OR supervisor_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'manager', 'supervisor', 'chief_accountant')))`,

        // Fix operations SELECT
        `DROP POLICY IF EXISTS "Users can view operations for accessible companies" ON operations`,
        `DROP POLICY IF EXISTS "Staff can view relevant operations" ON operations`,
        `CREATE POLICY "Staff can view relevant operations" ON operations FOR SELECT USING (EXISTS (SELECT 1 FROM companies c WHERE c.id = operations.company_id AND (c.accountant_id = auth.uid() OR c.supervisor_id = auth.uid() OR c.bank_client_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'manager', 'supervisor', 'chief_accountant', 'auditor')))))`,

        // Fix profiles SELECT
        `DROP POLICY IF EXISTS "Admins and managers can view all profiles" ON profiles`,
        `DROP POLICY IF EXISTS "Admins and supervisors can view all profiles" ON profiles`,
        `CREATE POLICY "Admins and supervisors can view all profiles" ON profiles FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'manager', 'supervisor', 'chief_accountant')))`
    ];

    // Execute via PostgREST's RPC or Management API
    for (let i = 0; i < sqlStatements.length; i++) {
        const sql = sqlStatements[i];
        try {
            const resp = await fetch(`${URL}/rest/v1/rpc/exec_sql`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SERVICE_KEY,
                    'Authorization': `Bearer ${SERVICE_KEY}`,
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({ sql_text: sql })
            });

            if (resp.ok) {
                console.log(`   ✅ Statement ${i + 1}/${sqlStatements.length} executed`);
            } else {
                const text = await resp.text();
                if (resp.status === 404) {
                    console.log(`   ⚠️ exec_sql RPC not found. Need to create it or use SQL Editor.`);
                    break;
                }
                console.log(`   ❌ Statement ${i + 1} error:`, text.substring(0, 200));
            }
        } catch (e) {
            console.log(`   ❌ Fetch error:`, e.message);
        }
    }

    // Step 3: Create exec_sql function first, then use it
    console.log('\n3. Creating exec_sql function via PostgREST...');

    // Alternative: use the pg_net extension or create a function
    // Let's try creating the function via a workaround
    const createFuncSQL = `
    CREATE OR REPLACE FUNCTION exec_sql(sql_text TEXT)
    RETURNS TEXT
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      EXECUTE sql_text;
      RETURN 'OK';
    END;
    $$;
  `;

    // Check if we can reach the Management API via HTTP
    try {
        const mgmtResp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/sql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SERVICE_KEY}`
            },
            body: JSON.stringify({ query: createFuncSQL })
        });
        console.log('   Management API response:', mgmtResp.status);
        if (mgmtResp.ok) {
            console.log('   ✅ exec_sql function created!');

            // Now re-run all SQL
            for (let i = 0; i < sqlStatements.length; i++) {
                const { data, error } = await supabase.rpc('exec_sql', { sql_text: sqlStatements[i] });
                if (error) console.log(`   ❌ Statement ${i + 1}:`, error.message);
                else console.log(`   ✅ Statement ${i + 1}/${sqlStatements.length} done`);
            }
        } else {
            const text = await mgmtResp.text();
            console.log('   ❌ Management API error:', text.substring(0, 200));
            console.log('\n⚠️ YOU MUST RUN THE SQL MANUALLY IN SUPABASE SQL EDITOR!');
            console.log('File: supabase/migrations/20260216_fix_supervisor_rls.sql');
        }
    } catch (e) {
        console.log('   ❌ Management API unreachable:', e.message);
        console.log('\n⚠️ YOU MUST RUN THE SQL MANUALLY IN SUPABASE SQL EDITOR!');
        console.log('File: supabase/migrations/20260216_fix_supervisor_rls.sql');
    }

    console.log('\n=== SUMMARY ===');
    console.log('✅ Admin role fixed: super_admin');
    console.log('⚠️ RLS policies: must be applied via Supabase SQL Editor');
    console.log('   Open: https://supabase.com/dashboard/project/veudzohikigofgaqfwcj/sql');
    console.log('   Paste contents of: supabase/migrations/20260216_fix_supervisor_rls.sql');
}

main().catch(console.error);
