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
            c.supervisorId === currentUserId ||
            c.chiefAccountantId === currentUserId
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
            c.bankClientId === currentUserId ||
            c.chiefAccountantId === currentUserId
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
        <div className="space-y-6 animate-fade-in p-6 bg-gray-50 dark:bg-[#1A1D23] min-h-screen">
            {/* Header Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Estimated Salary */}
                <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 p-4 rounded shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="text-[10px] font-bold uppercase text-gray-500 mb-1">{t.currentMonthEst}</p>
                            <h3 className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
                                {summary.totalSalary.toLocaleString()} <span className="text-sm font-bold text-gray-400">UZS</span>
                            </h3>
                        </div>
                        <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded flex items-center justify-center border border-indigo-100 dark:border-indigo-800">
                            <Wallet size={20} />
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <div className="p-2 bg-gray-50 dark:bg-[#1e2025] border border-gray-200 dark:border-gray-700 rounded">
                            <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">Bazaviy</p>
                            <p className="text-xs font-bold text-gray-800 dark:text-gray-200">{summary.baseSalary.toLocaleString()}</p>
                        </div>
                        <div className="p-2 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-900/30 rounded">
                            <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Bonus</p>
                            <p className="text-xs font-bold text-emerald-600">+{summary.kpiBonus.toLocaleString()}</p>
                        </div>
                        <div className="p-2 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-900/30 rounded">
                            <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mb-1">Qo'shimcha</p>
                            <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{summary.adjustments.toLocaleString()}</p>
                        </div>
                    </div>
                </div>

                {/* Efficiency Score */}
                <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 p-4 rounded shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="text-[10px] font-bold uppercase text-gray-500 mb-1">Reyting</p>
                            <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest">Samaradorlik</h4>
                        </div>
                        <div className="w-10 h-10 bg-amber-50 dark:bg-amber-900/20 text-amber-500 rounded flex items-center justify-center border border-amber-100 dark:border-amber-900/30">
                            <Award size={20} />
                        </div>
                    </div>
                    <div>
                        <div className="flex items-end gap-2 mb-2">
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{efficiency}%</h3>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">ko'rsatkich</span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-800 h-2 rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <div className="h-full bg-amber-500" style={{ width: `${efficiency}%` }}></div>
                        </div>
                    </div>
                </div>

                {/* Penalties Alert */}
                <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 p-4 rounded shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="text-[10px] font-bold uppercase text-gray-500 mb-1">Ehtiyotkorlik</p>
                            <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest">Jarimalar</h4>
                        </div>
                        <div className="w-10 h-10 bg-rose-50 dark:bg-rose-900/20 text-rose-500 rounded flex items-center justify-center border border-rose-100 dark:border-rose-900/30">
                            <AlertCircle size={20} />
                        </div>
                    </div>
                    <div>
                        <div className="flex items-baseline gap-2 mb-1">
                            <h3 className="text-2xl font-bold text-rose-600 tabular-nums">
                                {summary.kpiPenalty.toLocaleString()}
                            </h3>
                            <span className="text-[10px] font-bold text-gray-500 uppercase">UZS</span>
                        </div>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-sm bg-rose-500"></span>
                            {performances.filter(p => p.calculatedScore < 0).length} {t.violationsCount}
                        </p>
                    </div>
                </div>
            </div>

            {/* Detailed Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Positive Actions */}
                <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 p-4 rounded shadow-sm text-sm">
                    <div className="flex items-center justify-between mb-4 border-b border-gray-200 dark:border-gray-700 pb-3">
                        <h4 className="font-bold text-gray-800 dark:text-white uppercase flex items-center gap-2">
                            <TrendingUp size={16} className="text-emerald-500" />
                            {t.performedTasks}
                        </h4>
                        <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 font-bold text-[10px] uppercase border border-emerald-200 dark:border-emerald-800">
                            {t.bonus}
                        </span>
                    </div>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                        {performances.filter(p => p.calculatedScore > 0).map(p => (
                            <div key={p.id} className="flex flex-col p-3 bg-gray-50 dark:bg-[#1e2025] rounded border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
                                <div className="flex justify-between items-start mb-2">
                                    <p className="font-bold text-gray-800 dark:text-gray-100 text-xs leading-snug max-w-[80%]">{p.ruleNameUz || p.ruleName}</p>
                                    <span className="font-bold text-emerald-600 text-sm tabular-nums">
                                        +{p.calculatedScore.toFixed(0)}%
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <p className="text-[10px] font-bold text-gray-500 uppercase">{p.companyName}</p>
                                        <span className="text-gray-300 dark:text-gray-600">•</span>
                                        <p className="text-[10px] font-bold text-emerald-500/80">{new Date(p.submittedAt || '').toLocaleDateString()}</p>
                                    </div>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase">Oylikka ta'sir</p>
                                </div>
                            </div>
                        ))}
                        {performances.filter(p => p.calculatedScore > 0).length === 0 && (
                            <div className="text-center py-10 bg-gray-50 dark:bg-[#1e2025] rounded border border-dashed border-gray-300 dark:border-gray-700">
                                <div className="text-2xl mb-2 opacity-50">🌱</div>
                                <p className="font-bold text-gray-500 uppercase text-xs">Hozircha bonuslar mavjud emas</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Negative Actions */}
                <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 p-4 rounded shadow-sm text-sm">
                    <div className="flex items-center justify-between mb-4 border-b border-gray-200 dark:border-gray-700 pb-3">
                        <h4 className="font-bold text-gray-800 dark:text-white uppercase flex items-center gap-2">
                            <TrendingDown size={16} className="text-rose-500" />
                            {t.discrepancies}
                        </h4>
                        <span className="px-2 py-0.5 rounded bg-rose-50 dark:bg-rose-900/10 text-rose-600 font-bold text-[10px] uppercase border border-rose-200 dark:border-rose-800">
                            {t.penalty}
                        </span>
                    </div>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                        {performances.filter(p => p.calculatedScore < 0).map(p => (
                            <div key={p.id} className="flex flex-col p-3 bg-gray-50 dark:bg-[#1e2025] rounded border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
                                <div className="flex justify-between items-start mb-2">
                                    <p className="font-bold text-gray-800 dark:text-gray-100 text-xs leading-snug max-w-[80%]">{p.ruleNameUz || p.ruleName}</p>
                                    <span className="font-bold text-rose-600 text-sm tabular-nums">
                                        {p.calculatedScore.toFixed(0)}%
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <p className="text-[10px] font-bold text-gray-500 uppercase">{p.companyName}</p>
                                        <span className="text-gray-300 dark:text-gray-600">•</span>
                                        <p className="text-[10px] font-bold text-rose-500/80">{new Date(p.submittedAt || '').toLocaleDateString()}</p>
                                    </div>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase">Chegirildi</p>
                                </div>
                            </div>
                        ))}
                        {performances.filter(p => p.calculatedScore < 0).length === 0 && (
                            <div className="text-center py-10 bg-gray-50 dark:bg-[#1e2025] rounded border border-dashed border-gray-300 dark:border-gray-700">
                                <div className="text-2xl mb-2 opacity-50">🛡️</div>
                                <p className="font-bold text-gray-500 uppercase text-xs">A'lo darajada! Hech qanday jarima yo'q</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* KPI Submission (Employee) */}
            <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 shadow-sm rounded p-6">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6 border-b border-gray-200 dark:border-gray-700 pb-4">
                    <div>
                        <h4 className="text-lg font-bold text-gray-900 dark:text-white uppercase flex items-center gap-2">
                            <Activity className="text-indigo-600" size={18} />
                            {t.kpiInitiatives}
                        </h4>
                        <p className="text-xs font-bold text-gray-500 mt-1 max-w-xl">
                            {t.kpiDesc}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-[#1e2025] px-3 py-1.5 rounded border border-gray-200 dark:border-gray-700">
                        <input
                            type="month"
                            value={month}
                            onChange={e => setMonth(e.target.value)}
                            className="bg-transparent border-none font-bold text-sm text-gray-700 dark:text-gray-300 focus:ring-0 cursor-pointer p-0"
                        />
                    </div>
                </div>

                {myCompanies.length === 0 ? (
                    <div className="text-center py-20 bg-gray-50 dark:bg-[#1e2025] rounded border border-dashed border-gray-300 dark:border-gray-700">
                        <div className="text-4xl mb-4 opacity-50">🏝️</div>
                        <p className="font-bold text-gray-500 uppercase text-xs">
                            {lang === 'uz' ? 'Hozircha faol firmalar mavjud emas' : 'Активных фирм пока нет'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {myCompanies.map(company => {
                            const role: 'accountant' | 'bank_client' | null = company.accountantId === currentUserId
                                ? 'accountant'
                                : (company.bankClientId === currentUserId ? 'bank_client' : null);
                            const roleRules = rules.filter(r => r.role === role);

                            return (
                                <div key={company.id} className="bg-gray-50 dark:bg-[#1e2025] rounded p-4 border border-gray-200 dark:border-gray-700">
                                    <div className="flex items-center justify-between mb-4 border-b border-gray-200 dark:border-gray-700 pb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded bg-gray-200 dark:bg-gray-800 flex items-center justify-center font-bold text-lg text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700">
                                                {company.name[0]}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-gray-900 dark:text-white">{company.name}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <p className="text-[10px] font-bold text-gray-500 uppercase">INN: {company.inn}</p>
                                                    <span className="text-gray-300 dark:text-gray-600">•</span>
                                                    <span className="text-[10px] font-bold text-indigo-600 uppercase">
                                                        {role === 'accountant' ? (lang === 'uz' ? 'Buxgalter' : 'Бухгалтер') : 'Bank'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
                                                    className={`text-left p-3 rounded border transition-colors flex flex-col justify-between min-h-[100px] ${isApproved && isDone
                                                        ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800'
                                                        : isSubmitted
                                                            ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800'
                                                            : isRejected
                                                                ? 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800'
                                                                : 'bg-white dark:bg-[#22252B] border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-600'
                                                        } ${status === 'approved' ? 'opacity-80 cursor-not-allowed' : 'cursor-pointer'}`}
                                                >
                                                    <div>
                                                        <div className="flex items-start justify-between mb-2 gap-2">
                                                            <p className="font-bold text-xs text-gray-800 dark:text-gray-200 leading-snug">
                                                                {lang === 'uz' ? rule.nameUz : rule.name}
                                                            </p>
                                                            {isDone ? (
                                                                <Award size={16} className="text-emerald-500 shrink-0" />
                                                            ) : (
                                                                <Activity size={16} className="text-gray-400 shrink-0" />
                                                            )}
                                                        </div>

                                                        <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                                            {isApproved && isDone && (
                                                                <span className="text-[9px] font-bold bg-emerald-100 dark:bg-emerald-800/40 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded uppercase">Tasdiqlandi</span>
                                                            )}
                                                            {isSubmitted && (
                                                                <span className="text-[9px] font-bold bg-amber-100 dark:bg-amber-800/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded uppercase">Kutilmoqda</span>
                                                            )}
                                                            {isRejected && (
                                                                <span className="text-[9px] font-bold bg-rose-100 dark:bg-rose-800/40 text-rose-700 dark:text-rose-300 px-1.5 py-0.5 rounded uppercase">Rad etildi</span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="mt-2 flex items-center justify-between border-t border-gray-200 dark:border-gray-700/50 pt-2">
                                                        <span className={`text-[9px] font-bold px-2 py-1 rounded uppercase ${isDone
                                                            ? 'bg-emerald-500 text-white'
                                                            : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                                                            }`}>
                                                            {isDone ? (lang === 'uz' ? 'TOPShIRILDI' : 'СДАНО') : (lang === 'uz' ? 'TOPShIRISH' : 'СДАТЬ')}
                                                        </span>
                                                        <span className="text-[10px] font-bold text-gray-500">
                                                            {rule.weight}%
                                                        </span>
                                                    </div>

                                                    {perf?.rejectedReason && (
                                                        <div className="mt-2 pt-2 border-t border-rose-200 dark:border-rose-800/50">
                                                            <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400">"{perf.rejectedReason}"</p>
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}

                                        {roleRules.length === 0 && (
                                            <div className="text-center text-gray-500 text-sm py-8 bg-gray-100 dark:bg-[#1a1d23] rounded border border-dashed border-gray-300 dark:border-gray-700 col-span-full">
                                                <p className="font-bold uppercase text-[10px]">Ushbu rol uchun KPI qoidalari sozlanmagan</p>
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
    );
};

export default EmployeeDashboard;
