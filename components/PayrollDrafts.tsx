
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
        <div className="space-y-10 animate-fade-in pb-20">
            {/* Drafts Header */}
            <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-indigo-950 rounded-[3.5rem] p-12 text-white shadow-glass-lg group">
                <div className="absolute -top-10 -right-10 w-80 h-80 bg-emerald-500/10 rounded-full blur-[100px] animate-pulse"></div>
                <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-blue-500/10 rounded-full blur-[80px]"></div>
                <div className="absolute top-0 right-0 p-12 opacity-[0.05] group-hover:scale-110 group-hover:rotate-12 transition-all duration-700 pointer-events-none">
                    <DollarSign size={200} />
                </div>

                <div className="relative z-10 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-10">
                    <div className="flex items-center gap-6">
                        <div className="w-16 h-16 rounded-[1.8rem] bg-white/10 backdrop-blur-xl flex items-center justify-center border border-white/20 shadow-glass shrink-0">
                            <DollarSign className="text-white" size={36} />
                        </div>
                        <div>
                            <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter leading-none mb-2">
                                Oylik Xomcho't
                            </h2>
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.5em]">
                                DRAFTS & PREPARATIONS
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-6 items-center w-full xl:w-auto">
                        {userRole === 'admin' && (
                            <div className="w-full sm:w-auto px-8 py-5 bg-emerald-500/10 backdrop-blur-md border border-emerald-500/20 rounded-[1.8rem] flex flex-col items-center sm:items-start group/comm">
                                <p className="text-[10px] font-black text-emerald-400/70 uppercase tracking-widest mb-1">Super Admin (7%)</p>
                                <p className="text-2xl font-black text-emerald-400 tabular-nums group-hover:scale-105 transition-transform">{superAdminCommission.toLocaleString()} <span className="text-xs opacity-50">UZS</span></p>
                            </div>
                        )}
                        <div className="relative w-full sm:w-auto">
                            <input
                                type="month"
                                value={month}
                                onChange={(e) => setMonth(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-[1.8rem] px-8 py-5 font-black text-white outline-none focus:bg-white/10 focus:border-white/20 transition-all appearance-none shadow-inner"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {staff.map(s => {
                    const draft = drafts[s.id];
                    if (!draft || draft.companyCount === 0) return null;
                    const isApproved = approvedSalaries.some(a => a.employeeId === s.id);

                    return (
                        <div key={s.id} className={`liquid-glass-card p-10 rounded-[3.5rem] hover:shadow-glass-lg transition-all group border ${isApproved ? 'border-emerald-500/20' : 'border-white/10'} overflow-hidden relative`}>
                            <div className="absolute -right-10 -top-10 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-colors duration-700"></div>

                            <div className="flex items-center justify-between mb-10">
                                <div className="flex items-center gap-5">
                                    <div className="w-16 h-16 rounded-[1.5rem] bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white font-black text-2xl shadow-glass transform group-hover:scale-110 group-hover:rotate-6 transition-all duration-500">
                                        {s.name[0]}
                                    </div>
                                    <div>
                                        <h4 className="font-black text-xl text-slate-800 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{s.name}</h4>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">{s.role}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    {isApproved ? (
                                        <span className="px-4 py-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm flex items-center gap-1.5">
                                            <CheckCircle2 size={12} className="shrink-0" />
                                            Tasdiqlangan
                                        </span>
                                    ) : (
                                        <span className="px-4 py-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm">
                                            Draft
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-4">
                                {/* Asosiy Oylik — clickable */}
                                <button
                                    onClick={() => setDetailModal({ type: 'base', employeeId: s.id, employeeName: s.name })}
                                    className="w-full flex justify-between items-center p-5 bg-slate-50 dark:bg-white/5 rounded-[1.8rem] border border-transparent hover:border-indigo-500/20 hover:bg-indigo-500/5 transition-all cursor-pointer group/row active:scale-[0.98]"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-white dark:bg-white/10 flex items-center justify-center text-slate-400">
                                            <FileText size={16} />
                                        </div>
                                        <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Asosiy Oylik</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-black text-slate-800 dark:text-white tabular-nums">{draft.baseSalary.toLocaleString()} <span className="text-[10px] opacity-40 ml-1">UZS</span></span>
                                        <ChevronRight size={16} className="text-slate-300 group-hover/row:text-indigo-500 group-hover/row:translate-x-1 transition-all" />
                                    </div>
                                </button>

                                {/* KPI Bonus — clickable */}
                                <button
                                    onClick={() => setDetailModal({ type: 'bonus', employeeId: s.id, employeeName: s.name })}
                                    className="w-full flex justify-between items-center p-5 bg-emerald-500/5 dark:bg-emerald-500/10 rounded-[1.8rem] border border-transparent hover:border-emerald-500/20 transition-all cursor-pointer group/row active:scale-[0.98]"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-white dark:bg-white/10 flex items-center justify-center text-emerald-500">
                                            <CheckCircle2 size={16} />
                                        </div>
                                        <span className="text-xs font-black text-slate-500 uppercase tracking-widest">KPI Bonus</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-black text-emerald-500 tabular-nums">+{draft.kpiBonus.toLocaleString()} <span className="text-[10px] opacity-40 ml-1">UZS</span></span>
                                        <ChevronRight size={16} className="text-emerald-300 group-hover/row:text-emerald-500 group-hover/row:translate-x-1 transition-all" />
                                    </div>
                                </button>

                                {/* KPI Jarima — clickable */}
                                <button
                                    onClick={() => setDetailModal({ type: 'penalty', employeeId: s.id, employeeName: s.name })}
                                    className="w-full flex justify-between items-center p-5 bg-rose-500/5 dark:bg-rose-500/10 rounded-[1.8rem] border border-transparent hover:border-rose-500/20 transition-all cursor-pointer group/row active:scale-[0.98]"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-white dark:bg-white/10 flex items-center justify-center text-rose-500">
                                            <AlertCircle size={16} />
                                        </div>
                                        <span className="text-xs font-black text-slate-500 uppercase tracking-widest">KPI Jarima</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-black text-rose-500 tabular-nums">{draft.kpiPenalty.toLocaleString()} <span className="text-[10px] opacity-40 ml-1">UZS</span></span>
                                        <ChevronRight size={16} className="text-rose-300 group-hover/row:text-rose-500 group-hover/row:translate-x-1 transition-all" />
                                    </div>
                                </button>

                                <div className="pt-8 mt-6 border-t border-slate-100 dark:border-white/5 flex justify-between items-end">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Jami To'lov</p>
                                        <h3 className="text-3xl font-black text-indigo-600 dark:text-indigo-400 tracking-tighter tabular-nums">{draft.totalSalary.toLocaleString()} <span className="text-sm font-black text-slate-400 ml-1">UZS</span></h3>
                                    </div>
                                    {isApproved ? (
                                        <div className="px-8 py-5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-[1.5rem] font-black text-[11px] uppercase tracking-widest flex items-center gap-2 pointer-events-none">
                                            <CheckCircle2 size={16} className="shrink-0" />
                                            Saqlangan
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => handleApprove(s.id)}
                                            disabled={savingId === s.id}
                                            className="px-8 py-5 bg-slate-900 dark:bg-white/10 text-white rounded-[1.5rem] font-black text-[11px] uppercase tracking-widest hover:bg-indigo-600 dark:hover:bg-indigo-600 transition-all shadow-glass-lg active:scale-95 transform hover:-translate-y-1 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
                                        >
                                            {savingId === s.id && <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin shrink-0"></div>}
                                            {savingId === s.id ? 'Saqlanmoqda...' : 'Tasdiqlash'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {loading && (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] animate-pulse">Hisob-kitob amalga oshirilmoqda...</p>
                </div>
            )}

            {/* ── Detail Modal ── */}
            {detailModal && modalData && (
                <>
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[200] animate-fade-in" onClick={() => setDetailModal(null)}></div>
                    <div className="fixed inset-0 z-[201] flex items-start justify-center p-4 md:p-10 pt-20 overflow-y-auto scrollbar-hide" onClick={() => setDetailModal(null)}>
                        <div
                            className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl border border-white/20 dark:border-white/10 overflow-hidden mb-10"
                            onClick={e => e.stopPropagation()}
                            style={{ animation: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
                        >
                            {/* Modal Header */}
                            <div className={`p-8 md:p-10 border-b border-white/10 relative overflow-hidden ${detailModal.type === 'base' ? 'bg-gradient-to-br from-slate-800 to-indigo-900' :
                                detailModal.type === 'bonus' ? 'bg-gradient-to-br from-emerald-800 to-emerald-950' :
                                    'bg-gradient-to-br from-rose-800 to-rose-950'
                                }`}>
                                <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/5 rounded-full blur-3xl"></div>
                                <div className="flex justify-between items-center relative z-10">
                                    <div>
                                        <h3 className="text-2xl md:text-3xl font-black text-white tracking-tight mb-2">
                                            {detailModal.type === 'base' && '📋 Asosiy Oylik Tafsiloti'}
                                            {detailModal.type === 'bonus' && '✅ KPI Bonus Tafsiloti'}
                                            {detailModal.type === 'penalty' && '⚠️ KPI Jarima Tafsiloti'}
                                        </h3>
                                        <p className="text-white/50 text-sm font-black uppercase tracking-widest">
                                            {detailModal.employeeName} • {month}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setDetailModal(null)}
                                        className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl text-white transition-all active:scale-95"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>

                                {/* Total summary */}
                                <div className="mt-6 flex items-baseline gap-3 relative z-10">
                                    <span className="text-4xl font-black text-white tabular-nums">
                                        {detailModal.type === 'base' && drafts[detailModal.employeeId]?.baseSalary.toLocaleString()}
                                        {detailModal.type === 'bonus' && `+${drafts[detailModal.employeeId]?.kpiBonus.toLocaleString()}`}
                                        {detailModal.type === 'penalty' && drafts[detailModal.employeeId]?.kpiPenalty.toLocaleString()}
                                    </span>
                                    <span className="text-white/40 text-sm font-black uppercase">UZS</span>
                                </div>
                            </div>

                            {/* Modal Body */}
                            <div className="p-6 md:p-10 max-h-[60vh] overflow-y-auto scrollbar-hide">
                                {detailModal.type === 'base' && (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-12 gap-3 px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-white/5">
                                            <div className="col-span-5">Korxona</div>
                                            <div className="col-span-2">Rol</div>
                                            <div className="col-span-2 text-right">Shartnoma</div>
                                            <div className="col-span-3 text-right">Asosiy Oylik</div>
                                        </div>
                                        {modalData.filter(b => b.baseAmount > 0).map((b, i) => (
                                            <div key={i} className="grid grid-cols-12 gap-3 items-center px-4 py-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group/item">
                                                <div className="col-span-5 flex items-center gap-3 min-w-0">
                                                    <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 font-black text-[10px] shrink-0">
                                                        <Building2 size={14} />
                                                    </div>
                                                    <span className="text-sm font-bold text-slate-700 dark:text-white truncate" title={b.companyName}>{b.companyName}</span>
                                                </div>
                                                <div className="col-span-2">
                                                    <span className="text-[9px] font-black text-slate-400 uppercase px-2 py-1 bg-slate-100 dark:bg-white/5 rounded-lg">{b.role}</span>
                                                </div>
                                                <div className="col-span-2 text-right">
                                                    <span className="text-xs font-bold text-slate-400 tabular-nums">{b.contractAmount.toLocaleString()}</span>
                                                </div>
                                                <div className="col-span-3 text-right">
                                                    <span className="text-sm font-black text-slate-800 dark:text-white tabular-nums">{b.baseAmount.toLocaleString()}</span>
                                                    <span className="text-[9px] text-slate-400 ml-1">UZS</span>
                                                </div>
                                            </div>
                                        ))}
                                        {modalData.filter(b => b.baseAmount > 0).length === 0 && (
                                            <div className="text-center py-12 text-slate-300 dark:text-slate-600">
                                                <FileText size={40} className="mx-auto mb-3 opacity-30" />
                                                <p className="text-sm font-black uppercase tracking-widest">Ma'lumot yo'q</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {detailModal.type === 'bonus' && (
                                    <div className="space-y-4">
                                        {modalData.filter(b => b.kpiBonus > 0).map((b, i) => (
                                            <div key={i} className="p-5 rounded-2xl border border-emerald-500/10 bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors">
                                                <div className="flex items-center justify-between mb-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                                            <TrendingUp size={14} className="text-emerald-500" />
                                                        </div>
                                                        <div>
                                                            <span className="text-sm font-black text-slate-800 dark:text-white">{b.companyName}</span>
                                                            <span className="text-[9px] text-slate-400 font-black uppercase ml-2">{b.role}</span>
                                                        </div>
                                                    </div>
                                                    <span className="font-black text-emerald-500 tabular-nums text-lg">+{b.kpiBonus.toLocaleString()}</span>
                                                </div>
                                                <div className="space-y-1.5 pl-11">
                                                    {b.details.filter(d => d.includes('KPI +') || d.includes('Auto KPI +') || d.includes('KPI Bonus')).map((d, j) => (
                                                        <div key={j} className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                                            <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                                                            <span className="font-medium">{d}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                        {modalData.filter(b => b.kpiBonus > 0).length === 0 && (
                                            <div className="text-center py-12 text-slate-300 dark:text-slate-600">
                                                <CheckCircle2 size={40} className="mx-auto mb-3 opacity-30" />
                                                <p className="text-sm font-black uppercase tracking-widest">Bonus yo'q</p>
                                                <p className="text-xs text-slate-400 mt-2">Bu oyda KPI bonuslari hisoblanmagan</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {detailModal.type === 'penalty' && (
                                    <div className="space-y-4">
                                        {modalData.filter(b => b.kpiPenalty > 0).map((b, i) => (
                                            <div key={i} className="p-5 rounded-2xl border border-rose-500/10 bg-rose-500/5 hover:bg-rose-500/10 transition-colors">
                                                <div className="flex items-center justify-between mb-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-xl bg-rose-500/10 flex items-center justify-center">
                                                            <TrendingDown size={14} className="text-rose-500" />
                                                        </div>
                                                        <div>
                                                            <span className="text-sm font-black text-slate-800 dark:text-white">{b.companyName}</span>
                                                            <span className="text-[9px] text-slate-400 font-black uppercase ml-2">{b.role}</span>
                                                        </div>
                                                    </div>
                                                    <span className="font-black text-rose-500 tabular-nums text-lg">-{b.kpiPenalty.toLocaleString()}</span>
                                                </div>
                                                <div className="space-y-1.5 pl-11">
                                                    {b.details.filter(d => d.includes('KPI -') || d.includes('Auto KPI -')).map((d, j) => (
                                                        <div key={j} className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                                            <AlertCircle size={12} className="text-rose-400 shrink-0" />
                                                            <span className="font-medium">{d}</span>
                                                        </div>
                                                    ))}
                                                    {b.details.filter(d => d.includes('KPI -') || d.includes('Auto KPI -')).length === 0 && (
                                                        <p className="text-xs text-slate-400 italic">Jarima sabablari ko'rsatilmagan</p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                        {modalData.filter(b => b.kpiPenalty > 0).length === 0 && (
                                            <div className="text-center py-12 text-slate-300 dark:text-slate-600">
                                                <AlertCircle size={40} className="mx-auto mb-3 opacity-30" />
                                                <p className="text-sm font-black uppercase tracking-widest">Jarima yo'q</p>
                                                <p className="text-xs text-slate-400 mt-2">Bu oyda KPI jarimalari hisoblanmagan</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="p-6 md:p-8 border-t border-slate-100 dark:border-white/10 flex items-center justify-between bg-slate-50/50 dark:bg-white/5">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    {modalData.length} ta korxona • {month}
                                </p>
                                <button
                                    onClick={() => setDetailModal(null)}
                                    className="px-8 py-3 bg-slate-900 dark:bg-white/10 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-indigo-600 transition-all active:scale-95"
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
