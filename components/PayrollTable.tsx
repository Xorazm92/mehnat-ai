import React, { useState, useEffect, useMemo } from 'react';
import { Staff, EmployeeSalarySummary, Language, Company, OperationEntry, PayrollAdjustment, MonthlyPerformance, KPIRule, CompanyKPIRule } from '../types';
import { upsertPayrollAdjustment, fetchPayrollAdjustments, fetchMonthlyPerformance, fetchKPIRules, fetchAllCompanyKPIRules } from '../lib/supabaseData';
import { calculateCompanySalaries } from '../lib/kpiLogic';
import { translations } from '../lib/translations';
import { Wallet, MinusCircle, PlusCircle, Save, HandCoins, CheckCircle2 } from 'lucide-react';
import { periodsEqual } from '../lib/periods';

interface Props {
    staff: Staff[];
    companies: Company[];
    operations: OperationEntry[];
    lang: Language;
    currentUserId?: string;
    currentUserRole?: string;
}

const PayrollTable: React.FC<Props> = ({ staff, companies, operations, lang, currentUserId, currentUserRole }) => {
    const t = translations[lang];
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [editingAdj, setEditingAdj] = useState<{ empId: string, type: 'bonus' | 'jarima' | 'avans' | 'payment', amount: number, reason: string } | null>(null);
    const [adjustmentsList, setAdjustmentsList] = useState<PayrollAdjustment[]>([]);
    const [performanceList, setPerformanceList] = useState<MonthlyPerformance[]>([]);
    const [kpiRules, setKpiRules] = useState<KPIRule[]>([]);
    const [companyOverrides, setCompanyOverrides] = useState<CompanyKPIRule[]>([]);

    const loadMonthlyData = async () => {
        try {
            const adj = await fetchPayrollAdjustments(month + '-01');
            const perf = await fetchMonthlyPerformance(month + '-01');

            const [rules, overrides] = await Promise.all([
                fetchKPIRules(),
                fetchAllCompanyKPIRules()
            ]);

            setAdjustmentsList(adj);
            setPerformanceList(perf);
            setKpiRules(rules);
            setCompanyOverrides(overrides);
        } catch (e) {
            console.error("Error loading monthly data:", e);
        }
    };

    useEffect(() => {
        loadMonthlyData();
    }, [month]);

    const summaries = useMemo(() => {
        const checkMonth = month;

        // 1. Indexing & Pre-filtering (O(N))
        const opsByCompany = new Map<string, OperationEntry>();
        const staffInOps = new Map<string, Set<string>>();

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

        const adjustmentsByStaff = new Map<string, PayrollAdjustment[]>();
        adjustmentsList.forEach(a => {
            if (a.month.startsWith(month)) {
                const arr = adjustmentsByStaff.get(a.employeeId) || [];
                arr.push(a);
                adjustmentsByStaff.set(a.employeeId, arr);
            }
        });

        const staffCompaniesMap = new Map<string, Company[]>();
        const staffNameMap = new Map<string, Company[]>();

        companies.forEach(c => {
            const ids = [c.accountantId, c.bankClientId, c.supervisorId, c.chiefAccountantId].filter(Boolean) as string[];
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

        // 2. Optimized Calculation Loop
        return staff.map(s => {
            let totalBase = 0;
            let totalKpiBonus = 0;
            let totalKpiPenalty = 0;
            const sNameLower = s.name.trim().toLowerCase();

            const myCompaniesSet = new Set<Company>();
            (staffCompaniesMap.get(s.id) || []).forEach(c => myCompaniesSet.add(c));
            (staffNameMap.get(sNameLower) || []).forEach(c => {
                if ((!c.bankClientId && c.bankClientName?.trim().toLowerCase() === sNameLower) ||
                    (!c.supervisorId && c.supervisorName?.trim().toLowerCase() === sNameLower)) {
                    myCompaniesSet.add(c);
                }
            });

            opsByCompany.forEach((op, cid) => {
                if (staffInOps.get(cid)?.has(s.id)) {
                    const comp = companies.find(c => c.id === cid);
                    if (comp) myCompaniesSet.add(comp);
                }
            });

            myCompaniesSet.forEach(c => {
                const op = opsByCompany.get(c.id);
                const perf = perfsByCompany.get(c.id) || [];
                const cOverrides = overridesByCompany.get(c.id) || [];

                const mergedRules = kpiRules.map(r => {
                    const override = cOverrides.find(ov => ov.ruleId === r.id);
                    if (override) {
                        return { ...r, rewardPercent: override.rewardPercent ?? r.rewardPercent, penaltyPercent: override.penaltyPercent ?? r.penaltyPercent };
                    }
                    return r;
                });

                const results = calculateCompanySalaries(c, op, perf, mergedRules);

                results.filter(r =>
                    r.staffId === s.id || (r.staffName && r.staffName.trim().toLowerCase() === sNameLower)
                ).forEach(res => {
                    totalBase += res.baseAmount;
                    if (res.finalAmount < res.baseAmount) {
                        totalKpiPenalty += (res.baseAmount - res.finalAmount);
                    } else if (res.finalAmount > res.baseAmount) {
                        totalKpiBonus += (res.finalAmount - res.baseAmount);
                    }
                });
            });

            const employeeAdjustments = adjustmentsByStaff.get(s.id) || [];

            const totalReceived = employeeAdjustments
                .filter(a => a.adjustmentType === 'avans' || a.adjustmentType === 'jarima')
                .reduce((sum, a) => sum + a.amount, 0);

            const totalPaid = employeeAdjustments
                .filter(a => a.adjustmentType === 'payment')
                .reduce((sum, a) => sum + a.amount, 0);

            const manualBonuses = employeeAdjustments
                .filter(a => a.adjustmentType === 'bonus')
                .reduce((sum, a) => sum + a.amount, 0);

            const kpiSalary = totalBase - totalKpiPenalty + totalKpiBonus + manualBonuses;
            const remainingBalance = kpiSalary + totalReceived + totalPaid;

            return {
                employeeId: s.id,
                employeeName: s.name,
                employeeRole: s.role,
                month,
                companyCount: myCompaniesSet.size,
                baseSalary: totalBase,
                kpiBonus: totalKpiBonus,
                kpiPenalty: -totalKpiPenalty,
                adjustments: totalReceived + manualBonuses,
                totalSalary: kpiSalary,
                remainingBalance: remainingBalance,
                totalPaid: totalPaid,
                totalReceived: totalReceived,
                manualBonuses: manualBonuses,
                performanceDetails: []
            } as any;
        }).filter(s => s.companyCount > 0);
    }, [staff, companies, operations, month, adjustmentsList, performanceList, kpiRules, companyOverrides]);

    const handleAddAdjustment = async () => {
        if (!editingAdj) return;

        try {
            await upsertPayrollAdjustment({
                month: `${month}-01`,
                employeeId: editingAdj.empId,
                adjustmentType: editingAdj.type,
                amount: editingAdj.type === 'jarima' || editingAdj.type === 'avans' || editingAdj.type === 'payment' ? -Math.abs(editingAdj.amount) : Math.abs(editingAdj.amount),
                reason: editingAdj.reason,
                isApproved: true,
                approvedBy: currentUserId,
                approvedAt: new Date().toISOString(),
                createdBy: currentUserId
            });
            setEditingAdj(null);
            loadMonthlyData();
        } catch (e) {
            console.error(e);
            alert((e as any)?.message || 'Xatolik yuz berdi');
        }
    };

    return (
        <div className="space-y-4 animate-fade-in p-6 bg-[#F0F2F5] dark:bg-[#111318] min-h-screen">
            {/* Payroll Header */}
            <div className="bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] p-5 rounded-sm shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-colors">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-sm bg-[#3366CC] flex items-center justify-center text-white shadow-sm shrink-0">
                        <Wallet size={20} />
                    </div>
                    <div>
                        <h2 className="text-[14px] font-bold text-gray-800 dark:text-white leading-none uppercase tracking-wider">
                            Oylik Hisobot
                        </h2>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1.5 leading-none">
                            FINANS VA MAOSH TIZIMI
                        </p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 items-center">
                    <div className="bg-white dark:bg-[#1A1D23] px-3 py-1.5 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] shadow-sm">
                        <input
                            type="month"
                            value={month}
                            onChange={e => setMonth(e.target.value)}
                            className="bg-transparent border-none font-bold text-[11px] text-[#3366CC] focus:ring-0 cursor-pointer p-0 uppercase"
                        />
                    </div>
                    <div className="px-5 py-2.5 bg-[#EBFBF0] dark:bg-[#1A2321] text-emerald-600 rounded-sm border border-[#C3E6CB] dark:border-[#2D3D34] flex flex-col items-end shadow-sm">
                        <p className="text-[8px] font-black uppercase tracking-widest mb-1 opacity-70">JAMI TO'LOV</p>
                        <p className="text-[18px] font-bold tabular-nums leading-none">
                            {summaries.reduce((a, b) => a + b.totalSalary, 0).toLocaleString()} <span className="text-[10px] font-bold uppercase ml-0.5">sum</span>
                        </p>
                    </div>
                </div>
            </div>

            {/* Main Table Container */}
            <div className="bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm shadow-sm overflow-hidden transition-colors">
                <div className="overflow-x-auto scrollbar-hide">
                    <table className="w-full text-left border-collapse min-w-[1000px] c1-table">
                        <thead>
                            <tr className="bg-[#F8F9FA] dark:bg-[#1A1D23] text-[9px] font-bold uppercase tracking-widest text-gray-400 border-b border-[#DEE2E6] dark:border-[#3A3D44]">
                                <th className="px-5 py-3">Xodim & Rol</th>
                                <th className="px-5 py-3 text-center border-l border-[#F0F2F5] dark:border-[#1e2025]">Stavka</th>
                                <th className="px-5 py-3 text-center border-l border-[#F0F2F5] dark:border-[#1e2025] text-emerald-600">KPI Bonus</th>
                                <th className="px-5 py-3 text-center border-l border-[#F0F2F5] dark:border-[#1e2025] text-rose-600">Jarima</th>
                                <th className="px-5 py-3 text-center border-l border-[#F0F2F5] dark:border-[#1e2025] text-[#3366CC]">Qo'sh.</th>
                                <th className="px-5 py-3 text-center border-l border-[#F0F2F5] dark:border-[#1e2025] text-amber-600">Avans</th>
                                <th className="px-5 py-3 text-center border-l border-[#F0F2F5] dark:border-[#1e2025] text-emerald-600">Qolgan</th>
                                <th className="px-5 py-3 text-right border-l border-[#F0F2F5] dark:border-[#1e2025]">Amallar</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F0F2F5] dark:divide-[#1e2025]">
                            {summaries.map(s => (
                                <tr key={s.employeeId} className="hover:bg-[#EBF3FF] dark:hover:bg-[#1C2531] transition-all group">
                                    <td className="px-5 py-3">
                                        <div className="flex flex-col">
                                            <p className="font-bold text-[11px] text-gray-800 dark:text-white uppercase tracking-tight">{s.employeeName}</p>
                                            <p className="text-[8px] font-bold text-gray-400 uppercase mt-0.5 tracking-widest">{s.employeeRole}</p>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3 text-center border-l border-[#F0F2F5] dark:border-[#1e2025] font-bold text-gray-800 dark:text-white tabular-nums text-[11px]">
                                        {s.baseSalary.toLocaleString()}
                                    </td>
                                    <td className="px-5 py-3 text-center border-l border-[#F0F2F5] dark:border-[#1e2025]">
                                        <span className="font-bold text-emerald-600 tabular-nums text-[11px]">+{s.kpiBonus.toLocaleString()}</span>
                                    </td>
                                    <td className="px-5 py-3 text-center border-l border-[#F0F2F5] dark:border-[#1e2025]">
                                        <span className="font-bold text-rose-600 tabular-nums text-[11px]">{s.kpiPenalty.toLocaleString()}</span>
                                    </td>
                                    <td className="px-5 py-3 text-center border-l border-[#F0F2F5] dark:border-[#1e2025]">
                                        <span className="font-bold text-[#3366CC] tabular-nums text-[11px]">
                                            {s.manualBonuses > 0 ? '+' : ''}{s.manualBonuses.toLocaleString()}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-center border-l border-[#F0F2F5] dark:border-[#1e2025]">
                                        <span className="font-bold text-amber-600 tabular-nums text-[11px]">
                                            {s.totalReceived.toLocaleString()}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-center border-l border-[#F0F2F5] dark:border-[#1e2025]">
                                        <div className={`px-2 py-0.5 text-[11px] font-black border rounded-sm tabular-nums tracking-tight transition-colors ${s.remainingBalance <= 0
                                            ? 'bg-[#EBFBF0] text-emerald-600 border-[#C3E6CB] dark:bg-[#1A2321] dark:border-[#2D3D34]'
                                            : 'bg-[#F8F9FA] text-gray-800 border-[#DEE2E6] dark:bg-[#1A1D23] dark:border-[#3A3D44] dark:text-white'
                                            }`}>
                                            {s.remainingBalance.toLocaleString()}
                                        </div>
                                    </td>
                                    <td className="px-5 py-3 text-right">
                                        <div className="flex gap-1 justify-end opacity-20 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => setEditingAdj({ empId: s.employeeId, type: 'avans', amount: 0, reason: '' })}
                                                className="h-7 px-2.5 flex items-center justify-center gap-1.5 bg-amber-50 dark:bg-[#2B231A] text-amber-600 rounded-sm border border-amber-200 dark:border-[#423425] hover:bg-amber-100 transition-all font-bold group/btn"
                                                title="Avans berish"
                                            >
                                                <HandCoins size={12} />
                                                <span className="text-[8px] font-black uppercase tracking-widest hidden xl:inline">Avans</span>
                                            </button>
                                            <button
                                                onClick={() => setEditingAdj({ empId: s.employeeId, type: 'payment', amount: s.remainingBalance, reason: 'Maosh to\'lovi' })}
                                                className="h-7 px-2.5 flex items-center justify-center gap-1.5 bg-[#EBFBF0] dark:bg-[#1A2321] text-emerald-600 rounded-sm border border-[#C3E6CB] dark:border-[#2D3D34] hover:bg-[#D7F7E1] transition-all font-bold group/btn"
                                                title="Maosh to'lash"
                                            >
                                                <CheckCircle2 size={12} />
                                                <span className="text-[8px] font-black uppercase tracking-widest hidden xl:inline">To'lash</span>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Manual Adjustment Modal */}
            {editingAdj && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 transition-colors animate-fade-in" onClick={() => setEditingAdj(null)}>
                    <div className="bg-[#F0F2F5] dark:bg-[#111318] w-full max-w-md rounded-sm shadow-2xl border border-[#DEE2E6] dark:border-[#3A3D44] overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-3 border-b border-[#DEE2E6] dark:border-[#3A3D44] flex justify-between items-center bg-white dark:bg-[#1A1D23]">
                            <div>
                                <h3 className="text-[11px] font-bold text-gray-800 dark:text-white uppercase tracking-widest">
                                    {editingAdj.type === 'bonus' ? 'Bonus belgilash' :
                                        editingAdj.type === 'jarima' ? 'Jarima yozish' :
                                            editingAdj.type === 'avans' ? 'Avans berish' : 'Maosh to\'lovi'}
                                </h3>
                                <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">SOZLAMALARNI KIRITING</p>
                            </div>
                            <button onClick={() => setEditingAdj(null)} className="p-1 text-gray-400 hover:text-rose-500 transition-colors">
                                <PlusCircle size={18} className="rotate-45" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            <div className="space-y-1">
                                <label className="text-[8px] font-bold text-gray-400 uppercase tracking-widest block">Summa (sum)</label>
                                <input
                                    type="number"
                                    className="w-full bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm px-3 py-1.5 text-[11px] font-bold text-gray-800 dark:text-white outline-none focus:border-[#3366CC] shadow-sm uppercase tracking-tight"
                                    value={editingAdj.amount || ''}
                                    onChange={e => setEditingAdj({ ...editingAdj, amount: Number(e.target.value) })}
                                    placeholder="0"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[8px] font-bold text-gray-400 uppercase tracking-widest block">Sabab / Izoh</label>
                                <textarea
                                    className="w-full bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm px-3 py-1.5 text-[11px] font-bold text-gray-800 dark:text-white outline-none focus:border-[#3366CC] shadow-sm uppercase tracking-tight min-h-[100px]"
                                    value={editingAdj.reason}
                                    onChange={e => setEditingAdj({ ...editingAdj, reason: e.target.value })}
                                    placeholder="Tafsilotlarni kiriting..."
                                />
                            </div>
                        </div>

                        <div className="p-5 border-t border-[#DEE2E6] dark:border-[#3A3D44] flex gap-2.5">
                            <button
                                onClick={() => setEditingAdj(null)}
                                className="flex-1 px-4 py-2 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] font-bold text-[10px] text-gray-500 uppercase tracking-widest bg-white dark:bg-[#22252B] hover:bg-[#F8F9FA] transition-all"
                            >
                                Bekor qilish
                            </button>
                            <button
                                onClick={handleAddAdjustment}
                                className="flex-1 px-4 py-2 rounded-sm font-bold text-[10px] text-white bg-[#3366CC] hover:bg-[#2A52A3] transition-all shadow-sm flex items-center justify-center gap-2 uppercase tracking-widest"
                            >
                                <Save size={14} /> Saqlash
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PayrollTable;
