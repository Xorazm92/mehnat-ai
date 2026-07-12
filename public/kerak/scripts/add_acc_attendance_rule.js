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
    console.error("Critical: Missing Supabase credentials. Cannot add rule.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function addMissingKPIRule() {
    try {
        console.log('Checking for acc_attendance rule...');

        const { data: existing } = await supabase
            .from('kpi_rules')
            .select('id')
            .eq('name', 'acc_attendance')
            .single();

        if (existing) {
            console.log('acc_attendance rule already exists');
            return;
        }

        console.log('Adding acc_attendance rule...');

        const { error } = await supabase
            .from('kpi_rules')
            .insert({
                name: 'acc_attendance',
                name_uz: 'Ishga kelish/ketish',
                role: 'accountant',
                reward_percent: 1.00,
                penalty_percent: -1.00,
                input_type: 'checkbox',
                category: 'manual',
                sort_order: 19,
                is_active: true
            });

        if (error) throw error;

        console.log('Added acc_attendance rule successfully');
    } catch (error) {
        console.error('Error adding KPI rule:', error);
    }
}

addMissingKPIRule();
