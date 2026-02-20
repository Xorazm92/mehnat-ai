
import React, { useState, useEffect, useMemo } from 'react';
import { Staff, Company, Language, EmployeeSalarySummary, OperationEntry, MonthlyPerformance, KPIRule, CompanyKPIRule } from '../types';
import { fetchMonthlyPerformance, fetchKPIRules, fetchAllCompanyKPIRules } from '../lib/supabaseData';
import { calculateCompanySalaries } from '../lib/kpiLogic';
import { translations } from '../lib/translations';
import { DollarSign, CheckCircle2, AlertCircle, FileText, ChevronRight } from 'lucide-react';
import { periodsEqual } from '../lib/periods';

interface Props {
    staff: Staff[];
    companies: Company[];
    operations: OperationEntry[];
    lang: Language;
    userRole?: string;
}

const PayrollDrafts: React.FC<Props> = ({ staff, companies, operations, lang, userRole }) => {
    const t = translations[lang];
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
    const [performanceList, setPerformanceList] = useState<MonthlyPerformance[]>([]);
    const [kpiRules, setKpiRules] = useState<KPIRule[]>([]);
    const [companyOverrides, setCompanyOverrides] = useState<CompanyKPIRule[]>([]);
    const [loading, setLoading] = useState(false);

    const superAdminCommission = useMemo(() => {
        const totalTurnover = companies.filter(c => c.isActive).reduce((acc, c) => acc + (c.contractAmount || 0), 0);
        return totalTurnover * 0.07;
    }, [companies]);

    // Calculate drafts on the fly using useMemo instead of async state for better reactivity
    const drafts = useMemo(() => {
        const results: Record<string, EmployeeSalarySummary> = {};
        const checkMonth = month;

        staff.forEach(s => {
            let totalBase = 0;
            let totalKpiBonus = 0;
            let totalKpiPenalty = 0;

            const sNameLower = s.name.trim().toLowerCase();

            const myCompanyIdsFromOps = new Set(
                operations
                    .filter(op => periodsEqual(op.period, checkMonth))
                    .filter(op =>
                        op.assigned_accountant_id === s.id ||
                        op.assigned_bank_manager_id === s.id ||
                        op.assigned_supervisor_id === s.id
                    )
                    .map(op => op.companyId)
            );

            const myCompanies = companies.filter(c =>
                c.accountantId === s.id ||
                c.bankClientId === s.id ||
                c.supervisorId === s.id ||
                myCompanyIdsFromOps.has(c.id) ||
                (!c.bankClientId && c.bankClientName && c.bankClientName.trim().toLowerCase() === sNameLower) ||
                (!c.supervisorId && c.supervisorName && c.supervisorName.trim().toLowerCase() === sNameLower)
            );

            myCompanies.forEach(c => {
                const op = operations.find(o => o.companyId === c.id && periodsEqual(o.period, checkMonth));

                // Merge rules with company-specific overrides
                const mergedRules = kpiRules.map(r => {
                    const override = companyOverrides.find(o => o.companyId === c.id && o.ruleId === r.id);
                    if (override) {
                        return {
                            ...r,
                            rewardPercent: override.rewardPercent ?? r.rewardPercent,
                            penaltyPercent: override.penaltyPercent ?? r.penaltyPercent
                        };
                    }
                    return r;
                });

                const roleResults = calculateCompanySalaries(c, op, performanceList, mergedRules);

                roleResults.filter(r =>
                    r.staffId === s.id ||
                    (r.staffName && r.staffName.trim().toLowerCase() === sNameLower)
                ).forEach(res => {
                    totalBase += res.baseAmount;
                    if (res.finalAmount < res.baseAmount) {
                        totalKpiPenalty += (res.baseAmount - res.finalAmount);
                    } else if (res.finalAmount > res.baseAmount) {
                        totalKpiBonus += (res.finalAmount - res.baseAmount);
                    }
                });
            });

            results[s.id] = {
                employeeId: s.id,
                employeeName: s.name,
                employeeRole: s.role,
                month,
                companyCount: myCompanies.length,
                baseSalary: totalBase,
                kpiBonus: totalKpiBonus,
                kpiPenalty: -totalKpiPenalty,
                adjustments: 0,
                totalSalary: totalBase - totalKpiPenalty + totalKpiBonus,
                performanceDetails: performanceList.filter(p => p.employeeId === s.id)
            };
        });
        return results;
    }, [staff, companies, operations, month, performanceList, kpiRules, companyOverrides]);

    const loadPerformance = async () => {
        setLoading(true);
        try {
            const [perf, rules, overrides] = await Promise.all([
                fetchMonthlyPerformance(`${month}-01`),
                fetchKPIRules(),
                fetchAllCompanyKPIRules()
            ]);
            setPerformanceList(perf);
            setKpiRules(rules);
            setCompanyOverrides(overrides);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadPerformance();
    }, [month]);

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex items-center justify-between bg-white dark:bg-apple-darkCard p-8 rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder shadow-xl">
                <div>
                    <h2 className="text-2xl font-black text-slate-800 dark:text-white">Oylik Xomcho't (Drafts)</h2>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">Har oyning 1-sanasida avtomatik hisob-kitob</p>
                </div>
                <div className="flex gap-4">
                    {userRole === 'admin' && (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 px-6 py-3 rounded-2xl">
                            <p className="text-[10px] font-black text-emerald-600 uppercase">Super Admin (7%)</p>
                            <p className="text-xl font-black text-emerald-500 font-mono">{superAdminCommission.toLocaleString()} sum</p>
                        </div>
                    )}
                    <input
                        type="month"
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        className="bg-slate-50 dark:bg-apple-darkBg border border-apple-border rounded-xl px-4 py-3 font-black text-sm outline-none focus:ring-4 focus:ring-apple-accent/10 transition-all"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {staff.map(s => {
                    const draft = drafts[s.id];
                    if (!draft || draft.companyCount === 0) return null;

                    return (
                        <div key={s.id} className="bg-white dark:bg-apple-darkCard p-6 rounded-[2rem] border border-apple-border dark:border-apple-darkBorder hover:shadow-2xl transition-all group">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-apple-accent/10 flex items-center justify-center text-apple-accent font-black text-xl">
                                        {s.name[0]}
                                    </div>
                                    <div>
                                        <h4 className="font-black text-slate-800 dark:text-white">{s.name}</h4>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-tight">{s.role}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] font-black px-2 py-1 bg-amber-100 text-amber-600 rounded-lg uppercase">Draft</span>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-white/5 rounded-xl border border-transparent group-hover:border-apple-accent/20 transition-colors">
                                    <span className="text-xs font-bold text-slate-500">Asosiy Oylik</span>
                                    <span className="font-mono font-black text-slate-800 dark:text-white">{draft.baseSalary.toLocaleString()} sum</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-white/5 rounded-xl border border-transparent">
                                    <span className="text-xs font-bold text-slate-500">KPI Bonus</span>
                                    <span className="font-mono font-black text-emerald-500">+{draft.kpiBonus.toLocaleString()} sum</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-rose-50 dark:bg-rose-500/5 rounded-xl border border-transparent">
                                    <span className="text-xs font-bold text-slate-500">KPI Jarima</span>
                                    <span className="font-mono font-black text-rose-500">{draft.kpiPenalty.toLocaleString()} sum</span>
                                </div>
                                <div className="pt-4 mt-4 border-t border-apple-border dark:border-apple-darkBorder flex justify-between items-center">
                                    <span className="text-sm font-black text-slate-800 dark:text-white uppercase">Jami:</span>
                                    <span className="text-xl font-black text-apple-accent">{draft.totalSalary.toLocaleString()} sum</span>
                                </div>
                            </div>

                            <button className="w-full mt-6 py-4 bg-slate-900 text-white rounded-2xl font-black text-sm hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
                                <CheckCircle2 size={18} /> Tasdiqlash
                            </button>
                        </div>
                    );
                })}
            </div>
            {loading && <div className="text-center py-10 text-slate-400 animate-pulse font-bold">Yuklanmoqda...</div>}
        </div>
    );
};

export default PayrollDrafts;
