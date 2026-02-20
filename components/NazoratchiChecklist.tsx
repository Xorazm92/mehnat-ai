import React, { useState, useEffect, useMemo } from 'react';
import { Company, KPIRule, MonthlyPerformance, Staff, Language, CompanyKPIRule, OperationEntry } from '../types';
import { fetchKPIRules, fetchMonthlyPerformance, upsertMonthlyPerformance, fetchCompanyKPIRules } from '../lib/supabaseData';
import { CheckCircle2, XCircle, Search, AlertCircle, Save } from 'lucide-react';
import { translations } from '../lib/translations';
import { getReportStatusMultiplier } from '../lib/kpiLogic';

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
        return operations.find(o => o.companyId === selectedCompany.id && o.period === month) || null;
    }, [operations, selectedCompany?.id, month]);

    const calcAutomationPercentForCompany = (companyId: string) => {
        const op = operations.find(o => o.companyId === companyId && o.period === month);
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
        const reason = window.prompt(lang === 'uz' ? 'Rad etish sababi:' : 'Причина отказа:');
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
        <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)]">
            {/* LEFT: Company List */}
            <div className="w-full lg:w-1/3 bg-white dark:bg-apple-darkCard rounded-[2rem] border border-apple-border dark:border-apple-darkBorder flex flex-col overflow-hidden shadow-xl">
                <div className="p-6 border-b border-apple-border dark:border-apple-darkBorder">
                    <h3 className="text-xl font-black text-slate-800 dark:text-white mb-4 premium-text-gradient">
                        {lang === 'uz' ? 'Firmalar' : 'Фирмы'}
                    </h3>
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder={lang === 'uz' ? 'Firma qidirish...' : 'Поиск фирмы...'}
                            className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-white/5 rounded-xl border-none outline-none font-bold text-sm"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin">
                    {filteredCompanies.map(c => {
                        const companyPerf = performances.filter(p => p.companyId === c.id);
                        const manualPercent = companyPerf.reduce((sum, p) => sum + (Number(p.calculatedScore) || 0), 0);
                        const autoPercent = calcAutomationPercentForCompany(c.id);
                        const totalPercent = manualPercent + autoPercent;

                        return (
                            <div
                                key={c.id}
                                onClick={() => setSelectedCompanyId(c.id)}
                                className={`p-4 rounded-2xl cursor-pointer transition-all border-2 ${selectedCompanyId === c.id
                                    ? 'bg-apple-accent/10 border-apple-accent'
                                    : 'bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-white/5'
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <h4 className={`font-black ${selectedCompanyId === c.id ? 'text-apple-accent' : 'text-slate-700 dark:text-slate-200'}`}>
                                        {c.name}
                                    </h4>
                                    {totalPercent !== 0 && (
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${totalPercent > 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                            {totalPercent > 0 ? '+' : ''}{Number(totalPercent.toFixed(2))}%
                                        </span>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <div className="text-[10px] font-bold text-slate-400 px-2 py-1 bg-slate-100 dark:bg-white/10 rounded-lg">
                                        INN: {c.inn}
                                    </div>
                                    <div className="text-[10px] font-bold text-slate-400 px-2 py-1 bg-slate-100 dark:bg-white/10 rounded-lg">
                                        {c.accountantName}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* RIGHT: Checklist */}
            <div className="w-full lg:w-2/3 bg-white dark:bg-apple-darkCard rounded-[2rem] border border-apple-border dark:border-apple-darkBorder flex flex-col overflow-hidden shadow-xl">
                {selectedCompany ? (
                    <>
                        <div className="p-8 border-b border-apple-border dark:border-apple-darkBorder bg-slate-50 dark:bg-white/5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-2 premium-text-gradient">{selectedCompany.name}</h2>
                                    <div className="flex gap-4 text-sm font-bold text-slate-500">
                                        <span className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-apple-accent"></span>
                                            {lang === 'uz' ? 'Buxgalter' : 'Бухгалтер'}: {selectedCompany.accountantName}
                                        </span>
                                        <span className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                                            Bank: {staff.find(s => s.id === selectedCompany.bankClientId)?.name || '—'}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">{lang === 'uz' ? 'Joriy Oy' : 'Текущий Месяц'}</p>
                                    <input
                                        type="month"
                                        value={month}
                                        onChange={e => setMonth(e.target.value)}
                                        className="bg-white dark:bg-apple-darkBg border border-apple-border rounded-xl px-3 py-2 font-bold text-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 scrollbar-thin">
                            {selectedOperation && (
                                <div className="mb-10">
                                    <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <span className="w-6 h-[2px] bg-slate-300"></span> {lang === 'uz' ? 'Operatsiyalar (Avtomatik KPI)' : 'Операции (Авто KPI)'}
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                                    className={`p-5 rounded-2xl border-2 transition-all flex items-center justify-between ${score > 0 ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500/20' : score < 0 ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-500/20' : 'bg-white dark:bg-apple-darkBg border-slate-100 dark:border-white/5'}`}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center transition-colors ${score > 0 ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : score < 0 ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30' : 'bg-slate-100 dark:bg-white/10 text-slate-300'}`}>
                                                            {score < 0 ? <XCircle size={20} strokeWidth={3} /> : <CheckCircle2 size={score > 0 ? 20 : 18} strokeWidth={3} />}
                                                        </div>
                                                        <div>
                                                            <p className={`font-bold text-sm ${score !== 0 ? 'text-slate-800 dark:text-white' : 'text-slate-500'}`}>
                                                                {lang === 'uz' ? rule.nameUz : rule.name}
                                                            </p>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <p className="text-[10px] font-black text-slate-400">
                                                                    {Number(rule.rewardPercent || 0) > 0 ? `+${Number(rule.rewardPercent || 0)}%` : ''}
                                                                    {Number(rule.penaltyPercent || 0) < 0 ? ` / ${Number(rule.penaltyPercent || 0)}%` : ''}
                                                                </p>
                                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">{typeof status === 'string' ? status : '—'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className={`text-[11px] font-black ${score > 0 ? 'text-emerald-600' : score < 0 ? 'text-rose-600' : 'text-slate-300'}`}>
                                                        {score > 0 ? '+' : ''}{Number(score.toFixed(2))}%
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Accountant Tasks */}
                            <div className="mb-8">
                                <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <span className="w-6 h-[2px] bg-slate-300"></span> {lang === 'uz' ? 'Buxgalter Vazifalari (KPI)' : 'Задачи Бухгалтера (KPI)'}
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {rules.filter(r => (r.role === 'accountant' || r.role === 'all') && r.category !== 'automation').map(rawRule => {
                                        const rule = getEffectiveRule(rawRule);
                                        const perf = performances.find(p => p.companyId === selectedCompany.id && p.employeeId === (selectedCompany.accountantId || '') && p.ruleId === rule.id);
                                        const needsApproval = perf?.source === 'employee' && perf?.status === 'submitted';
                                        const isDone = perf?.value === 1;

                                        return (
                                            <div
                                                key={rule.id}
                                                onClick={() => {
                                                    if (needsApproval) return;
                                                    handleToggle(rule, selectedCompany, selectedCompany.accountantId || '', perf?.value || 0);
                                                }}
                                                className={`p-5 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between group active:scale-95 ${perf?.value === 1 ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500/20' :
                                                    perf?.value === -1 ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-500/20' :
                                                        'bg-white dark:bg-apple-darkBg border-slate-100 dark:border-white/5 hover:border-apple-accent/50'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center transition-colors ${perf?.value === 1 ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' :
                                                        perf?.value === -1 ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30' :
                                                            'bg-slate-100 dark:bg-white/10 text-slate-300'
                                                        }`}>
                                                        {perf?.value === -1 ? <XCircle size={20} strokeWidth={3} /> : <CheckCircle2 size={perf?.value === 1 ? 20 : 18} strokeWidth={3} />}
                                                    </div>
                                                    <div>
                                                        <p className={`font-bold text-sm ${perf?.value !== 0 ? 'text-slate-800 dark:text-white' : 'text-slate-500'}`}>
                                                            {lang === 'uz' ? rule.nameUz : rule.name}
                                                        </p>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <p className="text-[10px] font-black text-slate-400">
                                                                {((perf?.rewardPercentOverride ?? rule.rewardPercent) > 0) ? `+${(perf?.rewardPercentOverride ?? rule.rewardPercent)}%` : ''}
                                                                {((perf?.penaltyPercentOverride ?? rule.penaltyPercent) < 0) ? ` / ${(perf?.penaltyPercentOverride ?? rule.penaltyPercent)}%` : ''}
                                                            </p>
                                                            {perf?.value === 1 && <span className="text-[9px] font-black text-emerald-500 uppercase tracking-tight">Mukofot</span>}
                                                            {perf?.value === -1 && <span className="text-[9px] font-black text-rose-500 uppercase tracking-tight">Jarima</span>}
                                                            {needsApproval && (
                                                                <span className="text-[9px] font-black text-amber-600 uppercase tracking-tight">Tasdiq kutilmoqda</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {canEditPercents && (
                                                    <div
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="flex items-center gap-2"
                                                    >
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            className="w-20 px-2 py-1 rounded-lg border border-slate-200 text-[11px] font-bold text-emerald-600 bg-white"
                                                            placeholder={String(rule.rewardPercent ?? '')}
                                                            value={percentInputs[getPercentKey(selectedCompany.id, selectedCompany.accountantId || '', rule.id, 'reward')] ?? (perf?.rewardPercentOverride ?? perf?.rewardPercentOverride === 0 ? String(perf.rewardPercentOverride) : '')}
                                                            onChange={(e) => {
                                                                const key = getPercentKey(selectedCompany.id, selectedCompany.accountantId || '', rule.id, 'reward');
                                                                setPercentInputs(prev => ({ ...prev, [key]: e.target.value }));
                                                            }}
                                                            onBlur={(e) => {
                                                                const v = e.target.value;
                                                                const reward = v.trim() === '' ? null : Number(v);
                                                                if (v.trim() !== '' && !Number.isFinite(reward)) {
                                                                    alert("Noto'g'ri raqam format");
                                                                    return;
                                                                }
                                                                const penalty = (perf?.penaltyPercentOverride ?? perf?.penaltyPercentOverride === 0)
                                                                    ? perf.penaltyPercentOverride
                                                                    : null;
                                                                savePercentOverride(rule, selectedCompany, selectedCompany.accountantId || '', reward, penalty);
                                                            }}
                                                        />
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            className="w-20 px-2 py-1 rounded-lg border border-slate-200 text-[11px] font-bold text-rose-600 bg-white"
                                                            placeholder={String(rule.penaltyPercent ?? '')}
                                                            value={percentInputs[getPercentKey(selectedCompany.id, selectedCompany.accountantId || '', rule.id, 'penalty')] ?? (perf?.penaltyPercentOverride ?? perf?.penaltyPercentOverride === 0 ? String(perf.penaltyPercentOverride) : '')}
                                                            onChange={(e) => {
                                                                const key = getPercentKey(selectedCompany.id, selectedCompany.accountantId || '', rule.id, 'penalty');
                                                                setPercentInputs(prev => ({ ...prev, [key]: e.target.value }));
                                                            }}
                                                            onBlur={(e) => {
                                                                const v = e.target.value;
                                                                const penalty = v.trim() === '' ? null : Number(v);
                                                                if (v.trim() !== '' && !Number.isFinite(penalty)) {
                                                                    alert("Noto'g'ri raqam format");
                                                                    return;
                                                                }
                                                                const reward = (perf?.rewardPercentOverride ?? perf?.rewardPercentOverride === 0)
                                                                    ? perf.rewardPercentOverride
                                                                    : null;
                                                                savePercentOverride(rule, selectedCompany, selectedCompany.accountantId || '', reward, penalty);
                                                            }}
                                                        />
                                                    </div>
                                                )}

                                                {needsApproval && perf && (
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleApprove(perf);
                                                            }}
                                                            className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700"
                                                        >
                                                            Approve
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleReject(perf);
                                                            }}
                                                            className="px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-black hover:bg-rose-700"
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
                                <div>
                                    <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <span className="w-6 h-[2px] bg-slate-300"></span> {lang === 'uz' ? 'Bank Klient Vazifalari' : 'Задачи Банк-Клиента'}
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                                    className={`p-5 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between group active:scale-95 ${perf?.value === 1 ? 'bg-purple-50 dark:bg-purple-500/10 border-purple-500/20' :
                                                        perf?.value === -1 ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-500/20' :
                                                            'bg-white dark:bg-apple-darkBg border-slate-100 dark:border-white/5 hover:border-purple-500/50'
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center transition-colors ${perf?.value === 1 ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/30' :
                                                            perf?.value === -1 ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30' :
                                                                'bg-slate-100 dark:bg-white/10 text-slate-300'
                                                            }`}>
                                                            {perf?.value === -1 ? <XCircle size={20} strokeWidth={3} /> : <CheckCircle2 size={perf?.value === 1 ? 20 : 18} strokeWidth={3} />}
                                                        </div>
                                                        <div>
                                                            <p className={`font-bold text-sm ${perf?.value !== 0 ? 'text-slate-800 dark:text-white' : 'text-slate-500'}`}>
                                                                {lang === 'uz' ? rule.nameUz : rule.name}
                                                            </p>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <p className="text-[10px] font-black text-slate-400">
                                                                    {rule.rewardPercent > 0 ? `+${rule.rewardPercent}%` : ''}
                                                                    {rule.penaltyPercent < 0 ? ` / ${rule.penaltyPercent}%` : ''}
                                                                </p>
                                                                {perf?.value === 1 && <span className="text-[9px] font-black text-purple-500 uppercase tracking-tight">Mukofot</span>}
                                                                {perf?.value === -1 && <span className="text-[9px] font-black text-rose-500 uppercase tracking-tight">Jarima</span>}
                                                                {needsApproval && (
                                                                    <span className="text-[9px] font-black text-amber-600 uppercase tracking-tight">Tasdiq kutilmoqda</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {needsApproval && perf && (
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleApprove(perf);
                                                                }}
                                                                className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700"
                                                            >
                                                                Approve
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleReject(perf);
                                                                }}
                                                                className="px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-black hover:bg-rose-700"
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
                                <div className="mt-10">
                                    <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <span className="w-6 h-[2px] bg-slate-300"></span> {lang === 'uz' ? 'Nazoratchi Vazifalari' : 'Задачи Контролёра'}
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                                    className={`p-5 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between group active:scale-95 ${perf?.value === 1 ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-500/20' :
                                                        perf?.value === -1 ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-500/20' :
                                                            'bg-white dark:bg-apple-darkBg border-slate-100 dark:border-white/5 hover:border-indigo-500/50'
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center transition-colors ${perf?.value === 1 ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30' :
                                                            perf?.value === -1 ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30' :
                                                                'bg-slate-100 dark:bg-white/10 text-slate-300'
                                                            }`}>
                                                            {perf?.value === -1 ? <XCircle size={20} strokeWidth={3} /> : <CheckCircle2 size={perf?.value === 1 ? 20 : 18} strokeWidth={3} />}
                                                        </div>
                                                        <div>
                                                            <p className={`font-bold text-sm ${perf?.value !== 0 ? 'text-slate-800 dark:text-white' : 'text-slate-500'}`}>
                                                                {lang === 'uz' ? rule.nameUz : rule.name}
                                                            </p>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <p className="text-[10px] font-black text-slate-400">
                                                                    {rule.rewardPercent > 0 ? `+${rule.rewardPercent}%` : ''}
                                                                    {rule.penaltyPercent < 0 ? ` / ${rule.penaltyPercent}%` : ''}
                                                                </p>
                                                                {perf?.value === 1 && <span className="text-[9px] font-black text-indigo-500 uppercase tracking-tight">Mukofot</span>}
                                                                {perf?.value === -1 && <span className="text-[9px] font-black text-rose-500 uppercase tracking-tight">Jarima</span>}
                                                                {needsApproval && (
                                                                    <span className="text-[9px] font-black text-amber-600 uppercase tracking-tight">Tasdiq kutilmoqda</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {needsApproval && perf && (
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleApprove(perf);
                                                                }}
                                                                className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700"
                                                            >
                                                                Approve
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleReject(perf);
                                                                }}
                                                                className="px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-black hover:bg-rose-700"
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
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-300 p-10 text-center">
                        <div className="flex gap-4 mb-4">
                            <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-white/5 animate-pulse"></div>
                            <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-white/5 animate-pulse delay-75"></div>
                            <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-white/5 animate-pulse delay-150"></div>
                        </div>
                        <p className="font-black text-lg text-slate-500">{lang === 'uz' ? 'Baholash uchun chapdan firmani tanlang' : 'Выберите фирму слева для оценки'}</p>
                        <p className="text-sm mt-2 max-w-xs text-slate-400 italic">{lang === 'uz' ? 'Tezkor checklist yordamida buxgalter va bank xodimlarini baholang' : 'Оценивайте бухгалтеров и банковских сотрудников с помощью быстрого чек-листа'}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NazoratchiChecklist;
