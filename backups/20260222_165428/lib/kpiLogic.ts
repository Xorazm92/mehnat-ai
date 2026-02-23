
import { Company, OperationEntry, ReportStatus, ContractRole, MonthlyPerformance, KPIRule } from '../types';

export interface SalaryResult {
    role: ContractRole | 'chief_accountant' | 'supervisor';
    staffId?: string;
    staffName?: string;
    baseAmount: number;
    kpiScore: number; // percent sum (e.g. +0.5 means +0.5%)
    finalAmount: number;
    details: string[];
}

// getReportScore removed as it is redundant with getReportStatusMultiplier below.

/**
 * Maps operation report status to a multiplier (1, 0, -1).
 */
export const getReportStatusMultiplier = (status?: string): number => {
    if (!status) return 0;
    const s = status.toLowerCase();

    // Reward shorthands or full DB strings
    if (s === '+' || s === 'accepted' || s === 'topshirildi' || s === 'submitted') return 1;

    // Penalties
    if (s === '-' || s === 'not_submitted' || s === 'rejected' || s === 'rad etildi' || s === 'error' || s === 'oshibka' || s === 'blocked' || s === 'kartoteka') return -1;

    return 0; // Neutral (Not Required, Unknown)
};

const resolveOperationFieldKey = (rule: KPIRule): keyof OperationEntry | null => {
    const name = String(rule.name || '').trim();
    if (!name) return null;

    // Direct match (preferred)
    const direct = name as keyof OperationEntry;
    // We can't reliably check keys at runtime, but this keeps backward compatibility
    // with rules that are already named exactly like OperationEntry fields.
    if (direct) return direct;

    return null;
};

const resolveAutomationKey = (rule: KPIRule): keyof OperationEntry | null => {
    const name = String(rule.name || '').trim().toLowerCase();
    if (!name) return null;

    // Newer KPI rules were created with internal names like acc_didox, acc_letters...
    // Those must map to OperationEntry column names.
    const map: Record<string, keyof OperationEntry> = {
        acc_didox: 'didox',
        acc_letters: 'xatlar',
        acc_auto_cameral: 'avtokameral',
        acc_my_mehnat: 'my_mehnat',
        acc_1c_base: 'one_c',
        acc_cashflow: 'pul_oqimlari',
        acc_tax_info: 'chiqadigan_soliqlar',
        acc_payroll: 'hisoblangan_oylik',
        acc_debt: 'debitor_kreditor',
        acc_pnl: 'foyda_va_zarar',

        // Bank client column in operations
        bank_klient: 'bank_klient'
    };

    if (map[name]) return map[name];

    // Fallback: rule might already be exactly the OperationEntry key
    return resolveOperationFieldKey(rule);
};

/**
 * Calculates salaries for all roles in a company based on the operation period and manual performances.
 */
export const calculateCompanySalaries = (
    company: Company,
    operation?: OperationEntry,
    performances: MonthlyPerformance[] = [],
    rules: KPIRule[] = []
): SalaryResult[] => {
    const results: SalaryResult[] = [];
    const contract = (operation as any)?.contract_amount || company.contractAmount || (company as any).contract_amount || 0;

    const companyPerf = performances.filter(p => {
        if (p.companyId !== company.id) return false;
        // Only approved KPI affects payroll. Backward compatible: if status is missing, assume approved.
        if (!p.status) return true;
        return p.status === 'approved';
    });

    const calculateForRole = (
        role: SalaryResult['role'],
        staffId?: string,
        staffName?: string,
        perc?: number,
        sum?: number
    ) => {
        if (!staffId && !sum && !perc) return;

        let base = 0;
        const details: string[] = [];

        if (sum) {
            base = sum;
            details.push(`Fixed Sum: ${base.toLocaleString()}`);
        } else if (perc) {
            base = (contract * perc) / 100;
            details.push(`Contract: ${contract.toLocaleString()} * ${perc}%`);
        }

        if (base === 0 && !staffId) return;

        // KPI Calculation (percent-based)
        let sumPercent = 0;

        // 1) Manual KPI rules impact
        if (staffId) {
            const myRolePerf = companyPerf.filter(p => p.employeeId === staffId);
            const typedRole =
                role === 'accountant'
                    ? 'accountant'
                    : role === 'bank_manager'
                        ? 'bank_client'
                        : role === 'supervisor'
                            ? 'supervisor'
                            : role === 'chief_accountant'
                                ? 'chief_accountant'
                                : (role as any);

            const myRolePerfFiltered = myRolePerf.filter(p => {
                // If ruleRole is missing (old data), or explicitly 'all' - apply it.
                if (!p.ruleRole || p.ruleRole === 'all') return true;
                // Don't apply accountant/bank_client/supervisor rules to chief_accountant.
                if (typedRole === 'chief_accountant') return false;
                // Standard role match
                return p.ruleRole === typedRole;
            });

            for (const p of myRolePerfFiltered) {
                if (p.value === 1) {
                    const inc = Number(p.rewardPercentOverride ?? 0);
                    if (inc !== 0) {
                        sumPercent += inc;
                        details.push(`KPI +${inc}%: ${p.ruleNameUz || p.ruleName || p.ruleId}`);
                    }
                } else if (p.value === -1) {
                    const dec = Number(p.penaltyPercentOverride ?? 0);
                    if (dec !== 0) {
                        sumPercent -= Math.abs(dec);
                        details.push(`KPI -${Math.abs(dec)}%: ${p.ruleNameUz || p.ruleName || p.ruleId}`);
                    }
                }
            }
        }

        // 2) Report Status Impact (Oylar/Operations) - NOW DYNAMIC
        if (operation) {
            // Find all automation rules
            const autoRules = rules.filter(r => r.category === 'automation');

            for (const rule of autoRules) {
                const key = resolveAutomationKey(rule);
                if (!key) continue;
                const status = operation[key];

                if (typeof status === 'string') {
                    const multiplier = getReportStatusMultiplier(status);

                    // Priority: Performance Override -> Global Rule (which might be overridden per-company in performace list, 
                    // but for automation we usually don't have performance records yet unless it's handled like manual tasks.
                    // Wait, automation rules are linked to OperationEntry fields. 
                    // Let's check if there's a company-specific override in the performance list or a separate override table.
                    // The calculateCompanySalaries in PayrollDrafts/Table only gets rules via fetchKPIRules.
                    // We need to ensure rules passed here are already merged with company overrides.

                    const weight = multiplier === 1 ? (rule.rewardPercent || 0) : (rule.penaltyPercent || 0);
                    const score = multiplier * Math.abs(weight);

                    if (score !== 0) {
                        // Apply to accountant
                        if (role === 'accountant' && rule.role === 'accountant') {
                            sumPercent += score;
                            details.push(`Auto KPI ${score > 0 ? '+' : ''}${score}%: ${rule.nameUz || rule.name} (${status})`);
                        }
                        // Apply to bank_manager if it's bank_klient
                        if (role === 'bank_manager' && key === 'bank_klient') {
                            sumPercent += score;
                            details.push(`Auto KPI ${score > 0 ? '+' : ''}${score}%: ${rule.nameUz || rule.name} (${status})`);
                        }
                    }
                }
            }
        }

        // Calculation: Salary = Base + (Contract * KPI% / 100)
        // This ensures KPI depends on total contract value, not the person's share.
        const kpiBonus = (contract * sumPercent) / 100;
        const finalAmount = Math.max(0, base + kpiBonus);

        results.push({
            role,
            staffId,
            staffName: staffName || 'Unassigned',
            baseAmount: base,
            kpiScore: sumPercent,
            finalAmount,
            details: [
                ...details,
                `KPI Bonus: ${kpiBonus.toLocaleString()} so'm (${sumPercent.toFixed(2)}% of Contract)`
            ]
        });
    };

    // accountant
    calculateForRole('accountant', company.accountantId, company.accountantName, company.accountantPerc);

    // bank_manager
    calculateForRole('bank_manager', company.bankClientId, company.bankClientName, company.bankClientPerc, company.bankClientSum);

    // chief_accountant
    const chiefPerc = company.chiefAccountantPerc || 0; // Removed default 7%, must be manual
    const chiefSum = company.chiefAccountantSum || 0;

    if (chiefPerc > 0 || chiefSum > 0) {
        calculateForRole('chief_accountant', company.chiefAccountantId, company.chiefAccountantName || 'Bosh Buxgalter', chiefPerc, chiefSum);
    }

    // supervisor
    calculateForRole('supervisor', company.supervisorId, company.supervisorName, company.supervisorPerc);

    return results;
};
