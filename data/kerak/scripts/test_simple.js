import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function testSelect1() {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const supabase = createClient(supabaseUrl, serviceKey);

    console.log('Testing simple SELECT 1...');
    const startTime = Date.now();

    // We can use a raw table select with limit 1 as a proxy for select 1 if exec_sql isn't available
    const { data, error } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).limit(1);

    const duration = Date.now() - startTime;
    if (error) {
        console.error('Test Failed:', error.message);
    } else {
        console.log(`Test Succeeded in ${duration}ms`);
    }
}

testSelect1().catch(console.error);
