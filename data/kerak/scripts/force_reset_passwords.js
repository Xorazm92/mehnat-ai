// scripts/force_reset_passwords.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceKey);

const admins = [
    'go\'zaloy@asos.uz',
    'gozaloy@asos.uz',
    'muslimbek@asos.uz',
    'musobek@asos.uz',
    'admin@asos.uz'
];

const NEW_PASSWORD = 'Asos2026!';

async function run() {
    console.log('--- Force Password Reset Started ---');
    const { data: { users } } = await supabase.auth.admin.listUsers();

    for (const email of admins) {
        const user = users.find(u => u.email === email);
        if (user) {
            console.log(`Resetting ${email} (ID: ${user.id})...`);
            await supabase.auth.admin.updateUserById(user.id, {
                password: NEW_PASSWORD,
                email_confirm: true
            });
            console.log(`  OK.`);
        } else {
            console.log(`User ${email} not found in Auth.`);
        }
    }
    console.log('--- Done ---');
}

run();
