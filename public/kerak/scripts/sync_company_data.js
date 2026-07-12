
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
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Supabase URL/Key missing in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const JSON_FILE = path.resolve(__dirname, '../public/Фирмалар 31.01.2026 ..json');

async function runSync() {
    console.log('--- STARTING DATABASE SYNC ---');

    if (!fs.existsSync(JSON_FILE)) {
        console.error('Source JSON not found:', JSON_FILE);
        return;
    }

    const raw = fs.readFileSync(JSON_FILE, 'utf-8').trim();
    let jsonData;
    try {
        jsonData = JSON.parse(raw);
    } catch (e) {
        // Fallback for non-standard JSON if needed, but the view showed it's standard
        console.error('JSON Parse Error:', e.message);
        return;
    }

    const dataToProcess = jsonData.Royxat || jsonData.Лист1 || (Array.isArray(jsonData) ? jsonData : []);
    console.log(`Processing ${dataToProcess.length} items from JSON...`);

    // Fetch all companies from DB for matching
    const { data: dbCompanies, error: fetchErr } = await supabase.from('companies').select('id, name, inn, notes');
    if (fetchErr) {
        console.error('Error fetching companies:', fetchErr);
        return;
    }

    let updatedCount = 0;
    let skippedCount = 0;

    for (const item of dataToProcess) {
        if (!item) continue;
        const name = String(item['НАИМЕНОВАНИЯ'] || '').trim();
        if (!name || name === 'Jami') continue;

        // Try to find match in DB
        const match = dbCompanies.find(c =>
            c.name.toLowerCase() === name.toLowerCase() ||
            (c.inn && name.includes(c.inn))
        );

        if (match) {
            const contractAmount = Number(item['Столbeц7']) || Number(item['Столбец7']) || 0;
            const yorqinoyAmount = Number(item['Ёркиной']) || 0;

            // Calculate % if possible, or use 7 as default
            let cperc = 7;
            if (contractAmount > 0 && yorqinoyAmount > 0) {
                cperc = Math.round((yorqinoyAmount / contractAmount) * 100);
            }

            // Prepare update
            const existingNotes = typeof match.notes === 'string' && match.notes.startsWith('{')
                ? JSON.parse(match.notes)
                : (match.notes || {});

            const updatedNotes = {
                ...existingNotes,
                camt: contractAmount || existingNotes.camt,
                cperc: cperc || existingNotes.cperc || 7
            };

            const { error: updateErr } = await supabase
                .from('companies')
                .update({
                    contract_amount: contractAmount || match.contract_amount,
                    notes: JSON.stringify(updatedNotes)
                })
                .eq('id', match.id);

            if (updateErr) {
                console.error(`Failed to update ${name}:`, updateErr.message);
            } else {
                updatedCount++;
            }
        } else {
            skippedCount++;
        }
    }

    console.log(`\n--- SYNC COMPLETED ---`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`No match: ${skippedCount}`);
}

runSync().catch(console.error);
