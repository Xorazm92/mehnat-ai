import React, { useState, useEffect, useMemo } from 'react';
import { Company, KPIRule, MonthlyPerformance, Staff, Language, CompanyKPIRule, OperationEntry } from '../types';
import { fetchKPIRules, fetchMonthlyPerformance, upsertMonthlyPerformance, fetchCompanyKPIRules } from '../lib/supabaseData';
import { CheckCircle2, XCircle, Search, AlertCircle, Save, Shield, Activity } from 'lucide-react';
import { translations } from '../lib/translations';
import { getReportStatusMultiplier } from '../lib/kpiLogic';
import { periodsEqual } from '../lib/periods';

interface Props {
    companies: Company[];
    operations: OperationEntry[];
    staff: Staff[];
    lang: Language;
    currentUserRole?: string;
    currentUserId?: string;
}

const NazoratchiChecklist: React.FC<Props> = ({ companies, operations, staff, lang, currentUserRole, currentUserId }) => {
    const t = translations[lang];
    const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
    const [rules, setRules] = useState<KPIRule[]>([]);
    const [companyRules, setCompanyRules] = useState<CompanyKPIRule[]>([]);
    const [performances, setPerformances] = useState<MonthlyPerformance[]>([]);
    const [percentInputs, setPercentInputs] = useState<Record<string, string>>({});
    const [search, setSearch] = useState('');
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [loading, setLoading] = useState(false);

    const canEditPercents = currentUserRole === 'super_admin' || currentUserRole === 'chief_accountant';

    const resolveAutomationKey = (rule: KPIRule): keyof OperationEntry | null => {
        const name = String(rule.name || '').trim().toLowerCase();
        if (!name) return null;

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
            bank_klient: 'bank_klient'
        };

        return map[name] || (rule.name as keyof OperationEntry) || null;
    };

    const formatError = (error: any) => {
        if (!error) return 'Unknown error';
        if (typeof error === 'string') return error;
        const parts = [
            error.message,
            error.code ? `code=${error.code}` : null,
            error.details ? `details=${error.details}` : null,
            error.hint ? `hint=${error.hint}` : null
        ].filter(Boolean);
        if (parts.length) return parts.join('\n');
        try {
            return JSON.stringify(error);
        } catch {
            return String(error);
        }
    };

    const getPercentKey = (companyId: string, employeeId: string, ruleId: string, kind: 'reward' | 'penalty') => {
        return `${companyId}:${employeeId}:${ruleId}:${kind}`;
    };

    const savePercentOverride = async (rule: KPIRule, company: Company, employeeId: string, reward?: number | null, penalty?: number | null) => {
        if (!company?.id) {
            alert('Company not selected');
            return;
        }
        if (!employeeId) {
            alert("Xodim biriktirilmagan (employeeId bo'sh). Avval firmaga xodim biriktiring.");
            return;
        }
        if (!currentUserId) {
            alert('User not found (currentUserId is missing)');
            return;
        }

        const existing = performances.find(p => p.companyId === company.id && p.employeeId === employeeId && p.ruleId === rule.id);
        try {
            await upsertMonthlyPerformance({
                id: existing?.id,
                month: `${month}-01`,
                companyId: company.id,
                employeeId: employeeId,
                ruleId: rule.id,
                value: existing?.value ?? 0,
                rewardPercentOverride: reward,
                penaltyPercentOverride: penalty,
                source: existing?.source || 'chief',
                status: existing?.status || 'approved',
                approvedBy: currentUserId,
                approvedAt: new Date().toISOString(),
                recordedBy: currentUserId
            });
            await loadData();
        } catch (error) {
            console.error('Error saving KPI percents', error);
            alert(formatError(error));
            await loadData();
        }
    };

    // Load Rules and Initial Data
    useEffect(() => {
        loadData();
    }, [month]);

    const loadData = async () => {
        const [rulesData, perfData] = await Promise.all([
            fetchKPIRules(),
            fetchMonthlyPerformance(`${month}-01`) // Start of month
        ]);
        const filteredRules = rulesData.filter(r =>
            (r.role === 'accountant' || r.role === 'bank_client' || r.role === 'supervisor' || r.role === 'all')
        );
        setRules(filteredRules);
        setPerformances(perfData);
        setLoading(false);
    };

    const filteredCompanies = useMemo(() => {
        return companies.filter(c =>
            (c.name.toLowerCase().includes(search.toLowerCase()) ||
                c.inn.includes(search)) &&
            c.isActive
        );
    }, [companies, search]);

    const selectedCompany = useMemo(() =>
        companies.find(c => c.id === selectedCompanyId),
        [companies, selectedCompanyId]);

    const selectedOperation = useMemo(() => {
        if (!selectedCompany?.id) return null;
        return operations.find(o => o.companyId === selectedCompany.id && periodsEqual(o.period, month)) || null;
    }, [operations, selectedCompany?.id, month]);

    const calcAutomationPercentForCompany = (companyId: string) => {
        const op = operations.find(o => o.companyId === companyId && periodsEqual(o.period, month));
        if (!op) return 0;

        const autoRules = rules.filter(r => r.category === 'automation');
        let sum = 0;

        for (const r of autoRules) {
            if (r.role !== 'accountant' && r.role !== 'bank_client' && r.role !== 'all') continue;
            const key = resolveAutomationKey(r);
            if (!key) continue;
            const status = (op as any)[key];
            if (typeof status !== 'string') continue;
            const mult = getReportStatusMultiplier(status);
            if (mult === 0) continue;
            const weight = mult === 1 ? Number(r.rewardPercent || 0) : Number(r.penaltyPercent || 0);
            const score = mult * Math.abs(weight);
            sum += score;
        }

        return sum;
    };

    // Fetch company-specific rules when company changes
    useEffect(() => {
        if (selectedCompanyId) {
            fetchCompanyKPIRules(selectedCompanyId).then(setCompanyRules);
        } else {
            setCompanyRules([]);
        }
    }, [selectedCompanyId]);

    const getEffectiveRule = (rule: KPIRule) => {
        const override = companyRules.find(r => r.ruleId === rule.id);
        return {
            ...rule,
            rewardPercent: override?.rewardPercent ?? rule.rewardPercent,
            penaltyPercent: override?.penaltyPercent ?? rule.penaltyPercent
        };
    };

    const handleApprove = async (perf: MonthlyPerformance) => {
        try {
            if (!currentUserId) {
                alert('User not found (currentUserId is missing)');
                return;
            }
            await upsertMonthlyPerformance({
                id: perf.id,
                month: perf.month,
                companyId: perf.companyId,
                employeeId: perf.employeeId,
                ruleId: perf.ruleId,
                value: perf.value,
                source: perf.source || 'employee',
                status: 'approved',
                approvedBy: currentUserId,
                approvedAt: new Date().toISOString(),
                rejectedReason: null as any,
                recordedBy: currentUserId
            });
            await loadData();
        } catch (error) {
            console.error('Error approving KPI', error);
            alert(formatError(error) || 'Error approving KPI');
            await loadData();
        }
    };

    const handleReject = async (perf: MonthlyPerformance) => {
        const reason = window.prompt(t.rejectReason);
        if (!reason) return;
        try {
            if (!currentUserId) {
                alert('User not found (currentUserId is missing)');
                return;
            }
            await upsertMonthlyPerformance({
                id: perf.id,
                month: perf.month,
                companyId: perf.companyId,
                employeeId: perf.employeeId,
                ruleId: perf.ruleId,
                value: perf.value,
                source: perf.source || 'employee',
                status: 'rejected',
                approvedBy: currentUserId,
                approvedAt: new Date().toISOString(),
                rejectedReason: reason,
                recordedBy: currentUserId
            });
            await loadData();
        } catch (error) {
            console.error('Error rejecting KPI', error);
            alert(formatError(error) || 'Error rejecting KPI');
            await loadData();
        }
    };

    const handleToggle = async (rule: KPIRule, company: Company, employeeId: string, currentValue: number) => {
        if (!company?.id) {
            alert('Company not selected');
            return;
        }
        if (!employeeId) {
            alert("Xodim biriktirilmagan (employeeId bo'sh). Avval firmaga xodim biriktiring.");
            return;
        }
        if (!currentUserId) {
            alert('User not found (currentUserId is missing)');
            return;
        }

        // Cycle: 0 -> 1 -> -1 -> 0
        let newValue = 0;
        if (currentValue === 0) newValue = 1;
        else if (currentValue === 1) newValue = -1;
        else newValue = 0;

        const effectiveRule = getEffectiveRule(rule);
        const optimisticExisting = performances.find(p => p.companyId === company.id && p.employeeId === employeeId && p.ruleId === rule.id);
        const optimisticReward = optimisticExisting?.rewardPercentOverride ?? effectiveRule.rewardPercent ?? 0;
        const optimisticPenalty = optimisticExisting?.penaltyPercentOverride ?? effectiveRule.penaltyPercent ?? 0;
        const optimisticScore =
            newValue > 0
                ? Number(optimisticReward) * Number(newValue)
                : newValue < 0
                    ? -1 * Math.abs(Number(optimisticPenalty)) * Math.abs(Number(newValue))
                    : 0;

        // Optimistic update
        const tempId = Math.random().toString();
        const newPerf: MonthlyPerformance = {
            id: tempId,
            month: `${month}-01`,
            companyId: company.id,
            employeeId: employeeId,
            ruleId: rule.id,
            value: newValue,
            rewardPercentOverride: optimisticExisting?.rewardPercentOverride,
            penaltyPercentOverride: optimisticExisting?.penaltyPercentOverride,
            calculatedScore: optimisticScore
        };

        setPerformances(prev => {
            const existing = prev.find(p => p.companyId === company.id && p.employeeId === employeeId && p.ruleId === rule.id);
            if (existing) {
                return prev.map(p => p.id === existing.id ? {
                    ...p,
                    value: newValue,
                    rewardPercentOverride: optimisticExisting?.rewardPercentOverride,
                    penaltyPercentOverride: optimisticExisting?.penaltyPercentOverride,
                    calculatedScore: optimisticScore
                } : p);
            }
            return [...prev, newPerf];
        });

        try {
            const isChiefControlled = rule.category === 'manual';

            const existing = performances.find(p => p.companyId === company.id && p.employeeId === employeeId && p.ruleId === rule.id);
            await upsertMonthlyPerformance({
                month: `${month}-01`,
                companyId: company.id,
                employeeId: employeeId,
                ruleId: rule.id,
                value: newValue,
                rewardPercentOverride: existing?.rewardPercentOverride,
                penaltyPercentOverride: existing?.penaltyPercentOverride,
                source: isChiefControlled ? 'chief' : 'supervisor',
                status: 'approved',
                approvedBy: currentUserId,
                approvedAt: new Date().toISOString(),
                recordedBy: currentUserId
            });
            // Refresh to get real ID and calculated_score from DB trigger
            await loadData();
        } catch (error) {
            console.error('Error updating KPI', error);
            alert(formatError(error) || 'Error updating KPI');
            // Revert on error
            loadData();
        }
    };

    return (
        <div className="flex flex-col xl:flex-row gap-10 h-[calc(100vh-140px)] animate-fade-in pb-10">
            {/* LEFT: Company Sidebar */}
            <div className="w-full xl:w-[400px] liquid-glass-card rounded-[3rem] border border-white/10 flex flex-col overflow-hidden shadow-glass-lg relative group/sidebar">
                <div className="absolute -top-10 -left-10 w-40 h-40 bg-indigo-500/5 rounded-full blur-3xl"></div>

                <div className="p-10 border-b border-white/5 relative z-10">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="w-12 h-12 rounded-[1.2rem] bg-indigo-500/10 text-indigo-500 flex items-center justify-center border border-indigo-500/20 shadow-glass">
                            <Shield size={24} />
                        </div>
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tighter">
                            {t.organizations}
                        </h3>
                    </div>

                    <div className="relative group">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={20} />
                        <input
                            type="text"
                            placeholder={t.searchMatrix}
                            className="w-full pl-14 pr-6 py-4 bg-slate-50 dark:bg-white/5 rounded-[1.5rem] border border-transparent focus:border-indigo-500/20 outline-none font-black text-sm transition-all focus:bg-white/10 shadow-inner"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-3 scrollbar-none relative z-10">
                    {filteredCompanies.map(c => {
                        const companyPerf = performances.filter(p => p.companyId === c.id);
                        const manualPercent = companyPerf.reduce((sum, p) => sum + (Number(p.calculatedScore) || 0), 0);
                        const autoPercent = calcAutomationPercentForCompany(c.id);
                        const totalPercent = manualPercent + autoPercent;
                        const isSelected = selectedCompanyId === c.id;

                        return (
                            <div
                                key={c.id}
                                onClick={() => setSelectedCompanyId(c.id)}
                                className={`p-6 rounded-[2rem] cursor-pointer transition-all duration-500 border ${isSelected
                                    ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 dark:from-indigo-600 dark:to-indigo-700 text-white shadow-glass-indigo border-indigo-400/30'
                                    : 'bg-white/40 dark:bg-white/5 border-transparent hover:border-white/20 hover:bg-white/60 dark:hover:bg-white/10'
                                    } group/item`}
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <h4 className={`font-black text-base tracking-tight ${isSelected ? 'text-white' : 'text-slate-800 dark:text-white'}`}>
                                        {c.name}
                                    </h4>
                                    {totalPercent !== 0 && (
                                        <span className={`text-[10px] font-black px-3 py-1 rounded-full shadow-sm border ${isSelected
                                            ? 'bg-white/20 text-white border-white/30'
                                            : totalPercent > 0 ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                                            }`}>
                                            {totalPercent > 0 ? '+' : ''}{Number(totalPercent.toFixed(2))}%
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <div className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl border ${isSelected ? 'bg-white/10 border-white/20 text-white/70' : 'bg-slate-100 dark:bg-white/5 border-transparent text-slate-400'}`}>
                                        INN: {c.inn}
                                    </div>
                                    <div className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl border ${isSelected ? 'bg-white/10 border-white/20 text-white/70' : 'bg-slate-100 dark:bg-white/5 border-transparent text-slate-400'}`}>
                                        {c.accountantName}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* RIGHT: Main Checklist Area */}
            <div className="flex-1 liquid-glass-card rounded-[3rem] border border-white/10 flex flex-col overflow-hidden shadow-glass-lg relative">
                {selectedCompany ? (
                    <>
                        <div className="p-10 border-b border-white/5 bg-white/40 dark:bg-white/5 backdrop-blur-3xl relative z-10">
                            <div className="absolute -top-10 -right-10 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl"></div>

                            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
                                <div>
                                    <h2 className="text-4xl font-black text-slate-800 dark:text-white tracking-tighter mb-4 premium-text-gradient">
                                        {selectedCompany.name}
                                    </h2>
                                    <div className="flex flex-wrap gap-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-black text-[10px] border border-indigo-500/20 shadow-sm">B</div>
                                            <div>
                                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{lang === 'uz' ? 'Buxgalter' : 'Бухгалтер'}</p>
                                                <p className="text-xs font-black text-slate-700 dark:text-white">{selectedCompany.accountantName}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center font-black text-[10px] border border-purple-500/20 shadow-sm">BK</div>
                                            <div>
                                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Bank Client</p>
                                                <p className="text-xs font-black text-slate-700 dark:text-white">{staff.find(s => s.id === selectedCompany.bankClientId)?.name || '—'}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col items-end w-full md:w-auto">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2">{lang === 'uz' ? 'Joriy Oy' : 'Текущий Месяц'}</p>
                                    <input
                                        type="month"
                                        value={month}
                                        onChange={e => setMonth(e.target.value)}
                                        className="bg-white/5 dark:bg-white/5 border border-white/10 rounded-2xl px-6 py-4 font-black text-slate-800 dark:text-white outline-none focus:bg-white/10 focus:border-white/20 transition-all appearance-none shadow-inner"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-10 scrollbar-none relative z-10 space-y-12">
                            {selectedOperation && (
                                <div className="animate-fade-in-up">
                                    <div className="flex items-center gap-4 mb-8">
                                        <div className="w-1.5 h-8 bg-indigo-500 rounded-full shadow-glass-indigo"></div>
                                        <h4 className="text-sm font-black text-slate-400 uppercase tracking-[0.3em]">
                                            {t.automationKpi}
                                        </h4>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {rules.filter(r => r.category === 'automation' && (r.role === 'accountant' || r.role === 'all')).map(rule => {
                                            const key = resolveAutomationKey(rule);
                                            if (!key) return null;
                                            const status = (selectedOperation as any)[key];
                                            const mult = typeof status === 'string' ? getReportStatusMultiplier(status) : 0;
                                            const weight = mult === 1 ? Number(rule.rewardPercent || 0) : Number(rule.penaltyPercent || 0);
                                            const score = mult * Math.abs(weight);

                                            return (
                                                <div
                                                    key={rule.id}
                                                    className={`p-6 rounded-[2rem] border transition-all duration-500 flex items-center justify-between group/row ${score > 0 ? 'bg-emerald-500/5 dark:bg-emerald-500/10 border-emerald-500/20 shadow-glass-emerald' : score < 0 ? 'bg-rose-500/5 dark:bg-rose-500/10 border-rose-500/20 shadow-glass-rose' : 'bg-white/40 dark:bg-white/5 border-white/10'}`}
                                                >
                                                    <div className="flex items-center gap-5">
                                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-700 ${score > 0 ? 'bg-emerald-500 text-white shadow-glass-lg' : score < 0 ? 'bg-rose-500 text-white shadow-glass-lg' : 'bg-slate-100 dark:bg-white/10 text-slate-300'}`}>
                                                            {score < 0 ? <XCircle size={28} strokeWidth={2.5} /> : <CheckCircle2 size={score > 0 ? 28 : 24} strokeWidth={2.5} />}
                                                        </div>
                                                        <div>
                                                            <p className={`font-black text-base tracking-tight ${score !== 0 ? 'text-slate-800 dark:text-white' : 'text-slate-500'}`}>
                                                                {lang === 'uz' ? rule.nameUz : rule.name}
                                                            </p>
                                                            <div className="flex items-center gap-3 mt-1">
                                                                <span className="text-[10px] font-black text-slate-400/60 uppercase tracking-widest px-2 py-0.5 bg-slate-100 dark:bg-white/5 rounded-lg">{typeof status === 'string' ? status : '—'}</span>
                                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                                                    {Number(rule.rewardPercent || 0) > 0 ? `+${Number(rule.rewardPercent || 0)}%` : ''}
                                                                    {Number(rule.penaltyPercent || 0) < 0 ? ` / ${Number(rule.penaltyPercent || 0)}%` : ''}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className={`text-xl font-black tabular-nums ${score > 0 ? 'text-emerald-500' : score < 0 ? 'text-rose-500' : 'text-slate-200'}`}>
                                                        {score > 0 ? '+' : ''}{Number(score.toFixed(2))}%
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Accountant Tasks */}
                            <div className="animate-fade-in-up delay-100">
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-1.5 h-8 bg-emerald-500 rounded-full shadow-glass-emerald"></div>
                                    <h4 className="text-sm font-black text-slate-400 uppercase tracking-[0.3em]">
                                        {t.manualKpi}
                                    </h4>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {rules.filter(r => (r.role === 'accountant' || r.role === 'all') && r.category !== 'automation').map(rawRule => {
                                        const rule = getEffectiveRule(rawRule);
                                        const perf = performances.find(p => p.companyId === selectedCompany.id && p.employeeId === (selectedCompany.accountantId || '') && p.ruleId === rule.id);
                                        const needsApproval = perf?.source === 'employee' && perf?.status === 'submitted';

                                        return (
                                            <div
                                                key={rule.id}
                                                onClick={() => {
                                                    if (needsApproval) return;
                                                    handleToggle(rule, selectedCompany, selectedCompany.accountantId || '', perf?.value || 0);
                                                }}
                                                className={`p-6 rounded-[2rem] border transition-all duration-500 cursor-pointer group/card flex flex-col justify-between h-full ${perf?.value === 1 ? 'bg-emerald-500/5 dark:bg-emerald-500/10 border-emerald-500/20 shadow-glass-emerald active:scale-95' :
                                                    perf?.value === -1 ? 'bg-rose-500/5 dark:bg-rose-500/10 border-rose-500/20 shadow-glass-rose active:scale-95' :
                                                        'bg-white/40 dark:bg-white/5 border-white/10 hover:border-indigo-500/30'
                                                    }`}
                                            >
                                                <div className="flex items-center justify-between mb-8">
                                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-700 ${perf?.value === 1 ? 'bg-emerald-500 text-white shadow-glass-lg' :
                                                        perf?.value === -1 ? 'bg-rose-500 text-white shadow-glass-lg' :
                                                            'bg-slate-100 dark:bg-white/10 text-slate-300'
                                                        }`}>
                                                        {perf?.value === -1 ? <XCircle size={28} strokeWidth={2.5} /> : <CheckCircle2 size={perf?.value === 1 ? 28 : 24} strokeWidth={2.5} />}
                                                    </div>

                                                    {canEditPercents && (
                                                        <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-3">
                                                            <div className="relative group/reward">
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    className="w-16 px-2 py-2 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[11px] font-black text-emerald-500 outline-none focus:bg-emerald-500/20 transition-all text-center placeholder:text-emerald-500/30"
                                                                    placeholder={String(rule.rewardPercent ?? '')}
                                                                    value={percentInputs[getPercentKey(selectedCompany.id, selectedCompany.accountantId || '', rule.id, 'reward')] ?? (perf?.rewardPercentOverride ?? perf?.rewardPercentOverride === 0 ? String(perf.rewardPercentOverride) : '')}
                                                                    onChange={(e) => {
                                                                        const key = getPercentKey(selectedCompany.id, selectedCompany.accountantId || '', rule.id, 'reward');
                                                                        setPercentInputs(prev => ({ ...prev, [key]: e.target.value }));
                                                                    }}
                                                                    onBlur={(e) => {
                                                                        const v = e.target.value;
                                                                        const reward = v.trim() === '' ? null : Number(v);
                                                                        const penalty = (perf?.penaltyPercentOverride ?? perf?.penaltyPercentOverride === 0) ? perf.penaltyPercentOverride : null;
                                                                        savePercentOverride(rule, selectedCompany, selectedCompany.accountantId || '', reward, penalty);
                                                                    }}
                                                                />
                                                                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] font-black uppercase text-emerald-500 opacity-0 group-hover/reward:opacity-100 transition-opacity">Reward %</span>
                                                            </div>
                                                            <div className="relative group/penalty">
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    className="w-16 px-2 py-2 bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/20 rounded-xl text-[11px] font-black text-rose-500 outline-none focus:bg-rose-500/20 transition-all text-center placeholder:text-rose-500/30"
                                                                    placeholder={String(rule.penaltyPercent ?? '')}
                                                                    value={percentInputs[getPercentKey(selectedCompany.id, selectedCompany.accountantId || '', rule.id, 'penalty')] ?? (perf?.penaltyPercentOverride ?? perf?.penaltyPercentOverride === 0 ? String(perf.penaltyPercentOverride) : '')}
                                                                    onChange={(e) => {
                                                                        const key = getPercentKey(selectedCompany.id, selectedCompany.accountantId || '', rule.id, 'penalty');
                                                                        setPercentInputs(prev => ({ ...prev, [key]: e.target.value }));
                                                                    }}
                                                                    onBlur={(e) => {
                                                                        const v = e.target.value;
                                                                        const penalty = v.trim() === '' ? null : Number(v);
                                                                        const reward = (perf?.rewardPercentOverride ?? perf?.rewardPercentOverride === 0) ? perf.rewardPercentOverride : null;
                                                                        savePercentOverride(rule, selectedCompany, selectedCompany.accountantId || '', reward, penalty);
                                                                    }}
                                                                />
                                                                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] font-black uppercase text-rose-500 opacity-0 group-hover/penalty:opacity-100 transition-opacity">Penalty %</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                <div>
                                                    <p className={`font-black text-base tracking-tight mb-2 ${perf?.value !== 0 ? 'text-slate-800 dark:text-white' : 'text-slate-500'}`}>
                                                        {lang === 'uz' ? rule.nameUz : rule.name}
                                                    </p>
                                                    <div className="flex items-center gap-3">
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                            {((perf?.rewardPercentOverride ?? rule.rewardPercent) > 0) ? `+${(perf?.rewardPercentOverride ?? rule.rewardPercent)}%` : ''}
                                                            {((perf?.penaltyPercentOverride ?? rule.penaltyPercent) < 0) ? ` / ${(perf?.penaltyPercentOverride ?? rule.penaltyPercent)}%` : ''}
                                                        </p>
                                                        {perf?.value === 1 && <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest px-2 py-0.5 bg-emerald-500/10 rounded-lg border border-emerald-500/10">Mukofot</span>}
                                                        {perf?.value === -1 && <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest px-2 py-0.5 bg-rose-500/10 rounded-lg border border-rose-500/10">Jarima</span>}
                                                        {needsApproval && (
                                                            <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest px-2 py-0.5 bg-amber-500/10 rounded-lg border border-amber-500/10 animate-pulse">{t.pendingApproval}</span>
                                                        )}
                                                    </div>
                                                </div>

                                                {needsApproval && perf && (
                                                    <div className="flex items-center gap-3 mt-8" onClick={e => e.stopPropagation()}>
                                                        <button
                                                            onClick={() => handleApprove(perf)}
                                                            className="flex-1 px-4 py-3 bg-emerald-500 text-white rounded-[1.2rem] text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-glass shadow-emerald-500/20 active:scale-95"
                                                        >
                                                            Approve
                                                        </button>
                                                        <button
                                                            onClick={() => handleReject(perf)}
                                                            className="flex-1 px-4 py-3 bg-rose-500 text-white rounded-[1.2rem] text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 transition-all shadow-glass shadow-rose-500/20 active:scale-95"
                                                        >
                                                            Reject
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Bank Client Tasks */}
                            {selectedCompany.bankClientId && (
                                <div className="animate-fade-in-up delay-200">
                                    <div className="flex items-center gap-4 mb-8">
                                        <div className="w-1.5 h-8 bg-purple-500 rounded-full shadow-glass-purple"></div>
                                        <h4 className="text-sm font-black text-slate-400 uppercase tracking-[0.3em]">
                                            {t.bankTasks}
                                        </h4>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {rules.filter(r => (r.role === 'bank_client' || r.role === 'all') && r.category !== 'automation').map(rawRule => {
                                            const rule = getEffectiveRule(rawRule);
                                            const perf = performances.find(p => p.companyId === selectedCompany.id && p.employeeId === (selectedCompany.bankClientId || '') && p.ruleId === rule.id);
                                            const needsApproval = perf?.source === 'employee' && perf?.status === 'submitted';

                                            return (
                                                <div
                                                    key={rule.id}
                                                    onClick={() => {
                                                        if (needsApproval) return;
                                                        handleToggle(rule, selectedCompany, selectedCompany.bankClientId || '', perf?.value || 0);
                                                    }}
                                                    className={`p-6 rounded-[2rem] border transition-all duration-500 cursor-pointer group/card flex flex-col justify-between h-full ${perf?.value === 1 ? 'bg-purple-500/5 dark:bg-purple-500/10 border-purple-500/20 shadow-glass-purple active:scale-95' :
                                                        perf?.value === -1 ? 'bg-rose-500/5 dark:bg-rose-500/10 border-rose-500/20 shadow-glass-rose active:scale-95' :
                                                            'bg-white/40 dark:bg-white/5 border-white/10 hover:border-purple-500/30'
                                                        }`}
                                                >
                                                    <div className="flex items-center justify-between mb-8">
                                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-700 ${perf?.value === 1 ? 'bg-purple-500 text-white shadow-glass-lg' :
                                                            perf?.value === -1 ? 'bg-rose-500 text-white shadow-glass-lg' :
                                                                'bg-slate-100 dark:bg-white/10 text-slate-300'
                                                            }`}>
                                                            {perf?.value === -1 ? <XCircle size={28} strokeWidth={2.5} /> : <CheckCircle2 size={perf?.value === 1 ? 28 : 24} strokeWidth={2.5} />}
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <p className={`font-black text-base tracking-tight mb-2 ${perf?.value !== 0 ? 'text-slate-800 dark:text-white' : 'text-slate-500'}`}>
                                                            {lang === 'uz' ? rule.nameUz : rule.name}
                                                        </p>
                                                        <div className="flex items-center gap-3">
                                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                                {rule.rewardPercent > 0 ? `+${rule.rewardPercent}%` : ''}
                                                                {rule.penaltyPercent < 0 ? ` / ${rule.penaltyPercent}%` : ''}
                                                            </p>
                                                            {perf?.value === 1 && <span className="text-[9px] font-black text-purple-500 uppercase tracking-widest px-2 py-0.5 bg-purple-500/10 rounded-lg border border-purple-500/10">Mukofot</span>}
                                                            {perf?.value === -1 && <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest px-2 py-0.5 bg-rose-500/10 rounded-lg border border-rose-500/10">Jarima</span>}
                                                            {needsApproval && (
                                                                <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest px-2 py-0.5 bg-amber-500/10 rounded-lg border border-amber-500/10 animate-pulse">Tasdiq kutilmoqda</span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {needsApproval && perf && (
                                                        <div className="flex items-center gap-3 mt-8" onClick={e => e.stopPropagation()}>
                                                            <button
                                                                onClick={() => handleApprove(perf)}
                                                                className="flex-1 px-4 py-3 bg-emerald-500 text-white rounded-[1.2rem] text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-glass shadow-emerald-500/20 active:scale-95"
                                                            >
                                                                Approve
                                                            </button>
                                                            <button
                                                                onClick={() => handleReject(perf)}
                                                                className="flex-1 px-4 py-3 bg-rose-500 text-white rounded-[1.2rem] text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 transition-all shadow-glass shadow-rose-500/20 active:scale-95"
                                                            >
                                                                Reject
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Supervisor Tasks */}
                            {selectedCompany.supervisorId && (
                                <div className="animate-fade-in-up delay-300">
                                    <div className="flex items-center gap-4 mb-8">
                                        <div className="w-1.5 h-8 bg-indigo-500 rounded-full shadow-glass-indigo"></div>
                                        <h4 className="text-sm font-black text-slate-400 uppercase tracking-[0.3em]">
                                            {lang === 'uz' ? 'Nazoratchi Vazifalari' : 'Задачи Контролёра'}
                                        </h4>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {rules.filter(r => r.role === 'supervisor' || r.role === 'all').map(rawRule => {
                                            const rule = getEffectiveRule(rawRule);
                                            const perf = performances.find(p => p.companyId === selectedCompany.id && p.employeeId === (selectedCompany.supervisorId || '') && p.ruleId === rule.id);
                                            const needsApproval = perf?.source === 'employee' && perf?.status === 'submitted';

                                            return (
                                                <div
                                                    key={rule.id}
                                                    onClick={() => {
                                                        if (needsApproval) return;
                                                        handleToggle(rule, selectedCompany, selectedCompany.supervisorId || '', perf?.value || 0);
                                                    }}
                                                    className={`p-6 rounded-[2rem] border transition-all duration-500 cursor-pointer group/card flex flex-col justify-between h-full ${perf?.value === 1 ? 'bg-indigo-500/5 dark:bg-indigo-500/10 border-indigo-500/20 shadow-glass-indigo active:scale-95' :
                                                        perf?.value === -1 ? 'bg-rose-500/5 dark:bg-rose-500/10 border-rose-500/20 shadow-glass-rose active:scale-95' :
                                                            'bg-white/40 dark:bg-white/5 border-white/10 hover:border-indigo-500/30'
                                                        }`}
                                                >
                                                    <div className="flex items-center justify-between mb-8">
                                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-700 ${perf?.value === 1 ? 'bg-indigo-500 text-white shadow-glass-lg' :
                                                            perf?.value === -1 ? 'bg-rose-500 text-white shadow-glass-lg' :
                                                                'bg-slate-100 dark:bg-white/10 text-slate-300'
                                                            }`}>
                                                            {perf?.value === -1 ? <XCircle size={28} strokeWidth={2.5} /> : <CheckCircle2 size={perf?.value === 1 ? 28 : 24} strokeWidth={2.5} />}
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <p className={`font-black text-base tracking-tight mb-2 ${perf?.value !== 0 ? 'text-slate-800 dark:text-white' : 'text-slate-500'}`}>
                                                            {lang === 'uz' ? rule.nameUz : rule.name}
                                                        </p>
                                                        <div className="flex items-center gap-3">
                                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                                {rule.rewardPercent > 0 ? `+${rule.rewardPercent}%` : ''}
                                                                {rule.penaltyPercent < 0 ? ` / ${rule.penaltyPercent}%` : ''}
                                                            </p>
                                                            {perf?.value === 1 && <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest px-2 py-0.5 bg-indigo-500/10 rounded-lg border border-indigo-500/10">Mukofot</span>}
                                                            {perf?.value === -1 && <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest px-2 py-0.5 bg-rose-500/10 rounded-lg border border-rose-500/10">Jarima</span>}
                                                            {needsApproval && (
                                                                <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest px-2 py-0.5 bg-amber-500/10 rounded-lg border border-amber-500/10 animate-pulse">Tasdiq kutilmoqda</span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {needsApproval && perf && (
                                                        <div className="flex items-center gap-3 mt-8" onClick={e => e.stopPropagation()}>
                                                            <button
                                                                onClick={() => handleApprove(perf)}
                                                                className="flex-1 px-4 py-3 bg-emerald-500 text-white rounded-[1.2rem] text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-glass shadow-emerald-500/20 active:scale-95"
                                                            >
                                                                Approve
                                                            </button>
                                                            <button
                                                                onClick={() => handleReject(perf)}
                                                                className="flex-1 px-4 py-3 bg-rose-500 text-white rounded-[1.2rem] text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 transition-all shadow-glass shadow-rose-500/20 active:scale-95"
                                                            >
                                                                Reject
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center bg-white/40 dark:bg-white/5 backdrop-blur-3xl animate-fade-in relative">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-[120px] animate-pulse"></div>
                        <div className="relative z-10 flex flex-col items-center">
                            <div className="flex gap-6 mb-12">
                                <div className="w-24 h-24 rounded-[2.5rem] bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shadow-glass-lg animate-bounce duration-[2000ms]">
                                    <Shield size={40} className="text-indigo-500" />
                                </div>
                                <div className="w-24 h-24 rounded-[2.5rem] bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-glass-lg animate-bounce duration-[2000ms] delay-300">
                                    <CheckCircle2 size={40} className="text-emerald-500" />
                                </div>
                                <div className="w-24 h-24 rounded-[2.5rem] bg-purple-500/10 flex items-center justify-center border border-purple-500/20 shadow-glass-lg animate-bounce duration-[2000ms] delay-700">
                                    <Activity size={40} className="text-purple-500" />
                                </div>
                            </div>
                            <h3 className="text-3xl font-black text-slate-800 dark:text-white mb-4 tracking-tighter text-center">
                                {t.auditReady}
                            </h3>
                            <p className="text-sm font-black text-slate-400 uppercase tracking-[0.3em] text-center max-w-sm leading-relaxed">
                                {t.selectCompanyAudit}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NazoratchiChecklist;
