"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { Company, KPIRule, MonthlyPerformance, Staff, Language, OperationEntry } from '@/types';
import { Search, Shield, CheckCircle2, XCircle } from 'lucide-react';
import { translations } from '@/lib/translations';
import { capKpiPercent, type KpiEntryInput, type KpiSalaryRole } from '@/lib/kpiScoring';
import { getKpiRules, getPerformanceForReview, upsertPerformance, approvePerformance, rejectPerformance } from '@/server/kpi';
import { deriveAttendanceKpi } from '@/server/attendance';
import KpiEntryCard from './kpi/KpiEntryCard';
import { formatNum } from "@/lib/format";
import { TableToolbar, type ViewMode } from "@/components/ui/TableToolbar";

interface Props {
    companies: Company[];
    operations: OperationEntry[];
    staff: Staff[];
    lang: Language;
    currentUserRole?: string;
    currentUserId?: string;
}

type RoleGroup = { key: KpiSalaryRole; ruleRole: string; label: string; accent: string; employeeId?: string; employeeName?: string; base: number };

const NazoratchiChecklist: React.FC<Props> = ({ companies, staff, lang, currentUserRole, currentUserId }) => {
    const staffById = useMemo(() => new Map(staff.map(s => [s.id, s.name])), [staff]);
    const nameOf = (id?: string | null, fallback?: string) => (id ? staffById.get(id) || fallback || '' : fallback || '');
    const t = translations[lang];
    const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
    const [rules, setRules] = useState<KPIRule[]>([]);
    const [performances, setPerformances] = useState<MonthlyPerformance[]>([]);
    const [search, setSearch] = useState('');
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [loading, setLoading] = useState(false);

    const canApprove = ['super_admin', 'admin', 'chief_accountant', 'supervisor'].includes((currentUserRole || '').toLowerCase());

    useEffect(() => { loadData(); }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

    const loadData = async () => {
        setLoading(true);
        try {
            const [rulesData, perfData] = await Promise.all([
                getKpiRules(),
                // The checklist reviews proposals, so it needs every status —
                // getMonthlyPerformance is approved-only by design.
                getPerformanceForReview(`${month}-01`),
            ]);
            setRules((rulesData as unknown as KPIRule[]).filter(r => ['accountant', 'bank_client', 'supervisor', 'all'].includes(r.role)));
            setPerformances(perfData as unknown as MonthlyPerformance[]);
        } finally {
            setLoading(false);
        }
    };

    const filteredCompanies = useMemo(
        () => companies.filter(c => c.isActive && (c.name.toLowerCase().includes(search.toLowerCase()) || (c.inn || '').includes(search))),
        [companies, search]
    );
    const selectedCompany = useMemo(() => companies.find(c => c.id === selectedCompanyId), [companies, selectedCompanyId]);

    // Per-company total KPI% (capped per role) for the sidebar badge
    const companyTotalPercent = (companyId: string) => {
        const rows = performances.filter(p => p.companyId === companyId);
        const byRole = new Map<string, number[]>();
        for (const p of rows) {
            const ruleRole = (p as MonthlyPerformance).ruleRole || rules.find(r => r.id === p.ruleId)?.role || 'accountant';
            (byRole.get(ruleRole) ?? byRole.set(ruleRole, []).get(ruleRole)!).push(Number(p.calculatedScore) || 0);
        }
        let total = 0;
        for (const [role, percents] of byRole) total += capKpiPercent(percents, role as KpiSalaryRole);
        return total;
    };

    const contractAmount = Number(selectedCompany?.contractAmount || (selectedCompany as unknown as { contract_amount?: number })?.contract_amount || 0);

    const roleGroups: RoleGroup[] = useMemo(() => {
        if (!selectedCompany) return [];
        const sc = selectedCompany;
        const shareOf = (perc?: number | null, sum?: number | null) => (sum ? Number(sum) : contractAmount * (Number(perc || 0) / 100));
        return [
            { key: 'accountant', ruleRole: 'accountant', label: lang === 'uz' ? 'Buxgalter' : 'Бухгалтер', accent: 'var(--success)', employeeId: sc.accountantId || undefined, employeeName: nameOf(sc.accountantId, sc.accountantName), base: shareOf(sc.accountantPerc, sc.accountantSum) },
            { key: 'bank_client', ruleRole: 'bank_client', label: lang === 'uz' ? 'Bank-klient' : 'Банк-клиент', accent: 'var(--accent-indigo)', employeeId: sc.bankClientId || undefined, employeeName: nameOf(sc.bankClientId, sc.bankClientName), base: shareOf(sc.bankClientPerc, sc.bankClientSum) },
            { key: 'supervisor', ruleRole: 'supervisor', label: lang === 'uz' ? 'Nazoratchi' : 'Назоратчи', accent: 'var(--warning)', employeeId: sc.supervisorId || undefined, employeeName: nameOf(sc.supervisorId, sc.supervisorName), base: shareOf(sc.supervisorPerc, sc.supervisorSum) },
        ];
    }, [selectedCompany, contractAmount, lang, staffById]); // eslint-disable-line react-hooks/exhaustive-deps

    const findPerf = (companyId: string, employeeId: string, ruleId: string) =>
        performances.find(p => p.companyId === companyId && p.employeeId === employeeId && p.ruleId === ruleId);

    const handleSaveEntry = async (rule: KPIRule, companyId: string, employeeId: string, input: KpiEntryInput) => {
        if (!employeeId) { alert(lang === 'uz' ? 'Bu rol firmaga biriktirilmagan' : 'Роль не назначена'); return; }
        try {
            const saved = await upsertPerformance({
                month: `${month}-01`,
                companyId,
                employeeId,
                ruleId: rule.id,
                selectedOption: input.selectedOption ?? null,
                earlyDays: input.counters?.early_days ?? 0,
                lateMinutes: (input.counters?.late_5min ?? 0) * 5,
                absentDays: input.counters?.absent_days ?? 0,
                penaltyAmount: input.penaltyAmount ?? 0,
                source: 'supervisor',
                status: 'approved', // supervisor is authoritative → counts in payroll immediately
            });
            // merge into local state
            setPerformances(prev => {
                const existing = prev.find(p => p.companyId === companyId && p.employeeId === employeeId && p.ruleId === rule.id);
                const rec = saved as unknown as MonthlyPerformance;
                return existing ? prev.map(p => (p.id === existing.id ? rec : p)) : [...prev, rec];
            });
        } catch (e) {
            alert((e as Error).message);
            loadData();
        }
    };

    const changeStatus = async (perf: MonthlyPerformance, approve: boolean) => {
        try {
            if (approve) await approvePerformance(perf.id);
            else {
                const reason = window.prompt(t.rejectReason) || '';
                if (!reason) return;
                await rejectPerformance(perf.id, reason);
            }
            await loadData();
        } catch (e) { alert((e as Error).message); }
    };

    return (
        <div className="flex flex-col xl:flex-row gap-6 h-[calc(100dvh-160px)] animate-fade-in pb-6 p-4">
            {/* LEFT: Company sidebar */}
            <div className="w-full xl:w-[340px] flex flex-col overflow-hidden rounded-xl"
                style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow)' }}>
                <div className="p-4" style={{ borderBottom: '1px solid var(--card-border)', background: 'var(--table-header-bg)' }}>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
                            style={{ background: 'linear-gradient(135deg, var(--accent-indigo), var(--accent-blue))' }}>
                            <Shield size={15} />
                        </div>
                        <h3 className="text-body font-bold uppercase tracking-widest" style={{ color: 'var(--text-primary)' }}>{t.organizations}</h3>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={14} style={{ color: 'var(--text-muted)' }} />
                        <input type="text" placeholder={t.searchMatrix}
                            className="w-full pl-9 pr-3 py-2.5 rounded-lg text-xs font-bold outline-none"
                            style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }}
                            value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {filteredCompanies.map(c => {
                        const total = companyTotalPercent(c.id);
                        const isSelected = selectedCompanyId === c.id;
                        return (
                            <div key={c.id} onClick={() => setSelectedCompanyId(c.id)}
                                className="p-3 rounded-lg cursor-pointer transition-all"
                                style={{ background: isSelected ? 'var(--accent-blue-light)' : 'transparent', border: `1px solid ${isSelected ? 'var(--accent-blue)' : 'transparent'}` }}>
                                <div className="flex justify-between items-start mb-2 gap-2">
                                    <h4 className="font-bold text-body leading-tight" style={{ color: isSelected ? 'var(--accent-blue)' : 'var(--text-primary)' }}>{c.name}</h4>
                                    {total !== 0 && (
                                        <span className="text-micro font-bold px-2 py-0.5 rounded-lg shrink-0"
                                            style={total > 0
                                                ? { background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-border)' }
                                                : { background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-border)' }}>
                                            {total > 0 ? '+' : ''}{Number(total.toFixed(2))}%
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    <span className="c1-badge" style={{ background: 'var(--input-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>INN: {c.inn}</span>
                                    {nameOf(c.accountantId, c.accountantName) && <span className="c1-badge" style={{ background: 'var(--input-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>{nameOf(c.accountantId, c.accountantName)}</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* RIGHT: v2 entry area */}
            <div className="flex-1 flex flex-col overflow-hidden rounded-xl"
                style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow)' }}>
                {selectedCompany ? (
                    <>
                        <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                            style={{ borderBottom: '1px solid var(--card-border)', background: 'var(--table-header-bg)' }}>
                            <div>
                                <h2 className="text-base font-bold uppercase mb-1" style={{ color: 'var(--text-primary)' }}>{selectedCompany.name}</h2>
                                <p className="text-meta font-bold" style={{ color: 'var(--text-muted)' }}>
                                    {lang === 'uz' ? 'Shartnoma' : 'Договор'}: {formatNum(contractAmount)} {lang === 'uz' ? "so'm" : 'сум'}
                                </p>
                            </div>
                            <TableToolbar
                                view={viewMode}
                                onViewChange={setViewMode}
                                month={
                                    <div className="flex items-center gap-2">
                                        <span className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Oy' : 'Месяц'}</span>
                                        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                                            className="rounded-lg px-3 py-2 text-body font-bold outline-none cursor-pointer"
                                            style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--accent-blue)' }} />
                                    </div>
                                }
                            />
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 space-y-8">
                            {roleGroups.map(group => {
                                const groupRules = rules.filter(r => r.role === group.ruleRole).sort((a, b) => a.sortOrder - b.sortOrder);
                                if (groupRules.length === 0) return null;
                                const percents = groupRules.map(r => Number(findPerf(selectedCompany.id, group.employeeId || '', r.id)?.calculatedScore) || 0);
                                const capped = capKpiPercent(percents, group.key);
                                const cap = { accountant: 5, bank_client: 2.5, supervisor: 1 }[group.key];
                                return (
                                    <div key={group.key} className="animate-fade-in">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1 h-4 rounded-lg" style={{ background: group.accent }} />
                                                <h4 className="text-meta font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{group.label}</h4>
                                                <span className="c1-badge" style={{ background: 'var(--input-bg)', color: 'var(--text-secondary)', border: '1px solid var(--card-border)' }}>
                                                    {group.employeeName || (lang === 'uz' ? 'Biriktirilmagan' : 'Не назначен')}
                                                </span>
                                            </div>
                                            <span className="text-xs font-extrabold tabular-nums"
                                                style={{ color: capped > 0 ? 'var(--success)' : capped < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                                                {capped > 0 ? '+' : ''}{Number(capped.toFixed(2))}% <span className="text-micro font-bold" style={{ color: 'var(--text-muted)' }}>/ max {cap}%</span>
                                            </span>
                                        </div>
                                        {group.employeeId ? (
                                            <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" : "grid grid-cols-1 gap-3"}>
                                                {groupRules.map(rule => {
                                                    const perf = findPerf(selectedCompany.id, group.employeeId!, rule.id);
                                                    const needsApproval = perf?.source === 'employee' && perf?.status === 'submitted';
                                                    return (
                                                        <div key={rule.id} className="flex flex-col gap-2">
                                                            <KpiEntryCard
                                                                rule={rule}
                                                                perf={perf}
                                                                base={group.base}
                                                                lang={lang}
                                                                disabled={needsApproval}
                                                                onSave={(input) => handleSaveEntry(rule, selectedCompany.id, group.employeeId!, input)}
                                                                onPrefill={
                                                                    rule.category === 'attendance'
                                                                        ? async () => {
                                                                            const s = await deriveAttendanceKpi(group.employeeId!, month);
                                                                            return { earlyDays: s.earlyDays, lateMinutes: s.lateMinutes, absentDays: s.absentDays };
                                                                        }
                                                                        : undefined
                                                                }
                                                            />
                                                            {needsApproval && perf && canApprove && (
                                                                <div className="flex gap-2">
                                                                    <button onClick={() => changeStatus(perf, true)}
                                                                        className="flex-1 py-1.5 rounded-lg text-micro font-bold uppercase text-white flex items-center justify-center gap-1" style={{ background: 'var(--success)' }}>
                                                                        <CheckCircle2 size={12} /> {lang === 'uz' ? 'Tasdiqlash' : 'Одобрить'}
                                                                    </button>
                                                                    <button onClick={() => changeStatus(perf, false)}
                                                                        className="flex-1 py-1.5 rounded-lg text-micro font-bold uppercase text-white flex items-center justify-center gap-1" style={{ background: 'var(--danger)' }}>
                                                                        <XCircle size={12} /> {lang === 'uz' ? 'Rad etish' : 'Отклонить'}
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="text-xs font-medium px-3 py-4 rounded-lg" style={{ background: 'var(--input-bg)', color: 'var(--text-muted)', border: '1px dashed var(--card-border)' }}>
                                                {lang === 'uz' ? 'Bu rol firmaga biriktirilmagan.' : 'Роль не назначена для этой фирмы.'}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                            {loading && <p className="text-center text-xs py-4" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Yuklanmoqda…' : 'Загрузка…'}</p>}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-10 text-center animate-fade-in">
                        <div className="w-20 h-20 mb-6 rounded-xl flex items-center justify-center"
                            style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
                            <Shield size={32} />
                        </div>
                        <h3 className="text-base font-bold uppercase mb-2" style={{ color: 'var(--text-primary)' }}>
                            {(t as unknown as { selectCompany?: string }).selectCompany || (lang === 'uz' ? 'Firmani tanlang' : 'Выберите фирму')}
                        </h3>
                        <p className="text-body font-medium max-w-md" style={{ color: 'var(--text-muted)' }}>
                            {lang === 'uz' ? 'KPI kiritish uchun chapdan firmani tanlang.' : 'Выберите фирму слева для ввода KPI.'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NazoratchiChecklist;
