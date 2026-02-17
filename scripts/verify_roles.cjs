const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env.local
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
    console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function verify() {
    console.log('--- Verifying Roles in Profiles Table ---');

    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('email, full_name, role')
        .order('role');

    if (error) {
        console.error('Error fetching profiles:', error.message);
        return;
    }

    console.table(profiles);

    const superAdmins = profiles.filter(p => p.role === 'super_admin');
    const supervisors = profiles.filter(p => p.role === 'supervisor');
    const accountants = profiles.filter(p => p.role === 'accountant');

    console.log(`\nSuper Admins: ${superAdmins.length}`);
    superAdmins.forEach(p => console.log(` - ${p.email} (${p.full_name})`));

    console.log(`\nSupervisors: ${supervisors.length}`);
    supervisors.forEach(p => console.log(` - ${p.email} (${p.full_name})`));

    console.log(`\nAccountants: ${accountants.length}`);

    if (superAdmins.length > 1) {
        console.log('\n⚠️ WARNING: More than one Super Admin found!');
    } else {
        console.log('\n✅ Role distribution looks correct.');
    }
}

verify();
