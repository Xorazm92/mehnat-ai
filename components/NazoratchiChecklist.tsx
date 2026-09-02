"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { useViewMode } from '@/hooks/useViewMode';
import { Company, KPIRule, MonthlyPerformance, Staff, Language, OperationEntry } from '@/types';
import { Search, Shield, CheckCircle2, XCircle } from 'lucide-react';
import { translations } from '@/lib/translations';
import { capKpiPercent, KPI_SALARY_CONFIG, type KpiEntryInput, type KpiSalaryRole } from '@/lib/kpiScoring';
import { getKpiRules, getPerformanceForReview, upsertPerformance, approvePerformance, rejectPerformance, approveAutoPerformance } from '@/server/kpi';
import { projectAllKpiForMonth } from '@/server/kpiProjection';
import { deriveAttendanceKpi } from '@/server/attendance';
import KpiEntryCard from './kpi/KpiEntryCard';
import { formatNum } from "@/lib/platform/format";
import { TableToolbar } from "@/components/ui/TableToolbar";
import { toast } from "sonner";
import { usePrompt } from "@/components/ui/ConfirmDialog";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { friendlyError } from "@/lib/actionError";
import { MonthPicker } from './ui/MonthPicker';

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
    const prompt = usePrompt();
    const staffById = useMemo(() => new Map(staff.map(s => [s.id, s.name])), [staff]);
    const nameOf = (id?: string | null, fallback?: string) => (id ? staffById.get(id) || fallback || '' : fallback || '');
    const t = translations[lang];
    const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
    const [rules, setRules] = useState<KPIRule[]>([]);
    const [performances, setPerformances] = useState<MonthlyPerformance[]>([]);
    const [search, setSearch] = useState('');
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    // Standart — RO'YXAT; tanlov brauzerda saqlanadi (hooks/useViewMode).
    const [viewMode, setViewMode] = useViewMode('nazorat');
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);

    // Server gate'lari bir xil emas, UI ham shunga qarab ajratilishi kerak:
    // approvePerformance / approveAutoPerformance faqat chief+ ga ruxsat beradi,
    // rejectPerformance nazoratchiga ham. Bitta `canApprove` bilan nazoratchiga
    // "Tasdiqlash" tugmasi ko'rinardi va bosilganda "Forbidden" qaytarardi.
    const role = (currentUserRole || '').toLowerCase();
    const canFinalApprove = ['super_admin', 'admin', 'chief_accountant'].includes(role);
    const canReject = ['super_admin', 'admin', 'chief_accountant', 'supervisor'].includes(role);

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
        // base = the CONTRACT, not the person's share. calculateCompanySalaries pays
        // `contract * kpiPercent / 100`, so showing a share-based figure here told the
        // supervisor a penalty cost 10,000 while payroll actually deducted 50,000.
        return [
            { key: 'accountant', ruleRole: 'accountant', label: lang === 'uz' ? 'Buxgalter' : 'Бухгалтер', accent: 'var(--success)', employeeId: sc.accountantId || undefined, employeeName: nameOf(sc.accountantId, sc.accountantName), base: contractAmount },
            { key: 'bank_client', ruleRole: 'bank_client', label: lang === 'uz' ? 'Bank-klient' : 'Банк-клиент', accent: 'var(--accent-indigo)', employeeId: sc.bankClientId || undefined, employeeName: nameOf(sc.bankClientId, sc.bankClientName), base: contractAmount },
            { key: 'supervisor', ruleRole: 'supervisor', label: lang === 'uz' ? 'Nazoratchi' : 'Назоратчи', accent: 'var(--warning)', employeeId: sc.supervisorId || undefined, employeeName: nameOf(sc.supervisorId, sc.supervisorName), base: contractAmount },
        ];
    }, [selectedCompany, contractAmount, lang, staffById]); // eslint-disable-line react-hooks/exhaustive-deps

    const findPerf = (companyId: string, employeeId: string, ruleId: string) =>
        performances.find(p => p.companyId === companyId && p.employeeId === employeeId && p.ruleId === ruleId);

    const handleSaveEntry = async (rule: KPIRule, companyId: string, employeeId: string, input: KpiEntryInput) => {
        if (!employeeId) { toast.error(lang === 'uz' ? 'Bu rol firmaga biriktirilmagan' : 'Роль не назначена'); return; }
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
            toast.error(friendlyError(e));
            loadData();
        }
    };

    // Dalildan avtomatik to'ldirilgan, hali tasdiqlanmagan takliflar soni.
    // Faqat shular ommaviy tasdiqlanadi — qo'lda kiritilganlarga tegilmaydi.
    const autoPending = useMemo(
        () => performances.filter(p => p.status === 'submitted' && (p.source === 'system' || p.source === 'bot')),
        [performances]
    );

    const runProjection = async () => {
        setBusy(true);
        try {
            const res = await projectAllKpiForMonth(month);
            toast.success(
                lang === 'uz'
                    ? `Dalildan ${res.totalWritten} ta taklif tayyorlandi`
                    : `Подготовлено предложений: ${res.totalWritten}`
            );
            await loadData();
        } catch (e) { toast.error(friendlyError(e)); }
        finally { setBusy(false); }
    };

    const approveAllAuto = async () => {
        const ok = await prompt({
            title: lang === 'uz' ? 'Avtomatik bahlarni tasdiqlash' : 'Подтвердить авто-оценки',
            // Tasdiq maoshga tushadi, shuning uchun soni aniq aytiladi.
            reasonLabel: lang === 'uz'
                ? `${autoPending.length} ta dalilga asoslangan baho tasdiqlanadi va MAOSHGA tushadi. Sabab/izoh:`
                : `Будет подтверждено ${autoPending.length} оценок — они попадут в зарплату. Причина:`,
            confirmLabel: lang === 'uz' ? 'Tasdiqlash' : 'Подтвердить',
        });
        if (!ok) return;
        setBusy(true);
        try {
            const res = await approveAutoPerformance(`${month}-01`);
            toast.success(lang === 'uz' ? `${res.approved} ta baho tasdiqlandi` : `Подтверждено: ${res.approved}`);
            await loadData();
        } catch (e) { toast.error(friendlyError(e)); }
        finally { setBusy(false); }
    };

    const changeStatus = async (perf: MonthlyPerformance, approve: boolean) => {
        try {
            if (approve) await approvePerformance(perf.id);
            else {
                const reason = await prompt({
                    title: 'KPI natijasi rad etilsinmi?',
                    reasonLabel: t.rejectReason,
                    confirmLabel: 'Rad etish',
                    tone: 'danger',
                });
                if (!reason) return;
                if (!reason) return;
                await rejectPerformance(perf.id, reason);
            }
            await loadData();
        } catch (e) { toast.error(friendlyError(e)); }
    };

    return (
        <div className="flex flex-col xl:flex-row gap-6 h-[calc(100dvh-240px)] min-h-[520px] animate-fade-in">
            {/* LEFT: Company sidebar */}
            <div className="w-full xl:w-[340px] flex flex-col overflow-hidden rounded-xl"
                style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow)' }}>
                <div className="p-4" style={{ borderBottom: '1px solid var(--card-border)', background: 'var(--table-header-bg)' }}>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
                            style={{ background: 'linear-gradient(135deg, var(--accent-indigo), var(--accent-blue))' }}>
                            <Shield size={15} />
                        </div>
                        <h3 className="text-body font-bold" style={{ color: 'var(--text-primary)' }}>{t.organizations}</h3>
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
                                    <Badge tone="neutral">INN: {c.inn}</Badge>
                                    {nameOf(c.accountantId, c.accountantName) && <Badge tone="neutral">{nameOf(c.accountantId, c.accountantName)}</Badge>}
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
                                <h2 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{selectedCompany.name}</h2>
                                <p className="text-meta font-bold" style={{ color: 'var(--text-muted)' }}>
                                    {lang === 'uz' ? 'Shartnoma' : 'Договор'}: {formatNum(contractAmount)} {lang === 'uz' ? "so'm" : 'сум'}
                                </p>
                            </div>
                            <TableToolbar
                                view={viewMode}
                                onViewChange={setViewMode}
                                month={
                                    <MonthPicker selectedPeriod={month} onChange={setMonth} />
                                }
                            />
                        </div>

                        {/* Dalil qatlami boshqaruvi — nazoratchi 25 qoidani 200+ firma
                            bo'yicha bittalab bosmasligi uchun. Ommaviy tugma FAQAT
                            avtomatik takliflarga tegadi (ADR-0005). */}
                        {canReject && (
                            <div className="px-5 py-3 flex flex-wrap items-center gap-3"
                                style={{ borderBottom: '1px solid var(--card-border)' }}>
                                <Button variant="secondary" size="sm" disabled={busy} onClick={runProjection}>
                                    {lang === 'uz' ? 'Dalildan hisoblash' : 'Рассчитать по данным'}
                                </Button>
                                {autoPending.length > 0 ? (
                                    <>
                                        <span className="text-micro font-bold" style={{ color: 'var(--text-muted)' }}>
                                            {lang === 'uz'
                                                ? `${autoPending.length} ta avtomatik baho tasdiq kutmoqda`
                                                : `${autoPending.length} авто-оценок ждут подтверждения`}
                                        </span>
                                        <Button variant="primary" size="sm" disabled={busy} onClick={approveAllAuto}>
                                            {lang === 'uz' ? 'Barchasini tasdiqlash' : 'Подтвердить все'}
                                        </Button>
                                    </>
                                ) : (
                                    <span className="text-micro font-bold" style={{ color: 'var(--text-muted)' }}>
                                        {lang === 'uz' ? 'Tasdiq kutayotgan avtomatik baho yo’q' : 'Нет авто-оценок на подтверждении'}
                                    </span>
                                )}
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto p-5 space-y-8">
                            {roleGroups.map(group => {
                                const groupRules = rules.filter(r => r.role === group.ruleRole).sort((a, b) => a.sortOrder - b.sortOrder);
                                if (groupRules.length === 0) return null;
                                const percents = groupRules.map(r => Number(findPerf(selectedCompany.id, group.employeeId || '', r.id)?.calculatedScore) || 0);
                                const capped = capKpiPercent(percents, group.key);
                                // Reglament shifti bitta joyda turadi (lib/kpiScoring).
                                const cap = KPI_SALARY_CONFIG[group.key]?.kpiMaxPercent ?? 0;
                                return (
                                    <div key={group.key} className="animate-fade-in">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1 h-4 rounded-lg" style={{ background: group.accent }} />
                                                <h4 className="text-meta font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{group.label}</h4>
                                                <Badge tone="neutral">
                                                    {group.employeeName || (lang === 'uz' ? 'Biriktirilmagan' : 'Не назначен')}
                                                </Badge>
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
                                                            {needsApproval && perf && canReject && (
                                                                <div className="flex gap-2">
                                                                    {canFinalApprove && (
                                                                        <Button variant="success" size="sm" onClick={() => changeStatus(perf, true)} className="flex-1">
                                                                            <CheckCircle2 size={12} /> {lang === 'uz' ? 'Tasdiqlash' : 'Одобрить'}
                                                                        </Button>
                                                                    )}
                                                                    <Button variant="danger" size="sm" onClick={() => changeStatus(perf, false)} className="flex-1">
                                                                        <XCircle size={12} /> {lang === 'uz' ? 'Rad etish' : 'Отклонить'}
                                                                    </Button>
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
                            {loading && <SkeletonTable rows={5} cols={4} />}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-10 text-center animate-fade-in">
                        <div className="w-20 h-20 mb-6 rounded-xl flex items-center justify-center"
                            style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
                            <Shield size={32} />
                        </div>
                        <h3 className="text-base font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
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
