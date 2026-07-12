import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Testing connectivity to:', supabaseUrl);

const supabase = createClient(supabaseUrl, serviceKey);

async function test() {
    try {
        const start = Date.now();
        const { data, error } = await supabase.from('profiles').select('count', { count: 'exact', head: true });
        const end = Date.now();

        if (error) {
            console.error('API Error:', error.message);
        } else {
            console.log('SUCCESS: API reachable. Ping time:', end - start, 'ms');
            console.log('Profiles table accessible.');
        }
    } catch (e) {
        console.error('Exception:', e.message);
    }
}

test();
