
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

console.log("Starting Verification (via test_supabase match)...");

async function runVerify() {
    try {
        const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);
        console.log("Client created.");

        const { count: companies } = await supabase.from('companies').select('*', { count: 'exact', head: true });
        const { count: ops2025 } = await supabase.from('operations').select('*', { count: 'exact', head: true }).eq('period', '2025 Yillik');
        const { count: ops2026 } = await supabase.from('operations').select('*', { count: 'exact', head: true }).eq('period', '2026 Yanvar');

        console.log(`Total Companies: ${companies}`);
        console.log(`Operations 2025 Yillik: ${ops2025}`);
        console.log(`Operations 2026 Yanvar: ${ops2026}`);

    } catch (e) {
        console.error("Verify Error:", e);
    }
}

runVerify();
