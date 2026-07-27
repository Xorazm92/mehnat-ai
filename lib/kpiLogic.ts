
import { Company, OperationEntry, ContractRole, MonthlyPerformance, KPIRule, Staff, CompanyKPIRule, CompanyBreakdown } from '@/types';
import { capKpiPercent } from '@/lib/kpiScoring';
import { periodsEqual } from '@/lib/periods';

export interface SalaryResult {
    role: ContractRole | 'chief_accountant' | 'supervisor';
    staffId?: string;
    staffName?: string;
    baseAmount: number;
    kpiScore: number; // percent sum (e.g. +0.5 means +0.5%)
    finalAmount: number;
    // Pre-floor amount. finalAmount clamps at 0, which turns "penalties exceeded
    // this person's entire base pay" into an ordinary-looking zero — that is how
    // ADR-0004's defect stayed invisible. Callers check this to see the clamp fire.
    rawAmount: number;
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
        bank_klient: 'bank_klient',

        // --- NEW SIMPLIFIED RULES ---
        automation_1c: 'one_c',
        automation_didox: 'didox',
        // Mapping broad report rules to representative columns for checking status
        reports_tax: 'daromad_soliq', // Use one of the main tax reports as representative
        reports_stat: 'stat_12_invest', // Use 12-invest as representative stat report
        reports_finance: 'moliyaviy_natija'
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
    // Prisma Decimal fields can arrive as strings across the RSC/JSON boundary —
    // coerce everything numeric so arithmetic never string-concatenates.
    const toNum = (v: unknown): number => {
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(n) ? n : 0;
    };
    const contract = toNum((operation as any)?.contract_amount ?? company.contractAmount ?? (company as any).contract_amount ?? 0);

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
        percRaw?: number,
        sumRaw?: number
    ) => {
        const perc = toNum(percRaw);
        const sum = toNum(sumRaw);
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
        // True once v2 performance records drive this role — makes the legacy
        // operation-status path below a no-op so nothing is double-counted.
        let hasPerfRecords = false;

        // 1) KPI from monthly performance records (v2: options-based score)
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

            const kpiPercents: number[] = [];
            for (const p of myRolePerfFiltered) {
                // Prefer the v2 precomputed percent (calculatedScore); fall back to the
                // legacy binary value×override model only when it is absent.
                const cs = (p as { calculatedScore?: number }).calculatedScore;
                let sc = typeof cs === 'number' ? cs : NaN;
                if (!Number.isFinite(sc)) {
                    sc = p.value === 1
                        ? Number(p.rewardPercentOverride ?? 0)
                        : p.value === -1
                            ? -Math.abs(Number(p.penaltyPercentOverride ?? 0))
                            : 0;
                }
                if (sc !== 0) {
                    kpiPercents.push(sc);
                    details.push(`KPI ${sc > 0 ? '+' : ''}${sc}%: ${(p as any).rule?.nameUz || (p as any).rule?.name || p.ruleId}`);
                }
            }
            // Cap the bonus side at the role's KPI max (5% / 2.5% / 1%); penalties accumulate.
            sumPercent += capKpiPercent(kpiPercents, typedRole);
            if (myRolePerfFiltered.length > 0) hasPerfRecords = true;
        }

        // 2) Report Status Impact (Oylar/Operations) — legacy fallback only when
        //    there are no v2 performance records for this role (else double-counts).
        if (operation && !hasPerfRecords) {
            // Find all automation rules (including reports)
            const autoRules = rules.filter(r => r.category === 'automation' || r.category === 'reports');

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
        const rawAmount = base + kpiBonus;
        const finalAmount = Math.max(0, rawAmount);

        results.push({
            role,
            staffId,
            staffName: staffName || 'Unassigned',
            baseAmount: base,
            kpiScore: sumPercent,
            finalAmount,
            rawAmount,
            details: [
                ...details,
                `KPI Bonus: ${kpiBonus.toLocaleString()} so'm (${sumPercent.toFixed(2)}% of Contract)`
            ]
        });
    };

    // accountant
    calculateForRole('accountant', company.accountantId, company.accountantName, company.accountantPerc, company.accountantSum);

    // bank_manager
    calculateForRole('bank_manager', company.bankClientId, company.bankClientName, company.bankClientPerc, company.bankClientSum);

    // chief_accountant
    const chiefPerc = company.chiefAccountantPerc || 0; // Removed default 7%, must be manual
    const chiefSum = company.chiefAccountantSum || 0;

    if (chiefPerc > 0 || chiefSum > 0) {
        calculateForRole('chief_accountant', company.chiefAccountantId, company.chiefAccountantName || 'Bosh Buxgalter', chiefPerc, chiefSum);
    }

    // supervisor
    calculateForRole('supervisor', company.supervisorId, company.supervisorName, company.supervisorPerc, company.supervisorSum);

    return results;
};

export interface EmployeeSalaryDraft {
    employeeId: string;
    month: string;
    companyCount: number;
    baseSalary: number;
    kpiBonus: number;
    kpiPenalty: number; // negative
    totalSalary: number;
    // Sum of the per-company pre-floor amounts. totalSalary is built from clamped
    // per-company figures, so a rawTotal below zero means penalties exceeded this
    // person's whole base pay and the clamp is hiding it. The payroll write refuses
    // on this — see ADR-0004.
    rawTotal: number;
    companyBreakdowns: CompanyBreakdown[];
}

/**
 * One employee's salary for one month, across every Company they work.
 *
 * Pure: hand it the same inputs and it returns the same number, in a browser or on
 * a server. The payroll write and the draft table both go through here so the figure
 * a Supervisor approves is the figure that gets paid.
 */
export const calculateEmployeeSalary = ({
    employee,
    companies,
    operations,
    performances,
    rules,
    overrides,
    month,
}: {
    employee: Staff;
    companies: Company[];
    operations: OperationEntry[];
    performances: MonthlyPerformance[];
    rules: KPIRule[];
    overrides: CompanyKPIRule[];
    month: string;
}): EmployeeSalaryDraft => {
    const nameLower = employee.name.trim().toLowerCase();

    const opsByCompany = new Map<string, OperationEntry>();
    const staffInOps = new Map<string, Set<string>>();
    operations.forEach(op => {
        if (!periodsEqual(op.period, month)) return;
        opsByCompany.set(op.companyId, op);
        const sids = new Set<string>();
        if (op.assigned_accountant_id) sids.add(op.assigned_accountant_id);
        if (op.assigned_bank_manager_id) sids.add(op.assigned_bank_manager_id);
        if (op.assigned_supervisor_id) sids.add(op.assigned_supervisor_id);
        staffInOps.set(op.companyId, sids);
    });

    // Only approved Monthly Performance affects pay (ADR-0001). The read module
    // already filters, but this stays as a backstop for legacy rows with no status.
    const perfsByCompany = new Map<string, MonthlyPerformance[]>();
    performances.forEach(p => {
        if (p.status && p.status !== 'approved') return;
        const arr = perfsByCompany.get(p.companyId) || [];
        arr.push(p);
        perfsByCompany.set(p.companyId, arr);
    });

    const overridesByCompany = new Map<string, CompanyKPIRule[]>();
    overrides.forEach(o => {
        const arr = overridesByCompany.get(o.companyId) || [];
        arr.push(o);
        overridesByCompany.set(o.companyId, arr);
    });

    // A Company counts if the employee is named on it by id, matched by name where
    // no id was ever set, or assigned through that month's operation.
    const mine = new Set<Company>();
    companies.forEach(c => {
        const byId =
            c.accountantId === employee.id ||
            c.bankClientId === employee.id ||
            c.supervisorId === employee.id ||
            c.chiefAccountantId === employee.id;
        const byName =
            (!c.bankClientId && c.bankClientName?.trim().toLowerCase() === nameLower) ||
            (!c.supervisorId && c.supervisorName?.trim().toLowerCase() === nameLower);
        const byOperation = staffInOps.get(c.id)?.has(employee.id) ?? false;
        if (byId || byName || byOperation) mine.add(c);
    });

    let baseSalary = 0;
    let kpiBonus = 0;
    let kpiPenalty = 0;
    let rawTotal = 0;
    const companyBreakdowns: CompanyBreakdown[] = [];

    mine.forEach(c => {
        const op = opsByCompany.get(c.id);
        const perf = perfsByCompany.get(c.id) || [];
        const cOverrides = overridesByCompany.get(c.id) || [];

        const mergedRules = rules.map(r => {
            const o = cOverrides.find(x => x.ruleId === r.id);
            return o
                ? { ...r, rewardPercent: o.rewardPercent ?? r.rewardPercent, penaltyPercent: o.penaltyPercent ?? r.penaltyPercent }
                : r;
        });

        calculateCompanySalaries(c, op, perf, mergedRules)
            .filter(r => r.staffId === employee.id || r.staffName?.trim().toLowerCase() === nameLower)
            .forEach(res => {
                const bonus = res.finalAmount > res.baseAmount ? res.finalAmount - res.baseAmount : 0;
                const penalty = res.finalAmount < res.baseAmount ? res.baseAmount - res.finalAmount : 0;

                baseSalary += res.baseAmount;
                kpiBonus += bonus;
                kpiPenalty += penalty;
                rawTotal += res.rawAmount;

                companyBreakdowns.push({
                    companyId: c.id,
                    companyName: c.name,
                    contractAmount: Number((op as { contract_amount?: number } | undefined)?.contract_amount ?? c.contractAmount ?? 0),
                    role: res.role,
                    baseAmount: res.baseAmount,
                    kpiBonus: bonus,
                    kpiPenalty: penalty,
                    details: res.details,
                });
            });
    });

    return {
        employeeId: employee.id,
        month,
        companyCount: mine.size,
        baseSalary,
        kpiBonus,
        kpiPenalty: -kpiPenalty,
        totalSalary: baseSalary - kpiPenalty + kpiBonus,
        rawTotal,
        companyBreakdowns,
    };
};
