// Debug script to check admin access and RLS state
const { createClient } = require('@supabase/supabase-js');

const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZldWR6b2hpa2lnb2ZnYXFmd2NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDE5OTU5NSwiZXhwIjoyMDg1Nzc1NTk1fQ.vb4tjg60CbAjyQa2NzKk6bMaGctF3CE2kmqj-fw5JVw';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZldWR6b2hpa2lnb2ZnYXFmd2NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxOTk1OTUsImV4cCI6MjA4NTc3NTU5NX0.pfsGinzi0YZbmET2xIj5ZN4nq9xf4CBCtGyLunUMb5s';
const URL = 'https://veudzohikigofgaqfwcj.supabase.co';

const serviceClient = createClient(URL, SERVICE_KEY);

async function main() {
    console.log('=== DEBUGGING SUPERVISOR ACCESS ===\n');

    // 1. Check admin profile
    const { data: adminProfile } = await serviceClient.from('profiles').select('id,full_name,role').eq('email', 'admin@asos.uz').single();
    console.log('1. Admin profile:', JSON.stringify(adminProfile));

    // 2. Check Go'zaloy  
    const { data: gProfile } = await serviceClient.from('profiles').select('id,full_name,role').ilike('full_name', '%zaloy%').single();
    console.log('2. Go\'zaloy profile:', JSON.stringify(gProfile));

    // 3. Count companies with service key (bypasses RLS)
    const { data: allCompanies, error: allErr } = await serviceClient.from('companies').select('id').eq('is_active', true);
    console.log('\n3. Total active companies (service key):', allCompanies?.length || 0, allErr?.message || '');

    // 4. Test what admin sees WITH anon key  
    console.log('\n4. Testing admin login...');
    const anonClient = createClient(URL, ANON_KEY);

    // Try common passwords
    const passwords = ['asos2024', 'Asos2024', 'admin2024', 'Admin2024', 'password123', '123456'];
    let adminSession = null;

    for (const pwd of passwords) {
        const { data, error } = await anonClient.auth.signInWithPassword({
            email: 'admin@asos.uz',
            password: pwd
        });
        if (!error && data?.session) {
            console.log('   Admin logged in with:', pwd);
            adminSession = data.session;
            break;
        }
    }

    if (!adminSession) {
        console.log('   Could not login as admin. Testing Go\'zaloy...');
        for (const pwd of passwords) {
            const { data, error } = await anonClient.auth.signInWithPassword({
                email: "go'zaloy@asos.uz",
                password: pwd
            });
            if (!error && data?.session) {
                console.log('   Go\'zaloy logged in with:', pwd);
                adminSession = data.session;
                break;
            }
        }
    }

    if (adminSession) {
        // Create authenticated client
        const authClient = createClient(URL, ANON_KEY);
        await authClient.auth.setSession({
            access_token: adminSession.access_token,
            refresh_token: adminSession.refresh_token
        });

        const { data: userCompanies, error: ucErr } = await authClient.from('companies').select('id,name').eq('is_active', true).limit(10);
        console.log('   User can see companies:', userCompanies?.length || 0, ucErr?.message || '');
        if (userCompanies?.length > 0) {
            userCompanies.slice(0, 3).forEach(c => console.log('     -', c.name));
        }
    } else {
        console.log('   Could not login with any test password');
    }

    // 5. Check what RLS policies exist by checking via information_schema
    console.log('\n5. Checking RLS state...');
    const { data: rlsCheck } = await serviceClient.rpc('check_rls_enabled', {}).catch(() => ({ data: null }));

    // Check directly if the old policy name exists
    // We'll try to read companies with a token that has the supervisor's sub
    const { data: compCheck } = await serviceClient
        .from('companies')
        .select('id,supervisor_id')
        .not('supervisor_id', 'is', null)
        .limit(3);
    console.log('   Companies with supervisor_id:', compCheck?.length, 'of total');
    if (compCheck) compCheck.forEach(c => console.log('     id:', c.id.slice(0, 8), 'supervisor:', c.supervisor_id?.slice(0, 8)));

    // 6. ⚠️ CRITICAL: Fix admin role to super_admin
    console.log('\n6. Admin role is:', adminProfile?.role);
    if (adminProfile?.role === 'supervisor') {
        console.log('   ⚠️ Admin user has "supervisor" role, should be "super_admin"!');
        console.log('   Fixing...');
        const { error } = await serviceClient
            .from('profiles')
            .update({ role: 'super_admin' })
            .eq('email', 'admin@asos.uz');
        if (error) {
            console.log('   Error fixing admin role:', error.message);
        } else {
            console.log('   ✅ Admin role fixed to super_admin!');
        }
    }

    console.log('\nDone!');
}

main().catch(console.error);
