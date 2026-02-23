import React, { useState, useEffect, useMemo } from 'react';
import { Staff, EmployeeSalarySummary, Language, Company, OperationEntry, PayrollAdjustment, MonthlyPerformance, KPIRule, CompanyKPIRule } from '../types';
import { upsertPayrollAdjustment, fetchPayrollAdjustments, fetchMonthlyPerformance, fetchKPIRules, fetchAllCompanyKPIRules } from '../lib/supabaseData';
import { calculateCompanySalaries } from '../lib/kpiLogic';
import { translations } from '../lib/translations';
import { Wallet, MinusCircle, PlusCircle, Save } from 'lucide-react';
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
    const [editingAdj, setEditingAdj] = useState<{ empId: string, type: 'bonus' | 'jarima' | 'avans', amount: number, reason: string } | null>(null);
    const [adjustmentsList, setAdjustmentsList] = useState<PayrollAdjustment[]>([]);
    const [performanceList, setPerformanceList] = useState<MonthlyPerformance[]>([]);
    const [kpiRules, setKpiRules] = useState<KPIRule[]>([]);
    const [companyOverrides, setCompanyOverrides] = useState<CompanyKPIRule[]>([]);

    const loadMonthlyData = async () => {
        try {
            const [adj, perf, rules, overrides] = await Promise.all([
                fetchPayrollAdjustments(month + '-01'),
                fetchMonthlyPerformance(month + '-01'),
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
        return staff.map(s => {
            const checkMonth = month; // Filter operations by this month if needed

            let totalBase = 0;
            let totalKpiBonus = 0;
            let totalKpiPenalty = 0;

            const sNameLower = s.name.trim().toLowerCase();

            const myCompanyIdsFromOps = new Set(
                operations
                    .filter(op => periodsEqual(op.period, checkMonth))
                    .filter(op =>
                        op.assigned_accountant_id === s.id ||
                        op.assigned_bank_manager_id === s.id ||
                        op.assigned_supervisor_id === s.id
                    )
                    .map(op => op.companyId)
            );

            const myCompanies = companies.filter(c =>
                c.accountantId === s.id ||
                c.bankClientId === s.id ||
                c.supervisorId === s.id ||
                myCompanyIdsFromOps.has(c.id) ||
                // Name-based fallback for staff without profile IDs
                (!c.bankClientId && c.bankClientName && c.bankClientName.trim().toLowerCase() === sNameLower) ||
                (!c.supervisorId && c.supervisorName && c.supervisorName.trim().toLowerCase() === sNameLower)
            );

            myCompanies.forEach(c => {
                const op = operations.find(o => o.companyId === c.id && periodsEqual(o.period, checkMonth));

                // Merge rules with company-specific overrides
                const mergedRules = kpiRules.map(r => {
                    const override = companyOverrides.find(o => o.companyId === c.id && o.ruleId === r.id);
                    if (override) {
                        return {
                            ...r,
                            rewardPercent: override.rewardPercent ?? r.rewardPercent,
                            penaltyPercent: override.penaltyPercent ?? r.penaltyPercent
                        };
                    }
                    return r;
                });

                const results = calculateCompanySalaries(c, op, performanceList, mergedRules);

                // Match by ID first, then by name as fallback
                results.filter(r =>
                    r.staffId === s.id ||
                    (r.staffName && r.staffName.trim().toLowerCase() === sNameLower)
                ).forEach(res => {
                    totalBase += res.baseAmount;

                    if (res.finalAmount < res.baseAmount) {
                        const diff = res.baseAmount - res.finalAmount;
                        totalKpiPenalty += diff;
                    } else if (res.finalAmount > res.baseAmount) {
                        totalKpiBonus += (res.finalAmount - res.baseAmount);
                    }
                });
            });

            // Adjustments logic
            const myAdj = adjustmentsList.filter(a => a.employeeId === s.id && a.month.startsWith(month)).reduce((sum, a) => sum + a.amount, 0);

            return {
                employeeId: s.id,
                employeeName: s.name,
                employeeRole: s.role,
                month,
                companyCount: myCompanies.length,
                baseSalary: totalBase,
                kpiBonus: totalKpiBonus,
                kpiPenalty: -totalKpiPenalty,
                adjustments: myAdj,
                totalSalary: totalBase - totalKpiPenalty + totalKpiBonus + myAdj,
                performanceDetails: []
            } as EmployeeSalarySummary;
        }).filter(s => s.companyCount > 0);
    }, [staff, companies, operations, month, adjustmentsList, performanceList, kpiRules, companyOverrides]);

    const handleAddAdjustment = async () => {
        if (!editingAdj) return;

        try {
            await upsertPayrollAdjustment({
                month: `${month}-01`,
                employeeId: editingAdj.empId,
                adjustmentType: editingAdj.type,
                amount: editingAdj.type === 'jarima' || editingAdj.type === 'avans' ? -Math.abs(editingAdj.amount) : Math.abs(editingAdj.amount),
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
        <div className="space-y-12 animate-fade-in pb-20">
            {/* Payroll Header */}
            <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-indigo-950 rounded-[3.5rem] p-12 text-white shadow-glass-lg group">
                <div className="absolute -top-10 -right-10 w-80 h-80 bg-emerald-500/10 rounded-full blur-[100px] animate-pulse"></div>
                <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-blue-500/10 rounded-full blur-[80px]"></div>
                <div className="absolute top-0 right-0 p-12 opacity-[0.05] group-hover:scale-110 group-hover:rotate-12 transition-all duration-700 pointer-events-none">
                    <Wallet size={200} />
                </div>

                <div className="relative z-10 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-10">
                    <div>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-glass">
                                <Wallet className="text-white" size={32} />
                            </div>
                            <h2 className="text-4xl md:text-5xl font-black tracking-tighter leading-tight premium-text-gradient">
                                Oylik Hisobot <span className="text-white/30">(Payroll)</span>
                            </h2>
                        </div>
                        <p className="text-sm font-black text-white/40 uppercase tracking-[0.3em]">
                            Financial Oversight & Salary Distribution
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-6 items-center w-full xl:w-auto">
                        <div className="relative w-full sm:w-auto">
                            <input
                                type="month"
                                value={month}
                                onChange={e => setMonth(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-[1.8rem] px-8 py-5 font-black text-white outline-none focus:bg-white/10 focus:border-white/20 transition-all appearance-none shadow-inner"
                            />
                        </div>
                        <div className="w-full sm:w-auto px-10 py-5 bg-emerald-500 text-white rounded-[1.8rem] flex flex-col items-center sm:items-start group/total shadow-glass-emerald border border-emerald-400/20">
                            <p className="text-[10px] font-black text-white/70 uppercase tracking-widest mb-1">Jami To'lov</p>
                            <p className="text-2xl font-black tabular-nums group-hover:scale-105 transition-transform">{summaries.reduce((a, b) => a + b.totalSalary, 0).toLocaleString()} <span className="text-xs opacity-70">UZS</span></p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Table Container */}
            <div className="liquid-glass-card rounded-[3.5rem] shadow-glass-lg border border-white/10 overflow-hidden relative group">
                <div className="absolute -top-40 -left-40 w-80 h-80 bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none group-hover:opacity-100 transition-opacity opacity-0"></div>

                <div className="overflow-x-auto scrollbar-none relative z-10">
                    <table className="w-full text-left border-collapse min-w-[1240px]">
                        <thead>
                            <tr className="bg-white/5 dark:bg-white/5 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 border-b border-white/10">
                                <th className="px-10 py-10 backdrop-blur-md">Xodim & Rol</th>
                                <th className="px-6 py-10 text-center border-l border-white/5 backdrop-blur-md">Stavka (Base)</th>
                                <th className="px-6 py-10 text-center border-l border-white/5 text-emerald-500 backdrop-blur-md">KPI Bonus</th>
                                <th className="px-6 py-10 text-center border-l border-white/5 text-rose-500 backdrop-blur-md">Jarima</th>
                                <th className="px-6 py-10 text-center border-l border-white/5 text-indigo-500 backdrop-blur-md">Qo'shimcha</th>
                                <th className="px-10 py-10 text-center border-l border-white/5 backdrop-blur-md">Jami To'lanadigan</th>
                                <th className="px-8 py-10 text-right backdrop-blur-md">Amallar</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {summaries.map(s => (
                                <tr key={s.employeeId} className="hover:bg-white/10 dark:hover:bg-white/5 transition-all duration-500 group/row">
                                    <td className="px-10 py-10">
                                        <div className="flex items-center gap-5">
                                            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center font-black text-2xl text-indigo-500 border border-indigo-500/20 shadow-glass group-hover/row:scale-110 transition-transform">
                                                {s.employeeName.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-black text-xl text-slate-800 dark:text-white mb-1 group-hover/row:text-indigo-500 transition-colors">{s.employeeName}</p>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{s.employeeRole}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-10 text-center border-l border-white/5 font-black text-xl text-slate-600 dark:text-slate-400 tabular-nums">
                                        {s.baseSalary.toLocaleString()}
                                    </td>
                                    <td className="px-6 py-10 text-center border-l border-white/5">
                                        <span className="font-black text-2xl text-emerald-500 tabular-nums">+{s.kpiBonus.toLocaleString()}</span>
                                    </td>
                                    <td className="px-6 py-10 text-center border-l border-white/5">
                                        <span className="font-black text-2xl text-rose-500 tabular-nums">{s.kpiPenalty.toLocaleString()}</span>
                                    </td>
                                    <td className="px-6 py-10 text-center border-l border-white/5">
                                        <span className={`font-black text-xl tabular-nums ${s.adjustments >= 0 ? 'text-indigo-500' : 'text-amber-500'}`}>
                                            {s.adjustments > 0 ? '+' : ''}{s.adjustments.toLocaleString()}
                                        </span>
                                    </td>
                                    <td className="px-10 py-10 border-l border-white/5 text-center">
                                        <div className="px-8 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-[1.5rem] inline-block font-black text-2xl tabular-nums shadow-glass-indigo dark:shadow-glass group-hover/row:scale-105 transition-transform duration-500">
                                            {s.totalSalary.toLocaleString()}
                                        </div>
                                    </td>
                                    <td className="px-8 py-10 text-right">
                                        <div className="flex gap-4 justify-end">
                                            <button
                                                onClick={() => setEditingAdj({ empId: s.employeeId, type: 'bonus', amount: 0, reason: '' })}
                                                className="w-12 h-12 flex items-center justify-center bg-emerald-500/10 text-emerald-500 rounded-xl hover:bg-emerald-500 hover:text-white transition-all shadow-sm border border-emerald-500/20 group/btn"
                                                title="Bonus qo'shish"
                                            >
                                                <PlusCircle size={22} className="group-hover/btn:rotate-90 transition-transform" />
                                            </button>
                                            <button
                                                onClick={() => setEditingAdj({ empId: s.employeeId, type: 'jarima', amount: 0, reason: '' })}
                                                className="w-12 h-12 flex items-center justify-center bg-rose-500/10 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all shadow-sm border border-rose-500/20 group/btn"
                                                title="Jarima yozish"
                                            >
                                                <MinusCircle size={22} className="group-hover/btn:-rotate-90 transition-transform" />
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
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl z-[100] flex items-center justify-center p-8 animate-fade-in">
                    <div className="liquid-glass-card w-full max-w-xl rounded-[3.5rem] p-12 shadow-glass-2xl border border-white/20 relative overflow-hidden">
                        <div className="absolute -top-20 -right-20 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl"></div>

                        <div className="relative z-10">
                            <h3 className="text-3xl font-black mb-10 tracking-tighter premium-text-gradient uppercase">
                                {editingAdj.type === 'bonus' ? 'Bonus belgilash' : editingAdj.type === 'jarima' ? 'Jarima yozish' : 'Avans berish'}
                            </h3>

                            <div className="space-y-8">
                                <div className="group">
                                    <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-3 block group-focus-within:text-indigo-500 transition-colors">Summa (UZS)</label>
                                    <input
                                        type="number"
                                        className="w-full bg-white/5 border border-white/10 focus:border-indigo-500/40 rounded-[1.8rem] px-8 py-5 font-black text-2xl text-slate-800 dark:text-white outline-none shadow-inner transition-all placeholder:text-slate-400"
                                        value={editingAdj.amount || ''}
                                        onChange={e => setEditingAdj({ ...editingAdj, amount: Number(e.target.value) })}
                                        placeholder="0"
                                    />
                                </div>

                                <div className="group">
                                    <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-3 block group-focus-within:text-indigo-500 transition-colors">Sabab / Izoh</label>
                                    <textarea
                                        className="w-full bg-white/5 border border-white/10 focus:border-indigo-500/40 rounded-[2rem] px-8 py-6 font-medium text-slate-800 dark:text-white outline-none min-h-[160px] shadow-inner transition-all placeholder:text-slate-400"
                                        value={editingAdj.reason}
                                        onChange={e => setEditingAdj({ ...editingAdj, reason: e.target.value })}
                                        placeholder="Tafsilotlarni kiriting..."
                                    />
                                </div>

                                <div className="flex gap-6 pt-6">
                                    <button
                                        onClick={() => setEditingAdj(null)}
                                        className="flex-1 py-6 text-slate-400 font-bold hover:text-slate-600 dark:hover:text-white transition-colors text-xs uppercase tracking-widest"
                                    >
                                        Bekor qilish
                                    </button>
                                    <button
                                        onClick={handleAddAdjustment}
                                        className="flex-[2] py-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-[2rem] font-black hover:scale-[1.02] active:scale-95 transition-all shadow-glass-indigo dark:shadow-glass flex items-center justify-center gap-4 text-xs uppercase tracking-[0.2em]"
                                    >
                                        <Save size={20} /> Saqlash (Confirm)
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PayrollTable;
