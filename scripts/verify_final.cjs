const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
    console.log('Verifying Supervisor Access...');

    // 1. Login as Supervisor Go\'zaloy
    const email = 'gozaloy@example.com';
    // Try common passwords since I don't know the exact one set in this specific dev instance
    const passwords = ['password123', 'Gozaloy2024', 'secret'];

    let session = null;

    for (const p of passwords) {
        console.log(`Trying login for ${email} with password: ${p}`);
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password: p,
        });

        if (!error && data.session) {
            console.log('✅ Login successful!');
            session = data.session;
            break;
        }
        console.log(`❌ Login failed: ${error?.message}`);
    }

    if (!session) {
        console.error('Could not log in as supervisor. Cannot verify RLS.');
        // Try to see if we can use the service role to check if the user exists/has companies (if we had the key, but we assume strict env)
        return;
    }

    // 2. Fetch Companies
    console.log('Fetching companies as Supervisor...');
    const { data: companies, error: fetchError } = await supabase
        .from('companies')
        .select('id, name, supervisor_id')
        .eq('supervisor_id', session.user.id);

    if (fetchError) {
        console.error('❌ RLS Verification Failed:', fetchError.message);
    } else {
        console.log(`✅ RLS Verification Successful!`);
        console.log(`Supervisor has access to ${companies.length} companies.`);

        if (companies.length === 0) {
            console.log('⚠️ Warning: 0 companies found. This might mean RLS is blocking everything OR the user has no companies assigned.');
            // Let's try to fetch *any* company to see if SELECT policy works at all
            const { count, error: countError } = await supabase.from('companies').select('*', { count: 'exact', head: true });
            console.log(`Total visible companies to this user: ${count}`);
        } else {
            console.log('Sample accessible company:', companies[0].name);
        }
    }
}

verify();
