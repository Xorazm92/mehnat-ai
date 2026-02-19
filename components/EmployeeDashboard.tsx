import React, { useState, useEffect, useMemo } from 'react';
import { EmployeeSalarySummary, Language, MonthlyPerformance, Company, OperationEntry, KPIRule, PayrollAdjustment } from '../types';
import { fetchKPIRules, fetchMonthlyPerformance, fetchPayrollAdjustments, upsertMonthlyPerformance } from '../lib/supabaseData';
import { calculateCompanySalaries } from '../lib/kpiLogic';
import { translations } from '../lib/translations';
import { Wallet, TrendingUp, AlertCircle, Award, Star, TrendingDown } from 'lucide-react';

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
        return <div className="p-20 text-center text-slate-400">Loading details...</div>;
    }

    if (!summary) {
        return <div className="p-20 text-center text-slate-400">Ma'lumot topilmadi</div>;
    }

    // Calculate efficiency percentage (gamification)
    // Max possible bonus is hard to know exactly without knowing all rules, 
    // but we can estimate based on performed / total potential
    const positiveperf = performances.filter(p => p.calculatedScore > 0).length;
    // Assume a base goal of 50 positive actions per month for gamification scaling
    const efficiency = Math.min(100, Math.round((positiveperf / 20) * 100));

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Header Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Estimated Salary */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-apple-darkCard dark:to-slate-900 p-8 rounded-[2.5rem] text-white flex flex-col justify-between shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Wallet size={120} />
                    </div>
                    <div className="relative z-10">
                        <p className="text-xs font-black uppercase tracking-widest text-white/50 mb-2">Joriy Oylik (Tahminiy)</p>
                        <h3 className="text-4xl font-black tabular-nums tracking-tight">
                            {summary.totalSalary.toLocaleString()} <span className="text-lg text-white/50">UZS</span>
                        </h3>
                        <div className="mt-4 flex gap-4 text-xs font-bold text-white/60">
                            <span>Bazaviy: {summary.baseSalary.toLocaleString()}</span>
                            <span className="text-emerald-400">Bonus: +{summary.kpiBonus.toPrecision(3)}</span>
                            <span className="text-blue-300">Qo'shimcha: {summary.adjustments.toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                {/* Efficiency Score */}
                <div className="bg-white dark:bg-apple-darkCard p-8 rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder flex flex-col justify-between shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                        <Star size={120} />
                    </div>
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-orange-500/10 text-orange-500 flex items-center justify-center">
                            <Award size={24} strokeWidth={3} />
                        </div>
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Samaradorlik</p>
                    </div>
                    <div>
                        <div className="flex items-end gap-2 mb-2">
                            <h3 className="text-5xl font-black text-slate-800 dark:text-white tabular-nums">{efficiency}%</h3>
                            <span className="text-sm font-bold text-slate-400 mb-2">natija</span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-white/5 h-3 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-orange-400 to-pink-500 transition-all duration-1000" style={{ width: `${efficiency}%` }}></div>
                        </div>
                    </div>
                </div>

                {/* Penalties Alert */}
                <div className="bg-white dark:bg-apple-darkCard p-8 rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder flex flex-col justify-between shadow-lg">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                            <AlertCircle size={24} strokeWidth={3} />
                        </div>
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Jarimalar</p>
                    </div>
                    <div>
                        <h3 className="text-3xl font-black text-rose-500 tabular-nums">
                            {summary.kpiPenalty.toLocaleString()} <span className="text-sm text-slate-400">UZS</span>
                        </h3>
                        <p className="text-xs font-bold text-slate-400 mt-2">
                            {performances.filter(p => p.calculatedScore < 0).length} ta qoidabuzarlik
                        </p>
                    </div>
                </div>
            </div>

            {/* Detailed Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Positive Actions */}
                <div className="bg-white dark:bg-apple-darkCard p-8 rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder">
                    <h4 className="text-lg font-black text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                        <TrendingUp className="text-emerald-500" /> Bajarilgan Vazifalar (Bonus)
                    </h4>
                    <div className="space-y-4">
                        {performances.filter(p => p.calculatedScore > 0).map(p => (
                            <div key={p.id} className="flex items-center justify-between p-4 bg-emerald-50 dark:bg-emerald-500/5 rounded-2xl">
                                <div>
                                    <p className="font-bold text-slate-700 dark:text-white text-sm">{p.ruleNameUz || p.ruleName}</p>
                                    <p className="text-[10px] font-black text-slate-400 uppercase">{p.companyName}</p>
                                </div>
                                <span className="font-black text-emerald-600 bg-white dark:bg-white/10 px-3 py-1 rounded-lg text-xs">
                                    +{p.calculatedScore.toFixed(0)}%
                                </span>
                            </div>
                        ))}
                        {performances.filter(p => p.calculatedScore > 0).length === 0 && (
                            <p className="text-center text-slate-400 text-sm py-4">Hozircha bonuslar yo'q</p>
                        )}
                    </div>
                </div>

                {/* Negative Actions */}
                <div className="bg-white dark:bg-apple-darkCard p-8 rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder">
                    <h4 className="text-lg font-black text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                        <TrendingDown className="text-rose-500" /> Jarimalar va Kechikishlar
                    </h4>
                    <div className="space-y-4">
                        {performances.filter(p => p.calculatedScore < 0).map(p => (
                            <div key={p.id} className="flex items-center justify-between p-4 bg-rose-50 dark:bg-rose-500/5 rounded-2xl">
                                <div>
                                    <p className="font-bold text-slate-700 dark:text-white text-sm">{p.ruleNameUz || p.ruleName}</p>
                                    <p className="text-[10px] font-black text-slate-400 uppercase">{p.companyName}</p>
                                </div>
                                <span className="font-black text-rose-500 bg-white dark:bg-white/10 px-3 py-1 rounded-lg text-xs">
                                    {p.calculatedScore.toFixed(0)}%
                                </span>
                            </div>
                        ))}
                        {performances.filter(p => p.calculatedScore < 0).length === 0 && (
                            <p className="text-center text-slate-400 text-sm py-4">Qoidabuzarliklar yo'q! 🎉</p>
                        )}
                    </div>
                </div>
            </div>

            {/* KPI Submission (Employee) */}
            <div className="bg-white dark:bg-apple-darkCard p-8 rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h4 className="text-lg font-black text-slate-800 dark:text-white">
                            {lang === 'uz' ? 'KPI Vazifalar (Yuborish)' : 'KPI задачи (Отправка)'}
                        </h4>
                        <p className="text-xs font-bold text-slate-400 mt-1">
                            {lang === 'uz'
                                ? 'Bajardim desangiz yuboring. Nazoratchi tasdiqlagandan keyin oylikka qo\'shiladi.'
                                : 'Отправьте выполненное. В зарплату попадёт после подтверждения.'}
                        </p>
                    </div>
                    <input
                        type="month"
                        value={month}
                        onChange={e => setMonth(e.target.value)}
                        className="bg-white dark:bg-apple-darkBg border border-apple-border rounded-xl px-3 py-2 font-bold text-sm"
                    />
                </div>

                {myCompanies.length === 0 ? (
                    <div className="text-center text-slate-400 text-sm py-8">
                        {lang === 'uz' ? 'Sizga biriktirilgan firma topilmadi' : 'Нет закреплённых фирм'}
                    </div>
                ) : (
                    <div className="space-y-6">
                        {myCompanies.map(company => {
                            const role: 'accountant' | 'bank_client' | null = company.accountantId === currentUserId
                                ? 'accountant'
                                : (company.bankClientId === currentUserId ? 'bank_client' : null);
                            const roleRules = rules.filter(r => r.role === role);

                            return (
                                <div key={company.id} className="border border-slate-100 dark:border-white/5 rounded-3xl p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <p className="text-sm font-black text-slate-800 dark:text-white">{company.name}</p>
                                            <p className="text-[10px] font-black text-slate-400 uppercase">INN: {company.inn}</p>
                                        </div>
                                        <span className="text-[10px] font-black px-3 py-1 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/70">
                                            {role === 'accountant' ? (lang === 'uz' ? 'Buxgalter' : 'Бухгалтер') : 'Bank'}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                                                    className={`text-left p-4 rounded-2xl border-2 transition-all active:scale-[0.99] ${
                                                        isApproved && isDone
                                                            ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500/20'
                                                            : isSubmitted
                                                                ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-500/20'
                                                                : isRejected
                                                                    ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-500/20'
                                                                    : 'bg-white dark:bg-apple-darkBg border-slate-100 dark:border-white/5 hover:border-apple-accent/50'
                                                    } ${status === 'approved' ? 'opacity-80 cursor-not-allowed' : 'cursor-pointer'}`}
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div>
                                                            <p className="font-bold text-sm text-slate-800 dark:text-white">
                                                                {lang === 'uz' ? rule.nameUz : rule.name}
                                                            </p>
                                                            <div className="mt-1 flex items-center gap-2">
                                                                {isApproved && isDone && (
                                                                    <span className="text-[9px] font-black text-emerald-600 uppercase">Tasdiqlandi</span>
                                                                )}
                                                                {isSubmitted && (
                                                                    <span className="text-[9px] font-black text-amber-600 uppercase">Yuborildi</span>
                                                                )}
                                                                {isRejected && (
                                                                    <span className="text-[9px] font-black text-rose-600 uppercase">Rad etildi</span>
                                                                )}
                                                                {perf?.rejectedReason && (
                                                                    <span className="text-[10px] font-bold text-slate-400 truncate">{perf.rejectedReason}</span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="shrink-0">
                                                            <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${
                                                                isDone ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-white/10 text-slate-500'
                                                            }`}>
                                                                {isDone ? (lang === 'uz' ? 'Bajarildi' : 'Готово') : (lang === 'uz' ? 'Yo\'q' : 'Нет')}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}

                                        {roleRules.length === 0 && (
                                            <div className="text-center text-slate-400 text-sm py-4 col-span-full">
                                                {lang === 'uz' ? 'Bu rol uchun KPI qoidalari topilmadi' : 'Нет KPI правил для роли'}
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
