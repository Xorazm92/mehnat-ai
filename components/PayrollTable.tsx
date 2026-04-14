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
        <div className="space-y-4 animate-fade-in p-6 bg-gray-50 dark:bg-[#1A1D23] min-h-screen">
            {/* Payroll Header */}
            <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 p-4 rounded shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center border border-indigo-100 dark:border-indigo-800 text-indigo-600 shrink-0">
                        <Wallet size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight uppercase">
                            Oylik Hisobot
                        </h2>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">
                            Finans va Maosh
                        </p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 items-center">
                    <div className="bg-gray-50 dark:bg-[#1e2025] px-3 py-1.5 rounded border border-gray-200 dark:border-gray-700">
                        <input
                            type="month"
                            value={month}
                            onChange={e => setMonth(e.target.value)}
                            className="bg-transparent border-none font-bold text-sm text-gray-700 dark:text-gray-300 focus:ring-0 cursor-pointer p-0"
                        />
                    </div>
                    <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded border border-emerald-200 dark:border-emerald-800 flex flex-col">
                        <p className="text-[9px] font-bold uppercase tracking-widest mb-0.5">Jami To'lov</p>
                        <p className="text-lg font-bold tabular-nums leading-none">{summaries.reduce((a, b) => a + b.totalSalary, 0).toLocaleString()} <span className="text-[10px]">UZS</span></p>
                    </div>
                </div>
            </div>

            {/* Main Table Container */}
            <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 rounded shadow-sm overflow-hidden text-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[1000px]">
                        <thead>
                            <tr className="bg-gray-50 dark:bg-[#1e2025] text-[10px] font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200 dark:border-gray-700">
                                <th className="px-4 py-3">Xodim & Rol</th>
                                <th className="px-4 py-3 text-center border-l border-gray-200 dark:border-gray-700">Stavka</th>
                                <th className="px-4 py-3 text-center border-l border-gray-200 dark:border-gray-700 text-emerald-600">KPI Bonus</th>
                                <th className="px-4 py-3 text-center border-l border-gray-200 dark:border-gray-700 text-rose-600">Jarima</th>
                                <th className="px-4 py-3 text-center border-l border-gray-200 dark:border-gray-700 text-indigo-600">Qo'sh.</th>
                                <th className="px-4 py-3 text-center border-l border-gray-200 dark:border-gray-700 text-amber-600">Avans</th>
                                <th className="px-4 py-3 text-center border-l border-gray-200 dark:border-gray-700 text-emerald-600">Qolgan</th>
                                <th className="px-4 py-3 text-right border-l border-gray-200 dark:border-gray-700">Amallar</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {summaries.map(s => (
                                <tr key={s.employeeId} className="hover:bg-gray-50 dark:hover:bg-[#1e2025] transition-colors">
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col">
                                            <p className="font-bold text-sm text-gray-900 dark:text-gray-100">{s.employeeName}</p>
                                            <p className="text-[10px] font-bold text-gray-500 uppercase mt-0.5">{s.employeeRole}</p>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-center border-l border-gray-200 dark:border-gray-700 font-bold text-gray-800 dark:text-gray-200 tabular-nums">
                                        {s.baseSalary.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-center border-l border-gray-200 dark:border-gray-700">
                                        <span className="font-bold text-emerald-600 tabular-nums">+{s.kpiBonus.toLocaleString()}</span>
                                    </td>
                                    <td className="px-4 py-3 text-center border-l border-gray-200 dark:border-gray-700">
                                        <span className="font-bold text-rose-600 tabular-nums">{s.kpiPenalty.toLocaleString()}</span>
                                    </td>
                                    <td className="px-4 py-3 text-center border-l border-gray-200 dark:border-gray-700">
                                        <span className="font-bold text-indigo-600 tabular-nums">
                                            {s.manualBonuses > 0 ? '+' : ''}{s.manualBonuses.toLocaleString()}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center border-l border-gray-200 dark:border-gray-700">
                                        <span className="font-bold text-amber-600 tabular-nums">
                                            {s.totalReceived.toLocaleString()}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center border-l border-gray-200 dark:border-gray-700">
                                        <div className={`px-3 py-1 text-sm ${s.remainingBalance <= 0 ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800' : 'text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600'} rounded border inline-block font-bold tabular-nums`}>
                                            {s.remainingBalance.toLocaleString()}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex gap-2 justify-end">
                                            <button
                                                onClick={() => setEditingAdj({ empId: s.employeeId, type: 'avans', amount: 0, reason: '' })}
                                                className="px-3 h-8 flex items-center justify-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 rounded border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                                                title="Avans berish"
                                            >
                                                <HandCoins size={14} />
                                                <span className="text-[10px] font-bold uppercase hidden xl:inline">Avans</span>
                                            </button>
                                            <button
                                                onClick={() => setEditingAdj({ empId: s.employeeId, type: 'payment', amount: s.remainingBalance, reason: 'Maosh to\'lovi' })}
                                                className="px-3 h-8 flex items-center justify-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                                                title="Maosh to'lash"
                                            >
                                                <CheckCircle2 size={14} />
                                                <span className="text-[10px] font-bold uppercase hidden xl:inline">To'lash</span>
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
                <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={() => setEditingAdj(null)}>
                    <div className="bg-white dark:bg-[#22252B] w-full max-w-md rounded shadow-lg border border-gray-200 dark:border-gray-700" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white uppercase">
                                {editingAdj.type === 'bonus' ? 'Bonus belgilash' :
                                    editingAdj.type === 'jarima' ? 'Jarima yozish' :
                                        editingAdj.type === 'avans' ? 'Avans berish' : 'Maosh to\'lovi'}
                            </h3>
                        </div>

                        <div className="p-4 space-y-4">
                            <div>
                                <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">Summa (UZS)</label>
                                <input
                                    type="number"
                                    className="w-full bg-gray-50 dark:bg-[#1e2025] border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-indigo-500 transition-colors"
                                    value={editingAdj.amount || ''}
                                    onChange={e => setEditingAdj({ ...editingAdj, amount: Number(e.target.value) })}
                                    placeholder="0"
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">Sabab / Izoh</label>
                                <textarea
                                    className="w-full bg-gray-50 dark:bg-[#1e2025] border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-indigo-500 transition-colors min-h-[100px]"
                                    value={editingAdj.reason}
                                    onChange={e => setEditingAdj({ ...editingAdj, reason: e.target.value })}
                                    placeholder="Tafsilotlarni kiriting..."
                                />
                            </div>
                        </div>

                        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
                            <button
                                onClick={() => setEditingAdj(null)}
                                className="flex-1 py-2 text-gray-600 dark:text-gray-400 font-bold border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-[#1e2025] transition-colors text-[10px] uppercase tracking-widest"
                            >
                                Bekor qilish
                            </button>
                            <button
                                onClick={handleAddAdjustment}
                                className="flex-1 py-2 bg-indigo-600 text-white rounded font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest"
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
