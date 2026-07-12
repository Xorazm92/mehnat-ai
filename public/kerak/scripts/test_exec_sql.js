import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceKey);

async function testRpc() {
    try {
        const { data, error } = await supabase.rpc('exec_sql', { sql_text: 'SELECT 1;' });
        if (error) {
            console.log('Error:', error.message);
        } else {
            console.log('Success: exec_sql existed and worked!');
        }
    } catch (e) {
        console.log('Exception:', e.message);
    }
}

testRpc();
