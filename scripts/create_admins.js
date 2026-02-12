// scripts/create_admins.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
    console.error('Error: VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in .env.local');
    process.exit(1);
}

// Admin client for Auth operations
const supabase = createClient(supabaseUrl, serviceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

const admins = [
    { email: 'gozaloy@asos.uz', name: "Go'zaloy", role: 'super_admin' },
    { email: 'muslimbek@asos.uz', name: 'Muslimbek', role: 'super_admin' },
    { email: 'musobek@asos.uz', name: 'Musobek', role: 'super_admin' }
];

const DEFAULT_PASSWORD = 'Asos2026!';

async function run() {
    console.log('--- Super Admin Creation Process Started ---');

    for (const admin of admins) {
        console.log(`\nProcessing: ${admin.name} (${admin.email})...`);

        // 1. Create User in Auth (or get if exists)
        let userId;
        const { data: userRecord, error: fetchError } = await supabase.auth.admin.listUsers();

        const existingUser = userRecord?.users.find(u => u.email === admin.email);

        if (existingUser) {
            console.log(`  - User already exists in Auth. ID: ${existingUser.id}`);
            userId = existingUser.id;
        } else {
            console.log(`  - Creating new user in Auth...`);
            const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
                email: admin.email,
                password: DEFAULT_PASSWORD,
                email_confirm: true
            });

            if (createError) {
                console.error(`  - Failed to create user: ${createError.message}`);
                continue;
            }
            userId = newUser.user.id;
            console.log(`  - Created successfully. ID: ${userId}`);
        }

        // 2. Upsert Profile
        console.log(`  - Updating profile to '${admin.role}'...`);
        const { error: profileError } = await supabase
            .from('profiles')
            .upsert({
                id: userId,
                email: admin.email,
                full_name: admin.name,
                role: admin.role,
                is_active: true
            });

        if (profileError) {
            console.error(`  - Profile update failed: ${profileError.message}`);
        } else {
            console.log(`  - Profile updated successfully.`);
        }

        // 3. Update Staff table (using name and email)
        console.log(`  - Syncing with staff table...`);
        const { error: staffError } = await supabase
            .from('staff')
            .upsert({
                id: userId,
                name: admin.name,
                role: 'supervisor', // staff role is internal
                email: admin.email
            });

        if (staffError) {
            console.error(`  - Staff update failed: ${staffError.message}`);
        } else {
            console.log(`  - Staff table synced.`);
        }
    }

    console.log('\n--- Process Completed ---');
}

run();
