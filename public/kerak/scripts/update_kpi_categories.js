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
    console.error("Critical: Missing Supabase credentials. Cannot update.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function updateKPICategories() {
    try {
        console.log('Updating KPI categories...');

        // Update manual categories
        const { error: error1 } = await supabase
            .from('kpi_rules')
            .update({ category: 'manual' })
            .in('name', ['bank_attendance', 'bank_telegram_ok', 'bank_telegram_missed', 'supervisor_attendance', 'acc_telegram_ok', 'acc_telegram_missed']);

        if (error1) throw error1;

        console.log('Updated manual categories');

        // Update automation categories
        const { error: error2 } = await supabase
            .from('kpi_rules')
            .update({ category: 'automation' })
            .in('name', ['acc_1c_base', 'acc_didox', 'acc_letters', 'acc_my_mehnat', 'acc_auto_cameral', 'acc_cashflow', 'acc_tax_info', 'acc_payroll', 'acc_debt', 'acc_pnl']);

        if (error2) throw error2;

        console.log('Updated automation categories');
        console.log('KPI categories updated successfully');
    } catch (error) {
        console.error('Error updating KPI categories:', error);
    }
}

updateKPICategories();
