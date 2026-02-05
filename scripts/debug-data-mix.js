
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findOverlap() {
    const { data: profiles } = await supabase.from('profiles').select('full_name');
    const { data: companies } = await supabase.from('companies').select('name');

    const profileNames = new Set(profiles.map(p => p.full_name.toLowerCase()));
    const companyNames = new Set(companies.map(c => c.name.toLowerCase()));

    const intersection = [...profileNames].filter(name => companyNames.has(name));

    console.log('--- NAME OVERLAP (Names in both Profiles and Companies) ---');
    if (intersection.length === 0) {
        console.log('No direct name overlap found.');
    } else {
        intersection.forEach(name => console.log(`MIXED NAME: ${name}`));
    }

    console.log('\n--- JUNK PROFILES ---');
    profiles.filter(p => p.full_name.length < 3 || p.full_name === '0' || p.full_name === '-').forEach(p => console.log(`JUNK: ${p.full_name}`));
}

findOverlap();
