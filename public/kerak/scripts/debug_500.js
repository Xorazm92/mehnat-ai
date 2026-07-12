import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function debug500() {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Use anon key to simulate browser behavior
    const supabase = createClient(supabaseUrl, anonKey);

    console.log('--- Testing with ANON key ---');
    console.log('Logging in as Yorqinoy (admin@asos.uz)...');

    // Yorqinoy's password was 'Asos2026!' in deploy_users.cjs
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: 'admin@asos.uz',
        password: 'Asos2026!'
    });

    if (authErr) {
        console.error('Auth Error:', authErr);
        return;
    }

    console.log('Login successful. Testing profiles fetch...');
    const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single();

    if (pErr) {
        console.error('Profiles Fetch Error (ANON):', pErr);
    } else {
        console.log('Profiles Fetch Success (ANON):', profile.full_name);
    }

    console.log('\nTesting companies fetch...');
    const { data: companies, error: cErr } = await supabase
        .from('companies')
        .select('*', { count: 'exact', head: true });

    if (cErr) {
        console.error('Companies Fetch Error (ANON):', cErr);
    } else {
        console.log('Companies Fetch Success (ANON): Count', companies);
    }

    console.log('\n--- Testing with SERVICE ROLE key ---');
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);
    const { count, error: sErr } = await supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true });
    if (sErr) console.error('Profiles Fetch Error (SERVICE):', sErr);
    else console.log('Profiles Count (SERVICE):', count);
}

debug500().catch(console.error);
