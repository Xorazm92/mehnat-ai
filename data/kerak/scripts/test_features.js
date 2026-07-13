
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

if (!supabaseUrl || !supabaseKey) {
    console.error("Critical: Missing Supabase credentials. Cannot verify.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runTests() {
    console.log("\n--- Starting Feature Tests ---\n");

    // 1. Fetch a target company
    const { data: companies, error: fetchError } = await supabase
        .from('companies')
        .select('id, name')
        .limit(1);

    if (fetchError || !companies.length) {
        console.error("❌ Failed to fetch a company for testing:", fetchError?.message);
        return;
    }

    const company = companies[0];
    console.log(`Target Company: ${company.name} (${company.id})`);

    // TEST 1: Accountant History (Stamping)
    console.log("\n[TEST 1] Accountant History (Stamping)...");
    const period = '2026-01'; // Test period
    const testAccountantName = 'TEST_ROBOT_ACCOUNTANT';

    // Update a report cell
    const { error: updateError } = await supabase
        .from('company_monthly_reports')
        .upsert({
            company_id: company.id,
            period: period,
            comment: 'Test Update',
            assigned_accountant_name: testAccountantName,
            updated_at: new Date().toISOString()
        }, { onConflict: 'company_id,period' });

    if (updateError) {
        console.error("❌ Link Update Failed:", updateError.message);
    } else {
        // Verify
        const { data: report } = await supabase
            .from('company_monthly_reports')
            .select('assigned_accountant_name')
            .eq('company_id', company.id)
            .eq('period', period)
            .single();

        if (report?.assigned_accountant_name === testAccountantName) {
            console.log("✅ SUCCESS: assigned_accountant_name stamped correctly!");
        } else {
            console.error(`❌ FAILED: Expected '${testAccountantName}', got '${report?.assigned_accountant_name}'`);
        }
    }

    // TEST 2: Active Services
    console.log("\n[TEST 2] Active Services Persistence...");
    const testServices = ['didox', 'my_mehnat', 'test_key'];

    const { error: serviceError } = await supabase
        .from('companies')
        .update({ active_services: testServices })
        .eq('id', company.id);

    if (serviceError) {
        console.error("❌ Service Update Failed:", serviceError.message);
    } else {
        // Verify
        const { data: updatedCompany } = await supabase
            .from('companies')
            .select('active_services')
            .eq('id', company.id)
            .single();

        // Check if arrays match (simple length check + inclusion)
        const saved = updatedCompany?.active_services || [];
        const isMatch = saved.length === testServices.length && testServices.every(s => saved.includes(s));

        if (isMatch) {
            console.log("✅ SUCCESS: active_services saved correctly!", saved);
        } else {
            console.error("❌ FAILED: active_services mismatch.", saved);
        }

        // Cleanup active services (reset to empty/default to verify restore)
        // await supabase.from('companies').update({ active_services: [] }).eq('id', company.id);
        // console.log("   (Services reset to default for safety)");
    }

    console.log("\n--- Tests Complete ---\n");
}

runTests().catch(e => console.error(e));
