
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper to normalize strings for comparison
const normalize = (s) => (s || '').toString().toLowerCase().trim().replace(/['"`«»]/g, '');

async function main() {
    console.log('🚀 Starting Perfect Data Sync...');

    // 1. Load oylik.csv (Base List)
    const csvData = fs.readFileSync('public/oylik.csv', 'utf-8');
    const rows = parse(csvData, {
        columns: false,
        skip_empty_lines: true,
        from_line: 3 // Skip header rows
    });

    // 2. Load Firmalar.json (Logins/Passwords)
    const jsonData = JSON.parse(fs.readFileSync('public/Firmalar.json', 'utf-8'));
    const royxat = jsonData['Royxat'] || [];
    const ndsClients = jsonData['клиенты НДС'] || [];

    // Map for fast lookup by INN or Name
    const credsMap = new Map();
    royxat.forEach(item => {
        if (item['ИНН']) {
            credsMap.set(item['ИНН'].toString().trim(), {
                login: item['Login '] || item['Login'],
                password: item['Parol '] || item['Parol'],
                taxRegime: item[' '] // Sheet label for regime
            });
        }
    });

    const ownerMap = new Map();
    ndsClients.forEach(item => {
        if (item['ИНН']) {
            ownerMap.set(item['ИНН'].toString().trim(), item['эгаси']);
        }
    });

    // 3. Fetch current profiles
    const { data: profiles } = await supabase.from('profiles').select('id, full_name');
    const profileMap = new Map();
    profiles?.forEach(p => profileMap.set(p.full_name.toLowerCase(), p.id));

    let count = 0;
    for (const row of rows) {
        const name = row[1];
        const inn = row[2]?.toString().trim();
        if (!name || !inn || inn === 'ИНН') continue;

        // Financials
        const contractRaw = (row[6] || '0').replace(/,/g, '');
        const contractAmount = parseFloat(contractRaw) || 0;

        // Percentages/Sums (Approximate columns based on analysis)
        const accPerc = parseFloat(row[8]) || 20;
        const bankSum = parseFloat((row[9] || '0').replace(/,/g, '')) || 0;

        // Staff IDs
        const accountantName = row[4];
        const bankClientName = row[5];
        const supervisorName = row[7];

        const accountantId = profileMap.get((accountantName || '').toLowerCase());
        const bankClientId = profileMap.get((bankClientName || '').toLowerCase());
        const supervisorId = profileMap.get((supervisorName || '').toLowerCase());

        // Login/Password/Regime from JSON
        const extra = credsMap.get(inn) || {};
        const ownerName = ownerMap.get(inn) || null;

        // Regime Logic
        let regime = row[3] || extra.taxRegime;
        if (regime?.includes('НДС')) regime = 'НДС';
        else if (regime?.includes('Айланма')) regime = 'Айланма';
        else if (regime?.includes('Қатъий')) regime = 'Қатъий';
        else regime = 'Айланма';

        const fallbackJson = JSON.stringify({
            v: 1,
            bcid: bankClientId,
            bcn: bankClientName,
            sid: supervisorId,
            sn: supervisorName,
            camt: contractAmount,
            aperc: accPerc,
            bcsum: bankSum,
            on: ownerName,
            ia: true
        });

        const payload = {
            name: name.trim(),
            inn,
            tax_regime: regime,
            accountant_id: accountantId,
            login: extra.login || null,
            password_encrypted: extra.password || null,
            department: 'Buxgalteriya',
            notes: fallbackJson,
            is_active: true
        };

        const { error } = await supabase.from('companies').upsert(payload, { onConflict: 'inn' });
        if (error) {
            console.error(`Error syncing ${name}:`, error.message);
        } else {
            count++;
        }
    }

    console.log(`✅ Perfect Sync Complete! ${count} firms updated.`);
}

main().catch(console.error);
