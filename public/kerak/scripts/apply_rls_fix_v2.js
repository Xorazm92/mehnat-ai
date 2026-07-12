import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
    console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function applyFix() {
    const sqlPath = path.resolve(__dirname, '../supabase/fix_chief_accountant_rls.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Applying RLS fix for chief_accountant...');
    console.log('SQL File size:', sql.length, 'bytes');

    try {
        console.log('Connecting to Supabase at:', supabaseUrl);
        const { data, error } = await supabase.rpc('exec_sql', { sql_text: sql });

        if (error) {
            if (error.message.includes('function public.exec_sql(text) does not exist')) {
                console.error('CRITICAL: exec_sql function is missing in the database.');
                console.log('Please run the SQL content of supabase/fix_chief_accountant_rls.sql manually in the Supabase SQL Editor.');
            } else {
                console.error('Database Error:', error.message);
                if (error.details) console.error('Details:', error.details);
                if (error.hint) console.error('Hint:', error.hint);
            }
            process.exit(1);
        }

        console.log('SUCCESS: RLS fix applied successfully!');
    } catch (e) {
        console.error('Execution Exception:', e.message);
        process.exit(1);
    }
}

applyFix();
