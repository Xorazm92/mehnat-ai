import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function purge() {
    console.log('🚮 Purging data for fresh start...');
    
    // Deleting operations first (Foreign Key constraint)
    const { error: opErr } = await supabase.from('operations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (opErr) console.error('Error purging operations:', opErr.message);
    else console.log('✅ Operations purged.');

    const { error: compErr } = await supabase.from('companies').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (compErr) console.error('Error purging companies:', compErr.message);
    else console.log('✅ Companies purged.');

    console.log('✨ Database is now clean.');
}
purge();
