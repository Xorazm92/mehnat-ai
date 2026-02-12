import { Company, TaxType, OperationEntry } from '../types';
import { supabase } from './supabaseClient';
import { upsertCompany, fetchStaff, upsertMonthlyReport } from './supabaseData';
import { parseCSV } from './csvParser';

export const seedFirmaData = async () => {
    try {
        // 1. Fetch both data sources
        const [jsonRes, csvRes] = await Promise.all([
            fetch('/Firma oxiri.json'),
            fetch('/Firmalar - Royxat (2).csv')
        ]);

        if (!jsonRes.ok) throw new Error('Failed to fetch JSON');
        const jsonData: any[] = await jsonRes.json();

        let csvData: any[] = [];
        if (csvRes.ok) {
            const csvText = await csvRes.text();
            csvData = parseCSV(csvText);
        }

        console.log(`Found ${jsonData.length} companies in JSON and ${csvData.length} in CSV.`);

        // Helper to find value in item by a loosely matched key
        const normalize = (s: string) => s.toLowerCase().replace(/\s/g, '').replace(/k/g, 'к').replace(/[^a-zа-я0-9]/g, '');
        const getVal = (item: any, possibleKeys: string[]) => {
            const targetNormal = possibleKeys.map(normalize);
            for (const key of Object.keys(item)) {
                if (targetNormal.includes(normalize(key))) return item[key];
            }
            return undefined;
        };

        const existingStaff = await fetchStaff();
        const staffMap = new Map<string, string>();
        existingStaff.forEach(s => staffMap.set(s.name.trim().toLowerCase(), s.id));

        const matchStaff = (name: string | undefined): string | undefined => {
            if (!name) return undefined;
            const n = name.trim().toLowerCase();
            if (staffMap.has(n)) return staffMap.get(n);
            for (const entry of Array.from(staffMap.entries())) {
                if (entry[0].includes(n) || n.includes(entry[0])) return entry[1];
            }
            return undefined;
        };

        const currentPeriod = "2025-02";
        let companiesProcessed = 0;

        // Create a map by INN for faster lookup
        const csvByInn = new Map<string, any>();
        csvData.forEach(item => {
            const inn = String(item["ИНН"] || '').trim();
            if (inn) csvByInn.set(inn, item);
        });

        for (let index = 0; index < jsonData.length; index++) {
            const item = jsonData[index];
            const innRaw = getVal(item, ['ИНН', 'TIN', 'STIR']);
            const inn = innRaw ? String(innRaw).trim() : `tmp-${index}`;

            const csvItem = csvByInn.get(inn);
            const nameRaw = getVal(item, ['НАИМЕНОВАНИЯ', 'Nomi']) || (csvItem ? csvItem["НАИМЕНОВАНИЯ"] : undefined);
            if (!nameRaw) continue;

            const name = String(nameRaw).replace(/"/g, '').trim();

            // Basic company data
            const taxRaw = getVal(item, ['НДС', 'Soliq']);
            let taxType = TaxType.TURNOVER;
            if (taxRaw && String(taxRaw).includes('НДС')) taxType = TaxType.NDS_PROFIT;
            else if (taxRaw && String(taxRaw).toLowerCase().includes('qatiy')) taxType = TaxType.FIXED;

            const accName = String(csvItem ? csvItem["Бухгалтер"] : (getVal(item, ['Бухгалтер']) || '')).trim();

            const company: Company = {
                id: crypto.randomUUID(),
                originalIndex: item['№'] || index + 1,
                name,
                inn,
                taxType,
                serverInfo: String(getVal(item, ['Жойlashgan Сервер']) || ''),
                serverName: String(getVal(item, ['Сервер номи']) || ''),
                contractAmount: Number(getVal(item, ['Shartnoma qiymati'])) || 0,
                accountantName: accName,
                accountantId: matchStaff(accName),
                bankClientName: String(getVal(item, ['bank klient']) || '').trim(),
                supervisorName: String(getVal(item, ['Назоратчи']) || '').trim(),
                itParkResident: !!getVal(item, ['IT PARK Rezidenti']) || !!csvItem?.["IT PARK Rezidenti"],
                createdAt: new Date().toISOString(),
                isActive: true,
                login: csvItem ? String(csvItem["Login "] || '').trim() : undefined,
                password: csvItem ? String(csvItem["Parol "] || '').trim() : undefined
            };

            const { data: existing } = await supabase.from('companies').select('id').eq('inn', inn).maybeSingle();
            if (existing) company.id = existing.id;

            await upsertCompany(company);
            companiesProcessed++;

            if (csvItem) {
                const v = (key: string) => String(csvItem[key] || '').trim();

                await upsertMonthlyReport({
                    companyId: company.id,
                    period: currentPeriod,
                    bank_klient: v("bank klient"),
                    didox: v("Didox"),
                    xatlar: v("xatlar"),
                    avtokameral: v("Avtokameral"),
                    my_mehnat: v("my mehnat"),
                    one_c: v("1c"),
                    pul_oqimlari: v("Pul oqimlari"),
                    chiqadigan_soliqlar: v("Chiqadigan soliqlar"),
                    hisoblangan_oylik: v("Hisoblangan oylik"),
                    debitor_kreditor: v("Debitor kreditor"),
                    foyda_va_zarar: v("Foyda va zarar"),
                    tovar_ostatka: v("Tovar ostatka"),
                    nds_bekor_qilish: v("NDSNI BEKOR QILISH"),
                    aylanma_qqs: v("Aylanma/QQS"),
                    daromad_soliq: v("Daromad soliq"),
                    inps: v("INPS"),
                    foyda_soliq: v("Foyda soliq"),
                    moliyaviy_natija: v("Moliyaviy natija"),
                    buxgalteriya_balansi: v("Buxgalteriya balansi"),
                    statistika: v("Statistika"),
                    bonak: v("Bo'nak"),
                    yer_soliqi: v("Yer solig'i "),
                    mol_mulk_soligi: v("Mol mulk solig'i ma'lumotnoma"),
                    suv_soligi: v("Suv solig'i ma'lumotnoma"),
                    comment: ''
                });
            }
        }

        return { success: true, count: companiesProcessed };
    } catch (e) {
        console.error('Seeding error', e);
        return { success: false, error: e };
    }
};
