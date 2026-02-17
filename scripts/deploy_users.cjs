const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env.local
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
    console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

const USERS = [
    // Super Admin
    { name: 'Yorqinoy', email: 'admin@asos.uz', role: 'super_admin', password: 'Asos2026!' },

    // Supervisors
    { name: 'Go\'zaloy', email: 'gozaloy@asos.uz', role: 'supervisor', password: 'Asos2026!' },
    { name: 'Muslimbek', email: 'muslimbek@asos.uz', role: 'supervisor', password: 'Asos2026!' },
    { name: 'Musobek', email: 'musobek@asos.uz', role: 'supervisor', password: 'Asos2026!' },

    // Accountants
    { name: 'Ruslan', email: 'ruslan@asos.uz', role: 'accountant', password: 'Asos2026!' },
    { name: 'Otabek', email: 'otabek@asos.uz', role: 'accountant', password: 'Asos2026!' },
    { name: 'Abrorbek', email: 'abrorbek@asos.uz', role: 'accountant', password: 'Asos2026!' },
    { name: 'Maxmuda', email: 'maxmuda@asos.uz', role: 'accountant', password: 'Asos2026!' },
    { name: 'Mirabbos', email: 'mirabbos@asos.uz', role: 'accountant', password: 'Asos2026!' },
    { name: 'Axmadjon', email: 'axmadjon@asos.uz', role: 'accountant', password: 'Asos2026!' },
    { name: 'Humora', email: 'humora@asos.uz', role: 'accountant', password: 'Asos2026!' },
    { name: 'Zamira', email: 'zamira@asos.uz', role: 'accountant', password: 'Asos2026!' },
    { name: 'Javohir', email: 'javohir@asos.uz', role: 'accountant', password: 'Asos2026!' },
    { name: 'Dilhush', email: 'dilhush@asos.uz', role: 'accountant', password: 'Asos2026!' },
    { name: 'Abdug\'ani', email: 'abdug\'ani@asos.uz', role: 'accountant', password: 'Asos2026!' },
    { name: 'Hasan', email: 'hasan@asos.uz', role: 'accountant', password: 'Asos2026!' },
    { name: 'Ilhom', email: 'ilhom@asos.uz', role: 'accountant', password: 'Asos2026!' },
    { name: 'Mirahmad', email: 'mirahmad@asos.uz', role: 'accountant', password: 'Asos2026!' },
    { name: 'Adham', email: 'adham@asos.uz', role: 'accountant', password: 'Asos2026!' },
    { name: 'Kamron', email: 'kamron@asos.uz', role: 'accountant', password: 'Asos2026!' },
    { name: 'Elbek', email: 'elbek@asos.uz', role: 'accountant', password: 'Asos2026!' },
    { name: 'Sevara', email: 'sevara@asos.uz', role: 'accountant', password: 'Asos2026!' },
    { name: 'Azizbek', email: 'azizbek@asos.uz', role: 'accountant', password: 'Asos2026!' },
    { name: 'Mohirbek', email: 'mohirbek@asos.uz', role: 'accountant', password: 'Asos2026!' },
    { name: 'Alisher', email: 'alisher@asos.uz', role: 'accountant', password: 'Asos2026!' },
    { name: 'Bekzod', email: 'bekzod@asos.uz', role: 'accountant', password: 'Asos2026!' },
    { name: 'Sherzod', email: 'sherzod@asos.uz', role: 'accountant', password: 'Asos2026!' }
];

async function deploy() {
    console.log(`Starting deployment for ${USERS.length} users...`);

    for (const user of USERS) {
        try {
            console.log(`Processing ${user.email}...`);

            // 1. Check if user exists
            /* Note: listUsers() paginates by default (50 users). For a small list < 50 this is fine. 
               Ideally search by email but admin API might not support it directly in all versions. 
               Let's just try create and handle error, or fetch all.
            */

            let userId = null;

            const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
                email: user.email,
                password: user.password,
                email_confirm: true,
                user_metadata: { full_name: user.name }
            });

            if (!createError && newUser.user) {
                console.log(`  User created.`);
                userId = newUser.user.id;
            } else {
                // Assume user exists or error. Try to find user.
                console.log(`  Create failed or user exists. Finding user...`);

                // Fetch all users to find ID (inefficient but safe for <1000 users)
                const { data: { users: allUsers }, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });

                if (listError) {
                    console.error(`  Failed to list users: ${listError.message}`);
                    continue;
                }

                const existingUser = allUsers.find(u => u.email.toLowerCase() === user.email.toLowerCase());

                if (existingUser) {
                    userId = existingUser.id;
                    console.log(`  User found (ID: ${userId}). Updating password...`);

                    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
                        password: user.password,
                        user_metadata: { full_name: user.name },
                        email_confirm: true
                    });

                    if (updateError) {
                        console.error(`  Failed to update password: ${updateError.message}`);
                        continue;
                    }
                    console.log(`  Password updated.`);
                } else {
                    console.error(`  Could not find user and create failed: ${createError?.message}`);
                    continue;
                }
            }

            // 2. Update Role in Profiles
            if (userId) {
                const { error: profileError } = await supabase
                    .from('profiles')
                    .upsert({
                        id: userId,
                        email: user.email,
                        full_name: user.name,
                        role: user.role,
                        updated_at: new Date()
                    });

                if (profileError) {
                    console.error(`  Failed to update profile: ${profileError.message}`);
                } else {
                    console.log(`  Profile updated with role ${user.role}.`);
                }
            }


        } catch (err) {
            console.error(`  Unexpected error for ${user.email}:`, err);
        }
    }

    console.log('Deployment complete.');
}

deploy();
