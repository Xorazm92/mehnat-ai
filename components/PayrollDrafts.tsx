
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
        <div className="space-y-4 animate-fade-in p-4 bg-[#F0F2F5] dark:bg-[#1A1D23] min-h-screen">
            {/* Drafts Header */}
            <div className="bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] p-3 rounded-sm shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-sm bg-[#F2F7FF] dark:bg-[#1C2531] flex items-center justify-center border border-[#DEE2E6] dark:border-[#3A3D44] text-[#3366CC] shrink-0">
                        <DollarSign size={18} />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-gray-800 dark:text-white uppercase tracking-tight leading-none">
                            Oylik Xomcho't
                        </h2>
                        <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-1">
                            Qoralamalar (Drafts)
                        </p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 items-center">
                    {userRole === 'admin' && (
                        <div className="px-3 py-1 bg-[#EBFBF0] dark:bg-[#1C2F23] text-[#28A745] dark:text-[#34D058] rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] flex flex-col items-start min-w-[140px]">
                            <p className="text-[8px] font-bold uppercase tracking-widest mb-0.5 opacity-70">Super Admin (7%)</p>
                            <p className="text-sm font-bold tabular-nums leading-none">{superAdminCommission.toLocaleString()} <span className="text-[9px]">UZS</span></p>
                        </div>
                    )}
                    <div className="bg-[#F8F9FA] dark:bg-[#1e2025] px-2 py-1 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44]">
                        <input
                            type="month"
                            value={month}
                            onChange={(e) => setMonth(e.target.value)}
                            className="bg-transparent border-none font-bold text-xs text-gray-700 dark:text-gray-200 focus:ring-0 cursor-pointer p-0"
                        />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {staff.map(s => {
                    const draft = drafts[s.id];
                    if (!draft || draft.companyCount === 0) return null;
                    const isApproved = approvedSalaries.some(a => a.employeeId === s.id);

                    return (
                        <div key={s.id} className={`bg-white dark:bg-[#22252B] rounded-sm border ${isApproved ? 'border-[#28A745] dark:border-[#34D058]' : 'border-[#DEE2E6] dark:border-[#3A3D44]'} shadow-sm flex flex-col`}>
                            <div className={`px-3 py-2 border-b ${isApproved ? 'bg-[#EBFBF0] dark:bg-[#1C2F23] border-[#DEE2E6] dark:border-[#3A3D44]' : 'bg-[#F8F9FA] dark:bg-[#1e2025] border-[#DEE2E6] dark:border-[#3A3D44]'} flex items-center justify-between`}>
                                <div className="flex flex-col">
                                    <h4 className="font-bold text-[12px] text-gray-800 dark:text-gray-100 uppercase tracking-tight">{s.name}</h4>
                                    <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-0.5">{s.role}</p>
                                </div>
                                <div>
                                    {isApproved ? (
                                        <span className="px-2 py-0.5 bg-white dark:bg-black/20 text-[#28A745] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm text-[8px] font-bold uppercase flex items-center gap-1">
                                            <CheckCircle2 size={10} /> Tasdiqlandi
                                        </span>
                                    ) : (
                                        <span className="px-2 py-0.5 bg-[#FFF9EB] dark:bg-[#312B1C] text-[#FFC107] dark:text-[#FFD700] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm text-[8px] font-bold uppercase tracking-widest">
                                            Draft
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="p-3 flex-1 space-y-1.5">
                                {/* Asosiy Oylik */}
                                <button
                                    onClick={() => setDetailModal({ type: 'base', employeeId: s.id, employeeName: s.name })}
                                    className="w-full flex justify-between items-center px-3 py-1.5 bg-[#F8F9FA] dark:bg-[#1e2025] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm hover:bg-[#F2F7FF] dark:hover:bg-[#2A2D33] transition-colors text-[11px]"
                                >
                                    <div className="flex items-center gap-2 text-gray-500 uppercase tracking-tighter">
                                        <FileText size={12} />
                                        <span className="font-bold">Asosiy</span>
                                    </div>
                                    <span className="font-bold text-gray-800 dark:text-white tabular-nums">{draft.baseSalary.toLocaleString()}</span>
                                </button>

                                {/* KPI Bonus */}
                                <button
                                    onClick={() => setDetailModal({ type: 'bonus', employeeId: s.id, employeeName: s.name })}
                                    className="w-full flex justify-between items-center px-3 py-1.5 bg-[#EBFBF0] dark:bg-[#1C2F23] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm hover:opacity-80 transition-opacity text-[11px]"
                                >
                                    <div className="flex items-center gap-2 text-[#28A745]">
                                        <TrendingUp size={12} />
                                        <span className="font-bold uppercase tracking-tighter">Bonus</span>
                                    </div>
                                    <span className="font-bold text-[#28A745] tabular-nums">+{draft.kpiBonus.toLocaleString()}</span>
                                </button>

                                {/* KPI Jarima */}
                                <button
                                    onClick={() => setDetailModal({ type: 'penalty', employeeId: s.id, employeeName: s.name })}
                                    className="w-full flex justify-between items-center px-3 py-1.5 bg-[#FEEBF0] dark:bg-[#311C21] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm hover:opacity-80 transition-opacity text-[11px]"
                                >
                                    <div className="flex items-center gap-2 text-[#DC3545]">
                                        <TrendingDown size={12} />
                                        <span className="font-bold uppercase tracking-tighter">Jarima</span>
                                    </div>
                                    <span className="font-bold text-[#DC3545] tabular-nums">{draft.kpiPenalty.toLocaleString()}</span>
                                </button>
                            </div>

                            <div className="px-3 py-2 border-t border-[#DEE2E6] dark:border-[#3A3D44] bg-[#F8F9FA] dark:bg-[#1e2025] flex justify-between items-center">
                                <div className="flex flex-col">
                                    <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Jami To'lov</span>
                                    <span className="text-base font-bold text-gray-800 dark:text-white tabular-nums">{draft.totalSalary.toLocaleString()}</span>
                                </div>
                                {isApproved ? (
                                    <div className="px-3 py-1 bg-[#F1F3F5] dark:bg-[#2A2D33] text-gray-400 dark:text-gray-500 rounded-sm font-bold text-[9px] uppercase border border-[#DEE2E6] dark:border-[#3A3D44] cursor-not-allowed tracking-widest">
                                        Saqlangan
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => handleApprove(s.id)}
                                        disabled={savingId === s.id}
                                        className="c1-btn c1-btn-primary px-3 py-1.5 text-[9px] uppercase tracking-widest flex items-center gap-1.5"
                                    >
                                        {savingId === s.id ? '...' : (
                                            <>
                                                <DollarSign size={10} />
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
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <div className="w-5 h-5 border-2 border-[#3366CC] border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest animate-pulse">Yuklanmoqda...</p>
                </div>
            )}

            {/* ── Detail Modal ── */}
            {detailModal && modalData && (
                <>
                    <div className="fixed inset-0 bg-[#000]/60 z-[200] backdrop-blur-none" onClick={() => setDetailModal(null)}></div>
                    <div className="fixed inset-0 z-[201] flex items-center justify-center p-4">
                        <div
                            className="w-full max-w-2xl bg-white dark:bg-[#22252B] rounded-sm shadow-2xl border border-[#DEE2E6] dark:border-[#3A3D44] overflow-hidden flex flex-col max-h-[90vh]"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div className={`px-4 py-3 border-b border-[#DEE2E6] dark:border-[#3A3D44] flex justify-between items-start ${detailModal.type === 'base' ? 'bg-[#F2F7FF] dark:bg-[#1C2531]' : detailModal.type === 'bonus' ? 'bg-[#EBFBF0] dark:bg-[#1C2F23]' : 'bg-[#FEEBF0] dark:bg-[#311C21]'}`}>
                                <div>
                                    <h3 className="text-sm font-bold text-gray-800 dark:text-white uppercase tracking-widest flex items-center gap-2">
                                        {detailModal.type === 'base' && <FileText size={16} className="text-[#3366CC]" />}
                                        {detailModal.type === 'bonus' && <TrendingUp size={16} className="text-[#28A745]" />}
                                        {detailModal.type === 'penalty' && <TrendingDown size={16} className="text-[#DC3545]" />}
                                        {detailModal.type === 'base' && 'Asosiy Oylik Tafsiloti'}
                                        {detailModal.type === 'bonus' && 'KPI Bonus Tafsiloti'}
                                        {detailModal.type === 'penalty' && 'KPI Jarima Tafsiloti'}
                                    </h3>
                                    <p className="text-gray-400 text-[9px] font-bold uppercase tracking-widest mt-1">
                                        {detailModal.employeeName} • {month}
                                    </p>
                                </div>
                                <button onClick={() => setDetailModal(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Total summary */}
                            <div className="px-6 py-3 border-b border-[#DEE2E6] dark:border-[#3A3D44] bg-[#F8F9FA] dark:bg-[#1e2025]">
                                <div className="flex items-baseline gap-2">
                                    <span className={`text-xl font-bold tabular-nums ${detailModal.type === 'base' ? 'text-gray-800 dark:text-white' : detailModal.type === 'bonus' ? 'text-[#28A745]' : 'text-[#DC3545]'}`}>
                                        {detailModal.type === 'base' && drafts[detailModal.employeeId]?.baseSalary.toLocaleString()}
                                        {detailModal.type === 'bonus' && `+${drafts[detailModal.employeeId]?.kpiBonus.toLocaleString()}`}
                                        {detailModal.type === 'penalty' && drafts[detailModal.employeeId]?.kpiPenalty.toLocaleString()}
                                    </span>
                                    <span className="text-gray-400 text-[9px] font-bold uppercase tracking-widest">UZS (Jami)</span>
                                </div>
                            </div>

                            {/* Modal Body */}
                            <div className="flex-1 overflow-y-auto p-4 bg-white dark:bg-[#22252B]">
                                {detailModal.type === 'base' && (
                                    <div className="border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm overflow-hidden">
                                        <table className="w-full text-left text-[11px] border-collapse">
                                            <thead>
                                                <tr className="bg-[#F8F9FA] dark:bg-[#1e2025] text-[9px] font-bold text-gray-500 uppercase tracking-widest border-b border-[#DEE2E6] dark:border-[#3A3D44]">
                                                    <th className="px-3 py-1.5">Korxona</th>
                                                    <th className="px-3 py-1.5 text-center border-l border-[#DEE2E6] dark:border-[#3A3D44]">Rol</th>
                                                    <th className="px-3 py-1.5 text-right border-l border-[#DEE2E6] dark:border-[#3A3D44]">Shartnoma</th>
                                                    <th className="px-3 py-1.5 text-right border-l border-[#DEE2E6] dark:border-[#3A3D44]">Summa</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[#DEE2E6] dark:divide-[#3A3D44]">
                                                {modalData.filter(b => b.baseAmount > 0).map((b, i) => (
                                                    <tr key={i} className="hover:bg-[#F8F9FA] dark:hover:bg-[#1e2025]">
                                                        <td className="px-3 py-1.5 font-bold text-gray-800 dark:text-white text-[10px] uppercase">{b.companyName}</td>
                                                        <td className="px-3 py-1.5 text-center border-l border-[#DEE2E6] dark:border-[#3A3D44]">
                                                            <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">{b.role}</span>
                                                        </td>
                                                        <td className="px-3 py-1.5 text-right border-l border-[#DEE2E6] dark:border-[#3A3D44] text-[10px] text-gray-500 tabular-nums">
                                                            {b.contractAmount.toLocaleString()}
                                                        </td>
                                                        <td className="px-3 py-1.5 text-right border-l border-[#DEE2E6] dark:border-[#3A3D44] font-bold text-gray-800 dark:text-white tabular-nums">
                                                            {b.baseAmount.toLocaleString()}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {modalData.filter(b => b.baseAmount > 0).length === 0 && (
                                                    <tr>
                                                        <td colSpan={4} className="px-3 py-6 text-center text-gray-400 text-[10px] uppercase font-bold tracking-widest">Ma'lumot topilmadi</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {detailModal.type === 'bonus' && (
                                    <div className="space-y-2">
                                        {modalData.filter(b => b.kpiBonus > 0).map((b, i) => (
                                            <div key={i} className="border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm overflow-hidden bg-[#F8F9FA] dark:bg-[#1e2025]">
                                                <div className="px-3 py-1.5 bg-[#EBFBF0] dark:bg-[#1C2F23] flex items-center justify-between border-b border-[#DEE2E6] dark:border-[#3A3D44]">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[11px] font-bold text-gray-800 dark:text-white uppercase">{b.companyName}</span>
                                                        <span className="text-[8px] text-gray-400 font-bold uppercase">({b.role})</span>
                                                    </div>
                                                    <span className="font-bold text-[#28A745] tabular-nums text-[11px]">+{b.kpiBonus.toLocaleString()}</span>
                                                </div>
                                                <div className="p-3 space-y-1.5">
                                                    {b.details.filter(d => d.includes('KPI +') || d.includes('Auto KPI +') || d.includes('KPI Bonus')).map((d, j) => (
                                                        <div key={j} className="flex items-start gap-2 text-[10px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-tighter">
                                                            <div className="w-3 h-3 rounded-sm bg-[#28A745] flex items-center justify-center shrink-0 mt-0.5">
                                                                <CheckCircle2 size={8} className="text-white" />
                                                            </div>
                                                            <span>{d.replace('✅', '').trim()}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                        {modalData.filter(b => b.kpiBonus > 0).length === 0 && (
                                            <div className="text-center py-6 text-gray-400 text-[10px] font-bold uppercase tracking-widest">Bonuslar topilmadi</div>
                                        )}
                                    </div>
                                )}

                                {detailModal.type === 'penalty' && (
                                    <div className="space-y-2">
                                        {modalData.filter(b => b.kpiPenalty > 0).map((b, i) => (
                                            <div key={i} className="border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm overflow-hidden bg-[#F8F9FA] dark:bg-[#1e2025]">
                                                <div className="px-3 py-1.5 bg-[#FEEBF0] dark:bg-[#311C21] flex items-center justify-between border-b border-[#DEE2E6] dark:border-[#3A3D44]">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[11px] font-bold text-gray-800 dark:text-white uppercase">{b.companyName}</span>
                                                        <span className="text-[8px] text-gray-400 font-bold uppercase">({b.role})</span>
                                                    </div>
                                                    <span className="font-bold text-[#DC3545] tabular-nums text-[11px]">-{b.kpiPenalty.toLocaleString()}</span>
                                                </div>
                                                <div className="p-3 space-y-1.5">
                                                    {b.details.filter(d => d.includes('KPI -') || d.includes('Auto KPI -')).map((d, j) => (
                                                        <div key={j} className="flex items-start gap-2 text-[10px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-tighter">
                                                            <div className="w-3 h-3 rounded-sm bg-[#DC3545] flex items-center justify-center shrink-0 mt-0.5">
                                                                <AlertCircle size={8} className="text-white" />
                                                            </div>
                                                            <span>{d.replace('❌', '').trim()}</span>
                                                        </div>
                                                    ))}
                                                    {b.details.filter(d => d.includes('KPI -') || d.includes('Auto KPI -')).length === 0 && (
                                                        <p className="text-[8px] text-gray-400 italic uppercase">Jarima sababi aniqlanmadi</p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                        {modalData.filter(b => b.kpiPenalty > 0).length === 0 && (
                                            <div className="text-center py-6 text-gray-400 text-[10px] font-bold uppercase tracking-widest">Jarimalar topilmadi</div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="p-3 border-t border-[#DEE2E6] dark:border-[#3A3D44] bg-[#F8F9FA] dark:bg-[#1e2025] flex justify-end">
                                <button
                                    onClick={() => setDetailModal(null)}
                                    className="c1-btn c1-btn-secondary px-6 py-1.5 text-[10px] uppercase tracking-widest"
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
