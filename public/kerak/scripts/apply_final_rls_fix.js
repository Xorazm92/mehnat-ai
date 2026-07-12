
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function applyFix() {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = createClient(supabaseUrl, serviceKey);

    console.log('--- APPLYING FINAL RLS RECURSION FIX ---');

    const sqlFile = path.resolve(__dirname, '../supabase/migrations/20260218_fix_rls_recursion_final.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    // Split by semicolons, but be careful with functions. 
    // For simplicity, we'll try to run it in chunks or as a whole if exec_sql supports it.
    // Most 'exec_sql' RPCs in these setups handle multiple statements.

    try {
        const { data, error } = await supabase.rpc('exec_sql', { sql_text: sql });
        if (error) {
            console.error('Error applying fix:', error.message);
            console.log('Attempting to apply statements individually...');

            // Fallback: split by semicolon (naive)
            const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
            for (const stmt of statements) {
                const { error: stmtErr } = await supabase.rpc('exec_sql', { sql_text: stmt + ';' });
                if (stmtErr) {
                    console.error('Failed statement:', stmt);
                    console.error('Error:', stmtErr.message);
                } else {
                    console.log('Succeeded statement.');
                }
            }
        } else {
            console.log('Migration applied successfully!');
        }
    } catch (e) {
        console.error('Exception:', e.message);
    }

    console.log('--- DONE ---');
}

applyFix();
