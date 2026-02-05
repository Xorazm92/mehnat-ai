
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanup() {
    console.log('🚀 Starting Data Categorization Cleanup...');

    // 1. Identify Junk Profiles
    const { data: profiles } = await supabase.from('profiles').select('id, full_name');
    const junkProfileIds = profiles
        .filter(p => !p.full_name || p.full_name.trim() === '0' || p.full_name.trim() === '-' || p.full_name.toLowerCase().includes('ketgan'))
        .map(p => p.id);

    if (junkProfileIds.length > 0) {
        console.log(`🧹 Removing ${junkProfileIds.length} junk profiles...`);
        const { error: pErr } = await supabase.from('profiles').delete().in('id', junkProfileIds);
        if (pErr) console.error('Error deleting profiles:', pErr);
    } else {
        console.log('✅ No junk profiles found.');
    }

    // 2. Identify "Human-named" Companies (Summary Rows)
    // These are companies whose names match staff names and have invalid/generic INNs
    const staffNames = new Set(profiles.map(p => p.full_name.toLowerCase()));
    const { data: companies } = await supabase.from('companies').select('id, name, inn');

    const summaryCompanyIds = companies
        .filter(c => {
            const nameLower = c.name.toLowerCase().trim();
            // Check if name is exactly a staff name or starts with a number like "38:37" from the CSV grep
            const isStaffName = staffNames.has(nameLower);
            const isCsvRowHeader = /^\d+:\d+/.test(c.name);
            const hasInvalidInn = !c.inn || c.inn.length < 5 || c.inn.includes('inn-'); // though sync script generated some, summary rows usually lack them

            return (isStaffName || isCsvRowHeader) && (hasInvalidInn || isStaffName);
        })
        .map(c => c.id);

    if (summaryCompanyIds.length > 0) {
        console.log(`🧹 Removing ${summaryCompanyIds.length} summary-row "companies"...`);
        // Before deleting companies, we should handle dependent operations if needed, 
        // but usually these junk companies don't have valid operations or it's safe to clear them.
        const { error: oErr } = await supabase.from('operations').delete().in('company_id', summaryCompanyIds);
        if (oErr) console.error('Error deleting dependent operations:', oErr);

        const { error: cErr } = await supabase.from('companies').delete().in('id', summaryCompanyIds);
        if (cErr) console.error('Error deleting companies:', cErr);
    } else {
        console.log('✅ No summary-row companies found.');
    }

    console.log('✨ Cleanup Complete!');
}

cleanup();
