"use client";

import React, { useState, useMemo } from 'react';
import { useViewMode } from '@/hooks/useViewMode';
import { Expense, Language } from '@/types';
import { translations } from '@/lib/translations';
import { Receipt, Plus, Search, Edit3, Trash2, Tag, TrendingDown, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { exportToExcel } from '@/lib/exportExcel';
import { canApproveExpense } from '@/lib/expenseApproval';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, PAYMENT_METHOD_COLORS } from '@/lib/constants';
import BalanceOverview from '@/components/BalanceOverview';
import { TableToolbar } from '@/components/ui/TableToolbar';
import { formatUzDateNumeric, formatNum } from '@/lib/format';
import { groupDigits, ungroupDigits } from '@/lib/format';
import type { BalanceBreakdown } from '@/types';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { DataTable, type DataColumn } from '@/components/ui/DataTable';
import { useTableState } from '@/hooks/useTableState';
import { exportRowsToCsv } from '@/lib/exportTable';
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import FundingSourceSelect from "@/components/ui/FundingSourceSelect";

interface ExpenseModuleProps {
    expenses: Expense[];
    lang: Language;
    userRole?: string;
    balance?: BalanceBreakdown;
    onSaveExpense: (expense: Partial<Expense>) => Promise<void>;
    onDeleteExpense?: (id: string) => Promise<void>;
    onApproveExpense?: (id: string) => Promise<void>;
    onRejectExpense?: (id: string) => Promise<void>;
}

const EXP_STATUS: Record<string, { label: string; fg: string; bg: string; bd: string }> = {
    approved: { label: 'Tasdiqlangan', fg: 'var(--success)', bg: 'var(--success-bg)', bd: 'var(--success-border)' },
    pending: { label: 'Kutilmoqda', fg: 'var(--warning)', bg: 'var(--warning-bg)', bd: 'var(--warning-border)' },
    rejected: { label: 'Rad etildi', fg: 'var(--danger)', bg: 'var(--danger-bg)', bd: 'var(--danger-border)' },
};

const ExpenseModule: React.FC<ExpenseModuleProps> = ({ expenses, lang, userRole = '', balance, onSaveExpense, onDeleteExpense, onApproveExpense, onRejectExpense }) => {
  const confirm = useConfirm();
    const t = translations[lang];
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Qidiruv/saralash/filtr — URL'da; qidiruv 250ms debounce bilan.
    // `TableToolbar` ning o'z qidiruvi debounce qilinmagan edi, ya'ni uni
    // ishlatgan HAR BIR ekran har bosilgan harfda qayta filtrlanardi.
    const table = useTableState({
        ns: 'exp',
        defaultSortKey: 'date',
        defaultSortDir: 'desc',
        defaultFilters: { status: 'all' },
    });
    const searchTerm = table.debouncedSearch;
    const statusFilter = table.filters.status;
    // Standart — RO'YXAT; tanlov brauzerda saqlanadi (hooks/useViewMode).
    const [viewMode, setViewMode] = useViewMode('xarajatlar');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingExpense, setEditingExpense] = useState<Partial<Expense> | null>(null);

    const filteredExpenses = useMemo(() => {
        const q = searchTerm.toLowerCase();
        return expenses.filter(e =>
            (e.category.toLowerCase().includes(q) || (e.description?.toLowerCase().includes(q) ?? false))
            && (statusFilter === 'all' || (e.status || 'approved') === statusFilter)
        );
    }, [expenses, searchTerm, statusFilter]);

    const expenseColumns = useMemo<DataColumn<Expense>[]>(() => [
        {
            key: 'date', header: 'Sana', width: '120px',
            sortValue: e => e.date ?? '',
            exportValue: e => fmtDate(e.date),
            cell: e => <span className="text-meta font-bold font-mono" style={{ color: 'var(--text-secondary)' }}>{fmtDate(e.date)}</span>,
        },
        {
            key: 'category', header: 'Kategoriya', width: '150px',
            sortValue: e => e.category ?? '',
            cell: e => <span className="c1-badge" style={{ background: 'var(--input-bg)', color: 'var(--text-secondary)', border: '1px solid var(--card-border)' }}>{e.category}</span>,
        },
        {
            key: 'description', header: 'Izoh',
            sortValue: e => e.description ?? '',
            cell: e => <span className="text-body font-bold truncate max-w-[300px] inline-block align-middle" style={{ color: 'var(--text)' }}>{e.description || '—'}</span>,
        },
        {
            key: 'paymentMethod', header: "To'lov usuli", width: '130px',
            sortValue: e => PAYMENT_METHOD_LABELS[e.paymentMethod || 'naqd'] ?? '',
            cell: e => {
                const pm = e.paymentMethod || 'naqd';
                const c = PAYMENT_METHOD_COLORS[pm] || 'var(--text-muted)';
                return (
                    <span className="text-micro font-semibold uppercase tracking-widest px-2 py-1 rounded-lg whitespace-nowrap" style={{ color: c, background: `${c}1a`, border: `1px solid ${c}40` }}>
                        {PAYMENT_METHOD_LABELS[pm] || pm}
                    </span>
                );
            },
        },
        {
            key: 'amount', header: 'Summa', numeric: true, width: '150px',
            sortValue: e => Number(e.amount) || 0,
            exportValue: e => Number(e.amount) || 0,
            cell: e => (
                <span className="font-bold text-body" style={{ color: 'var(--danger)' }}>
                    -{formatNum(e.amount)} <span className="text-micro font-bold uppercase ml-1 opacity-60">sum</span>
                </span>
            ),
        },
        {
            key: 'status', header: 'Holat', width: '130px',
            sortValue: e => e.status ?? 'approved',
            cell: e => {
                const st = EXP_STATUS[e.status || 'approved'] || EXP_STATUS.approved;
                const canApr = e.status === 'pending' && canApproveExpense(userRole, e.amount);
                return (
                    <div className="flex items-center gap-2">
                        <span className="text-micro font-bold px-2 py-1 rounded-lg uppercase inline-flex items-center gap-1 whitespace-nowrap" style={{ background: st.bg, color: st.fg, border: `1px solid ${st.bd}` }}>
                            {e.status === 'approved' ? <CheckCircle2 size={10} /> : e.status === 'rejected' ? <XCircle size={10} /> : <Clock size={10} />} {st.label}
                        </span>
                        {canApr && onApproveExpense && (
                            <div className="flex gap-1" onClick={ev => ev.stopPropagation()}>
                                <button onClick={() => onApproveExpense(e.id)} className="w-6 h-6 flex items-center justify-center rounded-lg" style={{ background: 'var(--success)', color: 'var(--on-success)' }} aria-label="Tasdiqlash"><CheckCircle2 size={13} /></button>
                                {onRejectExpense && <button onClick={() => onRejectExpense(e.id)} className="w-6 h-6 flex items-center justify-center rounded-lg" style={{ background: 'var(--danger)', color: 'var(--on-danger)' }} aria-label="Rad etish"><XCircle size={13} /></button>}
                            </div>
                        )}
                    </div>
                );
            },
        },
        {
            key: 'actions', header: 'Amallar', align: 'right', width: '100px',
            cell: e => (
                <div className="flex items-center justify-end gap-1.5" onClick={ev => ev.stopPropagation()}>
                    <button onClick={() => { setEditingExpense(e); setIsModalOpen(true); }} className="icon-btn-sm rounded-lg" style={{ color: 'var(--accent-blue)' }} aria-label="Tahrirlash"><Edit3 size={15} /></button>
                    {onDeleteExpense && (
                        <button
                            onClick={async () => { if (await confirm({ title: "Xarajat o'chirilsinmi?", description: "Xarajat yozuvi o'chiriladi va balansga ta'sir qiladi.", confirmLabel: "O'chirish", tone: 'danger' })) onDeleteExpense(e.id); }}
                            className="icon-btn-sm rounded-lg" style={{ color: 'var(--danger)' }} aria-label="O'chirish"><Trash2 size={15} /></button>
                    )}
                </div>
            ),
        },
    ], [userRole, onApproveExpense, onRejectExpense, onDeleteExpense, confirm]);

    const stats = useMemo(() => {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const totalMonth = expenses
            .filter(e => e.date.startsWith(currentMonth))
            .reduce((sum, e) => sum + (e.amount || 0), 0);
        const totalAll = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

        return {
            totalMonth,
            totalAll,
            count: expenses.length
        };
    }, [expenses]);

    // Oylik byudjet + kategoriya limitlari (ASRO Xarajatlar prototipi)
    const budget = useMemo(() => {
        const cm = new Date().toISOString().slice(0, 7);
        const monthExp = expenses.filter(e => e.date.startsWith(cm));
        const spentOf = (keys: string[]) =>
            monthExp.filter(e => keys.some(k => (e.category || '').toLowerCase().includes(k))).reduce((s, e) => s + (e.amount || 0), 0);
        const cats = [
            { label: 'Ijara', keys: ['ijara', 'rent'], limit: 12_500_000 },
            { label: 'IT', keys: ['it', 'server', 'software'], limit: 6_000_000 },
            { label: 'Kommunal', keys: ['kommunal', 'utilit'], limit: 3_000_000 },
            { label: 'Transport', keys: ['transport'], limit: 2_000_000 },
            { label: 'Ofis', keys: ['office', 'ofis', 'kanstel', 'other'], limit: 1_500_000 },
        ].map(c => ({ label: c.label, limit: c.limit, spent: spentOf(c.keys) }));
        const totalSpent = monthExp.reduce((s, e) => s + (e.amount || 0), 0);
        const totalBudget = cats.reduce((s, c) => s + c.limit, 0);
        return { cats, totalSpent, totalBudget, remaining: totalBudget - totalSpent };
    }, [expenses]);

    const som = (v: number) => formatNum(Math.round(v));
    const fmtDate = (d: string) => (d ? formatUzDateNumeric(d) : '—');
    const STATUS_UZ: Record<string, string> = { approved: 'Tasdiqlangan', pending: 'Kutilmoqda', rejected: 'Rad etilgan' };
    const handleExport = () => {
        const rows = filteredExpenses.map(e => ({
            Sana: fmtDate(e.date),
            Kategoriya: e.category,
            Izoh: e.description || '',
            "To'lov usuli": PAYMENT_METHOD_LABELS[(e.paymentMethod as string)] || e.paymentMethod || '',
            Summa: e.amount || 0,
            Holat: STATUS_UZ[e.status || 'approved'] || e.status || '',
        }));
        exportToExcel(rows, `xarajatlar-${new Date().toISOString().slice(0, 10)}`, 'Xarajatlar');
    };
    const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);
    const limitColor = (p: number) => (p >= 100 ? 'var(--danger)' : p >= 90 ? 'var(--warning)' : 'var(--accent-blue)');

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (editingExpense) {
            await onSaveExpense(editingExpense);
            setIsModalOpen(false);
            setEditingExpense(null);
        }
    };

    const categories = ["Office", "Salary", "Tax", "Furniture", "Marketing", "Utilities", "Other"];

    return (
        <div className="space-y-4 animate-fade-in pb-20">
      <PageHeader
        icon={<Receipt size={20} />}
        title="Xarajatlar"
        description="Firma xarajatlari, tasdiqlash va byudjet nazorati"
      />
            {/* Mavjud balans — yagona kassa (kirim − chiqim − oylik) */}
            {balance && <BalanceOverview breakdown={balance} variant="compact" />}

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="dashboard-card p-5 relative overflow-hidden flex flex-col justify-between">
                    <div className="absolute top-[-20px] right-[-20px] opacity-5 pointer-events-none">
                        <TrendingDown size={140} style={{ color: 'var(--danger)' }} />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md shrink-0 bg-gradient-to-br from-[var(--danger)] to-[var(--danger-dark)]">
                                <TrendingDown size={20} />
                            </div>
                            <span className="text-meta font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>SHU OYDA</span>
                        </div>
                        <div className="text-3xl font-semibold tabular-nums leading-none mb-4" style={{ color: 'var(--text)' }}>
                            {formatNum(stats.totalMonth)} <span className="text-sm font-bold ml-1" style={{ color: 'var(--text-muted)' }}>sum</span>
                        </div>
                        <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
                            <div className="h-full w-3/4 rounded-full" style={{ background: 'var(--danger)' }}></div>
                        </div>
                    </div>
                </div>

                <div className="dashboard-card p-5 flex flex-col justify-center relative">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center border" style={{ background: 'var(--input-bg)', borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}>
                            <Receipt size={20} />
                        </div>
                        <div>
                            <span className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>UMUMIY</span>
                            <h4 className="font-bold text-body tracking-tight" style={{ color: 'var(--text)' }}>Jami xarajat</h4>
                        </div>
                    </div>
                    <div className="text-2xl font-semibold tabular-nums tracking-tight leading-none" style={{ color: 'var(--text)' }}>
                        {formatNum(stats.totalAll)} <span className="text-xs font-bold ml-1" style={{ color: 'var(--text-muted)' }}>sum</span>
                    </div>
                </div>

                <div className="dashboard-card p-5 flex flex-col justify-center relative">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center border" style={{ background: 'var(--input-bg)', borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}>
                            <Tag size={20} />
                        </div>
                        <div>
                            <span className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>FAOLLIK</span>
                            <h4 className="font-bold text-body tracking-tight" style={{ color: 'var(--text)' }}>Tranzaksiyalar</h4>
                        </div>
                    </div>
                    <div className="flex items-end gap-2 leading-none">
                        <span className="text-3xl font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{stats.count}</span>
                        <span className="text-meta font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>QAYD</span>
                    </div>
                </div>
            </div>

            {/* Byudjet paneli + kategoriya limitlari (ASRO prototip) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 dashboard-card p-5">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Oylik byudjet</h3>
                        <span className="text-body font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                            {som(budget.totalSpent)} <span className="text-meta font-bold" style={{ color: 'var(--text-muted)' }}>/ {som(budget.totalBudget)} so&apos;m</span>
                        </span>
                    </div>
                    <div className="h-3 w-full rounded-full overflow-hidden" style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct(budget.totalSpent, budget.totalBudget)}%`, background: limitColor(pct(budget.totalSpent, budget.totalBudget)) }} />
                    </div>
                    <p className="text-meta font-bold mt-2" style={{ color: budget.remaining >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        Qoldiq: {som(Math.abs(budget.remaining))} so&apos;m {budget.remaining < 0 ? '(oshib ketdi)' : ''}
                    </p>
                </div>
                <div className="dashboard-card p-5">
                    <h3 className="text-xs font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Kategoriya limitlari</h3>
                    <div className="space-y-3">
                        {budget.cats.map(c => {
                            const p = pct(c.spent, c.limit);
                            return (
                                <div key={c.label}>
                                    <div className="flex justify-between text-meta font-bold mb-1">
                                        <span style={{ color: 'var(--text-secondary)' }}>{c.label}</span>
                                        <span style={{ color: limitColor(p) }}>{(c.spent / 1_000_000).toFixed(1)}<span style={{ color: 'var(--text-muted)' }}> / {c.limit / 1_000_000} mln</span></span>
                                    </div>
                                    <div className="h-1.5 rounded-full" style={{ background: 'var(--input-bg)' }}>
                                        <div className="h-1.5 rounded-full" style={{ width: `${p}%`, background: limitColor(p) }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Tasdiqlash oqimi banner */}
            {(() => {
                const pending = expenses.filter(e => e.status === 'pending');
                if (pending.length === 0) return null;
                return (
                    <div className="p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2" style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)' }}>
                        <div className="flex items-center gap-2">
                            <Clock size={16} style={{ color: 'var(--warning)' }} />
                            <span className="text-xs font-bold" style={{ color: 'var(--warning)' }}>{pending.length} ta xarajat tasdiq kutmoqda</span>
                        </div>
                        <span className="text-micro font-medium" style={{ color: 'var(--text-muted)' }}>&lt;1 mln avto · 1–10 mln Bosh Buxgalter · &gt;10 mln Superadmin</span>
                    </div>
                );
            })()}

            <div className="flex items-center justify-between gap-3 flex-wrap">
                <TableToolbar
                    view={viewMode}
                    onViewChange={setViewMode}
                    search={table.search}
                    onSearchChange={table.setSearch}
                    searchPlaceholder="Qidirish..."
                    onExport={filteredExpenses.length ? handleExport : undefined}
                    filterCount={statusFilter !== 'all' ? 1 : 0}
                    filter={
                        <div className="flex flex-col gap-1.5">
                            <span className="text-micro font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>Holat</span>
                            <select
                                value={statusFilter}
                                onChange={(e) => table.setFilter('status', e.target.value)}
                                className="rounded-lg py-2 px-3 text-xs font-bold outline-none"
                                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                            >
                                <option value="all">Barcha holat</option>
                                <option value="approved">Tasdiqlangan</option>
                                <option value="pending">Kutilmoqda</option>
                                <option value="rejected">Rad etilgan</option>
                            </select>
                        </div>
                    }
                />
                <Button variant="danger" size="md" onClick={() => { setEditingExpense({ date: new Date().toISOString().split('T')[0], category: 'Office', amount: 0, paymentMethod: 'naqd' }); setIsModalOpen(true); }} className="whitespace-nowrap">
                    <Plus size={16} />
                    <span>Yangi Xarajat</span>
                </Button>
            </div>

            {/* Kartochka ko'rinishi (grid) */}
            {/* Karta ko'rinishi — ATAYLAB unmount qilinadi. Avval `hidden` sinfi
                bilan yashirilardi, ya'ni React ikkala ko'rinishni ham quraverardi. */}
            {viewMode === 'grid' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredExpenses.map((expense) => {
                    const st = EXP_STATUS[expense.status || 'approved'] || EXP_STATUS.approved;
                    const canApr = expense.status === 'pending' && canApproveExpense(userRole, expense.amount);
                    const pm = expense.paymentMethod || 'naqd';
                    const pmc = PAYMENT_METHOD_COLORS[pm] || 'var(--text-muted)';
                    return (
                        <div key={expense.id} className="dashboard-card p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="c1-badge" style={{ background: 'var(--input-bg)', color: 'var(--text-secondary)', border: '1px solid var(--card-border)' }}>{expense.category}</span>
                                        <span className="text-micro font-bold px-2 py-1 rounded-lg uppercase inline-flex items-center gap-1" style={{ background: st.bg, color: st.fg, border: `1px solid ${st.bd}` }}>
                                            {expense.status === 'approved' ? <CheckCircle2 size={10} /> : expense.status === 'rejected' ? <XCircle size={10} /> : <Clock size={10} />} {st.label}
                                        </span>
                                    </div>
                                    <div className="text-body font-bold mt-1.5 truncate" style={{ color: 'var(--text)' }}>{expense.description || '—'}</div>
                                    <div className="flex items-center gap-2 mt-1 text-meta font-bold" style={{ color: 'var(--text-muted)' }}>
                                        <span className="font-mono">{fmtDate(expense.date)}</span>
                                        <span className="text-micro font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded-lg" style={{ color: pmc, background: `${pmc}1a` }}>{PAYMENT_METHOD_LABELS[pm] || pm}</span>
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="font-semibold text-sm tabular-nums" style={{ color: 'var(--danger)' }}>-{formatNum(expense.amount)}</div>
                                    <div className="text-micro font-bold uppercase" style={{ color: 'var(--text-muted)' }}>sum</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--card-border)' }}>
                                {canApr && onApproveExpense && (
                                    <>
                                        <Button variant="success" size="md" onClick={() => onApproveExpense(expense.id)} className="flex-1"><CheckCircle2 size={13} /> Tasdiq</Button>
                                        {onRejectExpense && <Button variant="danger" size="md" onClick={() => onRejectExpense(expense.id)} className="flex-1"><XCircle size={13} /> Rad</Button>}
                                    </>
                                )}
                                <button onClick={() => { setEditingExpense(expense); setIsModalOpen(true); }} className="flex-1 py-2 rounded-lg text-meta font-semibold uppercase tracking-widest flex items-center justify-center gap-1.5" style={{ color: 'var(--accent-blue)', background: 'var(--accent-blue-light)' }}><Edit3 size={13} /> Tahrir</button>
                                {onDeleteExpense && (
                                    <button onClick={async () => { if (await confirm({ title: "Xarajat o'chirilsinmi?", description: "Xarajat yozuvi o'chiriladi va balansga ta'sir qiladi.", confirmLabel: "O'chirish", tone: 'danger' })) onDeleteExpense(expense.id); }} className="w-10 py-2 rounded-lg flex items-center justify-center shrink-0" style={{ color: 'var(--danger)', background: 'var(--danger-bg)' }}><Trash2 size={14} /></button>
                                )}
                            </div>
                        </div>
                    );
                })}
                {filteredExpenses.length === 0 && (
                    <div className="dashboard-card p-5 text-center">
                        <Search size={36} className="mx-auto mb-3 opacity-20" style={{ color: 'var(--text-muted)' }} />
                        <span className="text-meta font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Ma&apos;lumot topilmadi</span>
                    </div>
                )}
            </div>
            )}

            {/* Expense List (desktop) — DataTable platformasi */}
            {viewMode === 'list' && (
                <DataTable<Expense>
                    caption="Xarajatlar ro'yxati"
                    rows={filteredExpenses}
                    columns={expenseColumns}
                    rowKey={e => e.id}
                    sortKey={table.sortKey}
                    sortDir={table.sortDir}
                    onToggleSort={table.toggleSort}
                    density={table.density}
                    page={table.page}
                    pageSize={50}
                    onPageChange={table.setPage}
                    selected={selectedIds}
                    onSelectedChange={setSelectedIds}
                    emptyIcon={<Search size={36} />}
                    emptyTitle="Xarajat topilmadi"
                    emptyDescription={table.isDirty ? "Qidiruv yoki filtrni o'zgartirib ko'ring." : undefined}
                    bulkActions={onDeleteExpense ? (ids) => (
                        <button
                            type="button"
                            onClick={async () => {
                                const total = ids.reduce((sum, id) => sum + (Number(expenses.find(e => e.id === id)?.amount) || 0), 0);
                                const ok = await confirm({
                                    title: `${ids.length} ta xarajat o'chirilsinmi?`,
                                    description: `Jami ${formatNum(total)} so'm. Balansga ta'sir qiladi va ortga qaytarilmaydi.`,
                                    confirmLabel: "O'chirish",
                                    tone: 'danger',
                                });
                                if (!ok) return;
                                for (const id of ids) await onDeleteExpense(id);
                                setSelectedIds(new Set());
                            }}
                            className="text-meta font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg"
                            style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}
                        >
                            O&apos;chirish
                        </button>
                    ) : undefined}
                />
            )}            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity animate-fade-in">
                    <div className="w-full max-w-lg shadow-2xl relative overflow-hidden dashboard-card !p-0">
                        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'var(--danger)' }}></div>
                        <div className="px-6 py-5 flex justify-between items-center" style={{ borderBottom: '1px solid var(--card-border)' }}>
                            <div>
                                <h3 className="text-body font-bold" style={{ color: 'var(--text)' }}>Xarajatni kiritish</h3>
                                <p className="text-micro font-bold uppercase tracking-widest mt-1" style={{ color: 'var(--text-muted)' }}>TRANZAKSIYA TAFSILOTLARINI KIRITING</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="icon-btn-sm transition-all icon-btn-danger" style={{ color: 'var(--text-muted)', background: 'var(--input-bg)' }}>
                                <Plus size={20} className="rotate-45" />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 space-y-5"
                            onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); e.currentTarget.requestSubmit(); } }}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="space-y-2">
                                    <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{t.amount}</label>
                                    <div className="relative">
                                        <input
                                            type="text" inputMode="numeric"
                                            value={groupDigits(editingExpense?.amount || '')}
                                            onChange={(e) => setEditingExpense(prev => ({ ...prev, amount: Number(ungroupDigits(e.target.value)) }))}
                                            className="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none transition-all focus:ring-2 focus:ring-[var(--danger)] focus:ring-opacity-20 tracking-tight"
                                            style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}
                                            required
                                        />
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-micro font-bold uppercase" style={{ color: 'var(--text-muted)' }}>sum</div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{t.date}</label>
                                    <input
                                        type="date"
                                        value={editingExpense?.date || ''}
                                        onChange={(e) => setEditingExpense(prev => ({ ...prev, date: e.target.value }))}
                                        className="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none transition-all focus:ring-2 focus:ring-[var(--danger)] focus:ring-opacity-20 tracking-tight"
                                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--danger)' }}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{t.category}</label>
                                    <select
                                        value={editingExpense?.category || 'Other'}
                                        onChange={(e) => setEditingExpense(prev => ({ ...prev, category: e.target.value }))}
                                        className="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none transition-all focus:ring-2 focus:ring-[var(--danger)] focus:ring-opacity-20 tracking-tight"
                                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}
                                    >
                                        {categories.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>To&apos;lov usuli</label>
                                    <select
                                        value={editingExpense?.paymentMethod || 'naqd'}
                                        onChange={(e) => setEditingExpense(prev => ({ ...prev, paymentMethod: e.target.value }))}
                                        className="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none transition-all focus:ring-2 focus:ring-[var(--danger)] focus:ring-opacity-20 tracking-tight"
                                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}
                                    >
                                        {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label.toUpperCase()}</option>)}
                                    </select>
                                </div>
                                {/* Pul MANBAI — "to'lov usuli" dan farqli: usul naqd/plastik/schyot
                                    ekanini aytadi, manba esa KIMNING hisobidan chiqqanini. */}
                                <div className="space-y-2 md:col-span-2">
                                    <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                                        Pul manbai <span style={{ color: 'var(--danger)' }}>*</span>
                                    </label>
                                    <FundingSourceSelect
                                        value={editingExpense?.channelId || ''}
                                        onChange={(channelId) => setEditingExpense(prev => ({ ...prev, channelId }))}
                                        className="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none transition-all focus:ring-2 focus:ring-[var(--danger)] focus:ring-opacity-20 tracking-tight"
                                    />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{t.comment}</label>
                                    <input
                                        type="text"
                                        placeholder="IXTIYORIY IZOH..."
                                        value={editingExpense?.description || ''}
                                        onChange={(e) => setEditingExpense(prev => ({ ...prev, description: e.target.value }))}
                                        className="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none transition-all focus:ring-2 focus:ring-[var(--danger)] focus:ring-opacity-20 tracking-tight"
                                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 pt-6 mt-6" style={{ borderTop: '1px solid var(--card-border)' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-4 py-3 rounded-xl font-bold text-meta uppercase tracking-widest transition-all shadow-sm"
                                    style={{ background: 'var(--input-bg)', color: 'var(--text-secondary)', border: '1px solid var(--card-border)' }}
                                >
                                    {t.cancel}
                                </button>
                                <Button variant="danger" size="md" type="submit" className="flex-1">
                                    SAQLASH
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ExpenseModule;
