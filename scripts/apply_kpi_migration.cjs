const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceKey);

async function runMigration() {
    const sqlPath = path.join(process.cwd(), 'supabase/migrations/20260223_simplify_kpi_system.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('--- Applying KPI Simplification Migration ---');

    // We split by ';' for simple execution if possible, but PG blocks are tricky.
    // Supabase RPC 'exec_sql' would be ideal if it exists.
    // If not, we'll try to run it as one block.

    const { error } = await supabase.rpc('exec_sql', { sql_text: sql });

    if (error) {
        if (error.message.includes('function "exec_sql" does not exist')) {
            console.error('RPC "exec_sql" not found. Falling back to multi-statement execution if supported...');
            // In a real environment, we'd use a more robust way to run SQL.
            // For this task, I'll assume I can run the SQL or I'll provide instructions.
            // Wait, I can't easily run raw SQL without an RPC or the CLI.
            console.log('Please run the SQL in supabase/migrations/20260223_simplify_kpi_system.sql manually in the Supabase SQL Editor.');
        } else {
            console.error('Migration failed:', error);
        }
    } else {
        console.log('Migration applied successfully!');
    }
}

runMigration();
