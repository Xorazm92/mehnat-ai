import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing env: VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const csv = fs.readFileSync('public/Firmalar - Royxat (1).csv');
const rows = parse(csv, { columns: true, skip_empty_lines: true });

const mapTax = (v = '') => v.includes('НДС') ? 'vat' : v.includes('Айланма') ? 'turnover' : v.includes('Қатъий') ? 'fixed' : 'turnover';
const mapStatus = (v = '') => {
  const t = v.trim();
  if (t === '+') return 'accepted';
  if (t === '-') return 'not_submitted';
  if (t === '0') return 'not_required';
  if (t.toLowerCase().includes('kartoteka')) return 'blocked';
  if (t.toLowerCase().includes('ariza')) return 'in_progress';
  return 'unknown';
};

async function main() {
  // Fetch existing profiles to map accountant names
  const { data: profiles, error: pErr } = await supabase.from('profiles').select('id, full_name, email');
  if (pErr) throw pErr;

  const nameToId = {};
  profiles.forEach(p => {
    nameToId[p.full_name.toLowerCase()] = p.id;
  });

  const getOrCreateAccountant = async (name) => {
    if (!name) return null;
    const cleanName = name.trim();
    const lowerName = cleanName.toLowerCase();

    if (nameToId[lowerName]) return nameToId[lowerName];

    // Create new profile if not found
    console.log(`Creating profile for accountant: ${cleanName}`);

    // We need a dummy user in auth.users first, but since we use service_role, 
    // we can just insert into profiles if we don't need auth for them yet.
    // However, the FK constraint references auth.users(id).
    // So we should use admin.createUser
    const email = `${lowerName.replace(/\s+/g, '.')}@asos.uz`;
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: 'TemporaryPassword123!',
      email_confirm: true,
      user_metadata: { full_name: cleanName }
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        const user = existingUsers.users.find(u => u.email === email);
        if (user) {
          nameToId[lowerName] = user.id;
          return user.id;
        }
      }
      console.error(`Error creating auth user for ${cleanName}:`, authError.message);
      return null;
    }

    const { data: newProfile, error: profError } = await supabase
      .from('profiles')
      .upsert({
        id: authData.user.id,
        email: authData.user.email,
        full_name: cleanName,
        role: 'accountant',
        department: 'Buxgalteriya',
        is_active: true
      })
      .select('id')
      .single();

    if (profError) {
      console.error(`Error creating profile for ${cleanName}:`, profError.message);
      return null;
    }

    nameToId[lowerName] = newProfile.id;
    return newProfile.id;
  };

  for (const r of rows) {
    const name = (r['НАИМЕНОВАНИЯ'] || '').trim();
    if (!name) continue;

    const accountantName = (r['Бухгалter'] || r['Бухгалтер'] || '').trim();
    const accountantId = await getOrCreateAccountant(accountantName);

    const inn = (r['ИНН'] || '').trim() || `tmp-${r['-'] || Math.random().toString(36).slice(2, 8)}`;
    const taxRegime = mapTax(r[' ']);

    const { data: companyData, error: cErr } = await supabase
      .from('companies')
      .upsert({
        name,
        inn,
        tax_regime: taxRegime,
        department: 'Buxgalteriya',
        accountant_id: accountantId,
        login: (r['Login'] || '').trim() || null,
        password_encrypted: (r['Parol'] || '').trim() || null,
        is_active: true,
      })
      .select('id')
      .single();

    if (cErr) {
      console.error('company error', name, cErr.message);
      continue;
    }

    const companyId = companyData?.id;

    // Map statuses for operations (period fixed as 2026-01)
    const profit = mapStatus(r['Foyda soliq']);
    const form1 = mapStatus(r['Buxgalteriya balansi']);
    const form2 = mapStatus(r['Moliyaviy natija']);
    const stats = mapStatus(r['Statistika']);

    await supabase.from('operations').upsert({
      company_id: companyId,
      period: '2026-01',
      profit_tax_status: profit,
      form1_status: form1,
      form2_status: form2,
      stats_status: stats,
      comment: '',
    });
  }
  console.log('firms import done');
}

main().catch((e) => { console.error(e); process.exit(1); });
