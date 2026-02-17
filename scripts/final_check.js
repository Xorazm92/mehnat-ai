import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function finalCheck() {
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    console.log('--- FINAL ROLE CHECK ---');
    const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('email, full_name, role')
        .order('role');

    if (pErr) console.error(pErr);
    else console.table(profiles);

    console.log('\n--- FINAL DATA CHECK ---');
    const { count: companies } = await supabase.from('companies').select('*', { count: 'exact', head: true });
    const { count: assignments } = await supabase.from('contract_assignments').select('*', { count: 'exact', head: true });

    console.log(`Total Companies: ${companies}`);
    console.log(`Total Contract Assignments: ${assignments}`);

    const { data: superAdmins } = await supabase.from('profiles').select('email').eq('role', 'super_admin');
    console.log('\nSuper Admins:', superAdmins.map(a => a.email).join(', '));
}

finalCheck();
