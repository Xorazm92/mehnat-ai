import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Error: VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const JSON_PATH = path.join(process.cwd(), 'public', 'kpi-oylik.json');

const META_KEYS = new Set([
  '№',
  'НАИМЕНОВАНИЯ',
  'Бухгалтер',
  'bank klient',
  'Shartnoma summasi',
  'Назоратчи',
  'Buxgalter KPI',
  'Bank klient KPI',
  'NazoratchiKPI',
  'Nazoratchi KPI'
]);

const normalizeKey = (k) => String(k || '').trim().replace(/\s+/g, ' ');

const slugify = (s) =>
  String(s)
    .toLowerCase()
    .trim()
    .replace(/['`’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const classifyRule = (label) => {
  const l = label.toLowerCase();

  // Attendance / FaceID
  if (l.includes('ishga') && (l.includes('kelish') || l.includes('ketish') || l.includes('kechik'))) {
    if (l.includes('nazoratchi')) return { role: 'supervisor', category: 'attendance' };
    if (l.includes('bank')) return { role: 'bank_client', category: 'attendance' };
    // default: accountant attendance
    return { role: 'accountant', category: 'attendance' };
  }

  // Group supervision
  if (l.includes('gruppa') || l.includes('guruh')) {
    if (l.includes('bank')) return { role: 'bank_client', category: 'group' };
    if (l.includes('nazoratchi')) return { role: 'supervisor', category: 'group' };
    return { role: 'accountant', category: 'group' };
  }

  // Supervisor score line
  if (l === 'nazoratchi') {
    return { role: 'supervisor', category: 'group' };
  }

  // Default to accountant/report KPI
  return { role: 'accountant', category: 'reports' };
};

const extractRuleStats = (rows, key) => {
  let maxPos = 0;
  let minNeg = 0;

  for (const r of rows) {
    const raw = r[key];
    if (raw === null || raw === undefined || raw === '') continue;

    const n = Number(raw);
    if (!Number.isFinite(n)) continue;

    if (n > maxPos) maxPos = n;
    if (n < minNeg) minNeg = n;
  }

  return { rewardPercent: maxPos, penaltyPercent: minNeg };
};

async function upsertRule(rule) {
  // Find existing by name+role
  const { data: existing, error: findErr } = await supabase
    .from('kpi_rules')
    .select('id')
    .eq('name', rule.name)
    .eq('role', rule.role)
    .limit(1);

  if (findErr) throw findErr;

  const payload = {
    ...(existing && existing[0]?.id ? { id: existing[0].id } : {}),
    name: rule.name,
    name_uz: rule.nameUz,
    description: rule.description || null,
    role: rule.role,
    reward_percent: rule.rewardPercent,
    penalty_percent: rule.penaltyPercent,
    input_type: rule.inputType,
    category: rule.category,
    sort_order: rule.sortOrder,
    is_active: true
  };

  const { error } = await supabase.from('kpi_rules').upsert(payload);
  if (error) throw error;
}

async function run() {
  console.log('--- Seeding KPI Rules from public/kpi-oylik.json ---');

  if (!fs.existsSync(JSON_PATH)) {
    console.error(`File not found: ${JSON_PATH}`);
    process.exit(1);
  }

  const json = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const rows = Array.isArray(json?.KPI) ? json.KPI : [];

  if (rows.length === 0) {
    console.error('No KPI rows found in JSON. Expected { KPI: [...] }');
    process.exit(1);
  }

  // Collect keys
  const keys = new Set();
  for (const r of rows) {
    Object.keys(r || {}).forEach((k) => keys.add(normalizeKey(k)));
  }

  // Filter only KPI-like columns
  const ruleKeys = [...keys]
    .filter((k) => !META_KEYS.has(k))
    // ignore duplicated numbered helper columns like "...2" "...3" "...4" etc (these look like amount columns)
    .filter((k) => !/\d+$/.test(k))
    .filter((k) => k.length > 0);

  console.log(`Detected ${ruleKeys.length} rule columns.`);

  // Seed only the important ones by default
  const important = ruleKeys.filter((k) => {
    const l = k.toLowerCase();
    return (
      l.includes('gruppa') ||
      l.includes('guruh') ||
      (l.includes('ishga') && (l.includes('kelish') || l.includes('ketish') || l.includes('kechik'))) ||
      l === 'nazoratchi'
    );
  });

  console.log(`Seeding ${important.length} important KPI rules (attendance + group).`);

  let sort = 10;

  for (const label of important) {
    const { role, category } = classifyRule(label);
    const stats = extractRuleStats(rows, label);

    // Skip empty columns
    if (!stats.rewardPercent && !stats.penaltyPercent) continue;

    const rule = {
      name: `${slugify(label)}_${role}`,
      nameUz: label,
      role,
      category,
      inputType: 'checkbox',
      rewardPercent: stats.rewardPercent || 0,
      penaltyPercent: stats.penaltyPercent || 0,
      sortOrder: sort
    };

    await upsertRule(rule);
    console.log(`Upserted: [${role}] ${label} (cat=${category}) +${rule.rewardPercent}% / ${rule.penaltyPercent}%`);
    sort += 10;
  }

  console.log('--- Done ---');
}

run().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
