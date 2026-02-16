
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

console.log('--- STARTING PERFECT HISTORICAL DATA IMPORT ---');

// Cache for profiles
let profileMap = new Map();
let companyMap = new Map(); // inn -> id
let companyNameMap = new Map(); // normalized name -> id

async function fetchData() {
    console.log('Fetching profiles and companies...');
    const [profilesRes, companiesRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name'),
        supabase.from('companies').select('id, name, inn')
    ]);

    if (profilesRes.data) {
        profilesRes.data.forEach(p => {
            if (p.full_name) profileMap.set(p.full_name.trim().toLowerCase(), p);
        });
    }

    if (companiesRes.data) {
        companiesRes.data.forEach(c => {
            const innStr = String(c.inn || '').trim();
            const nameStr = String(c.name || '').trim().toLowerCase();
            if (innStr && !innStr.startsWith('NO_INN_')) companyMap.set(innStr, c.id);
            if (nameStr) companyNameMap.set(nameStr, c.id);
        });
    }
    console.log(`Loaded ${profileMap.size} profiles and ${companiesRes.data?.length} companies.`);
}

function findProfile(name) {
    if (!name) return null;
    const lowerName = name.trim().toLowerCase();
    if (profileMap.has(lowerName)) return profileMap.get(lowerName);
    for (const [key, profile] of profileMap.entries()) {
        if (key.includes(lowerName) || lowerName.includes(key)) return profile;
    }
    return null;
}

async function processItem(item, period) {
    if (!item) return;

    const name = String(item['НАИМЕНОВАНИЯ'] || '').trim();
    if (!name) return;

    let inn = String(item['ИНН'] || '').trim();
    const normalizedName = name.toLowerCase();

    // 1. Find Company
    let companyId = null;

    // Try by INN (if valid)
    if (inn && !inn.startsWith('NO_INN_') && inn.length >= 5) {
        companyId = companyMap.get(inn);
    }

    // Try by Name if still not found
    if (!companyId && normalizedName) {
        companyId = companyNameMap.get(normalizedName);
    }

    // If still missing, we might need a pseudo-INN for a NEW company that is truly missing
    if (!companyId) {
        if (!inn || inn.length < 5) {
            let hash = 0;
            for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i);
            inn = `NO_INN_${Math.abs(hash)}`;
        }

        console.log(`Creating new company: ${name} (${inn})`);
        const { data: inserted, error: insErr } = await supabase.from('companies').insert({
            inn, name, department: 'default', is_active: true, tax_regime: 'turnover'
        }).select('id').single();

        if (insErr) {
            console.error(`Error creating company ${name}:`, insErr.message);
            return;
        }
        companyId = inserted.id;
        // Update caches
        if (inn && !inn.startsWith('NO_INN_')) companyMap.set(inn, companyId);
        companyNameMap.set(normalizedName, companyId);
    }

    const accountantName = String(item['Бухгалтер'] || '').trim();
    const bankManagerName = String(item['bank klient'] || '').trim();
    const supervisorName = String(item['Назоratchi'] || item['Назоratchi'] || item['Назоратchi'] || item['Назоратчи'] || '').trim();

    const accountant = findProfile(accountantName);
    const bankManager = findProfile(bankManagerName);
    const supervisor = findProfile(supervisorName);

    const contractAmount = Number(item['Столбец7']) || 0;

    try {
        // 2. Upsert Snapshot (Monthly Reports)
        await supabase.from('company_monthly_reports').upsert({
            company_id: companyId,
            period: period,
            contract_amount: contractAmount,
            assigned_accountant_id: accountant?.id,
            assigned_accountant_name: accountantName,
            assigned_bank_manager_id: bankManager?.id,
            assigned_bank_manager_name: bankManagerName,
            assigned_supervisor_id: supervisor?.id,
            assigned_supervisor_name: supervisorName,
        }, { onConflict: 'company_id, period' });

        // 3. Upsert Operations (Matrix Visibility)
        await supabase.from('operations').upsert({
            company_id: companyId,
            period: period,
            assigned_accountant_id: accountant?.id,
            assigned_accountant_name: accountantName,
            assigned_bank_manager_id: bankManager?.id,
            assigned_bank_manager_name: bankManagerName,
            assigned_supervisor_id: supervisor?.id,
            assigned_supervisor_name: supervisorName,
            contract_amount: contractAmount
        }, { onConflict: 'company_id, period' });

    } catch (err) {
        console.error(`Error processing ${name}:`, err.message);
    }
}

async function processFile(filename, period) {
    const filePath = path.resolve(__dirname, `../public/${filename}`);
    if (!fs.existsSync(filePath)) return;

    let raw = fs.readFileSync(filePath, 'utf-8').trim();
    if (!raw.startsWith('[')) {
        raw = '[' + raw.replace(/}\s*{/g, '},{') + ']';
    }
    raw = raw.replace(/},\s*]/g, '}]');

    let jsonData;
    try {
        jsonData = JSON.parse(raw);
    } catch (e) {
        console.error('JSON Error in ' + filename + ':', e.message);
        return;
    }

    console.log(`Processing ${jsonData.length} items for ${period}...`);
    for (let i = 0; i < jsonData.length; i += 20) {
        const chunk = jsonData.slice(i, i + 20);
        await Promise.all(chunk.map(item => processItem(item, period)));
        process.stdout.write('.');
    }
    console.log(`\nFinished ${period}`);
}

async function run() {
    await fetchData();
    await processFile('Firmalar 31.12.2025.json', '2025 Dekabr');
    await processFile('Firmalar 31.01.2026.json', '2026 Yanvar');
    await processFile('Firmalar 31.12.2025.json', '2025 Yillik');
    console.log('\n--- ALL UPDATED PERFECTLY ---');
}

run().catch(console.error);
