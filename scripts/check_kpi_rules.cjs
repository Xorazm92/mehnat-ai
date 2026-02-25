const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceKey);

async function checkRules() {
    const { data, error } = await supabase.from('kpi_rules').select('*').order('sort_order');
    if (error) console.error(error);
    else console.log(JSON.stringify(data, null, 2));
}

checkRules();
