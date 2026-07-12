
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local
const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Supabase URL/Key missing in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function mergeCompanies() {
    console.log('--- STARTING COMPANY MERGE & DEDUPLICATION ---');

    // 1. Fetch all companies
    const { data: companies, error: fetchErr } = await supabase.from('companies').select('id, name, inn');
    if (fetchErr) {
        console.error('Error fetching companies:', fetchErr);
        return;
    }

    console.log(`Analyzing ${companies.length} companies...`);

    // 2. Group by normalized name
    const grouped = companies.reduce((acc, c) => {
        const n = String(c.name || '').trim().toLowerCase();
        if (!acc[n]) acc[n] = [];
        acc[n].push(c);
        return acc;
    }, {});

    let mergedCount = 0;

    for (const [name, list] of Object.entries(grouped)) {
        if (list.length < 2) continue;

        // Separate master and duplicates
        // Master is the one with a numeric INN or a 'tmp-' ID (real data)
        // Duplicates are the ones starting with 'NO_INN_' (created by previous faulty import)
        const masters = list.filter(c => !String(c.inn).startsWith('NO_INN_'));
        const duplicates = list.filter(c => String(c.inn).startsWith('NO_INN_'));

        if (masters.length > 0 && duplicates.length > 0) {
            const master = masters[0]; // Take the first valid master
            console.log(`\nMerging "${name}" (${masters.length} masters, ${duplicates.length} duplicates)`);
            console.log(`  Master ID: ${master.id} (INN: ${master.inn})`);

            for (const dup of duplicates) {
                console.log(`  Merging duplicate ID: ${dup.id} (INN: ${dup.inn})`);

                // Move operations
                const { error: opErr } = await supabase.from('operations').update({ company_id: master.id }).eq('company_id', dup.id);
                if (opErr) console.error(`    Error moving operations for ${dup.id}:`, opErr.message);

                // Move monthly reports
                const { error: repErr } = await supabase.from('company_monthly_reports').update({ company_id: master.id }).eq('company_id', dup.id);
                if (repErr) console.error(`    Error moving reports for ${dup.id}:`, repErr.message);

                // Delete duplicate
                const { error: delErr } = await supabase.from('companies').delete().eq('id', dup.id);
                if (delErr) console.error(`    Error deleting duplicate ${dup.id}:`, delErr.message);
                else mergedCount++;
            }
        }
    }

    console.log(`\n--- MERGE COMPLETE. ${mergedCount} duplicates removed. ---`);
}

mergeCompanies().catch(console.error);
