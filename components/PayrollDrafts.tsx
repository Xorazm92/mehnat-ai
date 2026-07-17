"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Staff, Company, Language, EmployeeSalarySummary, OperationEntry, MonthlyPerformance, KPIRule, CompanyKPIRule, EmployeeSalary } from '@/types';
import { calculateEmployeeSalary } from '@/lib/kpiLogic';
import { DollarSign, CheckCircle2, AlertCircle, FileText, X, TrendingUp, TrendingDown } from 'lucide-react';
import { getKpiRules, getMonthlyPerformance } from '@/server/kpi';
import { getPayrollAdjustments, approveEmployeeSalary } from '@/server/payroll';
import { toast } from 'sonner';
import { formatNum } from "@/lib/format";
import { TableToolbar, type ViewMode } from "@/components/ui/TableToolbar";
import { exportToExcel } from "@/lib/exportExcel";

interface Props {
    staff: Staff[];
    companies: Company[];
    operations: OperationEntry[];
    lang: Language;
    userRole?: string;
}

// Per-company breakdown for evidence
interface CompanyBreakdown {
    companyId: string;
    companyName: string;
    contractAmount: number;
    role: string;
    baseAmount: number;
    kpiBonus: number;
    kpiPenalty: number;
    details: string[];
}

interface DraftWithBreakdowns extends EmployeeSalarySummary {
    companyBreakdowns: CompanyBreakdown[];
}

type ModalType = 'base' | 'bonus' | 'penalty';

interface DetailModal {
    type: ModalType;
    employeeId: string;
    employeeName: string;
}

const PayrollDrafts: React.FC<Props> = ({ staff, companies, operations, lang, userRole }) => {
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
    const [performanceList, setPerformanceList] = useState<MonthlyPerformance[]>([]);
    const [kpiRules, setKpiRules] = useState<KPIRule[]>([]);
    const [companyOverrides, setCompanyOverrides] = useState<CompanyKPIRule[]>([]);
    const [approvedSalaries, setApprovedSalaries] = useState<EmployeeSalary[]>([]);
    const [loading, setLoading] = useState(false);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [detailModal, setDetailModal] = useState<DetailModal | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'approved'>('all');

    const superAdminCommission = useMemo(() => {
        const totalTurnover = companies.filter(c => c.isActive).reduce((acc, c) => acc + Number(c.contractAmount || 0), 0);
        return totalTurnover * 0.07;
    }, [companies]);

    // Calculate drafts with per-company breakdowns
    // The aggregation lives in lib/kpiLogic so the server can run the exact same
    // calculation when the salary is approved. This table is a preview of it.
    const drafts = useMemo(() => {
        const results: Record<string, DraftWithBreakdowns> = {};

        staff.forEach(s => {
            const draft = calculateEmployeeSalary({
                employee: s,
                companies,
                operations,
                performances: performanceList,
                rules: kpiRules,
                overrides: companyOverrides,
                month,
            });

            results[s.id] = {
                employeeId: s.id,
                employeeName: s.name,
                employeeRole: s.role,
                month,
                companyCount: draft.companyCount,
                baseSalary: draft.baseSalary,
                kpiBonus: draft.kpiBonus,
                kpiPenalty: draft.kpiPenalty,
                adjustments: 0,
                totalSalary: draft.totalSalary,
                performanceDetails: performanceList.filter(p => p.employeeId === s.id),
                companyBreakdowns: draft.companyBreakdowns
            };
        });
        return results;
    }, [staff, companies, operations, month, performanceList, kpiRules, companyOverrides]);

    const loadPerformance = async () => {
        setLoading(true);
        try {
            const [perf, rules, adjustments] = await Promise.all([
                getMonthlyPerformance(`${month}-01`),
                getKpiRules(),
                getPayrollAdjustments(month)
            ]);

            // Map server data to component types
            setPerformanceList((perf as any[]).map(p => ({
                ...p,
                value: Number(p.value ?? 0),
                calculatedScore: Number(p.calculatedScore ?? 0),
                rewardPercentOverride: p.rewardPercentOverride != null ? Number(p.rewardPercentOverride) : undefined,
                penaltyPercentOverride: p.penaltyPercentOverride != null ? Number(p.penaltyPercentOverride) : undefined,
            })));
            setKpiRules((rules as any[]).map(r => ({
                ...r,
                rewardPercent: Number(r.rewardPercent ?? 0),
                penaltyPercent: Number(r.penaltyPercent ?? 0),
            })));
            setCompanyOverrides([]);
            // Oldin tasdiqlangan oyliklarni DB dan tiklaymiz (faqat local state emas)
            setApprovedSalaries(
                (adjustments as any[])
                    .filter(a => a.adjustmentType === 'payment' && a.isApproved)
                    .map(a => ({
                        id: a.id,
                        employeeId: a.employeeId,
                        month: a.month,
                        baseSalary: 0,
                        kpiBonus: 0,
                        kpiPenalty: 0,
                        totalSalary: Number(a.amount),
                        breakdown: [],
                        isApproved: true,
                        approvedBy: a.approvedBy,
                        approvedAt: a.approvedAt,
                    } as EmployeeSalary))
            );
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadPerformance();
    }, [month]);

    // Get current modal data
    const modalData = useMemo(() => {
        if (!detailModal) return null;
        const draft = drafts[detailModal.employeeId] as DraftWithBreakdowns;
        if (!draft) return null;
        return draft.companyBreakdowns;
    }, [detailModal, drafts]);

    const handleApprove = async (employeeId: string) => {
        const draft = drafts[employeeId];
        if (!draft) return;

        setSavingId(employeeId);
        try {
            // Only who and when — the server computes the amount itself and ignores
            // whatever this component thinks it is. The figures above are a preview.
            const adjustment = await approveEmployeeSalary({
                employeeId: draft.employeeId,
                month: draft.month,
            });
            setApprovedSalaries(prev => [...prev, {
                id: adjustment.id,
                employeeId: draft.employeeId,
                month: draft.month,
                baseSalary: draft.baseSalary,
                kpiBonus: draft.kpiBonus,
                kpiPenalty: draft.kpiPenalty,
                totalSalary: draft.totalSalary,
                breakdown: draft.companyBreakdowns,
                isApproved: true,
                approvedAt: adjustment.approvedAt?.toISOString(),
            } as EmployeeSalary]);
            toast.success(lang === 'uz' ? 'Oylik tasdiqlandi' : 'Зарплата подтверждена');
        } catch (e) {
            console.error('Failed to approve', e);
            const message = e instanceof Error ? e.message : String(e);
            toast.error((lang === 'uz' ? 'Xatolik: ' : 'Ошибка: ') + message);
        }
        setSavingId(null);
    };

    const rows = staff.flatMap(s => {
        const draft = drafts[s.id];
        if (!draft || draft.companyCount === 0) return [];
        const isApproved = approvedSalaries.some(a => a.employeeId === s.id);
        if (statusFilter === 'approved' && !isApproved) return [];
        if (statusFilter === 'draft' && isApproved) return [];
        return [{ s, draft, isApproved }];
    });

    const handleExport = () => {
        exportToExcel(
            rows.map(({ s, draft, isApproved }) => ({
                'Xodim': s.name,
                'Lavozim': s.role,
                'Asosiy': Math.round(draft.baseSalary),
                'Bonus': Math.round(draft.kpiBonus),
                'Jarima': Math.round(draft.kpiPenalty),
                'Jami': Math.round(draft.totalSalary),
                'Holat': isApproved ? 'Tasdiqlandi' : 'Qoralama',
            })),
            `oylik-${month}`,
            'Oylik'
        );
    };

    return (
        <div className="space-y-4 animate-fade-in pb-6">
            {/* Drafts Header */}
            <div className="page-header flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md shrink-0"
                        style={{ background: "linear-gradient(135deg, var(--accent-blue), var(--accent-indigo))" }}>
                        <DollarSign size={18} />
                    </div>
                    <div>
                        <h2 className="text-[15px] font-bold leading-none" style={{ color: "var(--text-primary)" }}>
                            Oylik Xomcho&apos;t
                        </h2>
                        <p className="text-[11px] mt-1 font-medium" style={{ color: "var(--text-muted)" }}>
                            Qoralamalar
                        </p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 items-center">
                    {userRole === 'admin' && (
                        <div className="px-3 py-2 rounded-xl flex flex-col items-start min-w-[140px]"
                            style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)" }}>
                            <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--success)", opacity: 0.8 }}>Super Admin (7%)</p>
                            <p className="text-[15px] font-black tabular-nums leading-none" style={{ color: "var(--success)" }}>{formatNum(superAdminCommission)} <span className="text-[10px]">UZS</span></p>
                        </div>
                    )}
                    <TableToolbar
                        view={viewMode}
                        onViewChange={setViewMode}
                        month={
                            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg"
                                style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)" }}>
                                <span className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>Oy:</span>
                                <input
                                    type="month"
                                    value={month}
                                    onChange={(e) => setMonth(e.target.value)}
                                    className="bg-transparent border-none outline-none font-bold text-[13px] cursor-pointer"
                                    style={{ color: "var(--accent-blue)" }}
                                />
                            </div>
                        }
                        onExport={handleExport}
                        filterCount={statusFilter !== 'all' ? 1 : 0}
                        filter={
                            <div className="flex flex-col gap-2">
                                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Holat</p>
                                {([['all', 'Hammasi'], ['draft', 'Qoralama'], ['approved', 'Tasdiqlangan']] as const).map(([val, label]) => (
                                    <button key={val} type="button" onClick={() => setStatusFilter(val)}
                                        className="flex items-center justify-between px-3 py-2 rounded-lg text-[12px] font-bold transition-all"
                                        style={{
                                            background: statusFilter === val ? "var(--accent-blue-light)" : "var(--input-bg)",
                                            border: `1px solid ${statusFilter === val ? "var(--accent-blue)" : "var(--card-border)"}`,
                                            color: statusFilter === val ? "var(--accent-blue)" : "var(--text-secondary)",
                                        }}>
                                        {label}
                                        {statusFilter === val && <CheckCircle2 size={13} />}
                                    </button>
                                ))}
                            </div>
                        }
                    />
                </div>
            </div>

            {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {rows.map(({ s, draft, isApproved }) => {
                    return (
                        <div key={s.id} className="rounded-xl overflow-hidden flex flex-col transition-all"
                            style={{
                                background: "var(--card-bg)",
                                border: `1px solid ${isApproved ? "var(--success-border)" : "var(--card-border)"}`,
                                boxShadow: isApproved ? "0 0 0 1px var(--success-border)" : "var(--card-shadow)"
                            }}>
                            {/* Card Header */}
                            <div className="px-4 py-3 flex items-center justify-between"
                                style={{
                                    background: isApproved ? "var(--success-bg)" : "var(--table-header-bg)",
                                    borderBottom: "1px solid var(--card-border)"
                                }}>
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                                        style={{ background: `hsl(${(s.name.charCodeAt(0) * 37) % 360}, 60%, 50%)` }}>
                                        {s.name.charAt(0)}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-[13px] leading-none" style={{ color: "var(--text-primary)" }}>{s.name}</h4>
                                        <p className="text-[10px] mt-0.5 font-medium" style={{ color: "var(--text-muted)" }}>{s.role}</p>
                                    </div>
                                </div>
                                <div>
                                    {isApproved ? (
                                        <span className="c1-badge inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px]"
                                            style={{ background: "var(--success-bg)", color: "var(--success)", border: "1px solid var(--success-border)" }}>
                                            <CheckCircle2 size={11} /> Tasdiqlandi
                                        </span>
                                    ) : (
                                        <span className="c1-badge px-2.5 py-1 rounded-lg text-[10px]"
                                            style={{ background: "var(--warning-bg)", color: "var(--warning)", border: "1px solid var(--warning-border)" }}>
                                            Qoralama
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Card Body */}
                            <div className="p-3 flex-1 space-y-2">
                                {/* Asosiy Oylik */}
                                <button
                                    onClick={() => setDetailModal({ type: 'base', employeeId: s.id, employeeName: s.name })}
                                    className="w-full flex justify-between items-center px-3 py-2 rounded-lg text-[12px] transition-all group"
                                    style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)" }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent-blue)"; e.currentTarget.style.background = "var(--accent-blue-light)"; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--card-border)"; e.currentTarget.style.background = "var(--input-bg)"; }}
                                >
                                    <div className="flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
                                        <FileText size={13} />
                                        <span className="font-bold uppercase tracking-tight text-[11px]">Asosiy</span>
                                    </div>
                                    <span className="font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{formatNum(draft.baseSalary)}</span>
                                </button>

                                {/* KPI Bonus */}
                                <button
                                    onClick={() => setDetailModal({ type: 'bonus', employeeId: s.id, employeeName: s.name })}
                                    className="w-full flex justify-between items-center px-3 py-2 rounded-lg text-[12px] transition-opacity"
                                    style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)" }}
                                    onMouseEnter={e => e.currentTarget.style.opacity = "0.8"}
                                    onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                                >
                                    <div className="flex items-center gap-2" style={{ color: "var(--success)" }}>
                                        <TrendingUp size={13} />
                                        <span className="font-bold uppercase tracking-tight text-[11px]">Bonus</span>
                                    </div>
                                    <span className="font-bold tabular-nums" style={{ color: "var(--success)" }}>+{formatNum(draft.kpiBonus)}</span>
                                </button>

                                {/* KPI Jarima */}
                                <button
                                    onClick={() => setDetailModal({ type: 'penalty', employeeId: s.id, employeeName: s.name })}
                                    className="w-full flex justify-between items-center px-3 py-2 rounded-lg text-[12px] transition-opacity"
                                    style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}
                                    onMouseEnter={e => e.currentTarget.style.opacity = "0.8"}
                                    onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                                >
                                    <div className="flex items-center gap-2" style={{ color: "var(--danger)" }}>
                                        <TrendingDown size={13} />
                                        <span className="font-bold uppercase tracking-tight text-[11px]">Jarima</span>
                                    </div>
                                    <span className="font-bold tabular-nums" style={{ color: "var(--danger)" }}>{formatNum(draft.kpiPenalty)}</span>
                                </button>
                            </div>

                            {/* Card Footer */}
                            <div className="px-4 py-3 flex justify-between items-center"
                                style={{ borderTop: "1px solid var(--card-border)", background: "var(--table-header-bg)" }}>
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Jami To&apos;lov</span>
                                    <span className="text-[17px] font-black tabular-nums" style={{ color: "var(--text-primary)" }}>{formatNum(draft.totalSalary)}</span>
                                </div>
                                {isApproved ? (
                                    <div className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase cursor-not-allowed"
                                        style={{ background: "var(--input-bg)", color: "var(--text-muted)", border: "1px solid var(--card-border)" }}>
                                        Saqlangan
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => handleApprove(s.id)}
                                        disabled={savingId === s.id}
                                        className="c1-btn c1-btn-primary px-4 py-2 text-[10px] disabled:opacity-50"
                                    >
                                        {savingId === s.id ? '...' : (
                                            <><DollarSign size={11} />Tasdiqlash</>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            ) : (
            <div className="rounded-xl overflow-x-auto" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
                <table className="w-full text-left text-[12px] border-collapse min-w-[720px]">
                    <thead>
                        <tr style={{ background: "var(--table-header-bg)", borderBottom: "1px solid var(--card-border)" }}>
                            {["Xodim", "Asosiy", "Bonus", "Jarima", "Jami To'lov", "Holat", ""].map((h, i) => (
                                <th key={i} className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest ${i === 0 || i === 5 || i === 6 ? "text-left" : "text-right"}`}
                                    style={{ color: "var(--text-muted)" }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(({ s, draft, isApproved }) => (
                            <tr key={s.id} className="transition-colors"
                                style={{ borderBottom: "1px solid var(--card-border)", background: isApproved ? "var(--success-bg)" : "transparent" }}>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                                            style={{ background: `hsl(${(s.name.charCodeAt(0) * 37) % 360}, 60%, 50%)` }}>
                                            {s.name.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-bold text-[13px] leading-none" style={{ color: "var(--text-primary)" }}>{s.name}</p>
                                            <p className="text-[10px] mt-0.5 font-medium" style={{ color: "var(--text-muted)" }}>{s.role}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-right font-bold tabular-nums cursor-pointer hover:underline"
                                    style={{ color: "var(--text-primary)" }}
                                    onClick={() => setDetailModal({ type: 'base', employeeId: s.id, employeeName: s.name })}>
                                    {formatNum(draft.baseSalary)}
                                </td>
                                <td className="px-4 py-3 text-right font-bold tabular-nums cursor-pointer hover:underline"
                                    style={{ color: "var(--success)" }}
                                    onClick={() => setDetailModal({ type: 'bonus', employeeId: s.id, employeeName: s.name })}>
                                    +{formatNum(draft.kpiBonus)}
                                </td>
                                <td className="px-4 py-3 text-right font-bold tabular-nums cursor-pointer hover:underline"
                                    style={{ color: "var(--danger)" }}
                                    onClick={() => setDetailModal({ type: 'penalty', employeeId: s.id, employeeName: s.name })}>
                                    {formatNum(draft.kpiPenalty)}
                                </td>
                                <td className="px-4 py-3 text-right font-black tabular-nums text-[14px]" style={{ color: "var(--text-primary)" }}>
                                    {formatNum(draft.totalSalary)}
                                </td>
                                <td className="px-4 py-3">
                                    {isApproved ? (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold"
                                            style={{ background: "var(--success-bg)", color: "var(--success)", border: "1px solid var(--success-border)" }}>
                                            <CheckCircle2 size={11} /> Tasdiqlandi
                                        </span>
                                    ) : (
                                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold"
                                            style={{ background: "var(--warning-bg)", color: "var(--warning)", border: "1px solid var(--warning-border)" }}>
                                            Qoralama
                                        </span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    {isApproved ? (
                                        <span className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Saqlangan</span>
                                    ) : (
                                        <button onClick={() => handleApprove(s.id)} disabled={savingId === s.id}
                                            className="c1-btn c1-btn-primary px-3 py-1.5 text-[10px] disabled:opacity-50">
                                            {savingId === s.id ? '...' : (<><DollarSign size={11} />Tasdiqlash</>)}
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {rows.length === 0 && !loading && (
                    <div className="py-12 text-center text-[12px] font-bold" style={{ color: "var(--text-muted)" }}>Ma&apos;lumot yo&apos;q</div>
                )}
            </div>
            )}

            {loading && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                        style={{ borderColor: "var(--accent-blue)", borderTopColor: "transparent" }}></div>
                    <p className="text-[11px] font-bold uppercase tracking-widest animate-pulse" style={{ color: "var(--text-muted)" }}>Yuklanmoqda...</p>
                </div>
            )}

            {/* ── Detail Modal ── */}
            {detailModal && modalData && (
                <>
                    <div className="fixed inset-0 z-[200]" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} onClick={() => setDetailModal(null)}></div>
                    <div className="fixed inset-0 z-[201] flex items-center justify-center p-4">
                        <div
                            className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-in"
                            style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "0 25px 60px rgba(0,0,0,0.3)" }}
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div className="px-5 py-4 flex justify-between items-start"
                                style={{
                                    borderBottom: "1px solid var(--card-border)",
                                    background: detailModal.type === 'base' ? "var(--accent-blue-light)" : detailModal.type === 'bonus' ? "var(--success-bg)" : "var(--danger-bg)"
                                }}>
                                <div>
                                    <h3 className="text-[14px] font-bold uppercase tracking-widest flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                                        {detailModal.type === 'base' && <FileText size={16} style={{ color: "var(--accent-blue)" }} />}
                                        {detailModal.type === 'bonus' && <TrendingUp size={16} style={{ color: "var(--success)" }} />}
                                        {detailModal.type === 'penalty' && <TrendingDown size={16} style={{ color: "var(--danger)" }} />}
                                        {detailModal.type === 'base' && 'Asosiy Oylik Tafsiloti'}
                                        {detailModal.type === 'bonus' && 'KPI Bonus Tafsiloti'}
                                        {detailModal.type === 'penalty' && 'KPI Jarima Tafsiloti'}
                                    </h3>
                                    <p className="text-[11px] mt-1 font-medium" style={{ color: "var(--text-muted)" }}>
                                        {detailModal.employeeName} • {month}
                                    </p>
                                </div>
                                <button onClick={() => setDetailModal(null)}
                                    className="p-1.5 rounded-lg transition-all"
                                    style={{ color: "var(--text-muted)" }}
                                    onMouseEnter={e => { e.currentTarget.style.background = "var(--danger-bg)"; e.currentTarget.style.color = "var(--danger)"; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = "var(--text-muted)"; }}
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Total summary */}
                            <div className="px-6 py-3" style={{ borderBottom: "1px solid var(--card-border)", background: "var(--table-header-bg)" }}>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-xl font-black tabular-nums"
                                        style={{ color: detailModal.type === 'base' ? "var(--text-primary)" : detailModal.type === 'bonus' ? "var(--success)" : "var(--danger)" }}>
                                        {detailModal.type === 'base' && formatNum(drafts[detailModal.employeeId]?.baseSalary)}
                                        {detailModal.type === 'bonus' && `+${formatNum(drafts[detailModal.employeeId]?.kpiBonus)}`}
                                        {detailModal.type === 'penalty' && formatNum(drafts[detailModal.employeeId]?.kpiPenalty)}
                                    </span>
                                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>UZS (Jami)</span>
                                </div>
                            </div>

                            {/* Modal Body */}
                            <div className="flex-1 overflow-y-auto p-5" style={{ background: "var(--card-bg)" }}>
                                {detailModal.type === 'base' && (
                                    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--card-border)" }}>
                                        <table className="w-full text-left text-[11px] border-collapse">
                                            <thead>
                                                <tr style={{ background: "var(--table-header-bg)", borderBottom: "1px solid var(--table-border)" }}>
                                                    <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Korxona</th>
                                                    <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-center" style={{ color: "var(--text-muted)", borderLeft: "1px solid var(--table-border)" }}>Rol</th>
                                                    <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-right" style={{ color: "var(--text-muted)", borderLeft: "1px solid var(--table-border)" }}>Shartnoma</th>
                                                    <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-right" style={{ color: "var(--text-muted)", borderLeft: "1px solid var(--table-border)" }}>Summa</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {modalData.filter(b => b.baseAmount > 0).map((b, i) => (
                                                    <tr key={i} style={{ borderBottom: "1px solid var(--table-border)" }}
                                                        onMouseEnter={e => e.currentTarget.style.background = "var(--table-row-hover)"}
                                                        onMouseLeave={e => e.currentTarget.style.background = ""}>
                                                        <td className="px-3 py-2 font-bold text-[11px] uppercase" style={{ color: "var(--text-primary)" }}>{b.companyName}</td>
                                                        <td className="px-3 py-2 text-center" style={{ borderLeft: "1px solid var(--table-border)" }}>
                                                            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{b.role}</span>
                                                        </td>
                                                        <td className="px-3 py-2 text-right text-[11px] tabular-nums" style={{ color: "var(--text-secondary)", borderLeft: "1px solid var(--table-border)" }}>{formatNum(b.contractAmount)}</td>
                                                        <td className="px-3 py-2 text-right font-bold tabular-nums" style={{ color: "var(--text-primary)", borderLeft: "1px solid var(--table-border)" }}>{formatNum(b.baseAmount)}</td>
                                                    </tr>
                                                ))}
                                                {modalData.filter(b => b.baseAmount > 0).length === 0 && (
                                                    <tr><td colSpan={4} className="empty-state py-8" style={{ color: "var(--text-muted)" }}>Ma&apos;lumot topilmadi</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {detailModal.type === 'bonus' && (
                                    <div className="space-y-3">
                                        {modalData.filter(b => b.kpiBonus > 0).map((b, i) => (
                                            <div key={i} className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--success-border)" }}>
                                                <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: "var(--success-bg)", borderBottom: "1px solid var(--success-border)" }}>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[12px] font-bold uppercase" style={{ color: "var(--text-primary)" }}>{b.companyName}</span>
                                                        <span className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>({b.role})</span>
                                                    </div>
                                                    <span className="font-bold tabular-nums text-[12px]" style={{ color: "var(--success)" }}>+{formatNum(b.kpiBonus)}</span>
                                                </div>
                                                <div className="p-3 space-y-2" style={{ background: "var(--card-bg)" }}>
                                                    {b.details.filter(d => d.includes('KPI +') || d.includes('Auto KPI +') || d.includes('KPI Bonus')).map((d, j) => (
                                                        <div key={j} className="flex items-start gap-2 text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
                                                            <div className="w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "var(--success)", opacity: 0.9 }}>
                                                                <CheckCircle2 size={9} className="text-white" />
                                                            </div>
                                                            <span>{d.replace('✅', '').trim()}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                        {modalData.filter(b => b.kpiBonus > 0).length === 0 && (
                                            <div className="empty-state py-8">Bonuslar topilmadi</div>
                                        )}
                                    </div>
                                )}

                                {detailModal.type === 'penalty' && (
                                    <div className="space-y-3">
                                        {modalData.filter(b => b.kpiPenalty > 0).map((b, i) => (
                                            <div key={i} className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--danger-border)" }}>
                                                <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: "var(--danger-bg)", borderBottom: "1px solid var(--danger-border)" }}>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[12px] font-bold uppercase" style={{ color: "var(--text-primary)" }}>{b.companyName}</span>
                                                        <span className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>({b.role})</span>
                                                    </div>
                                                    <span className="font-bold tabular-nums text-[12px]" style={{ color: "var(--danger)" }}>-{formatNum(b.kpiPenalty)}</span>
                                                </div>
                                                <div className="p-3 space-y-2" style={{ background: "var(--card-bg)" }}>
                                                    {b.details.filter(d => d.includes('KPI -') || d.includes('Auto KPI -')).map((d, j) => (
                                                        <div key={j} className="flex items-start gap-2 text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
                                                            <div className="w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "var(--danger)", opacity: 0.9 }}>
                                                                <AlertCircle size={9} className="text-white" />
                                                            </div>
                                                            <span>{d.replace('❌', '').trim()}</span>
                                                        </div>
                                                    ))}
                                                    {b.details.filter(d => d.includes('KPI -') || d.includes('Auto KPI -')).length === 0 && (
                                                        <p className="text-[10px] italic" style={{ color: "var(--text-muted)" }}>Jarima sababi aniqlanmadi</p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                        {modalData.filter(b => b.kpiPenalty > 0).length === 0 && (
                                            <div className="empty-state py-8">Jarimalar topilmadi</div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="p-4 flex justify-end" style={{ borderTop: "1px solid var(--card-border)", background: "var(--table-header-bg)" }}>
                                <button onClick={() => setDetailModal(null)} className="btn-secondary px-6">
                                    Yopish
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default PayrollDrafts;
