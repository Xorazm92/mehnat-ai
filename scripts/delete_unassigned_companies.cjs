/**
 * Buxgalter biriktirilmagan korxonalarni o'chirish skripti
 * 
 * Bu skript "mukammal" darajada ishlaydi:
 * 1. Avval buxgalter biriktirilmagan korxonalar sonini aniqlaydi (hali contract_assignments da ham yo'qlarini).
 * 2. Ularga tegishli barcha bog'liq bazalarni (cascade) tozalaydi.
 * 3. Eng oxirida korxonaning o'zini o'chiradi.
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

    // 2. Barcha contract assignment larni olish
    const { data: allAssignments, error: assignError } = await supabase
        .from('contract_assignments')
        .select('client_id, role, user_id');

    if (assignError) {
        console.error('❌ Assignments yuklashda xatolik:', assignError.message);
        process.exit(1);
    }

    // Har bir kompaniya uchun accountant assignment borligini tekshiramiz
    const assignedCompanyIds = new Set(
        allAssignments.filter(a => a.role === 'accountant' && a.user_id).map(a => a.client_id)
    );

    console.log(`📊 Jami korxonalar: ${allCompanies.length}`);

    // 3. Buxgalter biriktirilmaganlarni ajratish
    const unassigned = allCompanies.filter(c => {
        const hasDirectAccountant = c.accountant_id && c.accountant_id !== '';
        const hasAssignmentAccountant = assignedCompanyIds.has(c.id);
        return !hasDirectAccountant && !hasAssignmentAccountant;
    });

    const assignedCount = allCompanies.length - unassigned.length;

    console.log(`✅ Buxgalter biriktirilgan (yoki assignment orqali): ${assignedCount}`);
    console.log(`❌ Buxgalter biriktirilMAGAN (o'chiriladi): ${unassigned.length}\n`);

    if (unassigned.length === 0) {
        console.log('✅ Barcha korxonalarga buxgalter biriktirilgan. O\'chirish kerak emas.');
        process.exit(0);
    }

    // 4. O'chiriladigan korxonalar ro'yxatini ko'rsatish
    console.log('📋 O\'chiriladigan korxonalar:');
    console.log('─'.repeat(60));
    unassigned.forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.name} (INN: ${c.inn || '—'})`);
    });
    console.log('─'.repeat(60));
    console.log('');

    const unassignedIds = unassigned.map(c => c.id);

    // O'chirishdan oldin mukammal tozalash (Cascade)
    console.log('🗑️  Bog\'liq ma\'lumotlarni mukammal tozalash (Cascade)...');

    const cleanTable = async (tableName, idColumn) => {
        const { error, count } = await supabase
            .from(tableName)
            .delete()
            .in(idColumn, unassignedIds);

        if (error && !error.message.includes('does not exist')) {
            console.warn(`  ⚠ ${tableName}:`, error.message);
        } else if (!error) {
            console.log(`  ✓ ${tableName} tozalandi (agar ma'lumot bo'lsa)`);
        }
    };

    await cleanTable('contract_assignments', 'client_id');
    await cleanTable('company_monthly_reports', 'company_id');
    await cleanTable('operations', 'company_id');
    await cleanTable('documents', 'company_id');
    await cleanTable('monthly_performance', 'company_id');
    await cleanTable('company_kpi_rules', 'company_id');
    await cleanTable('payments', 'company_id');
    await cleanTable('client_credentials', 'company_id');
    await cleanTable('client_history', 'company_id');

    // Endi korxonalarni o'chirish
    console.log('\n🗑️  Korxonalar o\'chirilmoqda...');

    // Batch delete in chunks of 50 to avoid timeouts
    const chunkSize = 50;
    let deleted = 0;

    for (let i = 0; i < unassignedIds.length; i += chunkSize) {
        const chunk = unassignedIds.slice(i, i + chunkSize);
        const { error: delErr } = await supabase
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
    console.log(`✅ MUKAMMAL TOZALANDI!`);
    console.log(`   O'chirildi: ${deleted} ta korxona (bog'liq barcha ma'lumotlari bilan)`);
    console.log(`   Qoldi: ${assignedCount} ta korxona (buxgalter biriktirilgan)`);
    console.log('═'.repeat(60));
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
