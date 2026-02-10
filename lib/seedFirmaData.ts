
import { Company, TaxType, StatsType, OperationTask, TaskStatus, OperationFieldKey, ReportStatus } from '../types';
import { supabase } from './supabaseClient';
import { upsertCompany, fetchStaff, upsertOperation } from './supabaseData';
import { OPERATION_TEMPLATES, MAP_JSON_FIELD_TO_KEY } from './operationTemplates';

interface FirmaJsonItem {
    "№": number;
    "НАИМЕНОВАНИЯ": string;
    "Жойлашган Сервер"?: string;
    "Сервер номи"?: string;
    "ИНН"?: number | string;
    "НДС"?: string;
    "Бухгалтер"?: string;
    "bank klient"?: string;
    "Shartnoma qiymati"?: number;
    "Назоратчи"?: string;
    "% Buxgalter"?: number;
    "% банк клиент"?: number;
    "Назоратчи  %"?: number;
    "%Bosh buxgalter Yorqinoy"?: number;
    "IT PARK Rezidenti"?: string;
}

// Safe number conversion: returns fallback if NaN, null, or undefined
const safeNumber = (val: any, fallback: number = 0): number => {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
};

export const seedFirmaData = async () => {
    try {
        const response = await fetch('/Firma oxiri.json');
        if (!response.ok) throw new Error('Failed to fetch JSON');

        const data: any[] = await response.json();
        console.log(`Found ${data.length} companies in JSON.`);

        // Helper to find value in item by a loosely matched key
        const normalize = (s: string) => s.toLowerCase().replace(/\s/g, '').replace(/k/g, 'к').replace(/[^a-zа-я0-9]/g, '');

        // Helper to find value in item by a loosely matched key
        const getVal = (item: any, possibleKeys: string[]) => {
            const targetNormal = possibleKeys.map(normalize);
            for (const key of Object.keys(item)) {
                if (targetNormal.includes(normalize(key))) return item[key];
            }
            return undefined;
        };

        // 1. Load existing staff from DB (we cannot create staff via client-side due to RLS)
        const existingStaff = await fetchStaff();
        const staffMap = new Map<string, string>(); // Lowercase Name -> ID
        existingStaff.forEach(s => staffMap.set(s.name.trim().toLowerCase(), s.id));
        console.log(`Loaded ${existingStaff.length} staff members from DB.`);

        // 2. Derive correct roles from JSON data (DB has all as 'accountant' by default)
        // Count appearances in each role column to determine primary role
        const roleCounts = new Map<string, { accountant: number; bank_manager: number; supervisor: number }>();

        data.forEach(item => {
            const acc = getVal(item, ['Бухгалтер', 'Бухгалter']);
            if (acc != null) {
                const key = String(acc).trim().toLowerCase();
                if (key.length > 1) {
                    if (!roleCounts.has(key)) roleCounts.set(key, { accountant: 0, bank_manager: 0, supervisor: 0 });
                    roleCounts.get(key)!.accountant++;
                }
            }

            const bank = getVal(item, ['bank klient']);
            if (bank != null) {
                const key = String(bank).trim().toLowerCase();
                if (key.length > 1) {
                    if (!roleCounts.has(key)) roleCounts.set(key, { accountant: 0, bank_manager: 0, supervisor: 0 });
                    roleCounts.get(key)!.bank_manager++;
                }
            }

            const sup = getVal(item, ['Назоратчи', 'Назоratchi']);
            if (sup != null) {
                const key = String(sup).trim().toLowerCase();
                if (key.length > 1) {
                    if (!roleCounts.has(key)) roleCounts.set(key, { accountant: 0, bank_manager: 0, supervisor: 0 });
                    roleCounts.get(key)!.supervisor++;
                }
            }
        });

        // Determine primary role for each staff member (highest count wins)
        const staffRoleMap = new Map<string, string>(); // Lowercase Name -> Role
        roleCounts.forEach((counts, name) => {
            if (counts.accountant >= counts.bank_manager && counts.accountant >= counts.supervisor) {
                staffRoleMap.set(name, 'accountant');
            } else if (counts.bank_manager >= counts.accountant && counts.bank_manager >= counts.supervisor) {
                staffRoleMap.set(name, 'bank_manager');
            } else {
                staffRoleMap.set(name, 'supervisor');
            }
        });

        // Override roles in the fetched staff objects
        existingStaff.forEach(s => {
            const derivedRole = staffRoleMap.get(s.name.trim().toLowerCase());
            if (derivedRole) {
                s.role = derivedRole;
            }
        });

        // Also add Yorqinoy as chief if she exists
        const yorqinoyStaff = existingStaff.find(s => s.name.trim().toLowerCase() === 'yorqinoy');
        if (yorqinoyStaff) yorqinoyStaff.role = 'chief';

        console.log('Staff role corrections applied:', Array.from(staffRoleMap.entries()).map(([n, r]) => `${n}=${r}`).join(', '));

        // Helper for staff matching
        const matchStaff = (name: string | undefined): string | undefined => {
            if (!name) return undefined;
            const n = name.trim().toLowerCase();
            // Direct match
            if (staffMap.has(n)) return staffMap.get(n);
            // Partial match: check if any existing staff name contains or is contained in the input
            for (const entry of Array.from(staffMap.entries())) {
                if (entry[0].includes(n) || n.includes(entry[0])) return entry[1];
            }
            return undefined;
        };

        let companiesProcessed = 0;
        let assignmentsCreated = 0;
        let assignmentErrors = 0;

        // 2. Upsert Companies
        for (let index = 0; index < data.length; index++) {
            const item = data[index];
            const nameRaw = getVal(item, ['НАИМЕНОВАНИЯ', 'Nomi']);
            if (!nameRaw) continue;

            const name = String(nameRaw).replace(/"/g, '').trim();
            const innRaw = getVal(item, ['ИНН', 'TIN', 'STIR']);
            const inn = innRaw ? String(innRaw).trim() : `tmp-${index}-${Math.random().toString(36).slice(2, 5)}`;

            const taxRaw = getVal(item, ['НДС', 'Soliq']);
            let taxType = TaxType.TURNOVER;
            if (taxRaw && String(taxRaw).includes('НДС')) taxType = TaxType.NDS_PROFIT;
            else if (taxRaw && String(taxRaw).toLowerCase().includes('qatiy')) taxType = TaxType.FIXED;

            const rawAcc = getVal(item, ['Бухгалter', 'Бухгалтер']);
            const accName = rawAcc != null ? String(rawAcc).trim() : undefined;
            const rawBc = getVal(item, ['bank klient']);
            const bcName = rawBc != null ? String(rawBc).trim() : undefined;
            const rawSup = getVal(item, ['Назоratchi', 'Назоратчи']);
            const supName = rawSup != null ? String(rawSup).trim() : undefined;

            const accId = matchStaff(accName);
            const bcId = matchStaff(bcName);
            const supId = matchStaff(supName);

            const contractAmount = safeNumber(getVal(item, ['Shartnoma qiymati', 'Qiymati']), 0);

            // Percentage/Sum Extraction — use safeNumber to avoid NaN
            const accPerc = safeNumber(getVal(item, ['% Buxgalter']), 20);
            const bcVal = safeNumber(getVal(item, ['% банк клиент']), 0);
            const supPerc = safeNumber(getVal(item, ['Назоратчи %', 'Назоratchi %', 'Назоратчи  %']), 5);
            const chiefVal = safeNumber(getVal(item, ['%Bosh buxgalter Yorqinoy', 'Chief %']), 0);

            const itpRaw = getVal(item, ['IT PARK Rezidenti', 'IT PARK']);
            const isItp = itpRaw && String(itpRaw).trim().length > 1;

            const company: Company = {
                id: crypto.randomUUID(), // Will be resolved by INN below
                originalIndex: item['№'] || index + 1,
                name,
                inn,
                taxType,
                serverInfo: getVal(item, ['Жойлашган Сервер']) || '',
                serverName: getVal(item, ['Сервер номи']) || '',
                contractAmount,
                accountantName: accName,
                accountantId: accId,
                bankClientName: bcName,
                bankClientId: bcId,
                supervisorName: supName,
                supervisorId: supId,

                accountantPerc: accPerc,
                bankClientPerc: bcVal <= 100 ? bcVal : 0,
                bankClientSum: bcVal > 100 ? bcVal : 0,
                supervisorPerc: supPerc,
                chiefAccountantPerc: chiefVal <= 100 ? chiefVal : 0,
                chiefAccountantSum: chiefVal > 100 ? chiefVal : 0,

                itParkResident: !!isItp,
                createdAt: new Date().toISOString(),
                isActive: true
            };

            const { data: existing } = await supabase.from('companies').select('id').eq('inn', inn).maybeSingle();
            if (existing) company.id = existing.id;

            if (index % 25 === 0) console.log(`Processing company ${index + 1}/${data.length}: ${name}`);
            await upsertCompany(company);
            companiesProcessed++;

            // 3. Populate Contract Assignments (The source for the Team tab)
            // Clear existing assignments for this company to avoid duplicates
            await supabase.from('contract_assignments').delete().eq('client_id', company.id);

            const assignmentsToInsert = [];
            const today = new Date().toISOString().split('T')[0];

            // Only add assignments for staff that actually exist in the DB (have valid IDs from profiles table)
            if (accId) {
                assignmentsToInsert.push({
                    client_id: company.id,
                    user_id: accId,
                    role: 'accountant',
                    salary_type: 'percent',
                    salary_value: accPerc,  // Already safe via safeNumber
                    start_date: today
                });
            }

            if (bcId) {
                assignmentsToInsert.push({
                    client_id: company.id,
                    user_id: bcId,
                    role: 'bank_manager',
                    salary_type: bcVal <= 100 ? 'percent' : 'fixed',
                    salary_value: bcVal,  // Already safe via safeNumber
                    start_date: today
                });
            }

            if (supId) {
                assignmentsToInsert.push({
                    client_id: company.id,
                    user_id: supId,
                    role: 'controller',
                    salary_type: 'percent',
                    salary_value: supPerc,  // Already safe via safeNumber
                    start_date: today
                });
            }

            // Chief Accountant (Yorqinoy) — only if she exists in the DB and has a value
            if (chiefVal > 0) {
                const chiefId = staffMap.get('yorqinoy');
                if (chiefId) {
                    assignmentsToInsert.push({
                        client_id: company.id,
                        user_id: chiefId,
                        role: 'chief',
                        salary_type: chiefVal <= 100 ? 'percent' : 'fixed',
                        salary_value: chiefVal,  // Already safe via safeNumber
                        start_date: today
                    });
                }
            }

            if (assignmentsToInsert.length > 0) {
                const { error: assErr } = await supabase.from('contract_assignments').insert(assignmentsToInsert);
                if (assErr) {
                    assignmentErrors++;
                    if (assignmentErrors <= 3) {
                        console.warn(`Assignment error for ${name}:`, assErr.message);
                    }
                } else {
                    assignmentsCreated += assignmentsToInsert.length;
                }
            }

            // 4. Seed Operations & Tasks (for current period)
            const currentPeriod = "2025-02"; // Hardcoded for now, or could be dynamic
            const { data: existingOp } = await supabase
                .from('operations')
                .select('id')
                .eq('company_id', company.id)
                .eq('period', currentPeriod)
                .maybeSingle();

            const opId = existingOp?.id || crypto.randomUUID();
            const tasks: OperationTask[] = [];

            // Iterate through templates to create tasks
            for (const template of OPERATION_TEMPLATES) {
                // Find matching JSON key for this template
                const jsonKeyEntry = Object.entries(MAP_JSON_FIELD_TO_KEY).find(([_, k]) => k === template.key);
                if (!jsonKeyEntry) continue;

                const jsonKey = jsonKeyEntry[0];
                const jsonValue = getVal(item, [jsonKey]);

                // Map JSON value to TaskStatus
                let status: TaskStatus = 'new';
                const valStr = String(jsonValue || '').trim().toLowerCase();

                if (valStr === '+' || valStr === 'topshirildi') status = 'approved';
                else if (valStr === '-') status = 'new'; // Not done yet
                else if (valStr === '0' || valStr === 'not_required') status = 'not_required';
                else if (valStr === 'kartoteka') status = 'blocked';
                else if (valStr.includes('ariza') || valStr === 'in_progress') status = 'pending_review';
                else if (valStr === 'rad etildi') status = 'rejected';
                else if (valStr === '?') status = 'new'; // Unknown -> treat as new

                // Determine assignee
                let assigneeId = undefined;
                let assigneeName = '';
                if (template.assignedRole === 'accountant') {
                    assigneeId = company.accountantId;
                    assigneeName = company.accountantName || '';
                } else if (template.assignedRole === 'bank_manager') {
                    assigneeId = company.bankClientId;
                    assigneeName = company.bankClientName || '';
                }

                // Controller is always supervisor
                const controllerId = company.supervisorId;
                const controllerName = company.supervisorName || '';

                // Create task
                if (jsonValue !== undefined || template.frequency === 'monthly') { // Create if value exists or it's a monthly task
                    tasks.push({
                        id: `${opId}-${template.key}`,
                        companyId: company.id,
                        companyName: company.name,
                        templateKey: template.key,
                        templateName: template.nameUz,
                        assigneeId,
                        assigneeName,
                        controllerId,
                        controllerName,
                        period: currentPeriod,
                        deadline: new Date(2025, 1, template.deadlineDay).toISOString(), // 2025-02-DD
                        status,
                        jsonValue: String(jsonValue || ''),
                        submittedAt: status === 'approved' ? new Date().toISOString() : undefined,
                        verifiedAt: status === 'approved' ? new Date().toISOString() : undefined,
                    });
                }
            }

            // Upsert operation with tasks
            await upsertOperation({
                id: opId,
                companyId: company.id,
                period: currentPeriod,
                profitTaxStatus: ReportStatus.UNKNOWN,
                form1Status: ReportStatus.UNKNOWN,
                form2Status: ReportStatus.UNKNOWN,
                statsStatus: ReportStatus.UNKNOWN,
                comment: '',
                updatedAt: new Date().toISOString(),
                history: [],
                tasks: tasks
            });
        }

        console.log(`Seeding complete! ${companiesProcessed} companies processed, ${assignmentsCreated} assignments created, ${assignmentErrors} assignment errors.`);
        return { success: true, count: data.length };
    } catch (e) {
        console.error('Seeding error', e);
        return { success: false, error: e };
    }
};
