
import { parseCSV } from './csvParser';
import { Company, OperationEntry, TaskStatus, OperationFieldKey } from '../types';
import { OPERATION_TEMPLATES, MAP_JSON_FIELD_TO_KEY } from './operationTemplates';
import { upsertOperationsBatch } from './supabaseData';

/**
 * Synchronizes operation tasks from a CSV file.
 */
export const syncOperationsFromCSV = async (
    csvText: string,
    companies: Company[],
    operations: OperationEntry[],
    selectedPeriod: string,
    lang: 'uz' | 'ru'
) => {
    const data = parseCSV(csvText);
    const batchUpdates: OperationEntry[] = [];

    const normalizeName = (name: string) => {
        return name.toLowerCase()
            .replace(/["'“”«»]/g, '')
            .replace(/mchj|xk|fx|ok|llc|oao|ooo|чп|хк|ок|мчж|латlar/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    for (const item of data) {
        const inn = String(item["ИНН"] || '').trim();
        const rawName = String(item["НАИМЕНОВАНИЯ"] || '').trim();
        const normName = normalizeName(rawName);

        // Find company by INN or Fuzzy Name
        const company = companies.find(c => {
            if (inn && c.inn === inn) return true;
            if (normalizeName(c.name) === normName) return true;
            return false;
        });

        if (!company) continue;

        const existingOp = operations.find(o => o.companyId === company.id && o.period === selectedPeriod);
        let updatedTasks = [...(existingOp?.tasks || [])];
        let hasChanges = false;

        for (const [jsonKey, templateKey] of Object.entries(MAP_JSON_FIELD_TO_KEY)) {
            const jsonValue = item[jsonKey];
            if (jsonValue === undefined) continue;

            const valStr = String(jsonValue).trim().toLowerCase();
            let status: TaskStatus = 'new';

            if (valStr === '+' || valStr === 'topshirildi') status = 'approved';
            else if (valStr === '0' || valStr === 'not_required') status = 'not_required';
            else if (valStr === 'kartoteka') status = 'blocked';
            else if (valStr.includes('ariza') || valStr === 'in_progress') status = 'pending_review';
            else if (valStr === 'rad etildi') status = 'rejected';
            else if (valStr === '-') status = 'new';
            else if (valStr === '?') status = 'new';

            const existingTaskIndex = updatedTasks.findIndex(t => t.templateKey === templateKey);

            if (existingTaskIndex >= 0) {
                if (updatedTasks[existingTaskIndex].status !== status || updatedTasks[existingTaskIndex].jsonValue !== String(jsonValue)) {
                    updatedTasks[existingTaskIndex] = {
                        ...updatedTasks[existingTaskIndex],
                        status,
                        jsonValue: String(jsonValue),
                        verifiedAt: status === 'approved' ? new Date().toISOString() : undefined
                    };
                    hasChanges = true;
                }
            } else {
                const tmpl = OPERATION_TEMPLATES.find(t => t.key === templateKey);
                if (tmpl) {
                    updatedTasks.push({
                        id: crypto.randomUUID(),
                        companyId: company.id,
                        companyName: company.name,
                        templateKey: templateKey as any,
                        templateName: lang === 'uz' ? tmpl.nameUz : tmpl.nameRu,
                        assigneeName: company.accountantName || 'Tayinlanmagan',
                        controllerName: 'Nazorat',
                        period: selectedPeriod,
                        deadline: new Date().toISOString(),
                        status,
                        jsonValue: String(jsonValue),
                        verifiedAt: status === 'approved' ? new Date().toISOString() : undefined
                    });
                    hasChanges = true;
                }
            }
        }

        if (hasChanges) {
            batchUpdates.push({
                ...existingOp,
                id: existingOp?.id || crypto.randomUUID(),
                companyId: company.id,
                period: selectedPeriod,
                tasks: updatedTasks,
                updatedAt: new Date().toISOString(),
                history: existingOp?.history || []
            } as OperationEntry);
        }
    }

    if (batchUpdates.length > 0) {
        await upsertOperationsBatch(batchUpdates);
        return batchUpdates.length;
    }
    return 0;
};
