"use client";

import React, { useState, useMemo } from 'react';
import { useViewMode } from '@/hooks/useViewMode';
import { Expense, Language } from '@/types';
import { translations } from '@/lib/translations';
import { Plus, Search, Edit3, Trash2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { exportObjectsToExcel } from '@/lib/exportTable';
import { canApproveExpense } from '@/lib/expenseApproval';
import BalanceOverview from '@/components/BalanceOverview';
import { TableToolbar } from '@/components/ui/TableToolbar';
import { formatUzDateNumeric, formatNum } from '@/lib/platform/format';
import { todayKey, submitOnCtrlEnter } from '@/lib/platform/format';
import type { BalanceBreakdown } from '@/types';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { DataTable, type DataColumn } from '@/components/ui/DataTable';
import { useTableState } from '@/hooks/useTableState';
import { usePageSize } from "@/hooks/usePageSize";
import { StatStrip } from "@/components/ui/StatStrip";
import { Badge, EmptyState, Modal, type BadgeTone } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { MoneyField } from "@/components/ui/MoneyField";
import { Select } from "@/components/ui/Select";
import FundingSourceSelect from "@/components/ui/FundingSourceSelect";
import { periodKeyOf } from '@/lib/periods';
import { DateField } from './ui/DateField';

/** Modal pastidagi tugma formadan tashqarida — `form` atributi bog'laydi. */
const EXPENSE_FORM_ID = 'expense-form';

const EXP_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
    approved: { label: 'Tasdiqlangan', tone: 'success' },
    pending: { label: 'Kutilmoqda', tone: 'warning' },
    rejected: { label: 'Rad etildi', tone: 'danger' },
};

// Korxona lug'atini o'qib bo'lmaganda ishlaydigan zaxira ro'yxat.
const FALLBACK_CATEGORIES = ["Arenda", "Soliqlar", "Bank usluga", "Ovqatga", "Kommunal (svet)", "Texnika", "Marketing", "Boshqa xarajatlar"];

interface ExpenseModuleProps {
    expenses: Expense[];
    lang: Language;
    userRole?: string;
    balance?: BalanceBreakdown;
    /**
     * Korxona lug'atidan kelgan xarajat toifalari (`/expenses/page.tsx`).
     * Berilmasa eski qattiq ro'yxat ishlaydi — komponent Dashboard kabi
     * boshqa joylardan ham chaqirilishi mumkin.
     */
    categories?: string[];
    onSaveExpense: (expense: Partial<Expense>) => Promise<void>;
    onDeleteExpense?: (id: string) => Promise<void>;
    onApproveExpense?: (id: string) => Promise<void>;
    onRejectExpense?: (id: string) => Promise<void>;
}

const ExpenseModule: React.FC<ExpenseModuleProps> = ({ expenses, lang, userRole = '', balance, categories, onSaveExpense, onDeleteExpense, onApproveExpense, onRejectExpense }) => {
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
    const [pageSize, setPageSize] = usePageSize("expenses");
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
            key: 'date', header: 'Sana', width: '120px', mobile: 'meta',
            sortValue: e => e.date ?? '',
            exportValue: e => fmtDate(e.date),
            cell: e => <span className="text-meta font-bold font-mono" style={{ color: 'var(--text-secondary)' }}>{fmtDate(e.date)}</span>,
        },
        {
            key: 'category', header: 'Kategoriya', width: '150px',
            sortValue: e => e.category ?? '',
            cell: e => <Badge tone="neutral">{e.category}</Badge>,
        },
        {
            key: 'description', header: 'Izoh', mobile: 'title',
            sortValue: e => e.description ?? '',
            cell: e => <span className="text-body font-bold truncate max-w-[300px] inline-block align-middle" style={{ color: 'var(--text)' }}>{e.description || '—'}</span>,
        },
        // "TO'LOV USULI" USTUNI OLIB TASHLANDI. `paymentMethod` maydoni
        // `KassaEntry` ga birlashtirilganda o'chirilgan edi — bu ustun esa
        // har qatorga standart "Naqd" ni soxta ko'rsatib turardi (bazada
        // maydon yo'q, klient qiymatni o'zi uylab topardi). Haqiqiy ma'lumot
        // — pul MANBAI (`channelId`), u modalda FundingSourceSelect orqali.
        {
            key: 'amount', header: 'Summa', numeric: true, width: '150px',
            sortValue: e => Number(e.amount) || 0,
            exportValue: e => Number(e.amount) || 0,
            cell: e => (
                <span className="font-bold text-body" style={{ color: 'var(--accent-red)' }}>
                    −{formatNum(e.amount)} <span className="text-micro font-bold uppercase ml-1 opacity-60">so&apos;m</span>
                </span>
            ),
        },
        {
            key: 'status', header: 'Holat', width: '130px', mobile: 'status',
            sortValue: e => e.status ?? 'approved',
            cell: e => {
                const st = EXP_STATUS[e.status || 'approved'] || EXP_STATUS.approved;
                const canApr = e.status === 'pending' && canApproveExpense(userRole, e.amount);
                return (
                    <div className="flex items-center gap-2">
                        <Badge
                            tone={st.tone}
                            icon={e.status === 'approved' ? <CheckCircle2 size={10} /> : e.status === 'rejected' ? <XCircle size={10} /> : <Clock size={10} />}
                        >
                            {st.label}
                        </Badge>
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
        // Oy kaliti MAHALLIY (`periodKeyOf`) — UTC `toISOString` oy
        // chegarasida server bilan klientga turlicha oy ko'rsatardi.
        const currentMonth = periodKeyOf(new Date());
        const byMonth = new Map<string, number>();
        for (const e of expenses) {
            const key = (e.date || '').slice(0, 7);
            if (!key) continue;
            byMonth.set(key, (byMonth.get(key) ?? 0) + (e.amount || 0));
        }
        const totalMonth = byMonth.get(currentMonth) ?? 0;
        // Eng katta oy — progress shunga nisbatan: ilgari chiziq SOXTA
        // `w-3/4` edi, hech qanday ma'lumotga bog'lanmagandi.
        const maxMonth = Math.max(1, ...byMonth.values());
        const totalAll = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

        return {
            totalMonth,
            totalAll,
            maxMonth,
            count: expenses.length,
        };
    }, [expenses]);

    const fmtDate = (d: string) => (d ? formatUzDateNumeric(d) : '—');
    const STATUS_UZ: Record<string, string> = { approved: 'Tasdiqlangan', pending: 'Kutilmoqda', rejected: 'Rad etilgan' };
    const handleExport = () => {
        const rows = filteredExpenses.map(e => ({
            Sana: fmtDate(e.date),
            Kategoriya: e.category,
            Izoh: e.description || '',
            Summa: e.amount || 0,
            Holat: STATUS_UZ[e.status || 'approved'] || e.status || '',
        }));
        void exportObjectsToExcel(rows, `xarajatlar-${new Date().toISOString().slice(0, 10)}`, 'Xarajatlar');
    };

    // Saqlash hodisadan AJRATILDI: tugma modal pastida (forma ichida emas)
    // va Ctrl+Enter ham shu yo'ldan o'tadi.
    const saveExpense = async () => {
        if (!editingExpense) return;
        await onSaveExpense(editingExpense);
        setIsModalOpen(false);
        setEditingExpense(null);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        await saveExpense();
    };

    // Korxona lug'ati (sozlamadan). Eski qattiq inglizcha ro'yxat
    // ("Office", "Salary"…) bazadagi hech bir toifaga mos kelmasdi va
    // undan tanlangan xarajat hisobotlarda begona modda bo'lib qolardi.
    const categoryOptions = useMemo(() => {
        const base = (categories && categories.length > 0 ? categories : FALLBACK_CATEGORIES).slice();
        // Tahrirlanayotgan yozuvning o'z toifasi ham ro'yxatda tursin —
        // aks holda eski/begona toifa select'dan "yo'qolardi".
        const current = editingExpense?.category;
        if (current && !base.includes(current)) base.unshift(current);
        return base;
    }, [categories, editingExpense?.category]);

    return (
        <div className="space-y-4 animate-fade-in pb-20">
      {/*
        SAHIFA SARLAVHASI OLIB TASHLANDI. Bu modul `/kassa/chiqim` ning
        "Xarajat" YORLIG'I ichida ochiladi — sahifada allaqachon
        "Chiqim kassa" sarlavhasi va faol yorliq turibdi. Ikkinchi
        sarlavha ekranda ikkita sahifa borday taassurot berardi.
      */}
            {/* Mavjud balans — yagona kassa (kirim − chiqim − oylik) */}
            {balance && <BalanceOverview breakdown={balance} variant="compact" />}

            {/*
              KO'RSATKICHLAR — umumiy `StatStrip` tilida.

              Ilgari bu yerda uchta `dashboard-card` bor edi va ularning
              har biri boshqacha yasалган: birinchisi gradient ikonka +
              140px dekorativ fon rasmi + `text-3xl`, ikkinchisi ramkali
              ikonka + `text-2xl`, uchinchisi yana `text-3xl`. Uchala
              karta ekranning butun ekran balandligini egallar, ma'lumot
              esa uch qatorga sig'ardi.

              "Tranzaksiyalar 227 QAYD" ALOHIDA ko'rsatkich sifatida olib
              tashlandi: qayd soni o'z-o'zicha qaror qabul qildirmaydi, u
              jami summaning izohi — shuning uchun `meta` ga tushdi.
            */}
            <StatStrip
              items={[
                { label: "Shu oyda", value: stats.totalMonth, tone: "out", emphasis: true },
                { label: "Jami xarajat", value: stats.totalAll, tone: "neutral", meta: `${stats.count} qayd` },
              ]}
            />

            {/*
              BYUDJET PANELI VA KATEGORIYA LIMITLARI OLIB TASHLANDI.

              Ular SOXTA ma'lumot ko'rsatardi: limitlar shu komponentning
              ichida qotirilgan edi — Ijara 12,5 mln · IT 6 mln · Kommunal
              3 mln · Transport 2 mln · Ofis 1,5 mln — va hech qanday
              sozlamadan kelmasdi. "Oylik byudjet 25 000 000" ham shu
              beshtaning yig'indisi edi.

              Ya'ni ekranda "Qoldiq: 24 550 000 so'm" deb turardi, holbuki
              o'sha byudjetni hech kim belgilamagan. Moliyaviy ekranda
              o'ylab topilgan raqam bo'sh joydan yomonroq: u noto'g'ri
              ishonch beradi.

              Toifalarni moslashtirish ham ishonchsiz edi: `'it'` kaliti
              `includes()` bilan qidirilardi, ya'ni tarkibida "it" bo'lgan
              HAR QANDAY toifa "IT" byudjetiga tushardi.

              Haqiqiy byudjet kerak bo'lsa: limitlar `SystemSetting` da
              saqlanib, admin sozlamalaridan kelishi kerak — aynan
              `lib/kassaCategories.ts` toifalar bilan qilgani kabi.
            */}

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
                        <Field label="Holat" className="min-w-[180px]">
                            <Select value={statusFilter} onChange={(e) => table.setFilter('status', e.target.value)}>
                                <option value="all">Barcha holat</option>
                                <option value="approved">Tasdiqlangan</option>
                                <option value="pending">Kutilmoqda</option>
                                <option value="rejected">Rad etilgan</option>
                            </Select>
                        </Field>
                    }
                />
                {/* "Yangi xarajat" — YARATISH amali, `danger` (qizil) emas:
                    qizil holat rangi xato/o'chirish ma'nosida qolishi kerak. */}
                <Button variant="primary" size="md" onClick={() => { setEditingExpense({ date: todayKey(), category: categoryOptions[0] || '', amount: 0 }); setIsModalOpen(true); }} className="whitespace-nowrap">
                    <Plus size={16} />
                    <span>Yangi xarajat</span>
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
                    return (
                        <div key={expense.id} className="dashboard-card p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Badge tone="neutral">{expense.category}</Badge>
                                        <Badge
                                            tone={st.tone}
                                            icon={expense.status === 'approved' ? <CheckCircle2 size={10} /> : expense.status === 'rejected' ? <XCircle size={10} /> : <Clock size={10} />}
                                        >
                                            {st.label}
                                        </Badge>
                                    </div>
                                    <div className="text-body font-bold mt-1.5 truncate" style={{ color: 'var(--text)' }}>{expense.description || '—'}</div>
                                    <div className="flex items-center gap-2 mt-1 text-meta font-bold" style={{ color: 'var(--text-muted)' }}>
                                        <span className="font-mono">{fmtDate(expense.date)}</span>
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="font-semibold text-sm tabular-nums" style={{ color: 'var(--accent-red)' }}>−{formatNum(expense.amount)}</div>
                                    <div className="text-micro font-bold uppercase" style={{ color: 'var(--text-muted)' }}>so&apos;m</div>
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
                    <div className="dashboard-card !p-0 md:col-span-2 lg:col-span-3">
                        <EmptyState
                            icon={<Search size={28} />}
                            title="Xarajat topilmadi"
                            description={table.isDirty ? "Qidiruv yoki filtrni o'zgartirib ko'ring." : undefined}
                            action={table.isDirty ? (
                                <Button variant="secondary" size="sm" onClick={table.reset}>Filtrni tozalash</Button>
                            ) : undefined}
                        />
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
                    pageSize={pageSize}
                        onPageSizeChange={setPageSize}
                    onPageChange={table.setPage}
                    selected={selectedIds}
                    onSelectedChange={setSelectedIds}
                    emptyIcon={<Search size={36} />}
                    emptyTitle="Xarajat topilmadi"
                    emptyDescription={table.isDirty ? "Qidiruv yoki filtrni o'zgartirib ko'ring." : undefined}
                    bulkActions={(onDeleteExpense || onApproveExpense) ? (ids) => {
                        // Faqat "kutilmoqda" VA shu foydalanuvchi tasdiqlay oladigan
                        // summadagi qatorlar — checkbox har narsani belgilashi mumkin,
                        // lekin tugma huquqdan tashqarisini jimgina o'tkazib yubormaydi.
                        const approvableIds = onApproveExpense
                            ? ids.filter((id) => {
                                const e = expenses.find((x) => x.id === id);
                                return e && e.status === 'pending' && canApproveExpense(userRole, Number(e.amount));
                            })
                            : [];
                        return (
                            <>
                                {onApproveExpense && approvableIds.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            for (const id of approvableIds) await onApproveExpense(id);
                                            setSelectedIds(new Set());
                                        }}
                                        className="text-meta font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg"
                                        style={{ background: 'var(--success-bg)', color: 'var(--success)' }}
                                    >
                                        Tasdiqlash ({approvableIds.length})
                                    </button>
                                )}
                                {onDeleteExpense && (
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
                                )}
                            </>
                        );
                    } : undefined}
                />
            )}            {/*
                OYNA endi `Modal` primitivida. Ilgari bu yerda qo'lda yozilgan
                `fixed inset-0 z-[100] bg-black/60` qatlami turardi — u
                `--z-*` shkalasini chetlab o'tar va fonni Tailwind palitrasidan
                olardi (loyihada rang faqat tokenlardan keladi). Har maydon
                esa 100 belgilik bir xil klass satrini takrorlardi.

                Yuqoridagi qizil chiziq olib tashlandi: oynaning MAVZUSI
                sarlavhadan bilinadi, chiziq esa qolgan oynalardan farq
                qilardi.
            */}
            <Modal
                open={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                size="lg"
                title={editingExpense?.id ? 'Xarajatni tahrirlash' : 'Xarajatni kiritish'}
                description="Tranzaksiya tafsilotlarini kiriting."
                footer={
                    <>
                        <Button type="button" variant="secondary" size="md" onClick={() => setIsModalOpen(false)}>
                            {t.cancel}
                        </Button>
                        <Button type="submit" form={EXPENSE_FORM_ID} variant="primary" size="md">
                            Saqlash
                        </Button>
                    </>
                }
            >
                <form
                    id={EXPENSE_FORM_ID}
                    onSubmit={handleSave}
                    onKeyDown={submitOnCtrlEnter(() => { void saveExpense(); })}
                    className="space-y-3"
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Field label={t.amount} required>
                            <MoneyField
                                value={editingExpense?.amount ?? null}
                                onChange={(v) => setEditingExpense(prev => ({ ...prev, amount: v ?? 0 }))}
                                required
                            />
                        </Field>
                        <Field label={t.date} required>
                            <DateField
                                value={editingExpense?.date || ''}
                                onChange={(v) => setEditingExpense(prev => ({ ...prev, date: v }))}
                                required
                            />
                        </Field>
                        <Field label={t.category} required>
                            <Select
                                value={editingExpense?.category || categoryOptions[0] || ''}
                                onChange={(e) => setEditingExpense(prev => ({ ...prev, category: e.target.value }))}
                            >
                                {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                            </Select>
                        </Field>
                        {/* Pul MANBAI — "to'lov usuli" dan farqli: manba
                            KIMNING hisobidan chiqqanini beradi. Eski
                            "To'lov usuli" selecti bazada yo'q maydonni
                            tahrirlardi va olib tashlandi. */}
                        <Field label="Pul manbai" required>
                            <FundingSourceSelect
                                value={editingExpense?.channelId || ''}
                                onChange={(channelId) => setEditingExpense(prev => ({ ...prev, channelId }))}
                            />
                        </Field>
                        <div className="md:col-span-2">
                            <Field label={t.comment}>
                                <input
                                    type="text"
                                    placeholder="Ixtiyoriy izoh…"
                                    value={editingExpense?.description || ''}
                                    onChange={(e) => setEditingExpense(prev => ({ ...prev, description: e.target.value }))}
                                    className="erp-input w-full"
                                />
                            </Field>
                        </div>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default ExpenseModule;
