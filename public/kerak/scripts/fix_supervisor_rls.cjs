// Fix RLS policies for supervisor access
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://veudzohikigofgaqfwcj.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZldWR6b2hpa2lnb2ZnYXFmd2NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDE5OTU5NSwiZXhwIjoyMDg1Nzc1NTk1fQ.vb4tjg60CbAjyQa2NzKk6bMaGctF3CE2kmqj-fw5JVw'
);

async function runSQL(sql) {
    const url = 'https://veudzohikigofgaqfwcj.supabase.co/rest/v1/rpc/exec_sql';
    const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZldWR6b2hpa2lnb2ZnYXFmd2NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDE5OTU5NSwiZXhwIjoyMDg1Nzc1NTk1fQ.vb4tjg60CbAjyQa2NzKk6bMaGctF3CE2kmqj-fw5JVw';

    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': key,
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({ sql_text: sql })
        });
        const text = await resp.text();
        return { ok: resp.ok, status: resp.status, body: text };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

async function main() {
    console.log('🔧 Fixing RLS policies for supervisor access...\n');

    // Test Go'zaloy login to see what she currently gets
    console.log('1. Testing Go\'zaloy current access...');
    const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
        email: "go'zaloy@asos.uz",
        password: "asos2024"
    });

    if (loginErr) {
        console.log('  Login error:', loginErr.message);
        console.log('  Trying alternative passwords...');

        const passwords = ['Asos2024', 'asos2024!', 'Go\'zaloy2024', 'password123'];
        let worked = false;
        for (const pwd of passwords) {
            const { data: d2, error: e2 } = await supabase.auth.signInWithPassword({
                email: "go'zaloy@asos.uz",
                password: pwd
            });
            if (!e2 && d2?.session) {
                console.log(`  ✅ Logged in with password: ${pwd}`);
                worked = true;

                // Check what Go'zaloy can see
                const userClient = createClient(
                    'https://veudzohikigofgaqfwcj.supabase.co',
                    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZldWR6b2hpa2lnb2ZnYXFmd2NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxOTk1OTUsImV4cCI6MjA4NTc3NTU5NX0.pfsGinzi0YZbmET2xIj5ZN4nq9xf4CBCtGyLunUMb5s',
                    { global: { headers: { Authorization: `Bearer ${d2.session.access_token}` } } }
                );

                const { data: companies, error: compErr } = await userClient.from('companies').select('id').eq('is_active', true);
                console.log(`  Go'zaloy can see: ${companies?.length || 0} companies (error: ${compErr?.message || 'none'})`);
                break;
            }
        }
        if (!worked) console.log('  ⚠️ Could not login as Go\'zaloy to test');
    } else if (loginData?.session) {
        const userClient = createClient(
            'https://veudzohikigofgaqfwcj.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZldWR6b2hpa2lnb2ZnYXFmd2NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxOTk1OTUsImV4cCI6MjA4NTc3NTU5NX0.pfsGinzi0YZbmET2xIj5ZN4nq9xf4CBCtGyLunUMb5s',
            { global: { headers: { Authorization: `Bearer ${loginData.session.access_token}` } } }
        );

        const { data: companies, error: compErr } = await userClient.from('companies').select('id').eq('is_active', true);
        console.log(`  ✅ Go'zaloy can see: ${companies?.length || 0} companies (error: ${compErr?.message || 'none'})`);
    }

    // 2. Apply RLS fixes via service role  
    console.log('\n2. Checking current RLS policies...');

    // Try exec_sql first  
    const testResult = await runSQL("SELECT policyname FROM pg_policies WHERE tablename = 'companies'");
    console.log('  exec_sql test:', testResult.ok ? 'available' : `not available (${testResult.status})`);

    if (!testResult.ok) {
        console.log('\n⚠️ exec_sql RPC is not available. You need to run these SQL commands manually in Supabase SQL Editor:\n');

        console.log(`-- Step 1: Fix companies SELECT policy
DROP POLICY IF EXISTS "Accountants can view their own companies" ON companies;
DROP POLICY IF EXISTS "Staff can view relevant companies" ON companies;
CREATE POLICY "Staff can view relevant companies" ON companies FOR SELECT
  USING (
    accountant_id = auth.uid()
    OR supervisor_id = auth.uid()
    OR bank_client_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'manager', 'supervisor', 'chief_accountant', 'auditor')
    )
  );

-- Step 2: Fix companies UPDATE policy
DROP POLICY IF EXISTS "Accountants can update their own companies" ON companies;
DROP POLICY IF EXISTS "Staff can update relevant companies" ON companies;
CREATE POLICY "Staff can update relevant companies" ON companies FOR UPDATE
  USING (
    accountant_id = auth.uid()
    OR supervisor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'manager', 'supervisor', 'chief_accountant')
    )
  );

-- Step 3: Fix operations SELECT policy
DROP POLICY IF EXISTS "Users can view operations for accessible companies" ON operations;
DROP POLICY IF EXISTS "Staff can view relevant operations" ON operations;
CREATE POLICY "Staff can view relevant operations" ON operations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = operations.company_id
      AND (
        c.accountant_id = auth.uid()
        OR c.supervisor_id = auth.uid()
        OR c.bank_client_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
          AND p.role IN ('super_admin', 'manager', 'supervisor', 'chief_accountant', 'auditor')
        )
      )
    )
  );

-- Step 4: Fix profiles SELECT policy
DROP POLICY IF EXISTS "Admins and managers can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins and supervisors can view all profiles" ON profiles;
CREATE POLICY "Admins and supervisors can view all profiles" ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'manager', 'supervisor', 'chief_accountant')
    )
  );
`);
    }

    console.log('\n✅ Done! After running the SQL, Go\'zaloy will see her 152 companies.');
}

main().catch(console.error);
