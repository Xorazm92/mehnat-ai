
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

// Helper to read env file
const readEnv = (filePath) => {
    const env = {};
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        content.split('\n').forEach(line => {
            const parts = line.split('=');
            if (parts.length >= 2 && !line.trim().startsWith('#')) {
                const key = parts[0].trim();
                const value = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
                if (key) env[key] = value;
            }
        });
    }
    return env;
};

// Start with .env, then override with .env.local
const env = { ...readEnv(path.join(rootDir, '.env')), ...readEnv(path.join(rootDir, '.env.local')) };

const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_KEY || env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log(`Supabase URL: ${supabaseUrl ? "✅ Found" : "❌ Missing"}`);
console.log(`Supabase Key: ${supabaseKey ? "✅ Found" : "❌ Missing"}`);

if (!supabaseUrl || !supabaseKey) {
    console.error("Critical: Missing Supabase credentials. Cannot verify.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
    console.log("\n--- Verification Started ---\n");

    // 1. Check 'company_monthly_reports' columns
    console.log("1. Checking 'company_monthly_reports' columns...");
    const { data: reports, error: reportsError } = await supabase
        .from('company_monthly_reports')
        .select('id, assigned_accountant_id, assigned_accountant_name')
        .limit(1);

    if (reportsError) {
        if (reportsError.message.includes('create column') || reportsError.message.includes('does not exist')) {
            console.error("❌ FAILED: 'assigned_accountant_id' or 'assigned_accountant_name' columns missing in 'company_monthly_reports'.");
            console.error("   Reason: Migration failed or wasn't run.");
        } else {
            console.error("❌ Error querying 'company_monthly_reports':", reportsError.message);
        }
    } else {
        console.log("✅ SUCCESS: 'assigned_accountant_id' & 'assigned_accountant_name' columns EXIST.");
    }

    // 2. Check 'companies' columns
    console.log("\n2. Checking 'companies' columns...");
    const { data: companies, error: companiesError } = await supabase
        .from('companies')
        .select('id, active_services')
        .limit(1);

    if (companiesError) {
        if (companiesError.message.includes('does not exist')) {
            console.error("❌ FAILED: 'active_services' column missing in 'companies'.");
            console.error("   Reason: Migration failed or wasn't run.");
        } else {
            console.error("❌ Error querying 'companies':", companiesError.message);
        }
    } else {
        console.log("✅ SUCCESS: 'active_services' column EXISTS.");
        if (companies && companies.length > 0) {
            console.log("   Sample active_services:", companies[0].active_services);
        }
    }

    console.log("\n--- Verification Data ---");
    // Check if any report has an assigned accountant
    const { data: stampedReports } = await supabase
        .from('company_monthly_reports')
        .select('assigned_accountant_name')
        .not('assigned_accountant_name', 'is', null)
        .limit(5);

    console.log(`Reports with stamped accountant: ${stampedReports?.length || 0}`);

    console.log("\n--- Verification End ---");
}

verify().catch(e => console.error(e));
