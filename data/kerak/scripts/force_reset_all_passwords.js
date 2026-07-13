// scripts/force_reset_all_passwords.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

const NEW_PASSWORD = 'Asos2026!';

async function run() {
    console.log('--- Force Password Reset for ALL Users Started ---');
    const { data: { users }, error } = await supabase.auth.admin.listUsers();

    if (error) {
        console.error('Error fetching users:', error);
        return;
    }

    console.log(`Found ${users.length} users in Auth.`);

    for (const user of users) {
        console.log(`Resetting ${user.email} (ID: ${user.id})...`);
        try {
            const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
                password: NEW_PASSWORD,
                email_confirm: true
            });
            if (updateError) {
                console.error(`  FAIL for ${user.email}:`, updateError.message);
            } else {
                console.log(`  OK.`);
            }
        } catch (e) {
            console.error(`  EXCEPTION for ${user.email}:`, e.message);
        }
    }
    console.log('--- Done ---');
}

run();
