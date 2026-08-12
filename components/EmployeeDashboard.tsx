"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { EmployeeSalarySummary, Language, MonthlyPerformance, Company, OperationEntry, KPIRule, PayrollAdjustment } from '@/types';
import { calculateCompanySalaries } from '@/lib/kpiLogic';
import { type KpiEntryInput } from '@/lib/kpiScoring';
import { translations } from '@/lib/translations';
import { Wallet, TrendingUp, AlertCircle, Award, TrendingDown, Activity } from 'lucide-react';
import { getKpiRules, getMonthlyPerformance, upsertPerformance } from '@/server/kpi';
import { getPayrollAdjustments } from '@/server/payroll';
import { formatUzDate, formatNum } from '@/lib/format';
import KpiEntryCard from './kpi/KpiEntryCard';

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
                getKpiRules(),
                getMonthlyPerformance(`${month}-01`, currentUserId),
                getPayrollAdjustments(`${month}-01`, currentUserId)
            ]);
            setRules(
                (rulesData as any[]).filter(
                    r =>
                        (r.role === 'accountant' || r.role === 'bank_client') &&
                        r.isActive &&
                        r.category !== 'attendance'
                )
            );
            setPerformances(perfData as any[]);
            setAdjustments(adjData as any[]);
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

    // Employee self-assessment: submits a v2 three-state entry to the supervisor
    // (source='employee', status defaults to 'submitted' → awaits approval).
    const handleSelfAssess = async (company: Company, rule: KPIRule, input: KpiEntryInput) => {
        const existing = performances.find(p => p.companyId === company.id && p.ruleId === rule.id);
        if (existing?.status === 'approved') return; // official supervisor entry — read-only

        try {
            await upsertPerformance({
                month: `${month}-01`,
                companyId: company.id,
                employeeId: currentUserId,
                ruleId: rule.id,
                selectedOption: input.selectedOption ?? null,
                earlyDays: input.counters?.early_days ?? 0,
                lateMinutes: (input.counters?.late_5min ?? 0) * 5,
                absentDays: input.counters?.absent_days ?? 0,
                penaltyAmount: input.penaltyAmount ?? 0,
                source: 'employee',
            });
            await loadData();
        } catch (e) {
            console.error('Error submitting KPI', e);
            await loadData();
        }
    };

    if (loading) {
        return <div className="p-20 text-center text-[var(--text-muted)]">{t.loading}</div>;
    }

    if (!summary) {
        return <div className="p-20 text-center text-[var(--text-muted)]">{t.noData}</div>;
    }

    // Calculate efficiency percentage (gamification)
    // Max possible bonus is hard to know exactly without knowing all rules, 
    // but we can estimate based on performed / total potential
    const positiveperf = performances.filter(p => p.calculatedScore > 0).length;
    // Assume a base goal of 50 positive actions per month for gamification scaling
    const efficiency = Math.min(100, Math.round((positiveperf / 20) * 100));

    // Panel o'z sahifa fonini bo'yamaydi va `min-h-dvh` bilan cho'zilmaydi:
    // ilgari bu yorliq ichida turgani uchun kartaning ustiga ikkinchi kulrang
    // qatlam chizilar, ostida esa bo'sh ekran balandligi qolardi.
    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Estimated Salary */}
                <div className="bg-[var(--card-bg)] dark:bg-[var(--surface-2)] border border-[var(--rule)] p-4 rounded-lg shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="text-micro font-bold uppercase text-[var(--text-secondary)] mb-1">{(t as any).currentMonthEst || 'Joriy oy'}</p>
                            <h3 className="text-2xl font-bold tabular-nums text-[var(--text-primary)] dark:text-white">
                                {formatNum(summary.totalSalary)} <span className="text-sm font-bold text-[var(--text-muted)]">UZS</span>
                            </h3>
                        </div>
                        <div className="w-10 h-10 bg-[var(--accent-indigo-light)] text-[var(--accent-indigo)] rounded-lg flex items-center justify-center border border-[var(--accent-indigo-border)]">
                            <Wallet size={20} />
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <div className="p-2 bg-[var(--bg-sunken)] dark:bg-[var(--surface)] border border-[var(--rule)] rounded-lg">
                            <p className="text-micro font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Bazaviy</p>
                            <p className="text-xs font-bold text-[var(--text-primary)]">{formatNum(summary.baseSalary)}</p>
                        </div>
                        <div className="p-2 bg-[var(--success-bg)] border border-[var(--success-border)] rounded-lg">
                            <p className="text-micro font-bold text-[var(--success)] uppercase tracking-widest mb-1">Bonus</p>
                            <p className="text-xs font-bold text-[var(--success)]">+{formatNum(summary.kpiBonus)}</p>
                        </div>
                        <div className="p-2 bg-[var(--accent-indigo-light)] border border-[var(--accent-indigo-border)] rounded-lg">
                            <p className="text-micro font-bold text-[var(--accent-indigo)] uppercase tracking-widest mb-1">Qo&apos;shimcha</p>
                            <p className="text-xs font-bold text-[var(--accent-indigo)]">{formatNum(summary.adjustments)}</p>
                        </div>
                    </div>
                </div>

                {/* Efficiency Score */}
                <div className="bg-[var(--card-bg)] dark:bg-[var(--surface-2)] border border-[var(--rule)] p-4 rounded-lg shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="text-micro font-bold uppercase text-[var(--text-secondary)] mb-1">Reyting</p>
                            <h4 className="text-sm font-bold text-[var(--text-primary)] dark:text-white">Samaradorlik</h4>
                        </div>
                        <div className="w-10 h-10 bg-[var(--warning-bg)] text-[var(--warning)] rounded-lg flex items-center justify-center border border-[var(--warning-border)]">
                            <Award size={20} />
                        </div>
                    </div>
                    <div>
                        <div className="flex items-end gap-2 mb-2">
                            <h3 className="text-2xl font-bold text-[var(--text-primary)] dark:text-white tabular-nums">{efficiency}%</h3>
                            <span className="text-micro font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1.5">ko&apos;rsatkich</span>
                        </div>
                        <div className="w-full bg-[var(--bg-sunken)] h-2 rounded-lg border border-[var(--rule)] overflow-hidden">
                            <div className="h-full bg-[var(--warning)]" style={{ width: `${efficiency}%` }}></div>
                        </div>
                    </div>
                </div>

                {/* Penalties Alert */}
                <div className="bg-[var(--card-bg)] dark:bg-[var(--surface-2)] border border-[var(--rule)] p-4 rounded-lg shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="text-micro font-bold uppercase text-[var(--text-secondary)] mb-1">Ehtiyotkorlik</p>
                            <h4 className="text-sm font-bold text-[var(--text-primary)] dark:text-white">Jarimalar</h4>
                        </div>
                        <div className="w-10 h-10 bg-[var(--danger-bg)] text-[var(--danger)] rounded-lg flex items-center justify-center border border-[var(--danger-border)]">
                            <AlertCircle size={20} />
                        </div>
                    </div>
                    <div>
                        <div className="flex items-baseline gap-2 mb-1">
                            <h3 className="text-2xl font-bold text-[var(--danger)] tabular-nums">
                                {formatNum(summary.kpiPenalty)}
                            </h3>
                            <span className="text-micro font-bold text-[var(--text-secondary)] uppercase">UZS</span>
                        </div>
                        <p className="text-micro font-bold text-[var(--text-secondary)] uppercase tracking-widest flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-lg bg-[var(--danger)]"></span>
                            {performances.filter(p => p.calculatedScore < 0).length} {t.violationsCount}
                        </p>
                    </div>
                </div>
            </div>

            {/* Detailed Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Positive Actions */}
                <div className="bg-[var(--card-bg)] dark:bg-[var(--surface-2)] border border-[var(--rule)] p-4 rounded-lg shadow-sm text-sm">
                    <div className="flex items-center justify-between mb-4 border-b border-[var(--rule)] pb-3">
                        <h4 className="font-bold text-[var(--text-primary)] dark:text-white uppercase flex items-center gap-2">
                            <TrendingUp size={16} className="text-[var(--success)]" />
                            {t.performedTasks}
                        </h4>
                        <span className="px-2 py-0.5 rounded-lg bg-[var(--success-bg)] text-[var(--success)] font-bold text-micro uppercase border border-[var(--success-border)]">
                            {t.bonus}
                        </span>
                    </div>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                        {performances.filter(p => p.calculatedScore > 0).map(p => (
                            <div key={p.id} className="flex flex-col p-3 bg-[var(--bg-sunken)] dark:bg-[var(--surface)] rounded-lg border border-[var(--rule)] hover:border-[var(--rule)] dark:hover:border-[var(--rule-strong)] transition-colors">
                                <div className="flex justify-between items-start mb-2">
                                    <p className="font-bold text-[var(--text-primary)] text-xs leading-snug max-w-[80%]">{p.ruleNameUz || p.ruleName}</p>
                                    <span className="font-bold text-[var(--success)] text-sm tabular-nums">
                                        +{p.calculatedScore.toFixed(0)}%
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <p className="text-micro font-bold text-[var(--text-secondary)] uppercase">{p.companyName}</p>
                                        <span className="text-[var(--text-muted)]">•</span>
                                        <p className="text-micro font-bold text-[color-mix(in_srgb,var(--success)_80%,transparent)]">{formatUzDate(p.submittedAt)}</p>
                                    </div>
                                    <p className="text-micro font-bold text-[var(--text-muted)] uppercase">Oylikka ta&apos;sir</p>
                                </div>
                            </div>
                        ))}
                        {performances.filter(p => p.calculatedScore > 0).length === 0 && (
                            <div className="text-center py-10 bg-[var(--bg-sunken)] dark:bg-[var(--surface)] rounded-lg border border-dashed border-[var(--rule)]">
                                <div className="text-2xl mb-2 opacity-50">🌱</div>
                                <p className="font-bold text-[var(--text-secondary)] text-xs">Hozircha bonuslar mavjud emas</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Negative Actions */}
                <div className="bg-[var(--card-bg)] dark:bg-[var(--surface-2)] border border-[var(--rule)] p-4 rounded-lg shadow-sm text-sm">
                    <div className="flex items-center justify-between mb-4 border-b border-[var(--rule)] pb-3">
                        <h4 className="font-bold text-[var(--text-primary)] dark:text-white uppercase flex items-center gap-2">
                            <TrendingDown size={16} className="text-[var(--danger)]" />
                            {t.discrepancies}
                        </h4>
                        <span className="px-2 py-0.5 rounded-lg bg-[var(--danger-bg)] text-[var(--danger)] font-bold text-micro uppercase border border-[var(--danger-border)]">
                            {t.penalty}
                        </span>
                    </div>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                        {performances.filter(p => p.calculatedScore < 0).map(p => (
                            <div key={p.id} className="flex flex-col p-3 bg-[var(--bg-sunken)] dark:bg-[var(--surface)] rounded-lg border border-[var(--rule)] hover:border-[var(--rule)] dark:hover:border-[var(--rule-strong)] transition-colors">
                                <div className="flex justify-between items-start mb-2">
                                    <p className="font-bold text-[var(--text-primary)] text-xs leading-snug max-w-[80%]">{p.ruleNameUz || p.ruleName}</p>
                                    <span className="font-bold text-[var(--danger)] text-sm tabular-nums">
                                        {p.calculatedScore.toFixed(0)}%
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <p className="text-micro font-bold text-[var(--text-secondary)] uppercase">{p.companyName}</p>
                                        <span className="text-[var(--text-muted)]">•</span>
                                        <p className="text-micro font-bold text-[color-mix(in_srgb,var(--danger)_80%,transparent)]">{formatUzDate(p.submittedAt)}</p>
                                    </div>
                                    <p className="text-micro font-bold text-[var(--text-muted)] uppercase">Chegirildi</p>
                                </div>
                            </div>
                        ))}
                        {performances.filter(p => p.calculatedScore < 0).length === 0 && (
                            <div className="text-center py-10 bg-[var(--bg-sunken)] dark:bg-[var(--surface)] rounded-lg border border-dashed border-[var(--rule)]">
                                <div className="text-2xl mb-2 opacity-50">🛡️</div>
                                <p className="font-bold text-[var(--text-secondary)] text-xs">A&apos;lo darajada! Hech qanday jarima yo&apos;q</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* KPI Submission (Employee) */}
            <div className="bg-[var(--card-bg)] dark:bg-[var(--surface-2)] border border-[var(--rule)] shadow-sm rounded-lg p-6">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6 border-b border-[var(--rule)] pb-4">
                    <div>
                        <h4 className="text-lg font-bold text-[var(--text-primary)] dark:text-white flex items-center gap-2">
                            <Activity className="text-[var(--accent-indigo)]" size={18} />
                            {t.kpiInitiatives}
                        </h4>
                        <p className="text-xs font-bold text-[var(--text-secondary)] mt-1 max-w-xl">
                            {t.kpiDesc}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 bg-[var(--bg-sunken)] dark:bg-[var(--surface)] px-3 py-1.5 rounded-lg border border-[var(--rule)]">
                        <input
                            type="month"
                            value={month}
                            onChange={e => setMonth(e.target.value)}
                            className="bg-transparent border-none font-bold text-sm text-[var(--text-secondary)] focus:ring-0 cursor-pointer p-0"
                        />
                    </div>
                </div>

                {myCompanies.length === 0 ? (
                    <div className="text-center py-20 bg-[var(--bg-sunken)] dark:bg-[var(--surface)] rounded-lg border border-dashed border-[var(--rule)]">
                        <div className="text-4xl mb-4 opacity-50">🏝️</div>
                        <p className="font-bold text-[var(--text-secondary)] text-xs">
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
                                <div key={company.id} className="bg-[var(--bg-sunken)] dark:bg-[var(--surface)] rounded-lg p-4 border border-[var(--rule)]">
                                    <div className="flex items-center justify-between mb-4 border-b border-[var(--rule)] pb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-[var(--rule)] flex items-center justify-center font-bold text-lg text-[var(--text-secondary)] border border-[var(--rule)]">
                                                {company.name[0]}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-[var(--text-primary)] dark:text-white">{company.name}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <p className="text-micro font-bold text-[var(--text-secondary)] uppercase">INN: {company.inn}</p>
                                                    <span className="text-[var(--text-muted)]">•</span>
                                                    <span className="text-micro font-bold text-[var(--accent-indigo)] uppercase">
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
                                            const badge = status === 'approved'
                                                ? { t: lang === 'uz' ? 'Tasdiqlangan' : 'Одобрено', c: 'success' }
                                                : status === 'submitted'
                                                    ? { t: lang === 'uz' ? 'Kutilmoqda' : 'На проверке', c: 'warning' }
                                                    : status === 'rejected'
                                                        ? { t: lang === 'uz' ? 'Rad etildi' : 'Отклонено', c: 'danger' }
                                                        : null;
                                            return (
                                                <div key={rule.id} className="flex flex-col gap-1.5">
                                                    <KpiEntryCard
                                                        rule={rule}
                                                        perf={perf}
                                                        lang={lang}
                                                        disabled={status === 'approved'}
                                                        onSave={(input) => handleSelfAssess(company, rule, input)}
                                                    />
                                                    {(badge || perf?.rejectedReason) && (
                                                        <div className="flex items-center gap-2 px-1 flex-wrap">
                                                            {badge && (
                                                                <span className="c1-badge" style={{ background: `var(--${badge.c}-bg)`, color: `var(--${badge.c})`, border: `1px solid var(--${badge.c}-border)` }}>{badge.t}</span>
                                                            )}
                                                            {perf?.rejectedReason && (
                                                                <span className="text-micro font-bold" style={{ color: 'var(--danger)' }}>&quot;{perf.rejectedReason}&quot;</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {roleRules.length === 0 && (
                                            <div className="text-center text-[var(--text-secondary)] text-sm py-8 bg-[var(--bg-sunken)] dark:bg-[var(--surface)] rounded-lg border border-dashed border-[var(--rule)] col-span-full">
                                                <p className="font-bold uppercase text-micro">Ushbu rol uchun KPI qoidalari sozlanmagan</p>
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
