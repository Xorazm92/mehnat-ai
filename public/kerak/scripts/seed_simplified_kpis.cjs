const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceKey);

const RULES = [
    // GLOBAL RULES (Broadcasted in UI)
    { name: 'attendance_kelish', name_uz: 'Ishga o\'z vaqtida kelish', role: 'accountant', reward_percent: 1.0, penalty_percent: -1.0, category: 'attendance', sort_order: 10 },
    { name: 'attendance_ketish', name_uz: 'Ishdan o\'z vaqtida ketish', role: 'accountant', reward_percent: 1.0, penalty_percent: -1.0, category: 'attendance', sort_order: 11 },
    { name: 'telegram_response', name_uz: 'Telegram guruhlarda javob', role: 'accountant', reward_percent: 1.0, penalty_percent: -1.0, category: 'telegram', sort_order: 20 },

    // AUTOMATION RULES (Company specific)
    { name: 'automation_1c', name_uz: '1C ma\'lumotlari to\'liqligi', role: 'accountant', reward_percent: 1.0, penalty_percent: -1.0, category: 'automation', sort_order: 30 },
    { name: 'automation_didox', name_uz: 'Didox/E-faktura yuritilishi', role: 'accountant', reward_percent: 1.0, penalty_percent: -1.0, category: 'automation', sort_order: 40 },

    // REPORT RULES (Company specific)
    { name: 'reports_tax', name_uz: 'Soliq hisobotlari va to\'lovlar', role: 'accountant', reward_percent: 1.5, penalty_percent: -1.5, category: 'reports', sort_order: 50 },
    { name: 'reports_stat', name_uz: 'Statistika hisobotlari', role: 'accountant', reward_percent: 1.5, penalty_percent: -1.5, category: 'reports', sort_order: 60 },
    { name: 'reports_finance', name_uz: 'Moliya hisobotlari (F1, F2)', role: 'accountant', reward_percent: 1.5, penalty_percent: -1.5, category: 'reports', sort_order: 70 },

    // SUPERVISOR RULES
    { name: 'supervisor_attendance', name_uz: 'Ishga kelish (Nazoratchi)', role: 'supervisor', reward_percent: 1.0, penalty_percent: -1.0, category: 'attendance', sort_order: 100 },
    { name: 'supervisor_control', name_uz: 'Guruhlar nazorati', role: 'supervisor', reward_percent: 2.0, penalty_percent: -2.0, category: 'management', sort_order: 110 }
];

async function seed() {
    console.log('--- SEEDING SIMPLIFIED KPI RULES ---');

    // 1. Deactivate all existing rules
    console.log('Deactivating old rules...');
    const { error: deactivateError } = await supabase
        .from('kpi_rules')
        .update({ is_active: false })
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Hack to affect all rows

    if (deactivateError) {
        console.error('Error deactivating rules:', deactivateError);
    }

    // 2. Upsert new rules
    console.log('Upserting new rules...');
    for (const rule of RULES) {
        // Try to find by name + role to keep history if possible
        const { data: existing } = await supabase
            .from('kpi_rules')
            .select('id')
            .eq('name', rule.name)
            .eq('role', rule.role)
            .limit(1);

        const payload = {
            ...(existing && existing[0] ? { id: existing[0].id } : {}),
            ...rule,
            is_active: true,
            updated_at: new Date().toISOString()
        };

        const { error: upsertError } = await supabase
            .from('kpi_rules')
            .upsert(payload);

        if (upsertError) {
            console.error(`Error upserting rule ${rule.name}:`, upsertError);
        } else {
            console.log(`Successfully seeded: ${rule.name}`);
        }
    }

    console.log('--- SEEDING COMPLETE ---');
}

seed();
