import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing env vars");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    console.log("1. Testing Auth SignUp via Native Fetch...");
    const fakeEmail = `test.native${Date.now()}@asos.uz`;
    try {
        const res = await fetch(`${supabaseUrl}/auth/v1/signup`, {
            method: 'POST',
            headers: {
                'apikey': supabaseKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: fakeEmail,
                password: 'Password123!',
                data: { full_name: 'Test Native', role: 'accountant' }
            })
        });
        const result = await res.json();
        console.log("Auth Fetch Result:", res.status, res.statusText, result.msg || result.user?.id || 'Success');
    } catch (e) {
        console.error("Auth Fetch Error:", e.message);
    }

    const fakeId = "d5c5f426-8968-450a-9177-33eb1f062d51";

    console.log("\n2. Testing Direct JS Upsert...");
    const payload = {
        id: fakeId,
        email: 'direct@asos.uz',
        full_name: 'Direct Test',
        role: 'accountant',
        avatar_color: '#000',
        phone: '',
        is_active: true
    };

    const { error: dErr } = await supabase.from('profiles').upsert(payload);
    console.log("Direct Upsert Error:", dErr ? dErr.message : "Success!");

    console.log("\n3. Testing RPC Fallback...");
    const { error: rErr } = await supabase.rpc('upsert_staff_v1', {
        p_id: fakeId,
        p_email: 'rpc@asos.uz',
        p_full_name: 'RPC Test',
        p_role: 'accountant',
        p_avatar_color: '#000',
        p_phone: '',
        p_is_active: true
    });
    console.log("RPC Error:", rErr ? rErr.message : "Success!");
}

test().catch(console.error).finally(() => process.exit(0));
