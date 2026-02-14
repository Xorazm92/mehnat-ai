const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

async function verify() {
    try {
        // 1. Load env vars
        const envPath = path.resolve(__dirname, '../.env.local');
        if (!fs.existsSync(envPath)) {
            console.error('❌ .env.local not found!');
            process.exit(1);
        }

        const envContent = fs.readFileSync(envPath, 'utf8');
        const getEnv = (key) => {
            const match = envContent.match(new RegExp(`${key}=(.*)`));
            return match ? match[1].trim() : null;
        };

        const url = getEnv('VITE_SUPABASE_URL');
        const key = getEnv('VITE_SUPABASE_ANON_KEY');

        if (!url || !key) {
            console.error('❌ Missing credentials in .env.local');
            process.exit(1);
        }

        console.log('✅ Found credentials');
        const supabase = createClient(url, key);

        // 2. Check company_monthly_reports for assigned_accountant_id
        console.log('Testing company_monthly_reports column: assigned_accountant_id...');
        const { data: reportData, error: reportError } = await supabase
            .from('company_monthly_reports')
            .select('assigned_accountant_id')
            .limit(1);

        if (reportError) {
            console.error('❌ Error checking company_monthly_reports:', reportError.message);
            if (reportError.message.includes('assigned_accountant_id')) {
                console.error('👉 assigned_accountant_id column MISSING!');
            }
        } else {
            console.log('✅ assigned_accountant_id column exists!');
        }

        // 3. Check companies for active_services
        console.log('Testing companies column: active_services...');
        const { data: companyData, error: companyError } = await supabase
            .from('companies')
            .select('active_services')
            .limit(1);

        if (companyError) {
            console.error('❌ Error checking companies:', companyError.message);
            if (companyError.message.includes('active_services')) {
                console.error('👉 active_services column MISSING!');
            }
        } else {
            console.log('✅ active_services column exists!');
        }

    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

verify();
