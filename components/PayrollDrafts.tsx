
import React, { useState, useEffect, useMemo } from 'react';
import { Staff, Company, Language, EmployeeSalarySummary, OperationEntry, MonthlyPerformance, KPIRule, CompanyKPIRule, EmployeeSalary } from '../types';
import { fetchMonthlyPerformance, fetchKPIRules, fetchAllCompanyKPIRules, fetchEmployeeSalaries, saveEmployeeSalary } from '../lib/supabaseData';
import { calculateCompanySalaries, SalaryResult } from '../lib/kpiLogic';
import { translations } from '../lib/translations';
import { DollarSign, CheckCircle2, AlertCircle, FileText, ChevronRight, X, Building2, TrendingUp, TrendingDown } from 'lucide-react';
import { periodsEqual } from '../lib/periods';

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
    const t = translations[lang];
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
    const [performanceList, setPerformanceList] = useState<MonthlyPerformance[]>([]);
    const [kpiRules, setKpiRules] = useState<KPIRule[]>([]);
    const [companyOverrides, setCompanyOverrides] = useState<CompanyKPIRule[]>([]);
    const [approvedSalaries, setApprovedSalaries] = useState<EmployeeSalary[]>([]);
    const [loading, setLoading] = useState(false);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [detailModal, setDetailModal] = useState<DetailModal | null>(null);

    const superAdminCommission = useMemo(() => {
        const totalTurnover = companies.filter(c => c.isActive).reduce((acc, c) => acc + (c.contractAmount || 0), 0);
        return totalTurnover * 0.07;
    }, [companies]);

    // Calculate drafts with per-company breakdowns
    const drafts = useMemo(() => {
        const results: Record<string, DraftWithBreakdowns> = {};
        const checkMonth = month;

        // 1. Indexing & Pre-filtering (O(N))
        const opsByCompany = new Map<string, OperationEntry>();
        const staffInOps = new Map<string, Set<string>>(); // companyId -> Set of staff IDs found in operations

        operations.forEach(op => {
            if (periodsEqual(op.period, checkMonth)) {
                opsByCompany.set(op.companyId, op);

                const sids = new Set<string>();
                if (op.assigned_accountant_id) sids.add(op.assigned_accountant_id);
                if (op.assigned_bank_manager_id) sids.add(op.assigned_bank_manager_id);
                if (op.assigned_supervisor_id) sids.add(op.assigned_supervisor_id);
                staffInOps.set(op.companyId, sids);
            }
        });

        const perfsByCompany = new Map<string, MonthlyPerformance[]>();
        performanceList.forEach(p => {
            // Only approved KPI affects payroll. Backward compatible status check.
            if (!p.status || p.status === 'approved') {
                const arr = perfsByCompany.get(p.companyId) || [];
                arr.push(p);
                perfsByCompany.set(p.companyId, arr);
            }
        });

        const overridesByCompany = new Map<string, CompanyKPIRule[]>();
        companyOverrides.forEach(o => {
            const arr = overridesByCompany.get(o.companyId) || [];
            arr.push(o);
            overridesByCompany.set(o.companyId, arr);
        });

        // Index companies by staff assignment for faster lookup
        const staffCompaniesMap = new Map<string, Company[]>();
        const staffNameMap = new Map<string, Company[]>(); // For name-based fallbacks

        companies.forEach(c => {
            const ids = [c.accountantId, c.bankClientId, c.supervisorId].filter(Boolean) as string[];
            ids.forEach(id => {
                const arr = staffCompaniesMap.get(id) || [];
                arr.push(c);
                staffCompaniesMap.set(id, arr);
            });

            if (c.bankClientName) {
                const name = c.bankClientName.trim().toLowerCase();
                const arr = staffNameMap.get(name) || [];
                arr.push(c);
                staffNameMap.set(name, arr);
            }
            if (c.supervisorName) {
                const name = c.supervisorName.trim().toLowerCase();
                const arr = staffNameMap.get(name) || [];
                arr.push(c);
                staffNameMap.set(name, arr);
            }
        });

        // 2. Optimized Calculation Loop (O(N_staff * N_comp_per_staff))
        staff.forEach(s => {
            let totalBase = 0;
            let totalKpiBonus = 0;
            let totalKpiPenalty = 0;
            const companyBreakdowns: CompanyBreakdown[] = [];
            const sNameLower = s.name.trim().toLowerCase();

            // Collect all companies for this staff member (ID and Name matches)
            const myCompaniesSet = new Set<Company>();

            // Direct ID matches
            (staffCompaniesMap.get(s.id) || []).forEach(c => myCompaniesSet.add(c));

            // Name matches (fallbacks)
            (staffNameMap.get(sNameLower) || []).forEach(c => {
                if ((!c.bankClientId && c.bankClientName?.trim().toLowerCase() === sNameLower) ||
                    (!c.supervisorId && c.supervisorName?.trim().toLowerCase() === sNameLower)) {
                    myCompaniesSet.add(c);
                }
            });

            // Matches from operations assignment
            opsByCompany.forEach((op, cid) => {
                const sids = staffInOps.get(cid);
                if (sids?.has(s.id)) {
                    const comp = companies.find(c => c.id === cid);
                    if (comp) myCompaniesSet.add(comp);
                }
            });

            myCompaniesSet.forEach(c => {
                const op = opsByCompany.get(c.id);
                const perf = perfsByCompany.get(c.id) || [];
                const cOverrides = overridesByCompany.get(c.id) || [];

                // Fast rule merge
                const mergedRules = kpiRules.map(r => {
                    const override = cOverrides.find(o => o.ruleId === r.id);
                    if (override) {
                        return {
                            ...r,
                            rewardPercent: override.rewardPercent ?? r.rewardPercent,
                            penaltyPercent: override.penaltyPercent ?? r.penaltyPercent
                        };
                    }
                    return r;
                });

                const roleResults = calculateCompanySalaries(c, op, perf, mergedRules);

                roleResults.filter(r =>
                    r.staffId === s.id ||
                    (r.staffName && r.staffName.trim().toLowerCase() === sNameLower)
                ).forEach(res => {
                    const companyBonus = res.finalAmount > res.baseAmount ? (res.finalAmount - res.baseAmount) : 0;
                    const companyPenalty = res.finalAmount < res.baseAmount ? (res.baseAmount - res.finalAmount) : 0;

                    totalBase += res.baseAmount;
                    totalKpiBonus += companyBonus;
                    totalKpiPenalty += companyPenalty;

                    companyBreakdowns.push({
                        companyId: c.id,
                        companyName: c.name,
                        contractAmount: (op as any)?.contract_amount || c.contractAmount || 0,
                        role: res.role,
                        baseAmount: res.baseAmount,
                        kpiBonus: companyBonus,
                        kpiPenalty: companyPenalty,
                        details: res.details
                    });
                });
            });

            results[s.id] = {
                employeeId: s.id,
                employeeName: s.name,
                employeeRole: s.role,
                month,
                companyCount: myCompaniesSet.size,
                baseSalary: totalBase,
                kpiBonus: totalKpiBonus,
                kpiPenalty: -totalKpiPenalty,
                adjustments: 0,
                totalSalary: totalBase - totalKpiPenalty + totalKpiBonus,
                performanceDetails: performanceList.filter(p => p.employeeId === s.id),
                companyBreakdowns
            };
        });
        return results;
    }, [staff, companies, operations, month, performanceList, kpiRules, companyOverrides]);

    const loadPerformance = async () => {
        setLoading(true);
        try {
            const perf = await fetchMonthlyPerformance(`${month}-01`);

            const [rules, overrides] = await Promise.all([
                fetchKPIRules(),
                fetchAllCompanyKPIRules()
            ]);

            const approved = await fetchEmployeeSalaries(month);

            setPerformanceList(perf);
            setKpiRules(rules);
            setCompanyOverrides(overrides);
            setApprovedSalaries(approved);
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
            await saveEmployeeSalary({
                employeeId: draft.employeeId,
                month: draft.month,
                baseSalary: draft.baseSalary,
                kpiBonus: draft.kpiBonus,
                kpiPenalty: draft.kpiPenalty,
                totalSalary: draft.totalSalary,
                breakdown: draft.companyBreakdowns,
                isApproved: true,
                // approvedBy won't be set perfectly without context, but we will assume it is passed by UI if needed
            });
            // Refresh approved list
            const approved = await fetchEmployeeSalaries(month);
            setApprovedSalaries(approved);
        } catch (e) {
            console.error('Failed to approve', e);
        }
        setSavingId(null);
    };

    return (
        <div className="space-y-6 animate-fade-in p-6 bg-gray-50 dark:bg-[#1A1D23] min-h-screen">
            {/* Drafts Header */}
            <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 p-4 rounded shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center border border-indigo-100 dark:border-indigo-800 text-indigo-600 shrink-0">
                        <DollarSign size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight uppercase">
                            Oylik Xomcho't
                        </h2>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">
                            Qoralamalar (Drafts)
                        </p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 items-center">
                    {userRole === 'admin' && (
                        <div className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded border border-emerald-200 dark:border-emerald-800 flex flex-col items-start min-w-[140px]">
                            <p className="text-[9px] font-bold uppercase tracking-widest mb-0.5">Super Admin (7%)</p>
                            <p className="text-sm font-bold tabular-nums leading-none">{superAdminCommission.toLocaleString()} <span className="text-[10px]">UZS</span></p>
                        </div>
                    )}
                    <div className="bg-gray-50 dark:bg-[#1e2025] px-3 py-1.5 rounded border border-gray-200 dark:border-gray-700">
                        <input
                            type="month"
                            value={month}
                            onChange={(e) => setMonth(e.target.value)}
                            className="bg-transparent border-none font-bold text-sm text-gray-700 dark:text-gray-300 focus:ring-0 cursor-pointer p-0"
                        />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {staff.map(s => {
                    const draft = drafts[s.id];
                    if (!draft || draft.companyCount === 0) return null;
                    const isApproved = approvedSalaries.some(a => a.employeeId === s.id);

                    return (
                        <div key={s.id} className={`bg-white dark:bg-[#22252B] rounded border ${isApproved ? 'border-emerald-500 dark:border-emerald-600' : 'border-gray-200 dark:border-gray-700'} shadow-sm flex flex-col`}>
                            <div className={`p-4 border-b ${isApproved ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800' : 'bg-gray-50 dark:bg-[#1e2025] border-gray-200 dark:border-gray-700'} flex items-center justify-between`}>
                                <div className="flex flex-col">
                                    <h4 className="font-bold text-sm text-gray-900 dark:text-gray-100">{s.name}</h4>
                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-0.5">{s.role}</p>
                                </div>
                                <div>
                                    {isApproved ? (
                                        <span className="px-2 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded text-[9px] font-bold uppercase flex items-center gap-1">
                                            <CheckCircle2 size={10} /> Tasdiqlandi
                                        </span>
                                    ) : (
                                        <span className="px-2 py-1 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded text-[9px] font-bold uppercase">
                                            Draft
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="p-4 flex-1 space-y-2">
                                {/* Asosiy Oylik */}
                                <button
                                    onClick={() => setDetailModal({ type: 'base', employeeId: s.id, employeeName: s.name })}
                                    className="w-full flex justify-between items-center px-3 py-2 bg-gray-50 dark:bg-[#1e2025] border border-gray-200 dark:border-gray-700 rounded hover:border-indigo-400 transition-colors text-sm"
                                >
                                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                        <FileText size={14} />
                                        <span className="text-xs font-bold uppercase">Asosiy</span>
                                    </div>
                                    <span className="font-bold text-gray-900 dark:text-white tabular-nums">{draft.baseSalary.toLocaleString()}</span>
                                </button>

                                {/* KPI Bonus */}
                                <button
                                    onClick={() => setDetailModal({ type: 'bonus', employeeId: s.id, employeeName: s.name })}
                                    className="w-full flex justify-between items-center px-3 py-2 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/30 rounded hover:border-emerald-400 transition-colors text-sm"
                                >
                                    <div className="flex items-center gap-2 text-emerald-600">
                                        <TrendingUp size={14} />
                                        <span className="text-xs font-bold uppercase">Bonus</span>
                                    </div>
                                    <span className="font-bold text-emerald-600 tabular-nums">+{draft.kpiBonus.toLocaleString()}</span>
                                </button>

                                {/* KPI Jarima */}
                                <button
                                    onClick={() => setDetailModal({ type: 'penalty', employeeId: s.id, employeeName: s.name })}
                                    className="w-full flex justify-between items-center px-3 py-2 bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800/30 rounded hover:border-rose-400 transition-colors text-sm"
                                >
                                    <div className="flex items-center gap-2 text-rose-600">
                                        <TrendingDown size={14} />
                                        <span className="text-xs font-bold uppercase">Jarima</span>
                                    </div>
                                    <span className="font-bold text-rose-600 tabular-nums">{draft.kpiPenalty.toLocaleString()}</span>
                                </button>
                            </div>

                            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1e2025] flex justify-between items-center">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-gray-500 uppercase">Jami To'lov</span>
                                    <span className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{draft.totalSalary.toLocaleString()}</span>
                                </div>
                                {isApproved ? (
                                    <div className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded font-bold text-[10px] uppercase border border-gray-300 dark:border-gray-600 cursor-not-allowed">
                                        Saqlangan
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => handleApprove(s.id)}
                                        disabled={savingId === s.id}
                                        className="px-3 py-1.5 bg-indigo-600 text-white rounded font-bold text-[10px] uppercase hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 shadow-sm"
                                    >
                                        {savingId === s.id ? '...' : (
                                            <>
                                                <DollarSign size={12} />
                                                Tasdiqlash
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {loading && (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                    <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest animate-pulse">Yuklanmoqda...</p>
                </div>
            )}

            {/* ── Detail Modal ── */}
            {detailModal && modalData && (
                <>
                    <div className="fixed inset-0 bg-black/60 z-[200] animate-fade-in" onClick={() => setDetailModal(null)}></div>
                    <div className="fixed inset-0 z-[201] flex items-center justify-center p-4" onClick={() => setDetailModal(null)}>
                        <div
                            className="w-full max-w-2xl bg-white dark:bg-[#22252B] rounded shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col max-h-[90vh]"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div className={`p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-start ${detailModal.type === 'base' ? 'bg-indigo-50 dark:bg-indigo-900/10' : detailModal.type === 'bonus' ? 'bg-emerald-50 dark:bg-emerald-900/10' : 'bg-rose-50 dark:bg-rose-900/10'}`}>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                                        {detailModal.type === 'base' && <FileText size={18} className="text-indigo-600" />}
                                        {detailModal.type === 'bonus' && <TrendingUp size={18} className="text-emerald-600" />}
                                        {detailModal.type === 'penalty' && <TrendingDown size={18} className="text-rose-600" />}
                                        {detailModal.type === 'base' && 'Asosiy Oylik Tafsiloti'}
                                        {detailModal.type === 'bonus' && 'KPI Bonus Tafsiloti'}
                                        {detailModal.type === 'penalty' && 'KPI Jarima Tafsiloti'}
                                    </h3>
                                    <p className="text-gray-500 text-[10px] font-bold uppercase mt-1">
                                        {detailModal.employeeName} • {month}
                                    </p>
                                </div>
                                <button onClick={() => setDetailModal(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Total summary */}
                            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1e2025]">
                                <div className="flex items-baseline gap-2">
                                    <span className={`text-2xl font-bold tabular-nums ${detailModal.type === 'base' ? 'text-gray-900 dark:text-white' : detailModal.type === 'bonus' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {detailModal.type === 'base' && drafts[detailModal.employeeId]?.baseSalary.toLocaleString()}
                                        {detailModal.type === 'bonus' && `+${drafts[detailModal.employeeId]?.kpiBonus.toLocaleString()}`}
                                        {detailModal.type === 'penalty' && drafts[detailModal.employeeId]?.kpiPenalty.toLocaleString()}
                                    </span>
                                    <span className="text-gray-500 text-[10px] font-bold uppercase">UZS (Jami)</span>
                                </div>
                            </div>

                            {/* Modal Body */}
                            <div className="flex-1 overflow-y-auto p-4 bg-white dark:bg-[#22252B]">
                                {detailModal.type === 'base' && (
                                    <div className="border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
                                        <table className="w-full text-left text-sm border-collapse">
                                            <thead>
                                                <tr className="bg-gray-50 dark:bg-[#1e2025] text-[9px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-200 dark:border-gray-700">
                                                    <th className="px-3 py-2">Korxona</th>
                                                    <th className="px-3 py-2 text-center border-l border-gray-200 dark:border-gray-700">Rol</th>
                                                    <th className="px-3 py-2 text-right border-l border-gray-200 dark:border-gray-700">Shartnoma</th>
                                                    <th className="px-3 py-2 text-right border-l border-gray-200 dark:border-gray-700">Summa</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                {modalData.filter(b => b.baseAmount > 0).map((b, i) => (
                                                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-[#1e2025]">
                                                        <td className="px-3 py-2 font-bold text-gray-900 dark:text-white text-xs">{b.companyName}</td>
                                                        <td className="px-3 py-2 text-center border-l border-gray-200 dark:border-gray-700">
                                                            <span className="text-[9px] font-bold text-gray-500 uppercase">{b.role}</span>
                                                        </td>
                                                        <td className="px-3 py-2 text-right border-l border-gray-200 dark:border-gray-700 text-xs text-gray-500 tabular-nums">
                                                            {b.contractAmount.toLocaleString()}
                                                        </td>
                                                        <td className="px-3 py-2 text-right border-l border-gray-200 dark:border-gray-700 font-bold text-gray-900 dark:text-white tabular-nums">
                                                            {b.baseAmount.toLocaleString()}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {modalData.filter(b => b.baseAmount > 0).length === 0 && (
                                                    <tr>
                                                        <td colSpan={4} className="px-3 py-6 text-center text-gray-500 text-xs italic">Ma'lumot topilmadi</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {detailModal.type === 'bonus' && (
                                    <div className="space-y-3">
                                        {modalData.filter(b => b.kpiBonus > 0).map((b, i) => (
                                            <div key={i} className="border border-emerald-200 dark:border-emerald-800/30 rounded overflow-hidden">
                                                <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-900/10 flex items-center justify-between border-b border-emerald-100 dark:border-emerald-800/20">
                                                    <div>
                                                        <span className="text-sm font-bold text-gray-900 dark:text-white">{b.companyName}</span>
                                                        <span className="text-[9px] text-gray-500 font-bold uppercase ml-2">({b.role})</span>
                                                    </div>
                                                    <span className="font-bold text-emerald-600 tabular-nums text-sm">+{b.kpiBonus.toLocaleString()}</span>
                                                </div>
                                                <div className="px-3 py-2 space-y-1 bg-white dark:bg-[#22252B]">
                                                    {b.details.filter(d => d.includes('KPI +') || d.includes('Auto KPI +') || d.includes('KPI Bonus')).map((d, j) => (
                                                        <div key={j} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                                                            <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                                                            <span>{d.replace('✅', '').trim()}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                        {modalData.filter(b => b.kpiBonus > 0).length === 0 && (
                                            <div className="text-center py-6 text-gray-500 text-xs italic">Bonuslar topilmadi</div>
                                        )}
                                    </div>
                                )}

                                {detailModal.type === 'penalty' && (
                                    <div className="space-y-3">
                                        {modalData.filter(b => b.kpiPenalty > 0).map((b, i) => (
                                            <div key={i} className="border border-rose-200 dark:border-rose-800/30 rounded overflow-hidden">
                                                <div className="px-3 py-2 bg-rose-50 dark:bg-rose-900/10 flex items-center justify-between border-b border-rose-100 dark:border-rose-800/20">
                                                    <div>
                                                        <span className="text-sm font-bold text-gray-900 dark:text-white">{b.companyName}</span>
                                                        <span className="text-[9px] text-gray-500 font-bold uppercase ml-2">({b.role})</span>
                                                    </div>
                                                    <span className="font-bold text-rose-600 tabular-nums text-sm">-{b.kpiPenalty.toLocaleString()}</span>
                                                </div>
                                                <div className="px-3 py-2 space-y-1 bg-white dark:bg-[#22252B]">
                                                    {b.details.filter(d => d.includes('KPI -') || d.includes('Auto KPI -')).map((d, j) => (
                                                        <div key={j} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                                                            <AlertCircle size={12} className="text-rose-500 shrink-0" />
                                                            <span>{d.replace('❌', '').trim()}</span>
                                                        </div>
                                                    ))}
                                                    {b.details.filter(d => d.includes('KPI -') || d.includes('Auto KPI -')).length === 0 && (
                                                        <p className="text-[10px] text-gray-400 italic">Jarima sababi aniqlanmadi</p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                        {modalData.filter(b => b.kpiPenalty > 0).length === 0 && (
                                            <div className="text-center py-6 text-gray-500 text-xs italic">Jarimalar topilmadi</div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1e2025] flex justify-end">
                                <button
                                    onClick={() => setDetailModal(null)}
                                    className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded font-bold text-xs uppercase hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                                >
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
