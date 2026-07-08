import React, { useState, useEffect, useMemo } from 'react';
import { Company, KPIRule, MonthlyPerformance, Staff, Language, CompanyKPIRule, OperationEntry } from '@/types';
import { CheckCircle2, XCircle, Search, Shield } from 'lucide-react';
import { translations } from '@/lib/translations';
import { getReportStatusMultiplier } from '@/lib/kpiLogic';
import { periodsEqual } from '@/lib/periods';
import { getKpiRules, getCompanyKpiRules, getMonthlyPerformance, upsertPerformance } from '@/server/kpi';

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
    const [, setLoading] = useState(false);

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
            await upsertPerformance({
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
            } as any);
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
            getKpiRules(),
            getMonthlyPerformance(`${month}-01`) // Start of month
        ]);
        const filteredRules = (rulesData as any[]).filter(r =>
            (r.role === 'accountant' || r.role === 'bank_client' || r.role === 'supervisor' || r.role === 'all')
        );
        setRules(filteredRules);
        setPerformances(perfData as any[]);
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
            getCompanyKpiRules(selectedCompanyId).then(data => setCompanyRules(data as any[]));
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
            await upsertPerformance({
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
            } as any);
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
            await upsertPerformance({
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
            } as any);
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
            await upsertPerformance({
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
            } as any);
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
            <div className="w-full xl:w-[340px] flex flex-col overflow-hidden rounded-xl"
                style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "var(--card-shadow)" }}>
                <div className="p-4" style={{ borderBottom: "1px solid var(--card-border)", background: "var(--table-header-bg)" }}>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
                            style={{ background: "linear-gradient(135deg, var(--accent-indigo), var(--accent-blue))" }}>
                            <Shield size={15} />
                        </div>
                        <h3 className="text-[13px] font-bold uppercase tracking-widest" style={{ color: "var(--text-primary)" }}>
                            {t.organizations}
                        </h3>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={14} style={{ color: "var(--text-muted)" }} />
                        <input
                            type="text"
                            placeholder={t.searchMatrix}
                            className="w-full pl-9 pr-3 py-2.5 rounded-lg text-[12px] font-bold outline-none transition-all"
                            style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--text-primary)" }}
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
                                className="p-3 rounded-lg cursor-pointer transition-all"
                                style={{
                                    background: isSelected ? "var(--accent-blue-light)" : "transparent",
                                    border: `1px solid ${isSelected ? "var(--accent-blue)" : "transparent"}`,
                                }}
                                onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.borderColor = "var(--card-border)"; } }}
                                onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; } }}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-bold text-[13px] leading-tight" style={{ color: isSelected ? "var(--accent-blue)" : "var(--text-primary)" }}>
                                        {c.name}
                                    </h4>
                                    {totalPercent !== 0 && (
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                                            style={totalPercent > 0
                                                ? { background: "var(--success-bg)", color: "var(--success)", border: "1px solid var(--success-border)" }
                                                : { background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger-border)" }}>
                                            {totalPercent > 0 ? '+' : ''}{Number(totalPercent.toFixed(2))}%
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    <span className="c1-badge" style={{ background: "var(--input-bg)", color: "var(--text-muted)", border: "1px solid var(--card-border)" }}>INN: {c.inn}</span>
                                    <span className="c1-badge" style={{ background: "var(--input-bg)", color: "var(--text-muted)", border: "1px solid var(--card-border)" }}>{c.accountantName}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* RIGHT: Main Checklist Area */}
            <div className="flex-1 flex flex-col overflow-hidden rounded-xl"
                style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "var(--card-shadow)" }}>
                {selectedCompany ? (
                    <>
                        <div className="p-5" style={{ borderBottom: "1px solid var(--card-border)", background: "var(--table-header-bg)" }}>
                            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                <div>
                                    <h2 className="text-[17px] font-bold uppercase mb-3" style={{ color: "var(--text-primary)" }}>
                                        {selectedCompany.name}
                                    </h2>
                                    <div className="flex flex-wrap gap-4 pt-3" style={{ borderTop: "1px solid var(--card-border)" }}>
                                        <div className="flex items-center gap-2">
                                            <span className="c1-badge" style={{ background: "var(--input-bg)", color: "var(--text-muted)", border: "1px solid var(--card-border)" }}>B</span>
                                            <div>
                                                <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{lang === 'uz' ? 'Buxgalter' : 'Бухгалтер'}</p>
                                                <p className="text-[12px] font-bold" style={{ color: "var(--text-primary)" }}>{selectedCompany.accountantName}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 pl-4" style={{ borderLeft: "1px solid var(--card-border)" }}>
                                            <span className="c1-badge" style={{ background: "var(--input-bg)", color: "var(--text-muted)", border: "1px solid var(--card-border)" }}>BK</span>
                                            <div>
                                                <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Bank Client</p>
                                                <p className="text-[12px] font-bold" style={{ color: "var(--text-primary)" }}>{staff.find(s => s.id === selectedCompany.bankClientId)?.name || '—'}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col items-start md:items-end">
                                    <p className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-muted)" }}>{lang === 'uz' ? 'Joriy Oy' : 'Текущий Месяц'}</p>
                                    <input
                                        type="month"
                                        value={month}
                                        onChange={e => setMonth(e.target.value)}
                                        className="rounded-lg px-3 py-2 text-[13px] font-bold outline-none transition-all cursor-pointer"
                                        style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--accent-blue)" }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 space-y-8">
                            {selectedOperation && (
                                <div className="animate-fade-in">
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="w-1 h-4 rounded-sm" style={{ background: "var(--accent-indigo)" }}></div>
                                        <h4 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
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
                                                <div key={rule.id}
                                                    className="p-3 rounded-xl flex items-center justify-between transition-all"
                                                    style={{
                                                        background: score > 0 ? "var(--success-bg)" : score < 0 ? "var(--danger-bg)" : "var(--input-bg)",
                                                        border: `1px solid ${score > 0 ? "var(--success-border)" : score < 0 ? "var(--danger-border)" : "var(--card-border)"}`
                                                    }}>
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center"
                                                            style={{ background: score > 0 ? "var(--success)" : score < 0 ? "var(--danger)" : "var(--text-muted)", opacity: score === 0 ? 0.3 : 1, color: "white" }}>
                                                            {score < 0 ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-[13px] leading-none mb-1" style={{ color: score !== 0 ? "var(--text-primary)" : "var(--text-muted)" }}>
                                                                {lang === 'uz' ? rule.nameUz : rule.name}
                                                            </p>
                                                            <div className="flex items-center gap-2">
                                                                <span className="c1-badge" style={{ background: "var(--input-bg)", color: "var(--text-muted)", border: "1px solid var(--card-border)" }}>{typeof status === 'string' ? status : '—'}</span>
                                                                <span className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>
                                                                    {Number(rule.rewardPercent || 0) > 0 ? `+${Number(rule.rewardPercent || 0)}%` : ''}
                                                                    {Number(rule.penaltyPercent || 0) < 0 ? ` / ${Number(rule.penaltyPercent || 0)}%` : ''}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <span className="text-[13px] font-bold tabular-nums"
                                                        style={{ color: score > 0 ? "var(--success)" : score < 0 ? "var(--danger)" : "var(--text-muted)" }}>
                                                        {score > 0 ? '+' : ''}{Number(score.toFixed(2))}%
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Accountant Tasks */}
                            <div className="animate-fade-in">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-1 h-4 rounded-sm" style={{ background: "var(--success)" }}></div>
                                    <h4 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
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
                                                className="p-3 rounded-xl flex flex-col justify-between cursor-pointer select-none transition-all"
                                                style={{
                                                    background: perf?.value === 1 ? "var(--success-bg)" : perf?.value === -1 ? "var(--danger-bg)" : "var(--input-bg)",
                                                    border: `1px solid ${perf?.value === 1 ? "var(--success-border)" : perf?.value === -1 ? "var(--danger-border)" : "var(--card-border)"}`,
                                                }}
                                                onMouseEnter={e => { if (perf?.value === 0) e.currentTarget.style.borderColor = "var(--accent-indigo)"; }}
                                                onMouseLeave={e => { if (perf?.value === 0) e.currentTarget.style.borderColor = "var(--card-border)"; }}
                                            >
                                                <div className="flex items-start justify-between mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                                                            style={{
                                                                background: perf?.value === 1 ? "var(--success)" : perf?.value === -1 ? "var(--danger)" : "var(--card-border)",
                                                                color: perf?.value !== 0 ? "white" : "var(--text-muted)"
                                                            }}>
                                                            {perf?.value === -1 ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                                                        </div>
                                                        <p className="font-bold text-[12px] leading-tight" style={{ color: perf?.value !== 0 ? "var(--text-primary)" : "var(--text-secondary)" }}>
                                                            {lang === 'uz' ? rule.nameUz : rule.name}
                                                        </p>
                                                    </div>

                                                    {canEditPercents && (
                                                        <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 shrink-0 ml-2">
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                title="Reward %"
                                                                className="w-12 px-1 py-1 rounded text-[10px] font-bold outline-none text-center transition-colors"
                                                                style={{ background: "var(--input-bg)", border: "1px solid var(--success-border)", color: "var(--success)" }}
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
                                                                className="w-12 px-1 py-1 rounded text-[10px] font-bold outline-none text-center transition-colors"
                                                                style={{ background: "var(--input-bg)", border: "1px solid var(--danger-border)", color: "var(--danger)" }}
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

                                                <div className="flex items-center gap-2 mt-auto pt-2" style={{ borderTop: "1px solid var(--card-border)" }}>
                                                    <p className="text-[10px] font-bold" style={{ color: "var(--text-muted)" }}>
                                                        {((perf?.rewardPercentOverride ?? rule.rewardPercent) > 0) ? `+${(perf?.rewardPercentOverride ?? rule.rewardPercent)}%` : ''}
                                                        {((perf?.penaltyPercentOverride ?? rule.penaltyPercent) < 0) ? ` / ${(perf?.penaltyPercentOverride ?? rule.penaltyPercent)}%` : ''}
                                                    </p>
                                                    {perf?.value === 1 && <span className="c1-badge" style={{ background: "var(--success-bg)", color: "var(--success)", border: "1px solid var(--success-border)" }}>Mukofot</span>}
                                                    {perf?.value === -1 && <span className="c1-badge" style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger-border)" }}>Jarima</span>}
                                                    {needsApproval && (
                                                        <span className="c1-badge" style={{ background: "var(--warning-bg)", color: "var(--warning)", border: "1px solid var(--warning-border)" }}>{t.pendingApproval}</span>
                                                    )}
                                                </div>

                                                {needsApproval && perf && (
                                                    <div className="flex items-center gap-2 mt-3" onClick={e => e.stopPropagation()}>
                                                        <button onClick={() => handleApprove(perf)}
                                                            className="flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-colors text-white"
                                                            style={{ background: "var(--success)" }}
                                                        >Tasdiqlash</button>
                                                        <button onClick={() => handleReject(perf)}
                                                            className="flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-colors text-white"
                                                            style={{ background: "var(--danger)" }}
                                                        >Rad etish</button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Bank Client Tasks */}
                            {selectedCompany.bankClientId && (
                                <div className="animate-fade-in">
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="w-1 h-4 rounded-sm" style={{ background: "var(--accent-indigo)" }}></div>
                                        <h4 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                                            {t.bankTasks}
                                        </h4>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {rules.filter(r => (r.role === 'bank_client' || r.role === 'all') && r.category !== 'automation').map(rawRule => {
                                            const rule = getEffectiveRule(rawRule);
                                            const perf = performances.find(p => p.companyId === selectedCompany.id && p.employeeId === (selectedCompany.bankClientId || '') && p.ruleId === rule.id);
                                            const needsApproval = perf?.source === 'employee' && perf?.status === 'submitted';

                                            return (
                                                <div key={rule.id}
                                                    onClick={() => { if (needsApproval) return; handleToggle(rule, selectedCompany, selectedCompany.bankClientId || '', perf?.value || 0); }}
                                                    className="p-3 rounded-xl flex flex-col justify-between cursor-pointer select-none transition-all"
                                                    style={{
                                                        background: perf?.value === 1 ? "var(--accent-blue-light)" : perf?.value === -1 ? "var(--danger-bg)" : "var(--input-bg)",
                                                        border: `1px solid ${perf?.value === 1 ? "var(--accent-blue)" : perf?.value === -1 ? "var(--danger-border)" : "var(--card-border)"}`
                                                    }}
                                                >
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                                                            style={{ background: perf?.value === 1 ? "var(--accent-blue)" : perf?.value === -1 ? "var(--danger)" : "var(--card-border)", color: perf?.value !== 0 ? "white" : "var(--text-muted)" }}>
                                                            {perf?.value === -1 ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                                                        </div>
                                                        <p className="font-bold text-[12px] leading-tight" style={{ color: perf?.value !== 0 ? "var(--text-primary)" : "var(--text-secondary)" }}>
                                                            {lang === 'uz' ? rule.nameUz : rule.name}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2 pt-2" style={{ borderTop: "1px solid var(--card-border)" }}>
                                                        <p className="text-[10px] font-bold" style={{ color: "var(--text-muted)" }}>
                                                            {rule.rewardPercent > 0 ? `+${rule.rewardPercent}%` : ''}
                                                            {rule.penaltyPercent < 0 ? ` / ${rule.penaltyPercent}%` : ''}
                                                        </p>
                                                        {perf?.value === 1 && <span className="c1-badge" style={{ background: "var(--accent-blue-light)", color: "var(--accent-blue)", border: "1px solid var(--accent-blue)" }}>Mukofot</span>}
                                                        {perf?.value === -1 && <span className="c1-badge" style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger-border)" }}>Jarima</span>}
                                                        {needsApproval && <span className="c1-badge" style={{ background: "var(--warning-bg)", color: "var(--warning)", border: "1px solid var(--warning-border)" }}>Tasdiq kutilmoqda</span>}
                                                    </div>
                                                    {needsApproval && perf && (
                                                        <div className="flex gap-2 mt-3" onClick={e => e.stopPropagation()}>
                                                            <button onClick={() => handleApprove(perf)} className="flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase text-white" style={{ background: "var(--success)" }}>Tasdiqlash</button>
                                                            <button onClick={() => handleReject(perf)} className="flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase text-white" style={{ background: "var(--danger)" }}>Rad etish</button>
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
                                <div className="animate-fade-in">
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="w-1 h-4 rounded-sm" style={{ background: "var(--warning)" }}></div>
                                        <h4 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                                            {t.supervisorTasks}
                                        </h4>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {rules.filter(r => (r.role === 'supervisor' || r.role === 'all') && r.category !== 'automation').map(rawRule => {
                                            const rule = getEffectiveRule(rawRule);
                                            const perf = performances.find(p => p.companyId === selectedCompany.id && p.employeeId === (selectedCompany.supervisorId || '') && p.ruleId === rule.id);
                                            const needsApproval = perf?.source === 'employee' && perf?.status === 'submitted';

                                            return (
                                                <div key={rule.id}
                                                    onClick={() => { if (needsApproval) return; handleToggle(rule, selectedCompany, selectedCompany.supervisorId || '', perf?.value || 0); }}
                                                    className="p-3 rounded-xl flex flex-col justify-between cursor-pointer select-none transition-all"
                                                    style={{
                                                        background: perf?.value !== 0 ? "var(--warning-light)" : "var(--input-bg)",
                                                        border: `1px solid ${perf?.value !== 0 ? "var(--warning-border)" : "var(--card-border)"}`
                                                    }}
                                                >
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                                                            style={{ background: perf?.value !== 0 ? "var(--warning)" : "var(--card-border)", color: perf?.value !== 0 ? "white" : "var(--text-muted)" }}>
                                                            {perf?.value === -1 ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                                                        </div>
                                                        <p className="font-bold text-[12px] leading-tight" style={{ color: perf?.value !== 0 ? "var(--text-primary)" : "var(--text-secondary)" }}>
                                                            {lang === 'uz' ? rule.nameUz : rule.name}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2 pt-2" style={{ borderTop: "1px solid var(--card-border)" }}>
                                                        <p className="text-[10px] font-bold" style={{ color: "var(--text-muted)" }}>
                                                            {rule.rewardPercent > 0 ? `+${rule.rewardPercent}%` : ''}
                                                            {rule.penaltyPercent < 0 ? ` / ${rule.penaltyPercent}%` : ''}
                                                        </p>
                                                        {perf?.value === 1 && <span className="c1-badge" style={{ background: "var(--warning-light)", color: "var(--warning)", border: "1px solid var(--warning-border)" }}>Mukofot</span>}
                                                        {perf?.value === -1 && <span className="c1-badge" style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger-border)" }}>Jarima</span>}
                                                        {needsApproval && <span className="c1-badge" style={{ background: "var(--warning-bg)", color: "var(--warning)", border: "1px solid var(--warning-border)" }}>Tasdiq kutilmoqda</span>}
                                                    </div>
                                                    {needsApproval && perf && (
                                                        <div className="flex gap-2 mt-3" onClick={e => e.stopPropagation()}>
                                                            <button onClick={() => handleApprove(perf)} className="flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase text-white" style={{ background: "var(--success)" }}>Tasdiqlash</button>
                                                            <button onClick={() => handleReject(perf)} className="flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase text-white" style={{ background: "var(--danger)" }}>Rad etish</button>
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
                    <div className="flex-1 flex flex-col items-center justify-center p-10 text-center animate-fade-in">
                        <div className="w-20 h-20 mb-6 rounded-2xl flex items-center justify-center"
                            style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text-muted)" }}>
                            <Shield size={32} />
                        </div>
                        <h3 className="text-[17px] font-bold uppercase mb-2" style={{ color: "var(--text-primary)" }}>
                            {(t as any).auditReady || (t as any).selectCompany}
                        </h3>
                        <p className="text-[13px] font-medium max-w-md" style={{ color: "var(--text-muted)" }}>
                            {(t as any).selectCompanyAudit || (t as any).selectCompanyDesc}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NazoratchiChecklist;
