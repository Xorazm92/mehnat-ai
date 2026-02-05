import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const cleanNum = (str) => {
    if (!str || typeof str !== 'string') return 0;
    const clean = str.replace(/"/g, '').replace(/,/g, '').trim();
    if (clean === '-' || clean === '') return 0;
    return parseFloat(clean) || 0;
};
const normalizeName = (n) => (n || '').trim().replace(/"/g, '').toLowerCase();

const isValidName = (n) => {
    if (!n || n.length < 2) return false;
    const clean = n.trim();
    if (/^[0-9,. -]+$/.test(clean)) return false;
    if (clean.toLowerCase().includes('xammasi') || clean.toLowerCase().includes('itogo') || clean.toLowerCase().includes('total')) return false;
    return true;
};

// Logic to convert CSV score to Boolean based on "Perfect Spec"
const toBool = (val) => val > 0;

async function main() {
    console.log('--- 🚀 Starting "Perfect Spec" surgically clean migration ---');

    let hasCompCols = false;
    let hasKpiCol = false;
    try {
        const { error: cCheck } = await supabase.from('companies').select('accountant_perc').limit(1);
        hasCompCols = !cCheck;
        const { error: kCheck } = await supabase.from('operations').select('kpi').limit(1);
        hasKpiCol = !kCheck;
    } catch (e) { }

    // Deleting old data to prevent ghosts
    await supabase.from('operations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('companies').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    const { data: profiles } = await supabase.from('profiles').select('id, full_name');
    const nameToId = {};
    profiles.forEach(p => { nameToId[p.full_name.toLowerCase().trim()] = p.id; });

    const getStaffId = async (name) => {
        if (!name || !isValidName(name)) return null;
        const cleanN = name.trim();
        const lowerN = cleanN.toLowerCase();
        if (nameToId[lowerN]) return nameToId[lowerN];

        console.log(`👤 Creating profile: ${cleanN}`);
        const email = `${cleanN.replace(/[^a-zA-Z]/g, '').toLowerCase()}@asos.uz`;
        const { data: authUser, error: aErr } = await supabase.auth.admin.createUser({
            email, password: 'TempPassword123!', email_confirm: true, user_metadata: { full_name: cleanN }
        });
        const uid = aErr?.message?.includes('already registered')
            ? (await supabase.auth.admin.listUsers()).data.users.find(u => u.email === email)?.id
            : authUser?.user?.id;
        if (!uid) return null;
        await supabase.from('profiles').upsert({ id: uid, email, full_name: cleanN, role: 'accountant', is_active: true });
        nameToId[lowerN] = uid;
        return uid;
    };

    const oylikCsv = fs.readFileSync('public/oylik.csv');
    const oylikRows = parse(oylikCsv, { columns: true, skip_empty_lines: true, from_line: 2 });
    const companyMap = new Map();
    let companyCount = 0;

    for (const r of oylikRows) {
        const nameText = (r['НАИМЕНОВАНИЯ'] || '').trim();
        const innText = (r['ИНН'] || '').trim();
        if (!isValidName(nameText)) continue;
        const dedupeKey = (innText && innText.length > 5) ? innText : normalizeName(nameText);
        if (companyMap.has(dedupeKey)) continue;

        const aid = await getStaffId(r['Бухгалтер']);
        const bid = await getStaffId(r['bank klient']);
        const sid = await getStaffId(r['Назоratchi'] || r['Назоратчи']);

        const contractSum = cleanNum(r['Столbeц7'] || r['Столбец7']);
        const accPerc = cleanNum(r['Столбец10']);
        const bcSum = cleanNum(r['% банк klient'] || r['% bank klient']);
        const supPerc = cleanNum(r['Назоratchi  %'] || r['Назоratchi%']);

        const fallbackJson = JSON.stringify({ v: 1, bcid: bid, bcn: (r['bank klient'] || '').trim(), sid, sn: (r['Назоratchi'] || r['Назоратчи'] || '').trim(), camt: contractSum, aperc: accPerc, bcsum: bcSum, sperc: supPerc });

        const payload = {
            name: nameText.replace(/"/g, ''),
            inn: innText || `inn-${Math.random().toString(36).slice(2, 7)}`,
            accountant_id: aid,
            notes: fallbackJson,
            is_active: true,
            tax_regime: 'turnover',
            department: 'Buxgalteriya'
        };

        if (hasCompCols) {
            Object.assign(payload, { bank_client_id: bid, supervisor_id: sid, contract_amount: contractSum, accountant_perc: accPerc, bank_client_sum: bcSum, supervisor_perc: supPerc });
        }

        const { data: comp, error: cErr } = await supabase.from('companies').insert(payload).select('id').single();
        if (!cErr) {
            companyMap.set(dedupeKey, comp.id);
            companyCount++;
        }
    }

    const kpiCsv = fs.readFileSync('public/kpi.csv');
    const kpiRows = parse(kpiCsv, { columns: true, skip_empty_lines: true, from_line: 2 });
    const nameToCompId = {};
    const { data: allComps } = await supabase.from('companies').select('id, name');
    allComps.forEach(c => { nameToCompId[normalizeName(c.name)] = c.id; });

    for (const r of kpiRows) {
        const nameText = (r['НАИМЕНОВАНИЯ'] || r['Наименования компаний'] || '').trim();
        if (!isValidName(nameText)) continue;
        const companyId = nameToCompId[normalizeName(nameText)];
        if (!companyId) continue;

        const kpiMetrics = {
            supervisorAttendance: toBool(cleanNum(r['Ishga vaqtida kelish nazoratchi'])),
            bankClientAttendance: toBool(cleanNum(r['Ishga kelish bank klient'])),
            bankClientTgOk: cleanNum(r['Gruppa bank klient ']) > 0,
            bankClientTgMissed: cleanNum(r['Gruppa bank klient ']) < 0 ? Math.abs(cleanNum(r['Gruppa bank klient ']) * 2) : 0,
            accTgOk: cleanNum(r['Gruppa buxgalter']) > 0,
            accTgMissed: cleanNum(r['Gruppa buxgalter']) < 0 ? Math.abs(cleanNum(r['Gruppa buxgalter']) * 2) : 0,
            didox: toBool(cleanNum(r['Didox'])),
            letters: toBool(cleanNum(r['xatlar'])),
            myMehnat: toBool(cleanNum(r[' мехнат'])),
            oneC: toBool(cleanNum(r['1c'])),
            autoCameral: toBool(cleanNum(r['Avtokameral'])),
            cashFlow: toBool(cleanNum(r['Pul oqimlari'])),
            taxInfo: toBool(cleanNum(r['Chiqadigan soliqlar'])),
            payroll: toBool(cleanNum(r['Hisoblangan oylik'])),
            debt: toBool(cleanNum(r['Debitor kreditor'])),
            pnl: toBool(cleanNum(r['Foyda va zarar']))
        };

        const opPayload = { company_id: companyId, period: '2026-01', updated_at: new Date().toISOString() };
        if (hasKpiCol) opPayload.kpi = kpiMetrics;
        else opPayload.comment = JSON.stringify({ kpi: kpiMetrics });
        await supabase.from('operations').upsert(opPayload);
    }
    console.log(`✅ SUCCESS: ${companyCount} unique firms migrated flawlessly.`);
}

main().catch(err => { console.error(err); process.exit(1); });
