"use client";

import React, { useState, useMemo } from 'react';
import { useModalA11y } from '@/hooks/useModalA11y';
import { useViewMode } from '@/hooks/useViewMode';
import { Company, Payment, PaymentStatus, Language } from '@/types';
import { translations } from '@/lib/translations';
import { Wallet, Search, Plus, CheckCircle2, Clock, Trash2, CreditCard, Loader2 } from 'lucide-react';
import { TableToolbar } from "@/components/ui/TableToolbar";
import { toast } from 'sonner';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, PAYMENT_METHOD_COLORS } from '@/lib/constants';
import { formatNum } from "@/lib/format";
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Button } from "@/components/ui/Button";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { useTableState } from "@/hooks/useTableState";
import { MonthPicker } from './ui/MonthPicker';

interface KassaModuleProps {
    companies: Company[];
    payments: Payment[];
    /**
     * companyId → SERVERDA hisoblangan qarz (`lib/debt.ts`).
     *
     * Klient pulni O'ZI HISOBLAMAYDI. Ilgari bu faylda `contractAmount −
     * shu davr to'lovi` formulasi IKKI MARTA yozilgan edi (ustunda va
     * kartochkada) va u `PAYMENT_TERM_MONTHS` ni bilmasdi — ya'ni "iyulning
     * puli avgustda" qoidasi ekranda ishlamasdi va raqam Telegram
     * hisobotidagidan farq qilardi.
     */
    debtByCompany?: Record<string, { dueNow: number; overdue: number; outstanding: number }>;
    lang: Language;
    onSavePayment: (payment: Partial<Payment>) => Promise<void>;
    onDeletePayment: (id: string) => Promise<void>;
}

const KassaModule: React.FC<KassaModuleProps> = ({ companies, payments, debtByCompany = {}, lang, onSavePayment, onDeletePayment }) => {
    const table = useTableState({ ns: 'kassa', defaultSortKey: 'name' });
  const confirm = useConfirm();
    const t = translations[lang];
    const [searchTerm, setSearchTerm] = useState('');
    // Standart — RO'YXAT; tanlov brauzerda saqlanadi (hooks/useViewMode).
    const [viewMode, setViewMode] = useViewMode('kassa');
    const [selectedPeriod, setSelectedPeriod] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [isModalOpen, setIsModalOpen] = useState(false);

    // DIALOG XULQI — fokus tuzog'i, Escape, scroll qulfi, fokusni qaytarish.
    //
    // Bu oyna `fixed inset-0` bilan qo'lda yozilgan va DOM'da `role="dialog"`
    // umuman yo'q edi: ekran o'quvchi uni oyna deb e'lon qilmasdi, Tab esa
    // foydalanuvchini oyna ORTIDAGI sahifaga olib chiqib ketardi va u yerdan
    // klaviatura bilan qaytib bo'lmasdi. Tartib o'zgarmaydi — faqat xulq.
    const modalRef = useModalA11y<HTMLDivElement>({
        open: isModalOpen,
        onClose: () => setIsModalOpen(false),
    });
    const [editingPayment, setEditingPayment] = useState<Partial<Payment> | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const filteredData = useMemo(() => {
        return companies.map(c => {
            const payment = payments.find(p => p.companyId === c.id && p.period === selectedPeriod);
            return {
                ...c,
                payment
            };
        }).filter(c =>
            c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.inn.includes(searchTerm)
        );
    }, [companies, payments, searchTerm, selectedPeriod]);

    const stats = useMemo(() => {
        let baseExpected = 0;
        let remainingExpected = 0;

        companies.forEach(c => {
            const contractAmt = Number(c.contractAmount || 0);
            baseExpected += contractAmt;

            const debtInfo = debtByCompany[c.id];
            if (debtInfo !== undefined) {
                remainingExpected += debtInfo.outstanding;
            } else {
                const paymentForCompany = payments.find(p => p.companyId === c.id && p.period === selectedPeriod);
                let paidAmt = 0;
                if (paymentForCompany && (paymentForCompany.status === PaymentStatus.PAID || paymentForCompany.status === PaymentStatus.PARTIAL)) {
                    paidAmt = Number(paymentForCompany.amount || 0);
                }
                remainingExpected += Math.max(0, contractAmt - paidAmt);
            }
        });

        const totalPaid = payments
            .filter(p => p.period === selectedPeriod && (p.status === PaymentStatus.PAID || p.status === PaymentStatus.PARTIAL))
            .reduce((sum, p) => sum + Number(p.amount || 0), 0);
            
        const pendingCount = filteredData.filter(c => !c.payment || (c.payment.status !== PaymentStatus.PAID && c.payment.status !== PaymentStatus.PARTIAL)).length;

        return {
            baseExpected,
            remainingExpected,
            totalPaid,
            percent: baseExpected > 0 ? Math.round((totalPaid / baseExpected) * 100) : 0,
            pendingCount
        };
    }, [companies, payments, debtByCompany, selectedPeriod, filteredData]);
    /**
     * Qolgan to'lov — ustunda ham, saralashda ham, eksportda ham, kartochkada
     * ham AYNAN BIR XIL. Manba: server (`lib/debt.ts` → `getDebtors`).
     *
     * Serverda qatori yo'q firma = qarzi yo'q (0). Bu to'g'ri: `listDebtors`
     * faqat qoldig'i borlarni qaytaradi.
     */
    const remaining = (item: { id: string }) => debtByCompany[item.id]?.outstanding ?? 0;

    const kassaColumns = useMemo<DataColumn<(typeof filteredData)[number]>[]>(() => [
        {
            key: 'name', header: t.companyName,
            sortValue: item => item.name,
            cell: item => (
                <div>
                    <div className="font-bold text-body tracking-tight truncate max-w-[250px]" style={{ color: 'var(--text)' }}>{item.name}</div>
                    {item.brandName && <p className="text-micro font-bold uppercase tracking-widest mt-0.5 truncate max-w-[250px]" style={{ color: 'var(--text-muted)' }}>{item.brandName}</p>}
                </div>
            ),
        },
        {
            key: 'inn', header: t.inn, width: '120px',
            sortValue: item => item.inn,
            cell: item => <span className="font-mono text-meta font-bold" style={{ color: 'var(--text-secondary)' }}>{item.inn}</span>,
        },
        {
            key: 'due', header: 'Kutilayotgan', numeric: true, width: '160px',
            sortValue: item => remaining(item),
            exportValue: item => remaining(item),
            cell: item => (
                <span className="font-bold text-body" style={{ color: 'var(--text)' }}>
                    {formatNum(remaining(item))} <span className="text-micro font-bold ml-1 uppercase" style={{ color: 'var(--text-muted)' }}>sum</span>
                </span>
            ),
        },
        {
            key: 'status', header: t.status, align: 'center', width: '140px',
            sortValue: item => item.payment?.status ?? 'KUTILMOQDA',
            cell: item => item.payment ? (
                <span className="c1-badge inline-flex items-center gap-1.5" style={{
                    background: item.payment.status === PaymentStatus.PAID ? 'var(--success-bg)' : item.payment.status === PaymentStatus.PENDING ? 'var(--warning-light)' : 'var(--danger-bg)',
                    color: item.payment.status === PaymentStatus.PAID ? 'var(--success)' : item.payment.status === PaymentStatus.PENDING ? 'var(--warning)' : 'var(--danger)',
                }}>
                    {item.payment.status === PaymentStatus.PAID ? <CheckCircle2 size={12} strokeWidth={3} /> : <Clock size={12} strokeWidth={3} />}
                    {item.payment.status}
                </span>
            ) : (
                <span className="c1-badge inline-flex items-center gap-1.5" style={{ background: 'var(--input-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>
                    <Clock size={12} strokeWidth={3} />Kutilmoqda
                </span>
            ),
        },
        {
            key: 'method', header: "To'lov usuli", align: 'center', width: '140px',
            sortValue: item => item.payment ? (PAYMENT_METHOD_LABELS[item.payment.paymentMethod || 'naqd'] ?? '') : '',
            cell: item => {
                if (!item.payment) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
                const pm = item.payment.paymentMethod || 'naqd';
                const c = PAYMENT_METHOD_COLORS[pm] || 'var(--text-muted)';
                return (
                    <span className="text-micro font-semibold uppercase tracking-widest px-2 py-1 rounded-lg whitespace-nowrap" style={{ color: c, background: `${c}1a`, border: `1px solid ${c}40` }}>
                        {PAYMENT_METHOD_LABELS[pm] || pm}
                    </span>
                );
            },
        },
        {
            key: 'actions', header: t.actions, align: 'right', width: '170px',
            cell: item => (
                <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                    <Button variant="primary" size="sm" onClick={() => openPayment(item)}>
                        <CreditCard size={13} />{item.payment ? 'Tahrir' : "To'lov"}
                    </Button>
                    {item.payment && (
                        <button
                            onClick={async () => { if (await confirm({ title: "To'lov o'chirilsinmi?", description: "To'lov yozuvi o'chiriladi va balansga ta'sir qiladi.", confirmLabel: "O'chirish", tone: 'danger' })) onDeletePayment(item.payment!.id); }}
                            className="icon-btn-sm icon-btn-danger rounded-lg" style={{ color: 'var(--danger)' }} aria-label="O'chirish"
                        ><Trash2 size={15} /></button>
                    )}
                </div>
            ),
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [t, confirm, onDeletePayment]);


    const openPayment = (item: { id: string; contractAmount?: number; payment?: Partial<Payment> | null }) => {
        setEditingPayment(
            item.payment || {
                companyId: item.id,
                amount: item.contractAmount,
                period: selectedPeriod,
                status: PaymentStatus.PAID,
                paymentMethod: 'naqd',
                paymentDate: new Date().toISOString().split('T')[0],
            }
        );
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (editingPayment && !isSaving) {
            setIsSaving(true);
            try {
                await onSavePayment(editingPayment);
                toast.success(lang === 'uz' ? 'To\'lov saqlandi' : 'Платеж сохранен');
                setIsModalOpen(false);
                setEditingPayment(null);
            } catch (error: any) {
                console.error('Payment save error:', error);
                toast.error(lang === 'uz' ? 'Xatolik: ' + (error.message || 'Saqlab bo\'lmadi') : 'Ошибка: ' + (error.message || 'Не удалось сохранить'));
            } finally {
                setIsSaving(false);
            }
        }
    };

    return (
        <div className="space-y-4 animate-fade-in pb-20">
            {/* Header & Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="md:col-span-2 dashboard-card p-5 relative overflow-hidden flex flex-col justify-between">
                    <div className="absolute top-[-20px] right-[-20px] opacity-5 pointer-events-none">
                        <Wallet size={200} style={{ color: 'var(--accent-blue)' }} />
                    </div>

                    <div className="relative z-10 flex justify-between items-start mb-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-md shrink-0"
                                style={{ background: "linear-gradient(135deg, var(--accent-blue), var(--accent-blue-hover))" }}>
                                <Wallet size={24} />
                            </div>
                            <div>
                                <h2 className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{t.kassa || 'Kassa'}</h2>
                                <p className="text-xs font-bold leading-none mt-1" style={{ color: 'var(--text-muted)' }}>{selectedPeriod} DAVRI BO&apos;YICHA</p>
                            </div>
                        </div>
                    </div>

                    <div className="relative z-10 grid grid-cols-2 gap-6">
                        <div className="min-w-0">
                            <span className="text-meta font-bold uppercase tracking-widest mb-2 block" style={{ color: 'var(--text-muted)' }}>Kutilayotgan</span>
                            <div className="stat-metric text-2xl font-semibold tabular-nums leading-none" style={{ color: 'var(--text-primary)' }}>
                                {formatNum(stats.remainingExpected)} <span className="text-xs font-bold ml-1" style={{ color: 'var(--text-muted)' }}>sum</span>
                            </div>
                        </div>
                        <div className="min-w-0">
                            <span className="text-meta font-bold uppercase tracking-widest mb-2 block" style={{ color: 'var(--success)' }}>To&apos;langan</span>
                            <div className="stat-metric text-2xl font-semibold tabular-nums leading-none" style={{ color: 'var(--success)' }}>
                                {formatNum(stats.totalPaid)} <span className="text-xs font-bold ml-1 opacity-60">sum</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="dashboard-card p-5 flex flex-col justify-center items-center text-center">
                    <div className="relative h-28 w-28 flex items-center justify-center">
                        <svg className="h-full w-full transform -rotate-90">
                            <circle cx="50%" cy="50%" r="42%"
                                fill="transparent"
                                stroke="var(--card-border)"
                                strokeWidth="8"
                            />
                            <circle cx="50%" cy="50%" r="42%"
                                fill="transparent"
                                stroke="var(--accent-blue)"
                                strokeWidth="10"
                                strokeDasharray="263.8%"
                                strokeDashoffset={`${263.8 - (263.8 * stats.percent) / 100}%`}
                                className="transition-all duration-1000 ease-out"
                                strokeLinecap="round"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{stats.percent}%</span>
                        </div>
                    </div>
                    <div className="mt-6 flex flex-col items-center">
                        <div className="c1-badge" style={{ background: stats.percent >= 90 ? 'var(--success-bg)' : 'var(--warning-light)', color: stats.percent >= 90 ? 'var(--success)' : 'var(--warning)' }}>
                            {stats.pendingCount} TA KORXONA QOLDI
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors" size={18} style={{ color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        placeholder="INN YOKI FIRMA NOMI..."
                        className="w-full rounded-xl py-3 pl-12 pr-4 text-xs font-bold outline-none transition-all focus:ring-2 focus:ring-[var(--accent-blue)] focus:ring-opacity-20"
                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text-primary)' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="min-w-[200px] flex items-center">
                    <MonthPicker selectedPeriod={selectedPeriod} onChange={setSelectedPeriod} />
                </div>
                <div className="flex items-center justify-end">
                    <TableToolbar view={viewMode} onViewChange={setViewMode} />
                </div>
            </div>
            <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" : "hidden"}>
                {filteredData.map((item) => {
                    const stt = item.payment?.status;
                    const stColor = stt === PaymentStatus.PAID ? 'var(--success)' : stt === PaymentStatus.PENDING ? 'var(--warning)' : stt ? 'var(--danger)' : 'var(--text-muted)';
                    const stBg = stt === PaymentStatus.PAID ? 'var(--success-bg)' : stt === PaymentStatus.PENDING ? 'var(--warning-light)' : stt ? 'var(--danger-bg)' : 'var(--input-bg)';
                    const pm = item.payment?.paymentMethod || 'naqd';
                    const pmc = PAYMENT_METHOD_COLORS[pm] || 'var(--text-muted)';
                    return (
                        <div key={item.id} onClick={() => openPayment(item)} className="dashboard-card p-4 cursor-pointer active:scale-[0.99] transition-transform">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="text-body font-semibold tracking-tight truncate" style={{ color: 'var(--text)' }}>{item.name}</div>
                                    <div className="text-meta font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>INN: {item.inn}</div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="font-semibold text-sm tabular-nums" style={{ color: 'var(--text)' }}>
                                        {formatNum(remaining(item))}
                                    </div>
                                    <div className="text-micro font-bold uppercase" style={{ color: 'var(--text-muted)' }}>sum</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                                <span className="inline-flex items-center gap-1 text-micro font-semibold uppercase tracking-widest px-2 py-1 rounded-lg" style={{ color: stColor, background: stBg }}>
                                    {stt === PaymentStatus.PAID ? <CheckCircle2 size={11} /> : <Clock size={11} />} {stt || 'Kutilmoqda'}
                                </span>
                                {item.payment && <span className="text-micro font-semibold uppercase tracking-widest px-2 py-1 rounded-lg" style={{ color: pmc, background: `${pmc}1a` }}>{PAYMENT_METHOD_LABELS[pm] || pm}</span>}
                            </div>
                            <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--card-border)' }}>
                                <Button variant="primary" size="md" onClick={(e) => { e.stopPropagation(); openPayment(item); }} className="flex-1">
                                    <CreditCard size={14} /> {item.payment ? 'Tahrirlash' : "To'lov"}
                                </Button>
                                {item.payment && (
                                    <button onClick={async (e) => { e.stopPropagation(); if (await confirm({ title: "To'lov o'chirilsinmi?", description: "To'lov yozuvi o'chiriladi va balansga ta'sir qiladi.", confirmLabel: "O'chirish", tone: 'danger' })) onDeletePayment(item.payment!.id); }} className="w-10 py-2 rounded-lg flex items-center justify-center shrink-0" style={{ color: 'var(--danger)', background: 'var(--danger-bg)' }}><Trash2 size={14} /></button>
                                )}
                            </div>
                        </div>
                    );
                })}
                {filteredData.length === 0 && (
                    <div className="dashboard-card p-5 text-center">
                        <Search size={36} className="mx-auto mb-3 opacity-20" style={{ color: 'var(--text-muted)' }} />
                        <span className="text-meta font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Ma&apos;lumot topilmadi</span>
                    </div>
                )}
            </div>

            {/* Payments table (desktop) */}
            <div className={viewMode === 'list' ? "dashboard-card overflow-hidden overflow-x-auto" : "hidden"}>
                <div className="overflow-x-auto scrollbar-hide">
                    <DataTable
                        caption="Kassa — firmalar bo'yicha to'lovlar"
                        rows={filteredData}
                        columns={kassaColumns}
                        rowKey={item => item.id}
                        sortKey={table.sortKey}
                        sortDir={table.sortDir}
                        onToggleSort={table.toggleSort}
                        density={table.density}
                        page={table.page}
                        pageSize={50}
                        onPageChange={table.setPage}
                        onRowClick={item => openPayment(item)}
                        rowLabel={item => `${item.name} — to'lov kartochkasi`}
                        emptyIcon={<Wallet size={36} />}
                        emptyTitle="To'lov ma'lumoti yo'q"
                    />
                    {filteredData.length === 0 && (
                        <div className="py-24 flex flex-col items-center justify-center" style={{ color: 'var(--text-muted)' }}>
                            <Search size={48} className="opacity-20 mb-4" />
                            <p className="text-meta font-bold uppercase tracking-widest">Ma&apos;lumot topilmadi</p>
                        </div>
                    )}
                </div>
            </div>

            {isModalOpen && (
                <div
                    // `Modal` bu yerda ishlatilmaydi: u o'z sarlavhasi va ichki
                    // bo'shlig'ini qo'shadi, bu oyna esa o'z yuqori rangli
                    // chizig'i va tartibiga ega. Shu sababdan tartib qo'lda
                    // qoladi, XULQ esa `useModalA11y` dan olinadi — hook aynan
                    // shu holat uchun yozilgan.
                    // eslint-disable-next-line no-restricted-syntax
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
                    onMouseDown={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}
                >
                    <div
                        ref={modalRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label="To'lov oynasi"
                        tabIndex={-1}
                        className="w-full max-w-lg shadow-2xl relative overflow-hidden dashboard-card !p-0 outline-none"
                    >
                        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'var(--accent-blue)' }}></div>
                        <div className="px-6 py-5 flex justify-between items-center" style={{ borderBottom: '1px solid var(--card-border)' }}>
                            <div>
                                <h3 className="text-body font-bold" style={{ color: 'var(--text)' }}>To&apos;lovni tasdiqlash</h3>
                                <p className="text-micro font-bold uppercase tracking-widest mt-1" style={{ color: 'var(--text-muted)' }}>TRANZAKSIYA TAFSILOTLARINI KIRITING</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="icon-btn-sm transition-all icon-btn-danger" style={{ color: 'var(--text-muted)', background: 'var(--input-bg)' }}>
                                <Plus size={20} className="rotate-45" />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="space-y-2">
                                    <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{t.amount}</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={editingPayment?.amount || ''}
                                            onChange={(e) => setEditingPayment(prev => ({ ...prev, amount: Number(e.target.value) }))}
                                            className="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none transition-all focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-20 tracking-tight"
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
                                        value={editingPayment?.paymentDate || ''}
                                        onChange={(e) => setEditingPayment(prev => ({ ...prev, paymentDate: e.target.value }))}
                                        className="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none transition-all focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-20 tracking-tight"
                                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--accent-blue)' }}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>To&apos;lov Holati</label>
                                    <select
                                        value={editingPayment?.status || PaymentStatus.PENDING}
                                        onChange={(e) => setEditingPayment(prev => ({ ...prev, status: e.target.value as PaymentStatus }))}
                                        className="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none transition-all focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-20 tracking-tight"
                                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}
                                    >
                                        <option value={PaymentStatus.PAID}>To&apos;landi</option>
                                        <option value={PaymentStatus.PENDING}>Kutilmoqda</option>
                                        <option value={PaymentStatus.PARTIAL}>Qisman</option>
                                        <option value={PaymentStatus.OVERDUE}>Muddati o&apos;tgan</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>To&apos;lov usuli</label>
                                    <select
                                        value={editingPayment?.paymentMethod || 'naqd'}
                                        onChange={(e) => setEditingPayment(prev => ({ ...prev, paymentMethod: e.target.value }))}
                                        className="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none transition-all focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-20 tracking-tight"
                                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}
                                    >
                                        {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label.toUpperCase()}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{t.comment}</label>
                                    <input
                                        type="text"
                                        placeholder="IXTIYORIY IZOH..."
                                        value={editingPayment?.comment || ''}
                                        onChange={(e) => setEditingPayment(prev => ({ ...prev, comment: e.target.value }))}
                                        className="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none transition-all focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-20 tracking-tight"
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
                                <Button variant="primary" size="md" type="submit" disabled={isSaving} className="flex-1">
                                    {isSaving ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            SAQLANMOQDA...
                                        </>
                                    ) : (
                                        'TASDIQLASH'
                                    )}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default KassaModule;
