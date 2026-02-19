import React, { useState, useEffect, useMemo } from 'react';
import { Staff, EmployeeSalarySummary, Language, Company, OperationEntry, PayrollAdjustment, MonthlyPerformance, KPIRule, CompanyKPIRule } from '../types';
import { upsertPayrollAdjustment, fetchPayrollAdjustments, fetchMonthlyPerformance, fetchKPIRules, fetchAllCompanyKPIRules } from '../lib/supabaseData';
import { calculateCompanySalaries } from '../lib/kpiLogic';
import { translations } from '../lib/translations';
import { Wallet, MinusCircle, PlusCircle, Save } from 'lucide-react';

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

            const myCompanies = companies.filter(c =>
                c.accountantId === s.id ||
                c.bankClientId === s.id ||
                c.supervisorId === s.id ||
                // Name-based fallback for staff without profile IDs
                (!c.bankClientId && c.bankClientName && c.bankClientName.trim().toLowerCase() === sNameLower) ||
                (!c.supervisorId && c.supervisorName && c.supervisorName.trim().toLowerCase() === sNameLower)
            );

            myCompanies.forEach(c => {
                const op = operations.find(o => o.companyId === c.id && o.period === checkMonth);

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
        <div className="space-y-8 animate-fade-in">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-black text-slate-800 dark:text-white">Oylik Hisobot (Payroll)</h2>
                <div className="flex items-center gap-4">
                    <input
                        type="month"
                        value={month}
                        onChange={e => setMonth(e.target.value)}
                        className="bg-white dark:bg-apple-darkBg border border-apple-border rounded-xl px-4 py-3 font-bold text-sm shadow-sm"
                    />
                    <div className="bg-slate-900 text-white px-6 py-3 rounded-xl font-black shadow-lg">
                        Jami: {summaries.reduce((a, b) => a + b.totalSalary, 0).toLocaleString()} UZS
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-apple-darkCard rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder overflow-hidden shadow-xl">
                <div className="overflow-x-auto scrollbar-thin">
                    <table className="w-full text-left border-collapse min-w-[1000px]">
                        <thead>
                            <tr className="bg-slate-50/50 dark:bg-white/5 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b dark:border-apple-darkBorder">
                                <th className="px-8 py-6">Xodim</th>
                                <th className="px-6 py-6 border-l dark:border-apple-darkBorder">Stavka (Base)</th>
                                <th className="px-6 py-6 border-l dark:border-apple-darkBorder text-emerald-500">KPI Bonus</th>
                                <th className="px-6 py-6 border-l dark:border-apple-darkBorder text-rose-500">Jarima</th>
                                <th className="px-6 py-6 border-l dark:border-apple-darkBorder text-blue-500">Qo'shimcha</th>
                                <th className="px-8 py-6 border-l dark:border-apple-darkBorder">Jami To'lanadigan</th>
                                <th className="px-6 py-6"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-apple-border dark:divide-apple-darkBorder">
                            {summaries.map(s => (
                                <tr key={s.employeeId} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
                                    <td className="px-8 py-6">
                                        <div>
                                            <p className="font-extrabold text-slate-800 dark:text-white text-base">{s.employeeName}</p>
                                            <p className="text-[10px] font-black text-slate-400 uppercase">{s.employeeRole}</p>
                                        </div>
                                    </td>
                                    <td className="px-6 py-6 border-l dark:border-apple-darkBorder">
                                        <span className="font-bold text-slate-600 dark:text-slate-300 tabular-nums">{s.baseSalary.toLocaleString()}</span>
                                    </td>
                                    <td className="px-6 py-6 border-l dark:border-apple-darkBorder">
                                        <span className="font-black text-emerald-500 tabular-nums">+{s.kpiBonus.toLocaleString()}</span>
                                    </td>
                                    <td className="px-6 py-6 border-l dark:border-apple-darkBorder">
                                        <span className="font-black text-rose-500 tabular-nums">{s.kpiPenalty.toLocaleString()}</span>
                                    </td>
                                    <td className="px-6 py-6 border-l dark:border-apple-darkBorder">
                                        <span className={`font-bold tabular-nums ${s.adjustments >= 0 ? 'text-blue-500' : 'text-orange-500'}`}>
                                            {s.adjustments > 0 ? '+' : ''}{s.adjustments.toLocaleString()}
                                        </span>
                                    </td>
                                    <td className="px-8 py-6 border-l dark:border-apple-darkBorder">
                                        <div className="px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl inline-block font-black tabular-nums shadow-lg">
                                            {s.totalSalary.toLocaleString()}
                                        </div>
                                    </td>
                                    <td className="px-6 py-6 text-right">
                                        <div className="flex gap-2 justify-end">
                                            <button
                                                onClick={() => setEditingAdj({ empId: s.employeeId, type: 'bonus', amount: 0, reason: '' })}
                                                className="p-2 bg-emerald-50 text-emerald-500 rounded-lg hover:bg-emerald-500 hover:text-white transition-all"
                                                title="Bonus qo'shish"
                                            >
                                                <PlusCircle size={18} />
                                            </button>
                                            <button
                                                onClick={() => setEditingAdj({ empId: s.employeeId, type: 'jarima', amount: 0, reason: '' })}
                                                className="p-2 bg-rose-50 text-rose-500 rounded-lg hover:bg-rose-500 hover:text-white transition-all"
                                                title="Jarima yozish"
                                            >
                                                <MinusCircle size={18} />
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
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white dark:bg-apple-darkCard w-full max-w-md rounded-[2rem] p-8 shadow-2xl border border-apple-border dark:border-apple-darkBorder">
                        <h3 className="text-xl font-black mb-6">
                            {editingAdj.type === 'bonus' ? 'Bonus belgilash' : editingAdj.type === 'jarima' ? 'Jarima yozish' : 'Avans berish'}
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 block">Summa (UZS)</label>
                                <input
                                    type="number"
                                    className="w-full bg-slate-50 dark:bg-white/5 border border-transparent focus:border-apple-accent rounded-xl px-4 py-3 font-black text-lg outline-none"
                                    value={editingAdj.amount || ''}
                                    onChange={e => setEditingAdj({ ...editingAdj, amount: Number(e.target.value) })}
                                    placeholder="0"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 block">Sabab / Izoh</label>
                                <textarea
                                    className="w-full bg-slate-50 dark:bg-white/5 border border-transparent focus:border-apple-accent rounded-xl px-4 py-3 font-medium outline-none min-h-[100px]"
                                    value={editingAdj.reason}
                                    onChange={e => setEditingAdj({ ...editingAdj, reason: e.target.value })}
                                    placeholder="Nima uchun?"
                                />
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button
                                    onClick={() => setEditingAdj(null)}
                                    className="flex-1 py-4 text-slate-400 font-bold hover:text-slate-600 transition-colors"
                                >
                                    Bekor qilish
                                </button>
                                <button
                                    onClick={handleAddAdjustment}
                                    className="flex-1 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black hover:scale-[1.02] active:scale-95 transition-all shadow-lg flex items-center justify-center gap-2"
                                >
                                    <Save size={18} /> Saqlash
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PayrollTable;
