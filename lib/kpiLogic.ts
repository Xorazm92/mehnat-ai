
import { Company, OperationEntry, ContractRole, MonthlyPerformance, KPIRule, Staff, CompanyKPIRule, CompanyBreakdown } from '@/types';
import { capKpiPercent } from '@/lib/kpiScoring';
import { periodsEqual } from '@/lib/periods';
import { formatNum } from '@/lib/platform/format';
import {
    PAYROLL_BASIS_DEFAULT,
    resolveSalaryBasis,
    type PayrollBasis,
} from '@/lib/payrollBasis';

/**
 * Oylik bazasi. `collected` — shu firma shu davrda haqiqatda to'lagan summa;
 * 'cash' rejimida ulush ham, KPI bonusi ham shundan hisoblanadi.
 * Berilmasa 'accrual' — eski (shartnomaga asoslangan) xatti-harakat.
 */
export interface SalaryBasisOptions {
    basis?: PayrollBasis;
    collected?: number;
    /**
     * Shu firmadagi FAOL biriktiruvlar (`ContractAssignment`).
     *
     * Berilsa — ulush manbai SHU, `Company.accountantPerc/...Sum` ustunlari
     * emas. Nega muhim: ustunlar to'rtta rolga QOTIRILGAN, biriktiruv
     * jadvalida esa `role` erkin matn. Prodda allaqachon `chief` va
     * `controller` rollarida odamlar bor va ular oylikda UMUMAN
     * ko'rinmasdi — ularning ulushi hech qaysi ustunga sig'masdi.
     *
     * Berilmasa eski (ustunli) yo'l ishlaydi — orqaga moslik uchun.
     */
    assignments?: CompanyAssignment[];
}

/** `ContractAssignment` ning oylik uchun kerakli qismi. */
export interface CompanyAssignment {
    userId: string;
    userName?: string;
    /** Xom qiymat: 'accountant' | 'chief' | 'chief_accountant' | 'controller' | 'supervisor' | 'bank_manager' | … */
    role: string;
    /** 'percent' | 'fixed' */
    salaryType: string;
    salaryValue: number;
}

/**
 * Biriktiruv rolini oylik roliga keltirish.
 *
 * `null` — noma'lum rol: u hisoblanadi, lekin KPI bonusi konverti NOL
 * bo'ladi (qarang `capKpiPercent` chaqirig'i). Aks holda reglamentda
 * yozilmagan yangi rol cheksiz bonus konvertini olib qolardi.
 */
const assignmentRoleToSalaryRole = (role: string): SalaryResult['role'] | null => {
    switch (role) {
        case 'accountant': return 'accountant';
        case 'bank_manager':
        case 'bank_client': return 'bank_manager';
        case 'chief':
        case 'chief_accountant': return 'chief_accountant';
        case 'controller':
        case 'supervisor': return 'supervisor';
        default: return null;
    }
};

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

    // Reward shorthands or full DB strings.
    // 'nol' (nol hisobot) ham shu yerda: u topshirilgan ish — buxgalter nil
    // deklaratsiyani yuborgan. Avval u pastdagi `return 0` ga tushib, nol
    // hisobotli firmalar KPI'da umuman hisobga olinmasdi.
    if (s === '+' || s === 'accepted' || s === 'topshirildi' || s === 'submitted' || s === 'nol') return 1;

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
    rules: KPIRule[] = [],
    opts: SalaryBasisOptions = {}
): SalaryResult[] => {
    const results: SalaryResult[] = [];
    // Prisma Decimal fields can arrive as strings across the RSC/JSON boundary —
    // coerce everything numeric so arithmetic never string-concatenates.
    const toNum = (v: unknown): number => {
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(n) ? n : 0;
    };
    const contract = toNum((operation as any)?.contract_amount ?? company.contractAmount ?? (company as any).contract_amount ?? 0);

    const basisMode: PayrollBasis = opts.basis ?? PAYROLL_BASIS_DEFAULT;
    const basis = resolveSalaryBasis({ basis: basisMode, contract, collected: opts.collected });
    const basisLabel = basisMode === 'cash' ? 'Tushum' : 'Shartnoma';

    // ATAYLAB dedup QILINMAYDI: (month, companyId, employeeId, ruleId) DB darajasida
    // unique (prisma/schema.prisma), ya'ni dublikat bo'lishi mumkin emas. Bu yerda
    // qatorlarni yig'ish qonuniy bir nechta KPI yozuvini yo'qotadi va chegara
    // (capKpiPercent) hech qachon ishga tushmaydi. Qarang: ADR-0004.
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
        sumRaw?: number,
        /** false — reglamentda yozilmagan rol: KPI bonus konverti nol. */
        knownRole = true
    ) => {
        const perc = toNum(percRaw);
        const sum = toNum(sumRaw);
        if (!staffId && !sum && !perc) return;

        let base = 0;
        const details: string[] = [];

        if (sum) {
            // Qat'iy summa ham tushumga bog'lanadi (collectionRatio) — aks holda
            // bitta firmada foizli xodim to'lovga bog'liq, qat'iy summali xodim
            // bog'liq bo'lmay qolardi.
            base = sum * basis.collectionRatio;
            details.push(
                basis.collectionRatio === 1
                    ? `Qat'iy summa: ${formatNum(sum)}`
                    : `Qat'iy summa: ${formatNum(sum)} × ${(basis.collectionRatio * 100).toFixed(1)}%`
            );
        } else if (perc) {
            base = (basis.basisAmount * perc) / 100;
            details.push(`${basisLabel}: ${formatNum(basis.basisAmount)} × ${perc}%`);
        }

        if (basis.note) details.push(basis.note);

        if (base === 0 && !staffId) return;

        // KPI Calculation (percent-based)
        let sumPercent = 0;
        // True once v2 performance records drive this role — makes the legacy
        // operation-status path below a no-op so nothing is double-counted.
        let hasPerfRecords = false;

        // 1) KPI from monthly performance records (v2: options-based score)
        if (staffId) {
            const myRolePerf = companyPerf.filter(p => p.employeeId === staffId);
            // Noma'lum rol `chief_accountant` konvertini oladi — u NOL
            // (KPI_SALARY_CONFIG), ya'ni bonus berilmaydi. Xom rolni
            // o'tkazish `capKpiPercent` ga Infinity qaytarardi.
            const typedRole = !knownRole
                ? 'chief_accountant'
                : role === 'accountant'
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

                    // `rules` bu yerga KELISHIDAN OLDIN firma bo'yicha
                    // override'lar bilan birlashtirilgan bo'lishi shart
                    // (`calculateEmployeeSalary` shuni qiladi) — bu funksiya
                    // override jadvalini o'zi o'qimaydi.
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

        // Salary = Base + (Baza * KPI% / 100). KPI foizi xodimning ulushidan
        // emas, firmaning butun summasidan olinadi — 'cash' rejimida esa
        // to'langan qismidan.
        const kpiBonus = (basis.basisAmount * sumPercent) / 100;
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
                `KPI bonus: ${formatNum(kpiBonus)} so'm (${basisLabel}ning ${sumPercent.toFixed(2)}% i)`
            ]
        });
    };

    // BIRIKTIRUV YO'LI (afzal): ulush `ContractAssignment` dan o'qiladi,
    // ya'ni to'rtta ustunga sig'maydigan rollar ham oylikka tushadi.
    const assignments = opts.assignments;
    if (assignments && assignments.length > 0) {
        for (const a of assignments) {
            const mapped = assignmentRoleToSalaryRole(a.role);
            const value = toNum(a.salaryValue);
            const isPercent = a.salaryType !== 'fixed';
            calculateForRole(
                mapped ?? (a.role as SalaryResult['role']),
                a.userId,
                a.userName,
                isPercent ? value : undefined,
                isPercent ? undefined : value,
                mapped !== null
            );
        }
        return results;
    }

    // ESKI YO'L — biriktiruv berilmagan chaqiruvlar uchun (orqaga moslik).
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
    basis = PAYROLL_BASIS_DEFAULT,
    collectedByCompany,
    assignmentsByCompany,
}: {
    employee: Staff;
    companies: Company[];
    operations: OperationEntry[];
    performances: MonthlyPerformance[];
    rules: KPIRule[];
    overrides: CompanyKPIRule[];
    month: string;
    /** Oylik bazasi rejimi (`SystemSetting.payrollBasis`). */
    basis?: PayrollBasis;
    /** companyId → shu davrda tushgan summa. 'cash' rejimida MAJBURIY. */
    collectedByCompany?: Record<string, number>;
    /**
     * companyId → shu firmadagi faol biriktiruvlar. Berilsa ulush shundan
     * o'qiladi (`SalaryBasisOptions.assignments` izohiga qarang).
     */
    assignmentsByCompany?: Record<string, CompanyAssignment[]>;
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
        // Biriktiruv jadvalidagi rol ustunlarga sig'masligi mumkin ('chief',
        // 'controller') — u holda `byId` yolg'on chiqadi va firma umuman
        // hisobga olinmasdi.
        const byAssignment =
            assignmentsByCompany?.[c.id]?.some((a) => a.userId === employee.id) ?? false;
        if (byId || byName || byOperation || byAssignment) mine.add(c);
    });

    let baseSalary = 0;
    let kpiBonus = 0;
    let kpiPenalty = 0;
    let rawTotal = 0;
    const companyBreakdowns: CompanyBreakdown[] = [];

    mine.forEach(c => {
        const collected = collectedByCompany?.[c.id] ?? 0;
        const op = opsByCompany.get(c.id);
        const perf = perfsByCompany.get(c.id) || [];
        const cOverrides = overridesByCompany.get(c.id) || [];

        const mergedRules = rules.map(r => {
            const o = cOverrides.find(x => x.ruleId === r.id);
            return o
                ? { ...r, rewardPercent: o.rewardPercent ?? r.rewardPercent, penaltyPercent: o.penaltyPercent ?? r.penaltyPercent }
                : r;
        });

        calculateCompanySalaries(c, op, perf, mergedRules, {
            basis,
            collected,
            assignments: assignmentsByCompany?.[c.id],
        })
            .filter(r => r.staffId === employee.id || r.staffName?.trim().toLowerCase() === nameLower)
            .forEach(res => {
                const bonus = res.finalAmount > res.baseAmount ? res.finalAmount - res.baseAmount : 0;
                const penalty = res.finalAmount < res.baseAmount ? res.baseAmount - res.finalAmount : 0;
                // Jarima shu firmadagi bazani yeb tugatgan bo'lsa, ortig'i
                // `finalAmount = max(0, raw)` da yo'qoladi. `rawTotal` faqat
                // UMUMIY manfiylikni ushlaydi — bitta firmada qisilib, boshqa
                // firmalar uni qoplab yuborsa hech kim sezmaydi. Shu sababdan
                // yo'qolgan miqdor firma kesimida saqlanadi.
                const clampedLoss = res.rawAmount < 0 ? -res.rawAmount : 0;

                baseSalary += res.baseAmount;
                kpiBonus += bonus;
                kpiPenalty += penalty;
                rawTotal += res.rawAmount;

                const contractAmount = Number(
                    (op as { contract_amount?: number } | undefined)?.contract_amount ?? c.contractAmount ?? 0
                );
                companyBreakdowns.push({
                    companyId: c.id,
                    companyName: c.name,
                    contractAmount,
                    basisAmount: basis === 'cash' ? Math.min(collected, contractAmount || collected) : contractAmount,
                    collectedAmount: collected,
                    role: res.role,
                    baseAmount: res.baseAmount,
                    kpiBonus: bonus,
                    kpiPenalty: penalty,
                    clampedLoss,
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
