import React, { useState, useEffect, useMemo } from 'react';
import { EmployeeSalarySummary, Language, MonthlyPerformance, Company, OperationEntry, KPIRule, PayrollAdjustment } from '../types';
import { fetchKPIRules, fetchMonthlyPerformance, fetchPayrollAdjustments, upsertMonthlyPerformance } from '../lib/supabaseData';
import { calculateCompanySalaries } from '../lib/kpiLogic';
import { translations } from '../lib/translations';
import { Wallet, TrendingUp, AlertCircle, Award, Star, TrendingDown, Activity } from 'lucide-react';

interface Props {
    currentUserId: string;
    companies: Company[];
    operations: OperationEntry[];
    lang: Language;
}

const EmployeeDashboard: React.FC<Props> = ({ currentUserId, companies, operations, lang }) => {
    const t = translations[lang];
    const [performances, setPerformances] = useState<MonthlyPerformance[]>([]);
    const [rules, setRules] = useState<KPIRule[]>([]);
    const [adjustments, setAdjustments] = useState<PayrollAdjustment[]>([]);
    const [loading, setLoading] = useState(true);
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM

    const summary = useMemo(() => {
        const checkMonth = month;
        let totalBase = 0;
        let totalKpiBonus = 0;
        let totalKpiPenalty = 0;

        const myCompanies = companies.filter(c =>
            c.accountantId === currentUserId ||
            c.bankClientId === currentUserId ||
            c.supervisorId === currentUserId
        );

        myCompanies.forEach(c => {
            const op = operations.find(o => o.companyId === c.id && o.period === checkMonth);
            const results = calculateCompanySalaries(c, op, performances);

            results.filter(r => r.staffId === currentUserId).forEach(res => {
                totalBase += res.baseAmount;
                if (res.finalAmount < res.baseAmount) {
                    totalKpiPenalty += (res.baseAmount - res.finalAmount);
                } else if (res.finalAmount > res.baseAmount) {
                    totalKpiBonus += (res.finalAmount - res.baseAmount);
                }
            });
        });

        const myAdj = adjustments
            .filter(a => a.employeeId === currentUserId && a.month.startsWith(month) && a.isApproved)
            .reduce((sum, a) => sum + a.amount, 0);

        return {
            employeeId: currentUserId,
            employeeName: 'Self',
            employeeRole: '',
            month,
            companyCount: myCompanies.length,
            baseSalary: totalBase,
            kpiBonus: totalKpiBonus,
            kpiPenalty: -totalKpiPenalty,
            adjustments: myAdj,
            totalSalary: totalBase - totalKpiPenalty + totalKpiBonus + myAdj,
            performanceDetails: []
        } as EmployeeSalarySummary;
    }, [currentUserId, companies, operations, month, performances, adjustments]);

    useEffect(() => {
        loadData();
    }, [currentUserId, month]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [rulesData, perfData, adjData] = await Promise.all([
                fetchKPIRules(),
                fetchMonthlyPerformance(`${month}-01`, undefined, currentUserId),
                fetchPayrollAdjustments(`${month}-01`, currentUserId)
            ]);
            setRules(
                rulesData.filter(
                    r =>
                        (r.role === 'accountant' || r.role === 'bank_client') &&
                        r.isActive &&
                        r.category !== 'attendance'
                )
            );
            setPerformances(perfData);
            setAdjustments(adjData);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    const myCompanies = useMemo(() => {
        return companies.filter(c =>
            c.accountantId === currentUserId ||
            c.bankClientId === currentUserId
        );
    }, [companies, currentUserId]);

    const handleEmployeeSubmit = async (company: Company, rule: KPIRule) => {
        const employeeRole = company.accountantId === currentUserId ? 'accountant' : (company.bankClientId === currentUserId ? 'bank_client' : null);
        if (!employeeRole || rule.role !== employeeRole) return;

        if (rule.category === 'attendance') return;

        const existing = performances.find(p => p.companyId === company.id && p.ruleId === rule.id);

        // If already approved, don't allow changing from employee side
        if (existing?.status === 'approved') return;

        const nextValue = existing?.value === 1 ? 0 : 1;

        try {
            await upsertMonthlyPerformance({
                id: existing?.id,
                month: `${month}-01`,
                companyId: company.id,
                employeeId: currentUserId,
                ruleId: rule.id,
                value: nextValue,
                source: 'employee',
                status: 'submitted',
                submittedBy: currentUserId,
                submittedAt: new Date().toISOString(),
                recordedBy: currentUserId
            });
            await loadData();
        } catch (e) {
            console.error('Error submitting KPI', e);
            await loadData();
        }
    };

    if (loading) {
        return <div className="p-20 text-center text-slate-400">{t.loading}</div>;
    }

    if (!summary) {
        return <div className="p-20 text-center text-slate-400">{t.noData}</div>;
    }

    // Calculate efficiency percentage (gamification)
    // Max possible bonus is hard to know exactly without knowing all rules, 
    // but we can estimate based on performed / total potential
    const positiveperf = performances.filter(p => p.calculatedScore > 0).length;
    // Assume a base goal of 50 positive actions per month for gamification scaling
    const efficiency = Math.min(100, Math.round((positiveperf / 20) * 100));

    return (
        <div className="space-y-10 animate-fade-in pb-20">
            {/* Header Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Estimated Salary */}
                <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800 dark:from-indigo-950 dark:to-slate-900 p-10 rounded-[3rem] text-white shadow-glass-lg group hover:scale-[1.02] transition-all duration-500">
                    <div className="absolute -top-10 -right-10 w-64 h-64 bg-indigo-500/20 rounded-full blur-[80px] group-hover:bg-indigo-400/30 transition-colors duration-700"></div>
                    <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:opacity-20 transition-all duration-500 group-hover:rotate-12 group-hover:scale-110">
                        <Wallet size={120} />
                    </div>
                    <div className="relative z-10">
                        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40 mb-3">{t.currentMonthEst}</p>
                        <h3 className="text-5xl font-black tabular-nums tracking-tighter mb-6">
                            {summary.totalSalary.toLocaleString()} <span className="text-xl font-medium text-white/50">UZS</span>
                        </h3>
                        <div className="flex flex-wrap gap-4">
                            <div className="px-4 py-2 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10">
                                <p className="text-[8px] font-black text-white/50 uppercase tracking-widest mb-1">Bazaviy</p>
                                <p className="text-xs font-bold">{summary.baseSalary.toLocaleString()}</p>
                            </div>
                            <div className="px-4 py-2 bg-emerald-500/10 backdrop-blur-md rounded-2xl border border-emerald-500/20">
                                <p className="text-[8px] font-black text-emerald-400/70 uppercase tracking-widest mb-1">Bonus</p>
                                <p className="text-xs font-bold text-emerald-400">+{summary.kpiBonus.toLocaleString()}</p>
                            </div>
                            <div className="px-4 py-2 bg-blue-500/10 backdrop-blur-md rounded-2xl border border-blue-500/20">
                                <p className="text-[8px] font-black text-blue-300/70 uppercase tracking-widest mb-1">Qo'shimcha</p>
                                <p className="text-xs font-bold text-blue-300">{summary.adjustments.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Efficiency Score */}
                <div className="liquid-glass-card p-10 rounded-[3rem] flex flex-col justify-between shadow-glass relative overflow-hidden group hover:shadow-glass-lg transition-all duration-500">
                    <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-orange-500/5 rounded-full blur-[60px]"></div>
                    <div className="flex items-center gap-5 mb-8">
                        <div className="w-14 h-14 rounded-[1.5rem] bg-orange-500/10 text-orange-500 flex items-center justify-center shadow-glass border border-orange-500/20 group-hover:scale-110 transition-transform">
                            <Award size={28} strokeWidth={2.5} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Reyting</p>
                            <h4 className="font-black text-slate-800 dark:text-white">Samaradorlik</h4>
                        </div>
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-end gap-3 mb-4">
                            <h3 className="text-6xl font-black text-slate-800 dark:text-white tabular-nums tracking-tighter">{efficiency}%</h3>
                            <span className="text-sm font-black text-slate-400 uppercase tracking-widest mb-3">ko'rsatkich</span>
                        </div>
                        <div className="relative w-full bg-slate-100 dark:bg-white/5 h-4 rounded-full overflow-hidden p-1">
                            <div className="h-full bg-gradient-to-r from-orange-400 to-rose-500 rounded-full shadow-[0_0_15px_rgba(251,146,60,0.5)] transition-all duration-[1.5s] ease-out group-hover:brightness-110" style={{ width: `${efficiency}%` }}></div>
                        </div>
                    </div>
                </div>

                {/* Penalties Alert */}
                <div className="liquid-glass-card p-10 rounded-[3rem] flex flex-col justify-between shadow-glass group hover:border-rose-500/30 transition-all duration-500">
                    <div className="flex items-center gap-5 mb-8">
                        <div className="w-14 h-14 rounded-[1.5rem] bg-rose-500/10 text-rose-500 flex items-center justify-center shadow-glass border border-rose-500/20 group-hover:scale-110 transition-transform">
                            <AlertCircle size={28} strokeWidth={2.5} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Ehtiyotkorlik</p>
                            <h4 className="font-black text-slate-800 dark:text-white">Jarimalar</h4>
                        </div>
                    </div>
                    <div>
                        <div className="flex items-baseline gap-2 mb-2">
                            <h3 className="text-4xl font-black text-rose-500 tabular-nums">
                                {summary.kpiPenalty.toLocaleString()}
                            </h3>
                            <span className="text-sm font-black text-slate-400">UZS</span>
                        </div>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                            {performances.filter(p => p.calculatedScore < 0).length} {t.violationsCount}
                        </p>
                    </div>
                </div>
            </div>

            {/* Detailed Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Positive Actions */}
                <div className="liquid-glass-card p-10 rounded-[3.5rem] shadow-glass border border-white/10">
                    <div className="flex items-center justify-between mb-10">
                        <h4 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20">
                                <TrendingUp size={20} />
                            </div>
                            {t.performedTasks}
                        </h4>
                        <span className="px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-500 font-black text-[10px] uppercase tracking-widest border border-emerald-500/20">
                            {t.bonus}
                        </span>
                    </div>
                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
                        {performances.filter(p => p.calculatedScore > 0).map(p => (
                            <div key={p.id} className="group flex items-center justify-between p-6 bg-white/40 dark:bg-white/5 rounded-[2rem] border border-white/20 dark:border-white/10 hover:bg-white/60 dark:hover:bg-white/10 transition-all duration-300">
                                <div>
                                    <p className="font-black text-slate-800 dark:text-white text-base leading-tight mb-1">{p.ruleNameUz || p.ruleName}</p>
                                    <div className="flex items-center gap-2">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{p.companyName}</p>
                                        <span className="w-1 h-1 rounded-full bg-slate-200 dark:bg-white/20"></span>
                                        <p className="text-[10px] font-bold text-emerald-500/70">{new Date(p.submittedAt || '').toLocaleDateString()}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="font-black text-emerald-500 text-lg tabular-nums">
                                        +{p.calculatedScore.toFixed(0)}%
                                    </span>
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Oylikka ta'sir</p>
                                </div>
                            </div>
                        ))}
                        {performances.filter(p => p.calculatedScore > 0).length === 0 && (
                            <div className="text-center py-20 opacity-40">
                                <div className="text-5xl mb-4">🌱</div>
                                <p className="font-black text-slate-400 uppercase tracking-[0.2em] text-xs">Hozircha bonuslar mavjud emas</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Negative Actions */}
                <div className="liquid-glass-card p-10 rounded-[3.5rem] shadow-glass border border-white/10">
                    <div className="flex items-center justify-between mb-10">
                        <h4 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center border border-rose-500/20">
                                <TrendingDown size={20} />
                            </div>
                            {t.discrepancies}
                        </h4>
                        <span className="px-4 py-1.5 rounded-full bg-rose-500/10 text-rose-500 font-black text-[10px] uppercase tracking-widest border border-rose-500/20">
                            {t.penalty}
                        </span>
                    </div>
                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
                        {performances.filter(p => p.calculatedScore < 0).map(p => (
                            <div key={p.id} className="group flex items-center justify-between p-6 bg-rose-50/50 dark:bg-rose-500/5 rounded-[2rem] border border-rose-100 dark:border-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/10 transition-all duration-300">
                                <div>
                                    <p className="font-black text-slate-800 dark:text-white text-base leading-tight mb-1">{p.ruleNameUz || p.ruleName}</p>
                                    <div className="flex items-center gap-2">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{p.companyName}</p>
                                        <span className="w-1 h-1 rounded-full bg-slate-200 dark:bg-white/20"></span>
                                        <p className="text-[10px] font-bold text-rose-500/70">{new Date(p.submittedAt || '').toLocaleDateString()}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="font-black text-rose-500 text-lg tabular-nums">
                                        {p.calculatedScore.toFixed(0)}%
                                    </span>
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Chegirildi</p>
                                </div>
                            </div>
                        ))}
                        {performances.filter(p => p.calculatedScore < 0).length === 0 && (
                            <div className="text-center py-20 opacity-40">
                                <div className="text-5xl mb-4">🛡️</div>
                                <p className="font-black text-slate-400 uppercase tracking-[0.2em] text-xs">A'lo darajada! Hech qanday jarima yo'q</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* KPI Submission (Employee) */}
            <div className="liquid-glass-card p-10 rounded-[4rem] shadow-glass border border-white/10 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-[100px] -mr-48 -mt-48"></div>
                <div className="relative z-10">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-12">
                        <div>
                            <h4 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-4">
                                <Activity className="text-indigo-500" />
                                {t.kpiInitiatives}
                            </h4>
                            <p className="text-sm font-bold text-slate-400 mt-2 max-w-xl">
                                {t.kpiDesc}
                            </p>
                        </div>
                        <div className="flex items-center gap-3 bg-white/50 dark:bg-white/5 p-2 rounded-2xl border border-white/20 shadow-glass">
                            <input
                                type="month"
                                value={month}
                                onChange={e => setMonth(e.target.value)}
                                className="bg-transparent border-none font-black text-sm text-slate-700 dark:text-white focus:ring-0 cursor-pointer px-4"
                            />
                        </div>
                    </div>

                    {myCompanies.length === 0 ? (
                        <div className="text-center py-32 bg-slate-50/50 dark:bg-white/5 rounded-[3rem] border-2 border-dashed border-slate-200 dark:border-white/10">
                            <div className="text-6xl mb-6">🏝️</div>
                            <p className="font-black text-slate-400 uppercase tracking-[0.3em] text-sm">
                                {lang === 'uz' ? 'Hozircha faol firmalar mavjud emas' : 'Активных фирм пока нет'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-10">
                            {myCompanies.map(company => {
                                const role: 'accountant' | 'bank_client' | null = company.accountantId === currentUserId
                                    ? 'accountant'
                                    : (company.bankClientId === currentUserId ? 'bank_client' : null);
                                const roleRules = rules.filter(r => r.role === role);

                                return (
                                    <div key={company.id} className="bg-white/30 dark:bg-white/5 rounded-[3rem] p-10 border border-white/20 dark:border-white/10 group hover:border-indigo-500/30 transition-all duration-500">
                                        <div className="flex items-center justify-between mb-8">
                                            <div className="flex items-center gap-6">
                                                <div className="w-16 h-16 rounded-[2rem] bg-gradient-to-br from-slate-100 to-slate-200 dark:from-white/10 dark:to-white/5 flex items-center justify-center font-black text-2xl text-slate-400 group-hover:from-indigo-500 group-hover:to-indigo-600 group-hover:text-white transition-all duration-500 shadow-glass border border-white/20">
                                                    {company.name[0]}
                                                </div>
                                                <div>
                                                    <p className="text-xl font-black text-slate-800 dark:text-white leading-tight">{company.name}</p>
                                                    <div className="flex items-center gap-4 mt-2">
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">INN: {company.inn}</p>
                                                        <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                                        <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">
                                                            {role === 'accountant' ? (lang === 'uz' ? 'Buxgalter' : 'Бухгалтер') : 'Bank'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            {roleRules.map(rule => {
                                                const perf = performances.find(p => p.companyId === company.id && p.ruleId === rule.id);
                                                const status = perf?.status;
                                                const isApproved = status === 'approved' || !status;
                                                const isSubmitted = status === 'submitted';
                                                const isRejected = status === 'rejected';
                                                const isDone = perf?.value === 1;

                                                return (
                                                    <button
                                                        key={rule.id}
                                                        onClick={() => handleEmployeeSubmit(company, rule)}
                                                        disabled={status === 'approved'}
                                                        className={`relative text-left p-6 rounded-[2.2rem] border-2 transition-all duration-500 active:scale-95 group/btn overflow-hidden ${isApproved && isDone
                                                            ? 'bg-emerald-500/5 border-emerald-500/30'
                                                            : isSubmitted
                                                                ? 'bg-amber-500/5 border-amber-500/30'
                                                                : isRejected
                                                                    ? 'bg-rose-500/5 border-rose-500/30'
                                                                    : 'bg-white dark:bg-white/5 border-slate-100 dark:border-white/5 hover:border-indigo-500/30 hover:shadow-glass'
                                                            } ${status === 'approved' ? 'opacity-80 cursor-not-allowed' : 'cursor-pointer'}`}
                                                    >
                                                        {isDone && <div className={`absolute top-0 right-0 w-24 h-24 blur-3xl -mr-12 -mt-12 transition-colors duration-500 ${isApproved ? 'bg-emerald-500/20' : 'bg-amber-500/20'}`}></div>}

                                                        <div className="relative z-10 flex flex-col h-full justify-between">
                                                            <div>
                                                                <div className="flex items-start justify-between mb-3">
                                                                    <p className="font-black text-sm text-slate-800 dark:text-white leading-tight pr-4">
                                                                        {lang === 'uz' ? rule.nameUz : rule.name}
                                                                    </p>
                                                                    {isDone ? (
                                                                        <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-glass-lg shrink-0 scale-110">
                                                                            <Award size={14} fill="currentColor" />
                                                                        </div>
                                                                    ) : (
                                                                        <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-white/10 text-slate-400 flex items-center justify-center shrink-0">
                                                                            <Activity size={12} />
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    {isApproved && isDone && (
                                                                        <span className="text-[8px] font-black bg-emerald-500/20 text-emerald-600 px-2 py-0.5 rounded-md uppercase tracking-widest">Tasdiqlandi</span>
                                                                    )}
                                                                    {isSubmitted && (
                                                                        <span className="text-[8px] font-black bg-amber-500/20 text-amber-600 px-2 py-0.5 rounded-md uppercase tracking-widest">Kutilmoqda</span>
                                                                    )}
                                                                    {isRejected && (
                                                                        <span className="text-[8px] font-black bg-rose-500/20 text-rose-600 px-2 py-0.5 rounded-md uppercase tracking-widest">Rad etildi</span>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div className="mt-8 flex items-center justify-between">
                                                                <span className={`text-[10px] font-black px-4 py-1.5 rounded-2xl transition-all duration-500 ${isDone
                                                                    ? 'bg-emerald-500 text-white shadow-emerald-500/40'
                                                                    : 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400'
                                                                    }`}>
                                                                    {isDone ? (lang === 'uz' ? 'TOPShIRILDI' : 'СДАНО') : (lang === 'uz' ? 'TOPShIRISH' : 'СДАТЬ')}
                                                                </span>
                                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                                    {rule.weight}%
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {perf?.rejectedReason && (
                                                            <div className="mt-4 pt-4 border-t border-rose-500/20">
                                                                <p className="text-[9px] font-bold text-rose-500/80 italic leading-tight">" {perf.rejectedReason} "</p>
                                                            </div>
                                                        )}
                                                    </button>
                                                );
                                            })}

                                            {roleRules.length === 0 && (
                                                <div className="text-center text-slate-400 text-sm py-12 rounded-[2rem] bg-slate-50/50 dark:bg-white/5 border border-dashed border-slate-200 dark:border-white/10 col-span-full">
                                                    <p className="font-black uppercase tracking-widest text-xs">Ushbu rol uchun KPI qoidalari sozlanmagan</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EmployeeDashboard;
