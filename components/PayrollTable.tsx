"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { Staff, Language, Company, OperationEntry, PayrollAdjustment, MonthlyPerformance, KPIRule, CompanyKPIRule } from '@/types';
import { calculateCompanySalaries } from '@/lib/kpiLogic';
import { Wallet, MinusCircle, Save, HandCoins, CheckCircle2, SlidersHorizontal, Users, Briefcase, TrendingUp, AlertTriangle, Clock, Trash2 } from 'lucide-react';
import { periodsEqual } from '@/lib/periods';
import { getKpiRules, getMonthlyPerformance } from '@/server/kpi';
import {
    getPayrollAdjustments,
    createPayrollAdjustment,
    approvePayrollAdjustment,
    deletePayrollAdjustment,
} from '@/server/payroll';
import { getPayouts, createPayout } from '@/server/payouts';
import { getPayrollBasisContext } from '@/server/payroll';
import { PAYROLL_BASIS_DEFAULT, type PayrollBasis } from '@/lib/payrollBasis';
import type { CompanyAssignment } from '@/lib/kpiLogic';
import { groupDigits, ungroupDigits, submitOnCtrlEnter, formatNum } from '@/lib/platform/format';
import { ROLE_LABELS, type UserRole } from '@/lib/platform/permissions';
import { adjustmentMagnitude } from '@/lib/adjustments';
import { computeObligation } from '@/lib/payrollObligation';
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { IdentityCell } from "@/components/ui";
import { useTableState } from "@/hooks/useTableState";
import { usePageSize } from "@/hooks/usePageSize";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { friendlyError } from "@/lib/actionError";
import { MonthPicker } from "./ui/MonthPicker";
import { useDismissable } from "@/hooks/useDismissable";
import { Modal } from "@/components/ui/Modal";

interface Props {
    staff: Staff[];
    companies: Company[];
    operations: OperationEntry[];
    lang: Language;
    currentUserId?: string;
    currentUserRole?: string;
}

const PayrollTable: React.FC<Props> = ({ staff, companies, operations, currentUserRole }) => {
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM

    // Saralash/zichlik URL'da. Moliyaviy jadvalda saralash ayniqsa muhim:
    // "kim eng ko'p qarzdor" yoki "kimning bonusi eng yuqori" savoliga
    // avval umuman javob berib bo'lmasdi — saralash yo'q edi.
    const table = useTableState({ ns: 'pay', defaultSortKey: 'name' });
    const [pageSize, setPageSize] = usePageSize("payroll");
    const [editingAdj, setEditingAdj] = useState<{ empId: string, type: 'bonus' | 'jarima' | 'avans' | 'payment', amount: number, reason: string } | null>(null);
    const [adjustmentsList, setAdjustmentsList] = useState<PayrollAdjustment[]>([]);
    // REAL berilgan pullar (Payout jadvali) — majburiyatdan alohida o'qiladi.
    // AVANS-PAYOUT HAM SHU YERDA. Ilgari u chiqarib tashlanardi va avans
    // "totalReceived" orqali ikkinchi yo'ldan ayirilardi; endi majburiyat
    // (`lib/payrollObligation.ts`) avansni umuman sanamaydi, ya'ni u FAQAT
    // to'lov tomonida — server bilan bir xil.
    const [payoutsList, setPayoutsList] = useState<{ employeeId: string; amount: number }[]>([]);
    const [performanceList, setPerformanceList] = useState<MonthlyPerformance[]>([]);
    const [kpiRules, setKpiRules] = useState<KPIRule[]>([]);
    const [companyOverrides, setCompanyOverrides] = useState<CompanyKPIRule[]>([]);
    const [basis, setBasis] = useState<PayrollBasis>(PAYROLL_BASIS_DEFAULT);
    const [collectedByCompany, setCollectedByCompany] = useState<Record<string, number>>({});
    const [assignmentsByCompany, setAssignmentsByCompany] = useState<Record<string, CompanyAssignment[]>>({});
    // Per-user column show/hide for the salary table, saved in this browser.
    const [isLoading, setIsLoading] = useState(true);
    // Tasdiqlash/o'chirish jarayonidagi tuzatma — ikki marta bosishning oldini oladi.
    const [busyAdj, setBusyAdj] = useState<string | null>(null);
    const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
    const [colPanelOpen, setColPanelOpen] = useState(false);
    const colPanelRef = useDismissable<HTMLDivElement>(colPanelOpen, () => setColPanelOpen(false));
    useEffect(() => {
        try { const s = localStorage.getItem('payroll-hidden-cols'); if (s) setHiddenCols(new Set(JSON.parse(s) as string[])); } catch { /* ignore */ }
    }, []);
    useEffect(() => {
        try { localStorage.setItem('payroll-hidden-cols', JSON.stringify([...hiddenCols])); } catch { /* ignore */ }
    }, [hiddenCols]);
    const toggleCol = (key: string) => setHiddenCols(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
    const HIDEABLE_COLS = [
        { key: 'bonus', label: 'KPI Bonus' },
        { key: 'penalty', label: 'Jarima' },
        { key: 'manual', label: "Qo'shimcha" },
        { key: 'avans', label: 'Avans' },
        { key: 'remaining', label: 'Qolgan' },
    ];

    const loadMonthlyData = async () => {
        // Yuklanish holati: busiz oy almashtirilganda jadval O'TGAN oyning
        // raqamlarini joriy oyniki kabi ko'rsatib turardi — pul jadvalida bu
        // eng yomon holat, chunki raqamlar ishonchli ko'rinadi.
        setIsLoading(true);
        try {
            const [adj, perf, rules, payouts, basisCtx] = await Promise.all([
                getPayrollAdjustments(month + '-01'),
                getMonthlyPerformance(month + '-01'),
                getKpiRules(),
                getPayouts({ month }),
                getPayrollBasisContext(month)
            ]);

            setBasis(basisCtx.basis);
            setCollectedByCompany(basisCtx.collectedByCompany);
            setAssignmentsByCompany(basisCtx.assignmentsByCompany);

            setAdjustmentsList((adj as any[]).map(a => ({
                ...a,
                amount: Number(a.amount ?? 0),
            })));
            setPayoutsList((payouts as any[])
                .map(p => ({
                    employeeId: p.employeeId as string,
                    amount: Number(p.amount ?? 0),
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
        } finally {
            setIsLoading(false);
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

                const results = calculateCompanySalaries(c, op, perf, mergedRules, {
                    basis,
                    collected: collectedByCompany[c.id] ?? 0,
                    assignments: assignmentsByCompany[c.id],
                });

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
            // FAQAT TASDIQLANGAN tuzatma pulga ta'sir qiladi — server ham
            // shunday qiladi. Ilgari bu yerda filtr yo'q edi, ya'ni hali
            // tasdiqlanmagan avans kiritilishi bilanoq ekrandagi "Qolgan"
            // serverning chegarasidan pastga tushib ketardi.
            const approved = employeeAdjustments.filter(a => a.isApproved);

            // Ustunlarda ko'rsatish uchun (miqdor sifatida — lib/adjustments.ts:
            // tarixiy qatorlar aralash ishorada). Konventsiya: received/paid
            // manfiy saqlanadi, displey Math.abs ishlatadi.
            const totalReceived = -approved
                .filter(a => a.adjustmentType === 'avans' || a.adjustmentType === 'jarima')
                .reduce((sum, a) => sum + adjustmentMagnitude(a.amount), 0);

            const manualBonuses = approved
                .filter(a => a.adjustmentType === 'bonus')
                .reduce((sum, a) => sum + adjustmentMagnitude(a.amount), 0);

            // REAL berilgan pul — Payout jadvalidan (majburiyat emas), avans ham ichida.
            const totalPaid = -payoutsList
                .filter(p => p.employeeId === s.id)
                .reduce((sum, p) => sum + Math.abs(p.amount), 0);

            // MAJBURIYAT — server bilan AYNAN bir xil funksiya
            // (`lib/payrollObligation.ts`). 'payment' qatori ataylab tashlanadi:
            // uning o'rniga yuqorida jonli hisoblangan KPI oyligi turadi, shunda
            // oylik hali tasdiqlanmagan oyda ham raqam ko'rinadi. Qolgan turlar
            // (bonus +, jarima −, avans 0) o'z og'irligini o'sha yerdan oladi.
            const kpiSalary = totalBase - totalKpiPenalty + totalKpiBonus;
            const obligation = kpiSalary + computeObligation(
                approved.filter(a => a.adjustmentType !== 'payment')
            );
            const remainingBalance = obligation + totalPaid;

            return {
                employeeId: s.id,
                employeeName: s.name,
                employeeAvatarRef: s.avatarRef ?? null,
                employeeRole: s.role,
                month,
                companyCount: myCompaniesSet.size,
                baseSalary: totalBase,
                kpiBonus: totalKpiBonus,
                kpiPenalty: -totalKpiPenalty,
                adjustments: totalReceived + manualBonuses,
                // "Jami maosh" = to'liq MAJBURIYAT (KPI oyligi + qo'lda bonus −
                // qo'lda jarima), ya'ni server to'lashga ruxsat beradigan tom
                // summa. Ilgari bu yerda faqat KPI oyligi turardi va qo'lda
                // bonus ustunda ko'rinsa-da jamiga kirmasdi.
                totalSalary: obligation,
                remainingBalance: remainingBalance,
                totalPaid: totalPaid,
                totalReceived: totalReceived,
                manualBonuses: manualBonuses,
                performanceDetails: []
            } as any;
        }).filter(s => s.companyCount > 0);
    }, [staff, companies, operations, month, adjustmentsList, performanceList, kpiRules, companyOverrides, basis, collectedByCompany, assignmentsByCompany]);

    type PayrollRow = (typeof summaries)[number];

    const payrollColumns = useMemo<DataColumn<PayrollRow>[]>(() => [
        {
            key: 'name', header: 'Xodim',
            sortValue: r => r.employeeName,
            cell: r => (
                <IdentityCell
                    name={r.employeeName}
                    userId={r.employeeId}
                    avatarRef={r.employeeAvatarRef}
                    size="md"
                    secondary={`${ROLE_LABELS[r.employeeRole as UserRole] || r.employeeRole} · ${r.companyCount} firma`}
                />
            ),
        },
        {
            key: 'base', header: "Stavka (so'm)", numeric: true,
            sortValue: r => r.baseSalary,
            cell: r => <span className="font-bold" style={{ color: "var(--text-primary)" }}>{formatNum(r.baseSalary)}</span>,
        },
        {
            key: 'bonus', header: 'KPI Bonus', numeric: true, hidden: hiddenCols.has('bonus'),
            sortValue: r => r.kpiBonus,
            cell: r => <span className="font-bold" style={{ color: "var(--success)" }}>+{formatNum(r.kpiBonus)}</span>,
        },
        {
            key: 'penalty', header: 'Jarima', numeric: true, hidden: hiddenCols.has('penalty'),
            sortValue: r => r.kpiPenalty,
            cell: r => <span className="font-bold" style={{ color: "var(--danger)" }}>{formatNum(r.kpiPenalty)}</span>,
        },
        {
            key: 'manual', header: "Qo'shimcha", numeric: true, hidden: hiddenCols.has('manual'),
            sortValue: r => r.manualBonuses,
            cell: r => <span className="font-bold" style={{ color: "var(--accent-blue)" }}>{r.manualBonuses > 0 ? "+" : ""}{formatNum(r.manualBonuses)}</span>,
        },
        {
            key: 'avans', header: 'Avans', numeric: true, hidden: hiddenCols.has('avans'),
            sortValue: r => Math.abs(r.totalReceived),
            cell: r => <span className="font-bold" style={{ color: "var(--warning)" }}>{formatNum(Math.abs(r.totalReceived))}</span>,
        },
        {
            key: 'total', header: 'Jami maosh', numeric: true, mobile: 'status',
            sortValue: r => r.totalSalary,
            cell: r => <span className="text-sm font-semibold" style={{ color: "var(--accent-indigo)" }}>{formatNum(r.totalSalary)}</span>,
        },
        {
            key: 'remaining', header: 'Qolgan', numeric: true, hidden: hiddenCols.has('remaining'),
            sortValue: r => r.remainingBalance,
            cell: r => (
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold tabular-nums whitespace-nowrap"
                    style={{
                        background: r.remainingBalance <= 0 ? "var(--success-bg)" : "var(--warning-bg)",
                        color: r.remainingBalance <= 0 ? "var(--success)" : "var(--warning)",
                        border: `1px solid ${r.remainingBalance <= 0 ? "var(--success-border)" : "var(--warning-border)"}`,
                    }}>
                    {formatNum(r.remainingBalance)}
                </span>
            ),
        },
        {
            key: 'actions', header: 'Amallar', align: 'center',
            cell: r => (
                <div className="flex gap-1.5 justify-center" onClick={e => e.stopPropagation()}>
                    <button
                        onClick={() => setEditingAdj({ empId: r.employeeId, type: "avans", amount: 0, reason: "" })}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-meta font-semibold"
                        style={{ background: "var(--warning-bg)", color: "var(--warning)", border: "1px solid var(--warning-border)" }}
                    >
                        <HandCoins size={12} /> Avans
                    </button>
                    <button
                        onClick={() => setEditingAdj({ empId: r.employeeId, type: "payment", amount: r.remainingBalance, reason: "Maosh to'lovi" })}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-meta font-semibold"
                        style={{ background: "var(--success-bg)", color: "var(--success)", border: "1px solid var(--success-border)" }}
                    >
                        <CheckCircle2 size={12} /> To&apos;lash
                    </button>
                </div>
            ),
        },
    ], [hiddenCols]);


    // TASDIQLANMAGAN TUZATMALAR.
    //
    // `createPayrollAdjustment` yozuvni `isApproved: false` bilan yaratadi va
    // AVANS uchun pul aynan TASDIQDA kassadan chiqadi (Payout + ledger).
    // Tasdiqlash tugmasi hech qayerda yo'q edi — ya'ni kiritilgan avans
    // jadvalda "berilgan" bo'lib ko'rinardi, lekin kassadan bir tiyin ham
    // chiqmasdi. Shu bo'shliqni yopadi.
    const pendingAdjustments = useMemo(
        () => adjustmentsList.filter(a => !(a as any).isApproved && (a as any).adjustmentType !== 'payment'),
        [adjustmentsList]
    );

    const staffNameOf = (id: string) => staff.find(x => x.id === id)?.name ?? '—';

    const handleApproveAdj = async (id: string) => {
        setBusyAdj(id);
        try {
            await approvePayrollAdjustment(id);
            toast.success("Tuzatma tasdiqlandi");
            await loadMonthlyData();
        } catch (e) {
            toast.error(friendlyError(e) || "Tasdiqlab bo'lmadi");
        } finally {
            setBusyAdj(null);
        }
    };

    const handleDeleteAdj = async (id: string) => {
        setBusyAdj(id);
        try {
            await deletePayrollAdjustment(id, "Oylik jadvalidan bekor qilindi");
            toast.success("Tuzatma o'chirildi");
            await loadMonthlyData();
        } catch (e) {
            toast.error(friendlyError(e) || "O'chirib bo'lmadi");
        } finally {
            setBusyAdj(null);
        }
    };
    const [savingAdj, setSavingAdj] = useState(false);

    const handleAddAdjustment = async () => {
        if (!editingAdj) return;
        // Summa validatsiyasi: 0 yuborilishi mumkin edi va u jimgina yozilardi.
        if (!Number.isFinite(editingAdj.amount) || Math.abs(editingAdj.amount) <= 0) {
            toast.error("Summa noldan katta bo'lishi kerak");
            return;
        }
        if (savingAdj) return;

        setSavingAdj(true);
        try {
            if (editingAdj.type === 'payment') {
                // REAL pul berish — Payout jadvaliga (majburiyat tekshiruvi va
                // double-entry ledger server tomonda).
                await createPayout({
                    employeeId: editingAdj.empId,
                    month,
                    amount: Math.abs(editingAdj.amount),
                    note: editingAdj.reason || "Maosh to'lovi",
                });
            } else {
                await createPayrollAdjustment({
                    month: `${month}-01`,
                    employeeId: editingAdj.empId,
                    adjustmentType: editingAdj.type,
                    amount: editingAdj.type === 'jarima' || editingAdj.type === 'avans' ? -Math.abs(editingAdj.amount) : Math.abs(editingAdj.amount),
                    reason: editingAdj.reason,
                });
            }
            setEditingAdj(null);
            loadMonthlyData();
        } catch (e) {
            console.error(e);
            toast.error((e as any)?.message || 'Xatolik yuz berdi');
        } finally {
            setSavingAdj(false);
        }
    };

    // Lavozim yorliqlari `lib/permissions` dan — bu yerda nusxa saqlanmaydi.
    // Nusxa "Bank Menejer" deb yozardi, kanonik manba esa "Bank-Klient":
    // bitta rol ikki ekranda ikki xil nomlanardi.

    // Tasdiqlash faqat admin/superadminga — server ham shuni talab qiladi
    // (approvePayrollAdjustment), bu yerda faqat tugmani yashiramiz.
    const isApprover = currentUserRole === "super_admin" || currentUserRole === "admin";

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
                        <h2 className="text-sm font-bold leading-none" style={{ color: "var(--text-primary)" }}>
                            Oylik Hisobot
                        </h2>
                        <p className="text-meta mt-1 font-medium" style={{ color: "var(--text-muted)" }}>
                            Finans va maosh tizimi
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-3 items-center">
                    <MonthPicker selectedPeriod={month} onChange={setMonth} />
                    <div className="px-5 py-2.5 rounded-xl" style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)" }}>
                        <p className="text-micro font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--success)" }}>Jami to&apos;lov</p>
                        <p className="text-lg font-semibold tabular-nums leading-none" style={{ color: "var(--success)" }}>
                            {formatNum(summaries.reduce((a, b) => a + b.totalSalary, 0))}
                            <span className="text-meta font-bold ml-1.5" style={{ color: "var(--success)", opacity: 0.7 }}>so&apos;m</span>
                        </p>
                    </div>
                </div>
            </div>

            {/* Ko'rsatkichlar tasmasi — rangli plitkalar o'rniga chiziq bilan
                bo'lingan bitta panel; belgilar lucide'dan (emoji emas). */}
            <div className="stat-strip">
                {[
                    { label: "Xodimlar", value: formatNum(summaries.length), Icon: Users },
                    { label: "Jami stavka", value: formatNum(summaries.reduce((a, b) => a + b.baseSalary, 0)) + " so'm", Icon: Briefcase },
                    { label: "KPI bonus", value: "+" + formatNum(summaries.reduce((a, b) => a + b.kpiBonus, 0)) + " so'm", Icon: TrendingUp, color: "var(--success)" },
                    { label: "Jami jarima", value: formatNum(summaries.reduce((a, b) => a + Math.abs(b.kpiPenalty), 0)) + " so'm", Icon: AlertTriangle, color: "var(--danger)" },
                ].map((card) => (
                    <div key={card.label}>
                        <span className="stat-label flex items-center gap-1.5">
                            <card.Icon size={12} style={{ color: card.color ?? "var(--text-muted)" }} />
                            {card.label}
                        </span>
                        <span className="stat-value text-lg" style={card.color ? { color: card.color } : undefined}>
                            {card.value}
                        </span>
                    </div>
                ))}
            </div>

            {/* Mobil kartochkalar (Oylik) */}
            <div className="md:hidden space-y-3">
                {summaries.map((s) => (
                    <div key={s.employeeId} className="rounded-xl p-4" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "var(--card-shadow)" }}>
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ background: `hsl(${(s.employeeName.charCodeAt(0) * 37) % 360}, 60%, 50%)` }}>{s.employeeName.charAt(0)}</div>
                            <div className="flex-1 min-w-0">
                                <p className="text-body font-bold leading-none truncate" style={{ color: "var(--text-primary)" }}>{s.employeeName}</p>
                                <p className="text-micro mt-1 leading-none truncate" style={{ color: "var(--text-muted)" }}>{ROLE_LABELS[s.employeeRole as UserRole] || s.employeeRole} • {s.companyCount} firma</p>
                            </div>
                            <div className="text-right shrink-0">
                                <p className="text-2xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Jami</p>
                                <p className="text-sm font-semibold tabular-nums leading-tight" style={{ color: "var(--accent-indigo)" }}>{formatNum(s.totalSalary)}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-3">
                            {[
                                { l: "Stavka", v: formatNum(s.baseSalary), c: "var(--text-primary)" },
                                { l: "Bonus", v: "+" + formatNum(s.kpiBonus), c: "var(--success)" },
                                { l: "Jarima", v: formatNum(s.kpiPenalty), c: "var(--danger)" },
                                { l: "Qo'shimcha", v: (s.manualBonuses > 0 ? "+" : "") + formatNum(s.manualBonuses), c: "var(--accent-blue)" },
                                { l: "Avans", v: formatNum(Math.abs(s.totalReceived)), c: "var(--warning)" },
                                { l: "Qolgan", v: formatNum(s.remainingBalance), c: s.remainingBalance <= 0 ? "var(--success)" : "var(--warning)" },
                            ].map((x, i) => (
                                <div key={i} className="rounded-lg px-2 py-1.5 text-center" style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)" }}>
                                    <div className="text-2xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{x.l}</div>
                                    <div className="text-meta font-semibold tabular-nums mt-0.5 truncate" style={{ color: x.c }}>{x.v}</div>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2 mt-3">
                            <button onClick={() => setEditingAdj({ empId: s.employeeId, type: "avans", amount: 0, reason: "" })} className="flex-1 py-2 rounded-lg text-meta font-semibold uppercase tracking-widest flex items-center justify-center gap-1.5" style={{ background: "var(--warning-bg)", color: "var(--warning)", border: "1px solid var(--warning-border)" }}><HandCoins size={13} /> Avans</button>
                            <button onClick={() => setEditingAdj({ empId: s.employeeId, type: "payment", amount: s.remainingBalance, reason: "Maosh to'lovi" })} className="flex-1 py-2 rounded-lg text-meta font-semibold uppercase tracking-widest flex items-center justify-center gap-1.5" style={{ background: "var(--success-bg)", color: "var(--success)", border: "1px solid var(--success-border)" }}><CheckCircle2 size={13} /> To&apos;lash</button>
                        </div>
                    </div>
                ))}
                {summaries.length === 0 && (
                    <div className="rounded-xl p-12 text-center" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
                        <span className="text-meta font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Ma&apos;lumot topilmadi</span>
                    </div>
                )}
            </div>

            {/* Table (desktop) */}
            {/* Column visibility toggle (desktop salary table) */}
            <div className="hidden md:flex justify-end mb-2">
                {/* Ustunlar ochilmasi — dialog EMAS, menyu. Ilgari uni faqat
                    shaffof `fixed inset-0` backdrop yopardi: Escape ishlamasdi
                    va backdrop z-index'ga bog'liq bo'lgani uchun boshqa
                    ochilma bilan bir vaqtda ochiq qolishi mumkin edi.
                    `useDismissable` hujjat darajasida tinglaydi — Escape ham,
                    tashqi bosish ham ishlaydi, va bir vaqtda faqat bitta
                    ochilma ochiq turadi. */}
                <div className="relative" ref={colPanelRef}>
                    <button onClick={() => setColPanelOpen(o => !o)}
                        type="button"
                        aria-haspopup="true"
                        aria-expanded={colPanelOpen}
                        className="font-bold px-4 py-2 rounded-xl text-meta flex items-center gap-2 uppercase tracking-widest"
                        style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text-secondary)" }}>
                        <SlidersHorizontal size={14} /> Ustunlar{hiddenCols.size > 0 ? ` (${hiddenCols.size})` : ''}
                    </button>
                    {colPanelOpen && (
                            <div className="absolute right-0 mt-2 z-[100] w-56 rounded-xl p-3 shadow-2xl" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-meta font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>Ustunlar</span>
                                    <button onClick={() => setHiddenCols(new Set())} className="text-micro font-bold uppercase" style={{ color: "var(--accent-blue)" }}>Hammasi</button>
                                </div>
                                {HIDEABLE_COLS.map(c => (
                                    <label key={c.key} className="flex items-center gap-2 py-1 px-1 rounded-lg cursor-pointer text-xs" style={{ color: "var(--text-primary)" }}>
                                        <input type="checkbox" checked={!hiddenCols.has(c.key)} onChange={() => toggleCol(c.key)} />
                                        <span>{c.label}</span>
                                    </label>
                                ))}
                            </div>
                    )}
                </div>
            </div>

            <div className="hidden md:block rounded-xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "var(--card-shadow)" }}>
                <div className="overflow-x-auto">
                    <DataTable<PayrollRow>
                        caption="Oylik maosh jadvali"
                        rows={summaries}
                        columns={payrollColumns}
                        rowKey={r => r.employeeId}
                        sortKey={table.sortKey}
                        sortDir={table.sortDir}
                        onToggleSort={table.toggleSort}
                        density={table.density}
                        page={table.page}
                        pageSize={pageSize}
                        onPageSizeChange={setPageSize}
                        onPageChange={table.setPage}
                        loading={isLoading}
                        emptyIcon={<Wallet size={36} />}
                        emptyTitle="Bu oy uchun ma'lumot topilmadi"
                    />
                </div>
            </div>


            {/* TASDIQLANMAGAN TUZATMALAR — avans tasdiqlanmaguncha kassadan
                pul CHIQMAYDI, lekin jadvalda "olingan" bo'lib ko'rinadi.
                Shuning uchun panel jadvaldan yuqorida turadi. */}
            {pendingAdjustments.length > 0 && (
                <div className="rounded-xl overflow-hidden"
                    style={{ background: "var(--card-bg)", border: "1px solid var(--warning-border)" }}>
                    <div className="px-4 py-2.5 flex items-center gap-2"
                        style={{ background: "var(--warning-bg)", borderBottom: "1px solid var(--warning-border)" }}>
                        <Clock size={15} style={{ color: "var(--warning)" }} />
                        <span className="text-meta font-semibold" style={{ color: "var(--text)" }}>
                            {pendingAdjustments.length} ta tasdiqlanmagan tuzatma
                        </span>
                        <span className="text-micro" style={{ color: "var(--text-muted)" }}>
                            — avans tasdiqlanmaguncha kassadan pul chiqmaydi
                        </span>
                    </div>
                    <div className="divide-y" style={{ borderColor: "var(--card-border)" }}>
                        {pendingAdjustments.map(a => {
                            const type = (a as any).adjustmentType as string;
                            const label = type === 'avans' ? 'Avans' : type === 'jarima' ? 'Jarima' : type === 'bonus' ? 'Bonus' : type;
                            const color = type === 'jarima' ? 'var(--danger)' : type === 'avans' ? 'var(--warning)' : 'var(--success)';
                            const busy = busyAdj === a.id;
                            return (
                                <div key={a.id} className="px-4 py-2.5 flex items-center gap-3 flex-wrap">
                                    <span className="text-body font-semibold min-w-[9rem]" style={{ color: "var(--text)" }}>
                                        {staffNameOf(a.employeeId)}
                                    </span>
                                    <span className="text-micro font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                                        style={{ color, border: `1px solid ${color}` }}>{label}</span>
                                    <span className="text-body font-mono tabular-nums" style={{ color }}>
                                        {formatNum(adjustmentMagnitude(a.amount))}
                                    </span>
                                    <span className="text-meta flex-1 min-w-[8rem] truncate" style={{ color: "var(--text-muted)" }}>
                                        {(a as any).reason || '—'}
                                    </span>
                                    {isApprover ? (
                                        <div className="flex gap-1.5">
                                            <button disabled={busy} onClick={() => handleApproveAdj(a.id)}
                                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-meta font-semibold disabled:opacity-50"
                                                style={{ background: "var(--success-bg)", color: "var(--success)", border: "1px solid var(--success-border)" }}>
                                                <CheckCircle2 size={12} /> Tasdiqlash
                                            </button>
                                            <button disabled={busy} onClick={() => handleDeleteAdj(a.id)}
                                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-meta font-semibold disabled:opacity-50"
                                                style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger-border)" }}>
                                                <Trash2 size={12} /> O&apos;chirish
                                            </button>
                                        </div>
                                    ) : (
                                        <span className="text-micro" style={{ color: "var(--text-muted)" }}>
                                            Admin tasdig'i kutilmoqda
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Adjustment Modal */}

            {/* Tuzatish modali — `Modal` primitivi orqali: fokus tuzog'i, Escape,
                fokusni qaytarish va `role="dialog"` shu yerdan keladi. Oxirgisi
                `useAutoRefresh` ning ochiq dialog ustida pauza qilishini ham
                yoqadi — ilgari bu forma ostidan 15 soniyalik refresh o'tardi. */}
            <Modal
                open={Boolean(editingAdj)}
                onClose={() => setEditingAdj(null)}
                dismissable={!savingAdj}
                size="md"
                title={
                    editingAdj?.type === "bonus" ? "Bonus belgilash" :
                    editingAdj?.type === "jarima" ? "Jarima yozish" :
                    editingAdj?.type === "avans" ? "Avans berish" : "Maosh to'lovi"
                }
                description="Miqdor va sababni kiriting"
                footer={
                    <div className="flex gap-3">
                        <Button variant="secondary" size="md" onClick={() => setEditingAdj(null)} disabled={savingAdj} className="flex-1">
                            Bekor qilish
                        </Button>
                        <Button variant="primary" size="md" onClick={handleAddAdjustment} disabled={savingAdj} className="flex-1">
                            <Save size={15} /> {savingAdj ? "Saqlanmoqda…" : "Saqlash"}
                        </Button>
                    </div>
                }
            >
                {editingAdj && (
                    <div className="space-y-4" onKeyDown={submitOnCtrlEnter(handleAddAdjustment)}>
                        <div>
                            <label htmlFor="adj-amount" className="block text-meta font-semibold mb-1.5 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                                Summa (so&apos;m)
                            </label>
                            <input id="adj-amount" type="text" inputMode="numeric" autoFocus
                                className="erp-input text-sm font-bold"
                                value={groupDigits(editingAdj.amount || "")}
                                onChange={e => setEditingAdj({ ...editingAdj, amount: Number(ungroupDigits(e.target.value)) })}
                                placeholder="0" />
                        </div>
                        <div>
                            <label htmlFor="adj-reason" className="block text-meta font-semibold mb-1.5 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                                Sabab / Izoh
                            </label>
                            <textarea id="adj-reason"
                                className="erp-input min-h-[90px] resize-none"
                                value={editingAdj.reason}
                                onChange={e => setEditingAdj({ ...editingAdj, reason: e.target.value })}
                                placeholder="Tafsilotlarni kiriting..." />
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default PayrollTable;

