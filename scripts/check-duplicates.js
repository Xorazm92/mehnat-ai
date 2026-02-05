import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    console.log('--- Database Consistency Check ---');
    
    // Check Companies
    const { data: companies } = await supabase.from('companies').select('id, name, inn');
    const nameMap = {};
    const innMap = {};
    const dupeNames = [];
    const dupeInns = [];
    
    companies.forEach(c => {
        const name = c.name.trim().toLowerCase();
        if (nameMap[name]) dupeNames.push(c.name);
        nameMap[name] = true;
        
        const inn = c.inn.trim();
        if (innMap[inn] && !inn.startsWith('inn-')) dupeInns.push(inn);
        innMap[inn] = true;
    });
    
    console.log('Duplicate Company Names:', dupeNames.length);
    if (dupeNames.length > 0) console.log('Sample:', dupeNames.slice(0, 5));
    
    console.log('Duplicate INNs (excluding generated):', dupeInns.length);
    if (dupeInns.length > 0) console.log('Sample:', dupeInns.slice(0, 5));

    // Check Profiles
    const { data: profiles } = await supabase.from('profiles').select('id, full_name');
    const numericStaff = profiles.filter(p => !isNaN(parseFloat(p.full_name.replace(/,/g, ''))) && p.full_name.includes('.'));
    console.log('Phantom Numeric Profiles:', numericStaff.length);
    if (numericStaff.length > 0) console.log('Sample:', numericStaff.slice(0, 5).map(s => s.full_name));

    console.log('\nTotal Records:');
    console.log('Companies:', companies.length);
    console.log('Profiles:', profiles.length);
}
check();
