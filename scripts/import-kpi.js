import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const csv = fs.readFileSync('public/Фирмалар 31.01.2026kpi.csv');
const rows = parse(csv, { columns: true, skip_empty_lines: true });

const num = (v) => Number((v || '0').toString().replace(/,/g, '')) || 0;

async function main() {
  // Fetch existing profiles to map accountant names
  const { data: profiles, error: pErr } = await supabase.from('profiles').select('id, full_name');
  if (pErr) throw pErr;

  const nameToId = {};
  profiles.forEach(p => {
    nameToId[p.full_name.toLowerCase()] = p.id;
  });

  for (const r of rows) {
    const accountant = (r['Бухгалтер'] || '').trim();
    if (!accountant) continue;

    const accId = nameToId[accountant.toLowerCase()];
    if (!accId) {
      console.warn(`Accountant profile not found for: ${accountant}`);
      continue;
    }

    const overall = num(r['Buxgalter KPI']);
    const bank = num(r['Bank klient KPI']);
    const naz = num(r['NazoratchiKPI']);

    const { error } = await supabase.from('kpi_metrics').upsert({
      accountant_id: accId,
      period: '2026-01',
      overall_score: overall,
      stats_progress: bank,
      quality_score: naz,
    });

    if (error) {
      console.error('kpi error', accountant, error.message);
    }
  }
  console.log('kpi import done');
}

main().catch((e) => { console.error(e); process.exit(1); });
