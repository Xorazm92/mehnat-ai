
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
        <div className="space-y-10 animate-fade-in pb-20">
            {/* Drafts Header */}
            <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-indigo-950 rounded-[3.5rem] p-12 text-white shadow-glass-lg group">
                <div className="absolute -top-10 -right-10 w-80 h-80 bg-emerald-500/10 rounded-full blur-[100px] animate-pulse"></div>
                <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-blue-500/10 rounded-full blur-[80px]"></div>
                <div className="absolute top-0 right-0 p-12 opacity-[0.05] group-hover:scale-110 group-hover:rotate-12 transition-all duration-700 pointer-events-none">
                    <DollarSign size={200} />
                </div>

                <div className="relative z-10 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-10">
                    <div>
                        <h2 className="text-4xl md:text-5xl font-black tracking-tighter leading-tight mb-4 premium-text-gradient">
                            Oylik Xomcho't <span className="text-white/30">(Drafts)</span>
                        </h2>
                        <p className="text-sm font-black text-white/40 uppercase tracking-[0.3em]">
                            Har oyning 1-sanasida avtomatik hisob-kitob tizimi
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-6 items-center w-full xl:w-auto">
                        {userRole === 'admin' && (
                            <div className="w-full sm:w-auto px-8 py-5 bg-emerald-500/10 backdrop-blur-md border border-emerald-500/20 rounded-[1.8rem] flex flex-col items-center sm:items-start group/comm">
                                <p className="text-[10px] font-black text-emerald-400/70 uppercase tracking-widest mb-1">Super Admin (7%)</p>
                                <p className="text-2xl font-black text-emerald-400 tabular-nums group-hover:scale-105 transition-transform">{superAdminCommission.toLocaleString()} <span className="text-xs opacity-50">UZS</span></p>
                            </div>
                        )}
                        <div className="relative w-full sm:w-auto">
                            <input
                                type="month"
                                value={month}
                                onChange={(e) => setMonth(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-[1.8rem] px-8 py-5 font-black text-white outline-none focus:bg-white/10 focus:border-white/20 transition-all appearance-none shadow-inner"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {staff.map(s => {
                    const draft = drafts[s.id];
                    if (!draft || draft.companyCount === 0) return null;

                    return (
                        <div key={s.id} className="liquid-glass-card p-10 rounded-[3.5rem] hover:shadow-glass-lg transition-all group border border-white/10 overflow-hidden relative">
                            <div className="absolute -right-10 -top-10 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-colors duration-700"></div>

                            <div className="flex items-center justify-between mb-10">
                                <div className="flex items-center gap-5">
                                    <div className="w-16 h-16 rounded-[1.5rem] bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white font-black text-2xl shadow-glass transform group-hover:scale-110 group-hover:rotate-6 transition-all duration-500">
                                        {s.name[0]}
                                    </div>
                                    <div>
                                        <h4 className="font-black text-xl text-slate-800 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{s.name}</h4>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">{s.role}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="px-4 py-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm">
                                        Draft
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center p-5 bg-slate-50 dark:bg-white/5 rounded-[1.8rem] border border-transparent group-hover:border-indigo-500/10 transition-all">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-white dark:bg-white/10 flex items-center justify-center text-slate-400">
                                            <FileText size={16} />
                                        </div>
                                        <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Asosiy Oylik</span>
                                    </div>
                                    <span className="font-black text-slate-800 dark:text-white tabular-nums">{draft.baseSalary.toLocaleString()} <span className="text-[10px] opacity-40 ml-1">UZS</span></span>
                                </div>
                                <div className="flex justify-between items-center p-5 bg-emerald-500/5 dark:bg-emerald-500/10 rounded-[1.8rem] border border-transparent transition-all">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-white dark:bg-white/10 flex items-center justify-center text-emerald-500">
                                            <CheckCircle2 size={16} />
                                        </div>
                                        <span className="text-xs font-black text-slate-500 uppercase tracking-widest">KPI Bonus</span>
                                    </div>
                                    <span className="font-black text-emerald-500 tabular-nums">+{draft.kpiBonus.toLocaleString()} <span className="text-[10px] opacity-40 ml-1">UZS</span></span>
                                </div>
                                <div className="flex justify-between items-center p-5 bg-rose-500/5 dark:bg-rose-500/10 rounded-[1.8rem] border border-transparent transition-all">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-white dark:bg-white/10 flex items-center justify-center text-rose-500">
                                            <AlertCircle size={16} />
                                        </div>
                                        <span className="text-xs font-black text-slate-500 uppercase tracking-widest">KPI Jarima</span>
                                    </div>
                                    <span className="font-black text-rose-500 tabular-nums">{draft.kpiPenalty.toLocaleString()} <span className="text-[10px] opacity-40 ml-1">UZS</span></span>
                                </div>

                                <div className="pt-8 mt-6 border-t border-slate-100 dark:border-white/5 flex justify-between items-end">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Jami To'lov</p>
                                        <h3 className="text-3xl font-black text-indigo-600 dark:text-indigo-400 tracking-tighter tabular-nums">{draft.totalSalary.toLocaleString()} <span className="text-sm font-black text-slate-400 ml-1">UZS</span></h3>
                                    </div>
                                    <button className="px-8 py-5 bg-slate-900 dark:bg-white/10 text-white rounded-[1.5rem] font-black text-[11px] uppercase tracking-widest hover:bg-indigo-600 dark:hover:bg-indigo-600 transition-all shadow-glass-lg active:scale-95 transform hover:-translate-y-1">
                                        Tasdiqlash
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            {loading && (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] animate-pulse">Hisob-kitob amalga oshirilmoqda...</p>
                </div>
            )}
        </div>
    );
};

export default PayrollDrafts;
