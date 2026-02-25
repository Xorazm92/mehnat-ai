/**
 * Buxgalter biriktirilmagan korxonalarni o'chirish skripti
 * 
 * Bu skript:
 * 1. Avval buxgalter biriktirilmagan korxonalar sonini ko'rsatadi
 * 2. Keyin ularni bazadan o'chiradi (bog'liq ma'lumotlar bilan birga)
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ VITE_SUPABASE_URL yoki SUPABASE_SERVICE_ROLE_KEY topilmadi!');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
    console.log('🔍 Buxgalter biriktirilmagan korxonalarni tekshirish...\n');

    // 1. Barcha korxonalarni olish
    const { data: allCompanies, error: fetchError } = await supabase
        .from('companies')
        .select('id, name, inn, accountant_id, accountant_name')
        .order('name');

    if (fetchError) {
        console.error('❌ Korxonalarni yuklashda xatolik:', fetchError.message);
        process.exit(1);
    }

    console.log(`📊 Jami korxonalar: ${allCompanies.length}`);

    // 2. Buxgalter biriktirilmaganlarni ajratish
    const unassigned = allCompanies.filter(c => !c.accountant_id || c.accountant_id === '');
    const assigned = allCompanies.filter(c => c.accountant_id && c.accountant_id !== '');

    console.log(`✅ Buxgalter biriktirilgan: ${assigned.length}`);
    console.log(`❌ Buxgalter biriktirilMAGAN (o'chiriladi): ${unassigned.length}\n`);

    if (unassigned.length === 0) {
        console.log('✅ Barcha korxonalarga buxgalter biriktirilgan. O\'chirish kerak emas.');
        process.exit(0);
    }

    // 3. O'chiriladigan korxonalar ro'yxatini ko'rsatish
    console.log('📋 O\'chiriladigan korxonalar:');
    console.log('─'.repeat(60));
    unassigned.forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.name} (INN: ${c.inn || '—'})`);
    });
    console.log('─'.repeat(60));
    console.log('');

    // 4. O'chirish
    const unassignedIds = unassigned.map(c => c.id);

    // O'chirishdan oldin bog'liq ma'lumotlarni tozalash
    console.log('🗑️  Bog\'liq ma\'lumotlarni tozalash...');

    // contract_assignments
    const { error: assErr } = await supabase
        .from('contract_assignments')
        .delete()
        .in('client_id', unassignedIds);
    if (assErr) console.warn('  ⚠ contract_assignments:', assErr.message);
    else console.log('  ✓ contract_assignments tozalandi');

    // company_monthly_reports
    const { error: repErr } = await supabase
        .from('company_monthly_reports')
        .delete()
        .in('company_id', unassignedIds);
    if (repErr) console.warn('  ⚠ company_monthly_reports:', repErr.message);
    else console.log('  ✓ company_monthly_reports tozalandi');

    // operations (if exists)
    const { error: opsErr } = await supabase
        .from('operations')
        .delete()
        .in('company_id', unassignedIds);
    if (opsErr && !opsErr.message.includes('does not exist')) {
        console.warn('  ⚠ operations:', opsErr.message);
    } else if (!opsErr) {
        console.log('  ✓ operations tozalandi');
    }

    // documents (if exists)
    const { error: docErr } = await supabase
        .from('documents')
        .delete()
        .in('company_id', unassignedIds);
    if (docErr && !docErr.message.includes('does not exist')) {
        console.warn('  ⚠ documents:', docErr.message);
    } else if (!docErr) {
        console.log('  ✓ documents tozalandi');
    }

    // Endi korxonalarni o'chirish
    console.log('\n🗑️  Korxonalarni o\'chirish...');

    // Batch delete in chunks of 50 to avoid timeouts
    const chunkSize = 50;
    let deleted = 0;

    for (let i = 0; i < unassignedIds.length; i += chunkSize) {
        const chunk = unassignedIds.slice(i, i + chunkSize);
        const { error: delErr, count } = await supabase
            .from('companies')
            .delete()
            .in('id', chunk);

        if (delErr) {
            console.error(`  ❌ O'chirishda xatolik (chunk ${i}-${i + chunk.length}):`, delErr.message);
        } else {
            deleted += chunk.length;
            console.log(`  ✓ ${deleted}/${unassigned.length} o'chirildi...`);
        }
    }

    console.log('\n' + '═'.repeat(60));
    console.log(`✅ TAYYOR!`);
    console.log(`   O'chirildi: ${deleted} ta korxona`);
    console.log(`   Qoldi: ${assigned.length} ta korxona (buxgalter biriktirilgan)`);
    console.log('═'.repeat(60));
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
