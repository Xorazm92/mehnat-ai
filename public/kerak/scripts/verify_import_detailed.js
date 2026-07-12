
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

async function verify() {
    console.log("--- Verification Start ---");

    // 1. Check Axmadjon
    const { data: profile } = await supabase.from('profiles').select('id, full_name').ilike('full_name', '%Axmadjon%').single();
    if (profile) {
        console.log(`Profile: ${profile.full_name} (${profile.id})`);

        // Count Monthly Reports (2025-12)
        const { count: reportCount } = await supabase.from('company_monthly_reports')
            .select('*', { count: 'exact', head: true })
            .eq('period', '2025-12')
            .eq('assigned_accountant_id', profile.id);
        console.log(`Reports (2025-12) for Axmadjon: ${reportCount}`);

        // Count Operations (2025 Yillik)
        const { count: opCount } = await supabase.from('operations')
            .select('*', { count: 'exact', head: true })
            .eq('period', '2025 Yillik')
            .eq('assigned_accountant_id', profile.id);
        console.log(`Operations (2025 Yillik) for Axmadjon: ${opCount}`);
    }

    // 2. Check ENGLIFY
    const { data: englify } = await supabase.from('companies').select('*').ilike('name', '%ENGLIFY%').maybeSingle();
    if (englify) {
        console.log(`Found ENGLIFY: ${englify.name}, INN: ${englify.inn}`);

        const { count: engReports } = await supabase.from('company_monthly_reports')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', englify.id);
        console.log(`Monthly Reports for ENGLIFY: ${engReports}`);

        const { count: engOps } = await supabase.from('operations')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', englify.id);
        console.log(`Operations for ENGLIFY: ${engOps}`);
    } else {
        console.log("ENGLIFY not found in companies table.");
    }

    // 3. Global Stats
    const { count: totalOps2025 } = await supabase.from('operations').select('*', { count: 'exact', head: true }).eq('period', '2025 Yillik');
    const { count: totalOps2026 } = await supabase.from('operations').select('*', { count: 'exact', head: true }).eq('period', '2026 Yanvar');
    console.log(`Total Operations (2025 Yillik): ${totalOps2025}`);
    console.log(`Total Operations (2026 Yanvar): ${totalOps2026}`);
}

verify();
