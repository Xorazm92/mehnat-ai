
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
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

console.log('--- STARTING DEBUG IMPORT ---');

async function processItem(item, period) {
    if (!item) return { success: false, skipped: true };

    let inn = String(item['ИНН'] || '').trim();
    const name = String(item['НАИМЕНОВАНИЯ'] || '').trim();

    if (!inn || inn.length < 5) {
        if (name) {
            let hash = 0;
            for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i);
            inn = `NO_INN_${Math.abs(hash)}`;
        } else return { success: false, skipped: true };
    }

    const accountantName = String(item['Бухгалter'] || item['Бухгалтер'] || '').trim();
    const accountant = null; // Simplify for debug

    try {
        const { data: existing } = await supabase.from('companies').select('id').eq('inn', inn).maybeSingle();
        let companyId = existing?.id;

        if (!companyId) {
            const { data: inserted } = await supabase.from('companies').insert({ inn, name, department: 'default' }).select('id').single();
            companyId = inserted?.id;
        }

        if (companyId) {
            console.log(`Upserting ${inn} for ${period}...`);
            const { error: opErr } = await supabase.from('operations').upsert({
                company_id: companyId,
                period: period,
                assigned_accountant_name: accountantName,
            }, { onConflict: 'company_id, period' });

            if (opErr) console.error('OP ERR:', opErr.message);
            else console.log(`✓ ${inn}`);
        }
        return { success: true };
    } catch (err) {
        console.error(`FAIL ${inn}:`, err.message);
        return { success: false };
    }
}

async function run() {
    console.log('Reading file...');
    const rawData = fs.readFileSync(path.resolve(__dirname, '../public/Firmalar 31.12.2025.json'), 'utf-8');
    const jsonData = JSON.parse(rawData.startsWith('{') ? '[' + rawData + ']' : rawData);

    console.log(`Processing first 5 records for 2025 Dekabr...`);
    for (const item of jsonData.slice(0, 5)) {
        await processItem(item, '2025 Dekabr');
    }
    console.log('DEBUG DONE');
}

run().catch(console.error);
