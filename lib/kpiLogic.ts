
import { Company, OperationEntry, ReportStatus, ContractRole, MonthlyPerformance } from '../types';

export interface SalaryResult {
    role: ContractRole | 'chief_accountant' | 'supervisor';
    staffId?: string;
    staffName?: string;
    baseAmount: number;
    kpiScore: number; // -1, 0, 1
    finalAmount: number;
    details: string[];
}

/**
 * Calculates the KPI score (-1, 0, 1) for a specific report/operation status.
 */
export const getReportScore = (status: ReportStatus): number => {
    switch (status) {
        case ReportStatus.ACCEPTED:
        case ReportStatus.NOT_REQUIRED:
            return 1;
        case ReportStatus.SUBMITTED:
        case ReportStatus.IN_PROGRESS:
            return 0; // Hold
        case ReportStatus.NOT_SUBMITTED:
        case ReportStatus.REJECTED:
        case ReportStatus.BLOCKED:
            return -1; // Penalty
        default:
            return 0;
    }
};

/**
 * Calculates salaries for all roles in a company based on the operation period and manual performances.
 */
export const calculateCompanySalaries = (
    company: Company,
    operation?: OperationEntry,
    performances: MonthlyPerformance[] = []
): SalaryResult[] => {
    const results: SalaryResult[] = [];
    const contract = company.contractAmount || 0;

    const companyPerf = performances.filter(p => p.companyId === company.id);

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

        // KPI Calculation
        let score = 1; // Default to full pay

        // 1. Report Status Impact (Accountant only for now)
        if (role === 'accountant' && operation) {
            const profitScore = getReportScore(operation.profitTaxStatus);
            const statsScore = getReportScore(operation.statsStatus);

            if (profitScore === -1 || statsScore === -1) {
                score = -1;
                details.push('Penalty: Late or Rejected reports');
            } else if (profitScore === 0 || statsScore === 0) {
                score = 0;
                details.push('Hold: Reports in progress');
            }
        }

        // 2. Manual Performance Impact (From NazoratchiChecklist)
        if (staffId) {
            const myRolePerf = companyPerf.filter(p => p.employeeId === staffId);
            const penaltyCount = myRolePerf.filter(p => p.value === -1).length;
            const holdCount = myRolePerf.filter(p => p.value === 0).length;

            if (penaltyCount > 0) {
                score = -1;
                details.push(`Penalty: ${penaltyCount} negative KPI marks`);
            } else if (holdCount > 0 && score === 1) {
                score = 0;
                details.push(`Hold: ${holdCount} pending KPI marks`);
            }
        }

        results.push({
            role,
            staffId,
            staffName: staffName || 'Unassigned',
            baseAmount: base,
            kpiScore: score,
            finalAmount: score === 1 ? base : (score === 0 ? base * 0.5 : 0),
            details
        });
    };

    // accountant
    calculateForRole('accountant', company.accountantId, company.accountantName, company.accountantPerc);

    // bank_manager
    calculateForRole('bank_manager', company.bankClientId, company.bankClientName, company.bankClientPerc, company.bankClientSum);

    // chief_accountant
    if (company.chiefAccountantPerc || company.chiefAccountantSum) {
        calculateForRole('chief_accountant', undefined, 'Chief Accountant', company.chiefAccountantPerc, company.chiefAccountantSum);
    }

    // supervisor
    calculateForRole('supervisor', company.supervisorId, company.supervisorName, company.supervisorPerc);

    return results;
};
