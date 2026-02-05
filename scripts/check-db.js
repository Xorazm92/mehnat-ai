import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data, error } = await supabase.from('companies').select('contract_amount').limit(1);
    if (error) {
        console.log('STATUS: SCHEMA_NOT_READY');
    } else {
        console.log('STATUS: SCHEMA_OK');
    }
}
check();
