import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.local
const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
// If we have a service role key, that would be better for bypassing RLS, but likely we only have anon key in frontend .env
// We might need to use the service role key if RLS blocks writes from anon. 
// However, the user said "background script", implying admin rights. 
// Let's assume the anon key has permissions or try to find a SERVICE_KEY in .env if available, otherwise fallback.

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Supabase URL or Key not found in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// --- CSV Parsing Logic (Inlined from lib/csvParser.ts for standalone usage) ---
const parseCSV = (text) => {
    if (!text) return [];

    const rows = text.split('\n').filter(line => line.trim().length > 0);
    if (rows.length === 0) return [];

    // Detect delimiter
    const firstLine = rows[0];
    const delimiter = firstLine.includes(';') ? ';' : ',';

    const splitLine = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === delimiter && !inQuotes) {
                result.push(current.trim().replace(/^"|"$/g, '').trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim().replace(/^"|"$/g, '').trim());
        return result;
    };

    const headers = splitLine(rows[0]);

    const data = rows.slice(1).map(row => {
        const values = splitLine(row);
        const item = {};
        headers.forEach((header, index) => {
            // Remove BOM from header if present
            const cleanHeader = header.replace(/^\uFEFF/, '').trim();
            item[cleanHeader] = values[index] ? values[index] : '';
        });
        return item;
    });

    return data;
};

// --- Main Restoration Logic ---
const restoreData = async () => {
    console.log('Starting data restoration...');

    // 1. Read CSV
    const csvPath = path.resolve(__dirname, '../public/Firmalar - Royxat (2).csv');
    if (!fs.existsSync(csvPath)) {
        console.error('CSV file not found at:', csvPath);
        return;
    }
    const csvText = fs.readFileSync(csvPath, 'utf-8');
    const csvData = parseCSV(csvText);
    console.log(`Parsed ${csvData.length} rows from CSV.`);

    // 2. Fetch existing companies to map INN -> ID
    const { data: companies, error: fetchError } = await supabase
        .from('companies')
        .select('id, inn, name');

    if (fetchError) {
        console.error('Error fetching companies:', fetchError);
        return;
    }

    const companyMap = new Map(); // INN -> ID
    companies.forEach(c => {
        if (c.inn) companyMap.set(c.inn.trim(), c.id);
    });
    console.log(`Fetched ${companies.length} companies from DB.`);

    // 3. Iterate and upsert
    let updatedCount = 0;
    const period = '2026-01'; // Target period

    for (const row of csvData) {
        const inn = row['ИНН']?.trim();
        if (!inn) continue;

        const companyId = companyMap.get(inn);
        if (!companyId) {
            console.warn(`Company not found for INN: ${inn} (${row['НАИМЕНОВАНИЯ']})`);
            continue;
        }

        // Map CSV columns to DB columns
        // Referencing seedFirmaData.ts mapping
        const v = (key) => (row[key] || '').trim();

        const reportData = {
            company_id: companyId,
            period: period,
            bank_klient: v("bank klient"),
            didox: v("Didox"),
            xatlar: v("xatlar"),
            avtokameral: v("Avtokameral"),
            my_mehnat: v("my mehnat"),
            one_c: v("1c"),
            pul_oqimlari: v("Pul oqimlari"),
            chiqadigan_soliqlar: v("Chiqadigan soliqlar"),
            hisoblangan_oylik: v("Hisoblangan oylik"),
            debitor_kreditor: v("Debitor kreditor"),
            foyda_va_zarar: v("Foyda va zarar"),
            tovar_ostatka: v("Tovar ostatka"),
            nds_bekor_qilish: v("NDSNI BEKOR QILISH"),
            aylanma_qqs: v("Aylanma/QQS"),
            daromad_soliq: v("Daromad soliq"),
            inps: v("INPS"),
            foyda_soliq: v("Foyda soliq"),
            moliyaviy_natija: v("Moliyaviy natija"),
            buxgalteriya_balansi: v("Buxgalteriya balansi"),
            statistika: v("Statistika"),
            bonak: v("Bo'nak"),
            yer_soliqi: v("Yer solig'i "),
            mol_mulk_soligi: v("Mol mulk solig'i ma'lumotnoma"),
            suv_soligi: v("Suv solig'i ma'lumotnoma"),
            comment: '',
            updated_at: new Date().toISOString()
        };

        const { error: upsertError } = await supabase
            .from('company_monthly_reports')
            .upsert(reportData, { onConflict: 'company_id,period' });

        if (upsertError) {
            console.error(`Error upserting for INN ${inn}:`, upsertError);
        } else {
            updatedCount++;
            process.stdout.write(`\rUpdated: ${updatedCount}`);
        }
    }

    console.log(`\nRestoration complete. Updated/Inserted ${updatedCount} records.`);
};

restoreData().catch(console.error);
