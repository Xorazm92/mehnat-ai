"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { Staff, Language, Company, OperationEntry, PayrollAdjustment, MonthlyPerformance, KPIRule, CompanyKPIRule } from '@/types';
import { calculateCompanySalaries } from '@/lib/kpiLogic';
import { Wallet, MinusCircle, Save, HandCoins, CheckCircle2 } from 'lucide-react';
import { periodsEqual } from '@/lib/periods';
import { getKpiRules, getMonthlyPerformance } from '@/server/kpi';
import { getPayrollAdjustments, createPayrollAdjustment } from '@/server/payroll';

interface Props {
    staff: Staff[];
    companies: Company[];
    operations: OperationEntry[];
    lang: Language;
    currentUserId?: string;
    currentUserRole?: string;
}

const PayrollTable: React.FC<Props> = ({ staff, companies, operations }) => {
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [editingAdj, setEditingAdj] = useState<{ empId: string, type: 'bonus' | 'jarima' | 'avans' | 'payment', amount: number, reason: string } | null>(null);
    const [adjustmentsList, setAdjustmentsList] = useState<PayrollAdjustment[]>([]);
    const [performanceList, setPerformanceList] = useState<MonthlyPerformance[]>([]);
    const [kpiRules, setKpiRules] = useState<KPIRule[]>([]);
    const [companyOverrides, setCompanyOverrides] = useState<CompanyKPIRule[]>([]);

    const loadMonthlyData = async () => {
        try {
            const [adj, perf, rules] = await Promise.all([
                getPayrollAdjustments(month + '-01'),
                getMonthlyPerformance(month + '-01'),
                getKpiRules()
            ]);

            setAdjustmentsList((adj as any[]).map(a => ({
                ...a,
                amount: Number(a.amount ?? 0),
            })));
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
            await createPayrollAdjustment({
                month: `${month}-01`,
                employeeId: editingAdj.empId,
                adjustmentType: editingAdj.type,
                amount: editingAdj.type === 'jarima' || editingAdj.type === 'avans' || editingAdj.type === 'payment' ? -Math.abs(editingAdj.amount) : Math.abs(editingAdj.amount),
                reason: editingAdj.reason,
            });
            setEditingAdj(null);
            loadMonthlyData();
        } catch (e) {
            console.error(e);
            alert((e as any)?.message || 'Xatolik yuz berdi');
        }
    };

    const ROLE_LABELS: Record<string, string> = {
        super_admin: "Super Admin", admin: "Admin",
        chief_accountant: "Bosh Buxgalter", supervisor: "Nazoratchi",
        accountant: "Buxgalter", bank_manager: "Bank Menejer",
    };

    return (
        <div className="space-y-5 animate-fade-in pb-10">
            {/* Header */}
            <div
                className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-xl"
                style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "var(--card-shadow)" }}
            >
                <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white shadow-md"
                        style={{ background: "linear-gradient(135deg, var(--accent-blue), var(--accent-indigo))" }}>
                        <Wallet size={20} />
                    </div>
                    <div>
                        <h2 className="text-[15px] font-bold leading-none" style={{ color: "var(--text-primary)" }}>
                            Oylik Hisobot
                        </h2>
                        <p className="text-[11px] mt-1 font-medium" style={{ color: "var(--text-muted)" }}>
                            Finans va maosh tizimi
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-3 items-center">
                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg"
                        style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)" }}>
                        <span className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>Oy:</span>
                        <input
                            type="month" value={month}
                            onChange={e => setMonth(e.target.value)}
                            className="bg-transparent border-none outline-none font-bold text-[13px] cursor-pointer"
                            style={{ color: "var(--accent-blue)" }}
                        />
                    </div>
                    <div className="px-5 py-2.5 rounded-xl" style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)" }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--success)" }}>Jami to&apos;lov</p>
                        <p className="text-[18px] font-black tabular-nums leading-none" style={{ color: "var(--success)" }}>
                            {summaries.reduce((a, b) => a + b.totalSalary, 0).toLocaleString("uz-UZ")}
                            <span className="text-[11px] font-bold ml-1.5" style={{ color: "var(--success)", opacity: 0.7 }}>so&apos;m</span>
                        </p>
                    </div>
                </div>
            </div>

            {/* Summary stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: "Xodimlar", value: summaries.length, icon: "👥", color: "var(--accent-blue)", bg: "var(--info-bg)" },
                    { label: "Jami stavka", value: summaries.reduce((a, b) => a + b.baseSalary, 0).toLocaleString("uz-UZ") + " so'm", icon: "💼", color: "var(--accent-indigo)", bg: "var(--accent-indigo-light)" },
                    { label: "KPI bonus", value: "+" + summaries.reduce((a, b) => a + b.kpiBonus, 0).toLocaleString("uz-UZ") + " so'm", icon: "📈", color: "var(--success)", bg: "var(--success-bg)" },
                    { label: "Jami jarima", value: summaries.reduce((a, b) => a + Math.abs(b.kpiPenalty), 0).toLocaleString("uz-UZ") + " so'm", icon: "⚠️", color: "var(--danger)", bg: "var(--danger-bg)" },
                ].map((card, i) => (
                    <div key={i} className="p-4 rounded-xl" style={{ background: card.bg, border: `1px solid ${card.color}22` }}>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">{card.icon}</span>
                            <span className="text-[11px] font-semibold" style={{ color: card.color }}>{card.label}</span>
                        </div>
                        <p className="text-[15px] font-black tabular-nums" style={{ color: card.color }}>{card.value}</p>
                    </div>
                ))}
            </div>

            {/* Table */}
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "var(--card-shadow)" }}>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse" style={{ minWidth: "900px" }}>
                        <thead>
                            <tr style={{ background: "var(--table-header-bg)", borderBottom: "2px solid var(--table-border)" }}>
                                {[
                                    { label: "Xodim", align: "left" },
                                    { label: "Stavka (so'm)", align: "right", color: "var(--text-primary)" },
                                    { label: "KPI Bonus", align: "right", color: "var(--success)" },
                                    { label: "Jarima", align: "right", color: "var(--danger)" },
                                    { label: "Qo'shimcha", align: "right", color: "var(--accent-blue)" },
                                    { label: "Avans", align: "right", color: "var(--warning)" },
                                    { label: "Jami maosh", align: "right", color: "var(--accent-indigo)" },
                                    { label: "Qolgan", align: "right", color: "var(--success)" },
                                    { label: "Amallar", align: "center" },
                                ].map((h, i) => (
                                    <th key={i} className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                                        style={{ color: h.color || "var(--text-muted)", textAlign: h.align as any }}>
                                        {h.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {summaries.map((s, i) => (
                                <tr key={s.employeeId}
                                    style={{
                                        borderBottom: "1px solid var(--table-border)",
                                        background: i % 2 === 0 ? "var(--table-row-even)" : "var(--table-row-odd)",
                                    }}
                                    className="group transition-colors"
                                    onMouseEnter={e => (e.currentTarget.style.background = "var(--table-row-hover)")}
                                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "var(--table-row-even)" : "var(--table-row-odd)")}
                                >
                                    {/* Employee */}
                                    <td className="px-4 py-3.5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                                                style={{ background: `hsl(${(s.employeeName.charCodeAt(0) * 37) % 360}, 60%, 50%)` }}>
                                                {s.employeeName.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-[13px] font-semibold leading-none" style={{ color: "var(--text-primary)" }}>{s.employeeName}</p>
                                                <p className="text-[10px] mt-0.5 leading-none" style={{ color: "var(--text-muted)" }}>
                                                    {ROLE_LABELS[s.employeeRole] || s.employeeRole}
                                                    <span className="ml-1.5 opacity-60">• {s.companyCount} firma</span>
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    {/* Stavka */}
                                    <td className="px-4 py-3.5 text-right">
                                        <span className="text-[13px] font-bold tabular-nums whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
                                            {s.baseSalary.toLocaleString("uz-UZ")}
                                        </span>
                                    </td>
                                    {/* KPI Bonus */}
                                    <td className="px-4 py-3.5 text-right">
                                        <span className="text-[13px] font-bold tabular-nums whitespace-nowrap" style={{ color: "var(--success)" }}>
                                            +{s.kpiBonus.toLocaleString("uz-UZ")}
                                        </span>
                                    </td>
                                    {/* Jarima */}
                                    <td className="px-4 py-3.5 text-right">
                                        <span className="text-[13px] font-bold tabular-nums whitespace-nowrap" style={{ color: "var(--danger)" }}>
                                            {s.kpiPenalty.toLocaleString("uz-UZ")}
                                        </span>
                                    </td>
                                    {/* Qo'shimcha */}
                                    <td className="px-4 py-3.5 text-right">
                                        <span className="text-[13px] font-bold tabular-nums whitespace-nowrap" style={{ color: "var(--accent-blue)" }}>
                                            {s.manualBonuses > 0 ? "+" : ""}{s.manualBonuses.toLocaleString("uz-UZ")}
                                        </span>
                                    </td>
                                    {/* Avans */}
                                    <td className="px-4 py-3.5 text-right">
                                        <span className="text-[13px] font-bold tabular-nums whitespace-nowrap" style={{ color: "var(--warning)" }}>
                                            {Math.abs(s.totalReceived).toLocaleString("uz-UZ")}
                                        </span>
                                    </td>
                                    {/* Jami */}
                                    <td className="px-4 py-3.5 text-right">
                                        <span className="text-[14px] font-black tabular-nums whitespace-nowrap" style={{ color: "var(--accent-indigo)" }}>
                                            {s.totalSalary.toLocaleString("uz-UZ")}
                                        </span>
                                    </td>
                                    {/* Qolgan */}
                                    <td className="px-4 py-3.5 text-right">
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[12px] font-bold tabular-nums whitespace-nowrap"
                                            style={{
                                                background: s.remainingBalance <= 0 ? "var(--success-bg)" : "var(--warning-bg)",
                                                color: s.remainingBalance <= 0 ? "var(--success)" : "var(--warning)",
                                                border: `1px solid ${s.remainingBalance <= 0 ? "var(--success-border)" : "var(--warning-border)"}`,
                                            }}>
                                            {s.remainingBalance.toLocaleString("uz-UZ")}
                                        </span>
                                    </td>
                                    {/* Actions */}
                                    <td className="px-4 py-3.5 text-center">
                                        <div className="flex gap-1.5 justify-center opacity-30 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => setEditingAdj({ empId: s.employeeId, type: "avans", amount: 0, reason: "" })}
                                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                                                style={{ background: "var(--warning-bg)", color: "var(--warning)", border: "1px solid var(--warning-border)" }}
                                                title="Avans berish"
                                            >
                                                <HandCoins size={12} /> Avans
                                            </button>
                                            <button
                                                onClick={() => setEditingAdj({ empId: s.employeeId, type: "payment", amount: s.remainingBalance, reason: "Maosh to'lovi" })}
                                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                                                style={{ background: "var(--success-bg)", color: "var(--success)", border: "1px solid var(--success-border)" }}
                                                title="Maosh to'lash"
                                            >
                                                <CheckCircle2 size={12} /> To&apos;lash
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {summaries.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="px-8 py-16 text-center">
                                        <Wallet size={36} className="mx-auto mb-3" style={{ color: "var(--text-muted)", opacity: 0.4 }} />
                                        <p className="text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>Bu oy uchun ma&apos;lumot topilmadi</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Adjustment Modal */}
            {editingAdj && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in"
                    style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
                    onClick={() => setEditingAdj(null)}>
                    <div className="w-full max-w-md rounded-2xl overflow-hidden animate-scale-in"
                        style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "0 25px 60px rgba(0,0,0,0.3)" }}
                        onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-4 flex justify-between items-center" style={{ borderBottom: "1px solid var(--card-border)" }}>
                            <div>
                                <h3 className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>
                                    {editingAdj.type === "bonus" ? "Bonus belgilash" :
                                        editingAdj.type === "jarima" ? "Jarima yozish" :
                                            editingAdj.type === "avans" ? "Avans berish" : "Maosh to'lovi"}
                                </h3>
                                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>Miqdor va sababni kiriting</p>
                            </div>
                            <button onClick={() => setEditingAdj(null)}
                                className="p-2 rounded-lg transition-all"
                                style={{ color: "var(--text-muted)" }}
                                onMouseEnter={e => { e.currentTarget.style.background = "var(--danger-bg)"; e.currentTarget.style.color = "var(--danger)"; }}
                                onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = "var(--text-muted)"; }}>
                                <MinusCircle size={18} className="rotate-45" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-[11px] font-semibold mb-1.5 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Summa (so&apos;m)</label>
                                <input type="number"
                                    className="erp-input text-[15px] font-bold"
                                    value={editingAdj.amount || ""}
                                    onChange={e => setEditingAdj({ ...editingAdj, amount: Number(e.target.value) })}
                                    placeholder="0" />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold mb-1.5 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Sabab / Izoh</label>
                                <textarea
                                    className="erp-input min-h-[90px] resize-none"
                                    value={editingAdj.reason}
                                    onChange={e => setEditingAdj({ ...editingAdj, reason: e.target.value })}
                                    placeholder="Tafsilotlarni kiriting..." />
                            </div>
                        </div>
                        <div className="px-6 pb-6 flex gap-3">
                            <button onClick={() => setEditingAdj(null)} className="btn-secondary flex-1">Bekor qilish</button>
                            <button onClick={handleAddAdjustment}
                                className="btn-primary flex-1">
                                <Save size={15} /> Saqlash
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PayrollTable;

