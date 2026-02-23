import { Company, TaxType } from '../types';
import { supabase } from './supabaseClient';
import { onboardCompany, upsertCompany, fetchStaff, upsertMonthlyReport } from './supabaseData';
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

        const asStr = (v: any) => {
            if (v === null || v === undefined) return '';
            return String(v).replace(/"/g, '').trim();
        };

        const asNum = (v: any) => {
            if (v === null || v === undefined || v === '') return undefined;
            const n = Number(String(v).replace(/[^0-9.-]/g, ''));
            return Number.isFinite(n) ? n : undefined;
        };

        const asBool = (v: any) => {
            if (v === null || v === undefined) return undefined;
            const s = String(v).trim().toLowerCase();
            if (['1', 'true', 'ha', 'yes', 'y', '+'].includes(s)) return true;
            if (['0', 'false', 'yo\'q', 'no', 'n', '-'].includes(s)) return false;
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

            const name = asStr(nameRaw);

            // Basic company data
            const taxRaw = getVal(item, ['НДС', 'Soliq']);
            let taxType = TaxType.TURNOVER;
            if (taxRaw && String(taxRaw).includes('НДС')) taxType = TaxType.NDS_PROFIT;
            else if (taxRaw && String(taxRaw).toLowerCase().includes('qatiy')) taxType = TaxType.FIXED;

            const accName = asStr(csvItem ? csvItem["Бухгалтер"] : (getVal(item, ['Бухгалтер']) || ''));
            const controllerName = asStr(getVal(item, ['Назоратчи', 'Nazoratchi', 'Controller', 'Kontroller']));
            const bankManagerName = asStr(getVal(item, ['Bank menejer', 'Bank manager', 'Bank', 'Bank xodimi']));
            const chiefName = asStr(getVal(item, ['Bosh buxgalter', 'Chief accountant', 'Главный бухгалтер']));

            const accountantId = matchStaff(accName);
            const controllerId = matchStaff(controllerName);
            const bankManagerId = matchStaff(bankManagerName);
            const chiefId = matchStaff(chiefName);

            const accountantPerc = asNum(getVal(item, ['% buxgalter', '% бухгалтер', 'accountant %', 'Buxgalter %', 'accountant_perc'])) ?? undefined;
            const supervisorPerc = asNum(getVal(item, ['% nazoratchi', '% контролёр', 'controller %', 'supervisor %', 'supervisor_perc'])) ?? undefined;
            const firmaSharePercent = asNum(getVal(item, ['Firma ulushi %', 'firma share %', 'firma_share_percent'])) ?? undefined;
            const paymentDay = asNum(getVal(item, ['To\'lov kuni', 'payment day', 'payment_day'])) ?? undefined;

            const notesExtra: any = {
                idx: item['№'] || index + 1,
                bcn: asStr(getVal(item, ['bank klient', 'Bank klient', 'Bank client'])),
                sn: controllerName,
                cn: chiefName
            };

            const company: Company = {
                id: crypto.randomUUID(),
                originalIndex: item['№'] || index + 1,
                name,
                inn,
                taxType,
                serverInfo: asStr(getVal(item, ['Жойlashgan Сервер', 'Server ID', 'Server'])),
                serverName: asStr(getVal(item, ['Сервер номи', 'Server nomi', 'Server name'])),
                baseName1c: asStr(getVal(item, ['Baza', 'База', '1C база', '1C Baza', 'base_name_1c'])),
                contractAmount: asNum(getVal(item, ['Shartnoma qiymati', 'Contract amount', 'contract_amount'])) || 0,
                accountantName: accName,
                accountantId,
                accountantPerc,
                bankClientName: asStr(getVal(item, ['bank klient', 'Bank klient', 'Bank client'])),
                supervisorName: controllerName,
                supervisorId: controllerId,
                supervisorPerc,
                chiefAccountantName: chiefName,
                chiefAccountantId: chiefId,
                itParkResident: (asBool(getVal(item, ['IT PARK Rezidenti', 'ITPARK', 'it_park_resident'])) ?? undefined) ?? (!!csvItem?.["IT PARK Rezidenti"]),
                brandName: asStr(getVal(item, ['Brand', 'Brand nomi', 'brand_name'])),
                directorName: asStr(getVal(item, ['Direktor', 'Director', 'director_name'])),
                directorPhone: asStr(getVal(item, ['Direktor tel', 'Director phone', 'director_phone', 'Telefon'])),
                legalAddress: asStr(getVal(item, ['Yuridik manzil', 'Legal address', 'legal_address', 'Manzil'])),
                founderName: asStr(getVal(item, ['Ta\'sischi', 'Founder', 'founder_name'])),
                vatCertificateDate: asStr(getVal(item, ['QQS guvohnoma sana', 'VAT cert date', 'vat_certificate_date'])),
                hasLandTax: asBool(getVal(item, ['Yer solig\'i bor', 'has_land_tax'])),
                hasWaterTax: asBool(getVal(item, ['Suv solig\'i bor', 'has_water_tax'])),
                hasPropertyTax: asBool(getVal(item, ['Mol-mulk solig\'i bor', 'has_property_tax'])),
                hasExciseTax: asBool(getVal(item, ['Aksiz solig\'i bor', 'has_excise_tax'])),
                hasAuctionTax: asBool(getVal(item, ['Auksion solig\'i bor', 'has_auction_tax'])),
                oneCLocation: asStr(getVal(item, ['1C joylashuvi', '1C location', 'one_c_location'])),
                contractNumber: asStr(getVal(item, ['Shartnoma raqami', 'Contract number', 'contract_number'])),
                contractDate: asStr(getVal(item, ['Shartnoma sanasi', 'Contract date', 'contract_date'])),
                paymentDay: (paymentDay !== undefined ? paymentDay : undefined),
                firmaSharePercent: (firmaSharePercent !== undefined ? firmaSharePercent : undefined),
                currentBalance: asNum(getVal(item, ['Balans', 'current_balance'])) ?? 0,
                companyStatus: (asStr(getVal(item, ['Status', 'company_status'])) as any) || undefined,
                riskLevel: (asStr(getVal(item, ['Risk', 'risk_level'])) as any) || undefined,
                riskNotes: asStr(getVal(item, ['Risk izoh', 'risk_notes'])),
                statReports: (() => {
                    const v = getVal(item, ['Statistika', 'stat_reports']);
                    if (Array.isArray(v)) return v.map(asStr).filter(Boolean);
                    if (typeof v === 'string') return v.split(',').map(s => asStr(s)).filter(Boolean);
                    return undefined;
                })(),
                serviceScope: (() => {
                    const v = getVal(item, ['Scope', 'Xizmatlar ko\'lami', 'service_scope']);
                    if (Array.isArray(v)) return v.map(asStr).filter(Boolean);
                    if (typeof v === 'string') return v.split(',').map(s => asStr(s)).filter(Boolean);
                    return undefined;
                })(),
                activeServices: (() => {
                    const v = getVal(item, ['Aktiv xizmatlar', 'active_services']);
                    if (Array.isArray(v)) return v.map(asStr).filter(Boolean);
                    if (typeof v === 'string') return v.split(',').map(s => asStr(s)).filter(Boolean);
                    return undefined;
                })(),
                notes: JSON.stringify(notesExtra),
                createdAt: new Date().toISOString(),
                isActive: true,
                login: csvItem ? String(csvItem["Login "] || '').trim() : undefined,
                password: csvItem ? String(csvItem["Parol "] || '').trim() : undefined
            };

            const { data: existing } = await supabase.from('companies').select('id').eq('inn', inn).maybeSingle();
            if (existing) company.id = existing.id;

            const assignments: any[] = [];
            if (accountantId) assignments.push({ role: 'accountant', userId: accountantId, salaryType: 'percent', salaryValue: accountantPerc ?? 70 });
            if (controllerId) assignments.push({ role: 'controller', userId: controllerId, salaryType: 'fixed', salaryValue: 50000 });
            if (bankManagerId) assignments.push({ role: 'bank_manager', userId: bankManagerId, salaryType: 'fixed', salaryValue: 50000 });
            if (chiefId) assignments.push({ role: 'chief_accountant', userId: chiefId, salaryType: 'fixed', salaryValue: 0 });

            if (assignments.length > 0) {
                await onboardCompany(company, assignments);
            } else {
                await upsertCompany(company);
            }
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
                    yer_soligi: v("Yer solig'i "),
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
