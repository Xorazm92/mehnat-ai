/**
 * KPI Rules V2 - Seed Script
 * Bu skript kpi-rules-v2.json faylidagi qoidalarni Supabase bazasiga yozadi.
 * Ishlatish: node scripts/seed_kpi_rules_v2.js
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('=== KPI Rules V2 Seed ===\n');

  const rulesPath = path.join(process.cwd(), 'public', 'kpi-rules-v2.json');
  const rulesData = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
  const rules = rulesData.rules;

  console.log(`Jami qoidalar: ${rules.length}`);

  let inserted = 0, updated = 0, errors = 0;

  for (const rule of rules) {
    const record = {
      name:          rule.id,
      name_uz:       rule.name_uz,
      description_uz: rule.description_uz || null,
      role:          rule.role === 'bank_client' ? 'bank_client' : rule.role,
      input_type:    rule.input_type || 'checkbox',
      input_type_v2: rule.input_type,
      category:      rule.category,
      sort_order:    rule.sort_order,
      scope:         rule.scope || 'global',
      max_bonus:     rule.max_bonus ?? null,
      max_penalty:   rule.max_penalty ?? null,
      options:       rule.options || [],
      reward_percent:  rule.max_bonus ?? 0,
      penalty_percent: rule.max_penalty ? Math.abs(rule.max_penalty) : 0,
      is_active:     true
    };

    const { error } = await supabase
      .from('kpi_rules')
      .upsert(record, { onConflict: 'name' });

    if (error) {
      console.error(`  ❌ Xato [${rule.id}]:`, error.message);
      errors++;
    } else {
      console.log(`  ✅ [${rule.role.padEnd(12)}] ${rule.name_uz}`);
      inserted++;
    }
  }

  console.log(`\n--- Natija ---`);
  console.log(`✅ Muvaffaqiyatli: ${inserted}`);
  console.log(`❌ Xatolar:       ${errors}`);
}

run().catch(console.error);
