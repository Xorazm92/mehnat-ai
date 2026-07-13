
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

async function debug() {
    console.log("Fetching profile for Axmadjon...");
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').ilike('full_name', '%Axmadjon%');
    console.log("Profiles found:", profiles);

    if (profiles && profiles.length > 0) {
        const id = profiles[0].id;
        console.log(`Checking reports for accountant_id: ${id} in 2025-12`);
        const { count, data } = await supabase.from('company_monthly_reports')
            .select('company_id, assigned_accountant_name', { count: 'exact' })
            .eq('period', '2025-12')
            .eq('assigned_accountant_id', id);

        console.log(`Reports found: ${count}`);

        if (data && data.length > 0) {
            console.log(`Checking operations (2025 Yillik) for these companies...`);
            const companyIds = data.map(r => r.company_id);
            const { count: opCount, data: opData } = await supabase.from('operations')
                .select('company_id, period, assigned_accountant_id', { count: 'exact' })
                .in('company_id', companyIds)
                .eq('period', '2025 Yillik');

            console.log(`Operations found: ${opCount}`);
            console.log("Matches Accountant ID?", opData?.every(op => op.assigned_accountant_id === id));
            console.log(opData);
        }
    }
}

debug();
