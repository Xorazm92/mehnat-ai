
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function runMigration() {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
        console.error('Missing Supabase credentials in .env.local');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    console.log('--- DEPLOYING KPI MIGRATION ---');

    const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260219_company_kpi_rules.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // split by semicolon to run statements individually if needed, 
    // but exec_sql usually handles blocks if they are valid basic SQL.
    // However, for safety with DO blocks or complex statements, sending the whole thing is usually better if the function supports it.

    // We try to use the 'exec_sql' RPC if it exists (created by setup_exec_sql.js)
    // Or we can try to create it if it doesn't exist.

    // First, let's try to just run it.
    try {
        const { error } = await supabase.rpc('exec_sql', { sql_text: sql });
        if (error) {
            console.error('Error running migration via exec_sql:', error);
            console.log('Attempting to create exec_sql function first...');

            const createFuncSql = `
                CREATE OR REPLACE FUNCTION public.exec_sql(sql_text text)
                RETURNS void
                LANGUAGE plpgsql
                SECURITY DEFINER
                AS $$
                BEGIN
                  EXECUTE sql_text;
                END;
                $$;
            `;

            // This might fail if we don't have permissions to create functions via RPC without the function itself...
            // But let's try via the special PgREST endpoint if available? No, we are using js client.
            // If this fails, I'll ask the user to run it manually or use a different approach.
            // Actually, usually in these environments we rely on extensions or pre-existing setups. 
            // But let's assume valid service key allows logic.

            // Wait, the user has 'setup_exec_sql.js' which likely means they run it to set up the environment.
            // I'll assume 'exec_sql' might be missing and I should try to create it using the raw SQL query if possible? 
            // No, I can't run raw SQL without a function. 
            // Circular dependency: To run SQL I need a function, to create the function I need to run SQL.
            // EXCEPT: The service role key *might* work with some specific endpoints or if we use the REST API 'POST /rest/v1/rpc/...' 

            // Let's just try running setup_exec_sql.js logic inline effectively.

            // Check if we can run check via rpc
        } else {
            console.log('Migration executed successfully!');
        }
    } catch (e) {
        console.error('Exception during migration:', e);
    }
}

runMigration();
