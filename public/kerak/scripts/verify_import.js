
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Force log immediately
console.log("Starting verification script...");
console.log("Supabase URL:", process.env.VITE_SUPABASE_URL ? "Exists" : "Missing");

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);
console.log("Client created.");

async function check() {
    try {
        console.log("Checking companies...");
        const { count: companies, error: compErr } = await supabase.from('companies').select('*', { count: 'exact', head: true });
        if (compErr) console.error("Companies Error:", compErr);

        console.log("Checking default dept...");
        const { count: defaultDept } = await supabase.from('companies').select('*', { count: 'exact', head: true }).eq('department', 'default');

        console.log("Checking reports...");
        const { count: reports2025 } = await supabase.from('company_monthly_reports').select('*', { count: 'exact', head: true }).eq('period', '2025-12');
        const { count: reports2026 } = await supabase.from('company_monthly_reports').select('*', { count: 'exact', head: true }).eq('period', '2026-01');

        console.log("Checking operations...");
        const { count: ops2025, error: opErr } = await supabase.from('operations').select('*', { count: 'exact', head: true }).eq('period', '2025 Yillik');
        if (opErr) console.error("Operations Error:", opErr);

        const { count: ops2026 } = await supabase.from('operations').select('*', { count: 'exact', head: true }).eq('period', '2026 Yanvar');

        console.log(`Total Companies: ${companies}`);
        console.log(`Companies with 'default' dept: ${defaultDept}`);
        console.log(`Reports 2025-12: ${reports2025}`);
        console.log(`Reports 2026-01: ${reports2026}`);
        console.log(`Operations 2025 Yillik: ${ops2025}`);
        console.log(`Operations 2026 Yanvar: ${ops2026}`);
    } catch (e) {
        console.error("Script Error:", e);
    }
}

check();
