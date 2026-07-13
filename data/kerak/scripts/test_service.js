import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function checkService() {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const supabase = createClient(supabaseUrl, serviceKey);

    console.log('--- Testing with SERVICE ROLE key ---');

    console.log('Fetching profiles...');
    const { data: profiles, error: pErr } = await supabase.from('profiles').select('*').limit(5);
    if (pErr) console.error('Profiles Fetch Error (SERVICE):', pErr);
    else console.log('Profiles Fetch Success (SERVICE): Count', profiles.length);

    console.log('\nFetching companies...');
    const { data: companies, error: cErr } = await supabase.from('companies').select('*').limit(5);
    if (cErr) console.error('Companies Fetch Error (SERVICE):', cErr);
    else console.log('Companies Fetch Success (SERVICE): Count', companies.length);
}

checkService().catch(console.error);
