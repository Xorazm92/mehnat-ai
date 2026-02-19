import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
    console.error('Error: VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

const EMAIL = process.env.YORQINOY_EMAIL || 'admin@asos.uz';
const FULL_NAME = process.env.YORQINOY_FULL_NAME || 'Yorqinoy';
const PASSWORD = process.env.YORQINOY_PASSWORD || 'Asos2026!';
const ROLE = process.env.YORQINOY_ROLE || 'super_admin';

async function run() {
    console.log('--- Seeding Yorqinoy (Auth + Profiles) ---');

    let userId;

    try {
        const { data: created, error: createError } = await supabase.auth.admin.createUser({
            email: EMAIL,
            password: PASSWORD,
            email_confirm: true,
            user_metadata: { full_name: FULL_NAME }
        });

        if (!createError && created?.user?.id) {
            userId = created.user.id;
            console.log(`Auth user created: ${EMAIL} (id: ${userId})`);
        } else {
            const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
            if (listError) throw listError;

            const existing = listData?.users?.find(u => (u.email || '').toLowerCase() === EMAIL.toLowerCase());
            if (!existing?.id) {
                throw new Error(createError?.message || `Could not create or find auth user for ${EMAIL}`);
            }

            userId = existing.id;
            console.log(`Auth user exists: ${EMAIL} (id: ${userId})`);

            const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
                password: PASSWORD,
                email_confirm: true,
                user_metadata: { full_name: FULL_NAME }
            });

            if (updateError) {
                console.warn(`Warning: failed to update auth user password/metadata: ${updateError.message}`);
            }
        }

        const { error: profileError } = await supabase
            .from('profiles')
            .upsert({
                id: userId,
                email: EMAIL,
                full_name: FULL_NAME,
                role: ROLE,
                is_active: true
            });

        if (profileError) throw profileError;

        console.log(`Profile upserted: ${FULL_NAME} (${EMAIL}) role=${ROLE}`);
        console.log('--- Done ---');
    } catch (e) {
        console.error('Seed failed:', e);
        process.exit(1);
    }
}

run();
