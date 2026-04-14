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
        <div className="flex flex-col xl:flex-row gap-6 h-[calc(100vh-140px)] animate-fade-in pb-6">
            {/* LEFT: Company Sidebar */}
            <div className="w-full xl:w-[350px] bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 rounded shadow-sm flex flex-col overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1A1D23]">
                    <div className="flex items-center gap-3 mb-4">
                        <Shield size={18} className="text-indigo-600 dark:text-indigo-400" />
                        <h3 className="text-sm font-bold text-gray-800 dark:text-white uppercase">
                            {t.organizations}
                        </h3>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            type="text"
                            placeholder={t.searchMatrix}
                            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-[#1e2025] border border-gray-300 dark:border-gray-600 rounded text-xs font-bold text-gray-800 dark:text-gray-200 outline-none focus:border-indigo-500 shadow-sm"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
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
                                className={`p-3 rounded cursor-pointer transition-colors border ${isSelected
                                    ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800'
                                    : 'bg-white dark:bg-[#22252B] border-transparent hover:border-gray-200 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <h4 className={`font-bold text-sm ${isSelected ? 'text-indigo-900 dark:text-indigo-100' : 'text-gray-800 dark:text-white'}`}>
                                        {c.name}
                                    </h4>
                                    {totalPercent !== 0 && (
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${totalPercent > 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200'
                                            }`}>
                                            {totalPercent > 0 ? '+' : ''}{Number(totalPercent.toFixed(2))}%
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    <div className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 border border-gray-200 dark:border-gray-700">
                                        INN: {c.inn}
                                    </div>
                                    <div className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 border border-gray-200 dark:border-gray-700">
                                        {c.accountantName}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* RIGHT: Main Checklist Area */}
            <div className="flex-1 bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 rounded shadow-sm flex flex-col overflow-hidden">
                {selectedCompany ? (
                    <>
                        <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1A1D23]">
                            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-800 dark:text-white uppercase mb-3">
                                        {selectedCompany.name}
                                    </h2>
                                    <div className="flex flex-wrap gap-4 border-t border-gray-200 dark:border-gray-700 pt-3">
                                        <div className="flex items-center gap-2">
                                            <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#22252B] rounded px-1.5 py-0.5">B</div>
                                            <div>
                                                <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-0.5">{lang === 'uz' ? 'Buxgalter' : 'Бухгалтер'}</p>
                                                <p className="text-[11px] font-bold text-gray-800 dark:text-gray-200">{selectedCompany.accountantName}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 border-l border-gray-200 dark:border-gray-700 pl-4">
                                            <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#22252B] rounded px-1.5 py-0.5">BK</div>
                                            <div>
                                                <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-0.5">Bank Client</p>
                                                <p className="text-[11px] font-bold text-gray-800 dark:text-gray-200">{staff.find(s => s.id === selectedCompany.bankClientId)?.name || '—'}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col items-start md:items-end w-full md:w-auto">
                                    <p className="text-[9px] font-bold text-gray-500 uppercase mb-1">{lang === 'uz' ? 'Joriy Oy' : 'Текущий Месяц'}</p>
                                    <input
                                        type="month"
                                        value={month}
                                        onChange={e => setMonth(e.target.value)}
                                        className="bg-white dark:bg-[#1e2025] border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-xs font-bold text-gray-800 dark:text-gray-200 outline-none focus:border-indigo-500 shadow-sm transition-colors uppercase cursor-pointer"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-8">
                            {selectedOperation && (
                                <div className="animate-fade-in-up">
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="w-1 h-4 bg-indigo-600 rounded-sm"></div>
                                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                                            {t.automationKpi}
                                        </h4>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                                                    className={`p-3 rounded border flex items-center justify-between bg-white dark:bg-[#1e2025] ${score > 0 ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/30 dark:bg-emerald-900/10' : score < 0 ? 'border-rose-200 bg-rose-50/50 dark:border-rose-900/30 dark:bg-rose-900/10' : 'border-gray-200 dark:border-gray-700'}`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-8 h-8 rounded shrink-0 flex items-center justify-center ${score > 0 ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : score < 0 ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400' : 'bg-gray-100 text-gray-400 dark:bg-gray-800'}`}>
                                                            {score < 0 ? <XCircle size={18} /> : <CheckCircle2 size={18} />}
                                                        </div>
                                                        <div>
                                                            <p className={`font-bold text-sm leading-none mb-1 ${score !== 0 ? 'text-gray-800 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                                                                {lang === 'uz' ? rule.nameUz : rule.name}
                                                            </p>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[9px] font-bold text-gray-500 uppercase px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded">{typeof status === 'string' ? status : '—'}</span>
                                                                <p className="text-[9px] font-bold text-gray-400 uppercase">
                                                                    {Number(rule.rewardPercent || 0) > 0 ? `+${Number(rule.rewardPercent || 0)}%` : ''}
                                                                    {Number(rule.penaltyPercent || 0) < 0 ? ` / ${Number(rule.penaltyPercent || 0)}%` : ''}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className={`text-sm font-bold tabular-nums ${score > 0 ? 'text-emerald-600 dark:text-emerald-400' : score < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-gray-400'}`}>
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
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-1 h-4 bg-emerald-500 rounded-sm"></div>
                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                                        {t.manualKpi}
                                    </h4>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
                                                className={`p-3 border rounded shadow-sm flex flex-col justify-between transition-colors cursor-pointer select-none ${perf?.value === 1 ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/10 dark:border-emerald-800' :
                                                    perf?.value === -1 ? 'bg-rose-50 border-rose-200 dark:bg-rose-900/10 dark:border-rose-800' :
                                                        'bg-white dark:bg-[#1e2025] hover:border-indigo-300 border-gray-200 dark:border-gray-700'
                                                    }`}
                                            >
                                                <div className="flex items-start justify-between mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${perf?.value === 1 ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30' :
                                                            perf?.value === -1 ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30' :
                                                                'bg-gray-100 text-gray-400 dark:bg-gray-800'
                                                            }`}>
                                                            {perf?.value === -1 ? <XCircle size={18} /> : <CheckCircle2 size={18} />}
                                                        </div>
                                                        <p className={`font-bold text-xs leading-tight ${perf?.value !== 0 ? 'text-gray-800 dark:text-gray-100' : 'text-gray-600 dark:text-gray-300'}`}>
                                                            {lang === 'uz' ? rule.nameUz : rule.name}
                                                        </p>
                                                    </div>

                                                    {canEditPercents && (
                                                        <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 shrink-0 ml-2">
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                title="Reward %"
                                                                className="w-12 px-1 py-1 bg-white dark:bg-[#22252B] border border-emerald-200 dark:border-emerald-900/50 rounded text-[10px] font-bold text-emerald-600 outline-none focus:border-emerald-500 transition-colors text-center"
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
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                title="Penalty %"
                                                                className="w-12 px-1 py-1 bg-white dark:bg-[#22252B] border border-rose-200 dark:border-rose-900/50 rounded text-[10px] font-bold text-rose-600 outline-none focus:border-rose-500 transition-colors text-center"
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
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2 mt-auto pt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                                                    <p className="text-[10px] font-bold text-gray-500">
                                                        {((perf?.rewardPercentOverride ?? rule.rewardPercent) > 0) ? `+${(perf?.rewardPercentOverride ?? rule.rewardPercent)}%` : ''}
                                                        {((perf?.penaltyPercentOverride ?? rule.penaltyPercent) < 0) ? ` / ${(perf?.penaltyPercentOverride ?? rule.penaltyPercent)}%` : ''}
                                                    </p>
                                                    {perf?.value === 1 && <span className="text-[9px] font-bold text-emerald-600 uppercase px-1.5 py-0.5 bg-emerald-100 rounded">Mukofot</span>}
                                                    {perf?.value === -1 && <span className="text-[9px] font-bold text-rose-600 uppercase px-1.5 py-0.5 bg-rose-100 rounded">Jarima</span>}
                                                    {needsApproval && (
                                                        <span className="text-[9px] font-bold text-amber-600 uppercase px-1.5 py-0.5 bg-amber-100 rounded">{t.pendingApproval}</span>
                                                    )}
                                                </div>

                                                {needsApproval && perf && (
                                                    <div className="flex items-center gap-2 mt-3" onClick={e => e.stopPropagation()}>
                                                        <button
                                                            onClick={() => handleApprove(perf)}
                                                            className="flex-1 py-1.5 bg-emerald-500 text-white rounded text-[10px] font-bold uppercase hover:bg-emerald-600 transition-colors"
                                                        >
                                                            Approve
                                                        </button>
                                                        <button
                                                            onClick={() => handleReject(perf)}
                                                            className="flex-1 py-1.5 bg-rose-500 text-white rounded text-[10px] font-bold uppercase hover:bg-rose-600 transition-colors"
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
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="w-1 h-4 bg-purple-500 rounded-sm"></div>
                                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                                            {t.bankTasks}
                                        </h4>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
                                                    className={`p-3 border rounded shadow-sm flex flex-col justify-between transition-colors cursor-pointer select-none ${perf?.value === 1 ? 'bg-purple-50 border-purple-200 dark:bg-purple-900/10 dark:border-purple-800' :
                                                        perf?.value === -1 ? 'bg-rose-50 border-rose-200 dark:bg-rose-900/10 dark:border-rose-800' :
                                                            'bg-white dark:bg-[#1e2025] hover:border-purple-300 border-gray-200 dark:border-gray-700'
                                                        }`}
                                                >
                                                    <div className="flex items-start justify-between mb-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${perf?.value === 1 ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30' :
                                                                perf?.value === -1 ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30' :
                                                                    'bg-gray-100 text-gray-400 dark:bg-gray-800'
                                                                }`}>
                                                                {perf?.value === -1 ? <XCircle size={18} /> : <CheckCircle2 size={18} />}
                                                            </div>
                                                            <p className={`font-bold text-xs leading-tight ${perf?.value !== 0 ? 'text-gray-800 dark:text-gray-100' : 'text-gray-600 dark:text-gray-300'}`}>
                                                                {lang === 'uz' ? rule.nameUz : rule.name}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 mt-auto pt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                                                        <p className="text-[10px] font-bold text-gray-500">
                                                            {rule.rewardPercent > 0 ? `+${rule.rewardPercent}%` : ''}
                                                            {rule.penaltyPercent < 0 ? ` / ${rule.penaltyPercent}%` : ''}
                                                        </p>
                                                        {perf?.value === 1 && <span className="text-[9px] font-bold text-purple-600 uppercase px-1.5 py-0.5 bg-purple-100 rounded">Mukofot</span>}
                                                        {perf?.value === -1 && <span className="text-[9px] font-bold text-rose-600 uppercase px-1.5 py-0.5 bg-rose-100 rounded">Jarima</span>}
                                                        {needsApproval && (
                                                            <span className="text-[9px] font-bold text-amber-600 uppercase px-1.5 py-0.5 bg-amber-100 rounded">Tasdiq kutilmoqda</span>
                                                        )}
                                                    </div>

                                                    {needsApproval && perf && (
                                                        <div className="flex items-center gap-2 mt-3" onClick={e => e.stopPropagation()}>
                                                            <button
                                                                onClick={() => handleApprove(perf)}
                                                                className="flex-1 py-1.5 bg-emerald-500 text-white rounded text-[10px] font-bold uppercase hover:bg-emerald-600 transition-colors"
                                                            >
                                                                Approve
                                                            </button>
                                                            <button
                                                                onClick={() => handleReject(perf)}
                                                                className="flex-1 py-1.5 bg-rose-500 text-white rounded text-[10px] font-bold uppercase hover:bg-rose-600 transition-colors"
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
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="w-1 h-4 bg-amber-500 rounded-sm"></div>
                                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                                            {t.supervisorTasks}
                                        </h4>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {rules.filter(r => (r.role === 'supervisor' || r.role === 'all') && r.category !== 'automation').map(rawRule => {
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
                                                    className={`p-3 border rounded shadow-sm flex flex-col justify-between transition-colors cursor-pointer select-none ${perf?.value !== 0 ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-800' :
                                                            'bg-white dark:bg-[#1e2025] hover:border-amber-300 border-gray-200 dark:border-gray-700'
                                                        }`}
                                                >
                                                    <div className="flex items-start justify-between mb-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${perf?.value !== 0 ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30' :
                                                                    'bg-gray-100 text-gray-400 dark:bg-gray-800'
                                                                }`}>
                                                                {perf?.value === -1 ? <XCircle size={18} /> : <CheckCircle2 size={18} />}
                                                            </div>
                                                            <p className={`font-bold text-xs leading-tight ${perf?.value !== 0 ? 'text-gray-800 dark:text-gray-100' : 'text-gray-600 dark:text-gray-300'}`}>
                                                                {lang === 'uz' ? rule.nameUz : rule.name}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 mt-auto pt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                                                        <p className="text-[10px] font-bold text-gray-500">
                                                            {rule.rewardPercent > 0 ? `+${rule.rewardPercent}%` : ''}
                                                            {rule.penaltyPercent < 0 ? ` / ${rule.penaltyPercent}%` : ''}
                                                        </p>
                                                        {perf?.value === 1 && <span className="text-[9px] font-bold text-amber-600 uppercase px-1.5 py-0.5 bg-amber-100 rounded">Mukofot</span>}
                                                        {perf?.value === -1 && <span className="text-[9px] font-bold text-amber-600 uppercase px-1.5 py-0.5 bg-amber-100 rounded">Jarima</span>}
                                                        {needsApproval && (
                                                            <span className="text-[9px] font-bold text-amber-600 uppercase px-1.5 py-0.5 bg-amber-100 rounded">Tasdiq kutilmoqda</span>
                                                        )}
                                                    </div>

                                                    {needsApproval && perf && (
                                                        <div className="flex items-center gap-2 mt-3" onClick={e => e.stopPropagation()}>
                                                            <button
                                                                onClick={() => handleApprove(perf)}
                                                                className="flex-1 py-1.5 bg-emerald-500 text-white rounded text-[10px] font-bold uppercase hover:bg-emerald-600 transition-colors"
                                                            >
                                                                Approve
                                                            </button>
                                                            <button
                                                                onClick={() => handleReject(perf)}
                                                                className="flex-1 py-1.5 bg-rose-500 text-white rounded text-[10px] font-bold uppercase hover:bg-rose-600 transition-colors"
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
                    <div className="flex-1 flex flex-col items-center justify-center p-10 text-center relative z-10 animate-fade-in bg-white dark:bg-[#22252B]">
                        <div className="w-20 h-20 mb-6 bg-gray-100 dark:bg-gray-800 text-gray-400 rounded-full flex items-center justify-center border border-gray-200 dark:border-gray-700">
                            <Shield size={32} />
                        </div>
                        <h3 className="text-xl font-bold text-gray-800 dark:text-white uppercase mb-2">
                            {t.auditReady || t.selectCompany}
                        </h3>
                        <p className="text-sm font-bold text-gray-500 max-w-md">
                            {t.selectCompanyAudit || t.selectCompanyDesc}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NazoratchiChecklist;
