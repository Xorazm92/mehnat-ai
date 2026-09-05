"use client";

import React, { useState, useMemo } from 'react';
import { useViewMode } from '@/hooks/useViewMode';
import { Company, Payment, PaymentStatus, Language } from '@/types';
import { translations } from '@/lib/translations';
import { Wallet, Search, CheckCircle2, Clock, Trash2, CreditCard } from 'lucide-react';
import { TableToolbar } from "@/components/ui/TableToolbar";
import { toast } from 'sonner';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, PAYMENT_METHOD_COLORS } from '@/lib/constants';
import { formatNum } from "@/lib/platform/format";
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Button } from "@/components/ui/Button";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { Badge, Modal } from "@/components/ui";
import { Field } from "@/components/ui/Field";
import { MoneyField } from "@/components/ui/MoneyField";
import { Select } from "@/components/ui/Select";
import { useTableState } from "@/hooks/useTableState";
import { usePageSize } from "@/hooks/usePageSize";
import { MonthPicker } from './ui/MonthPicker';
import { DateField } from './ui/DateField';
import FundingSourceSelect from './ui/FundingSourceSelect';

/** Modal pastidagi tugma formadan tashqarida — `form` atributi bog'laydi. */
const PAYMENT_FORM_ID = 'payment-form';

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
    const [pageSize, setPageSize] = usePageSize("kassa");
  const confirm = useConfirm();
    const t = translations[lang];
    const [searchTerm, setSearchTerm] = useState('');
    // Standart — RO'YXAT; tanlov brauzerda saqlanadi (hooks/useViewMode).
    const [viewMode, setViewMode] = useViewMode('kassa');
    const [selectedPeriod, setSelectedPeriod] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [isModalOpen, setIsModalOpen] = useState(false);

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
            key: 'inn', header: t.inn, width: '120px', mobile: 'meta',
            sortValue: item => item.inn,
            cell: item => <span className="font-mono text-meta font-bold" style={{ color: 'var(--text-secondary)' }}>{item.inn}</span>,
        },
        {
            key: 'due', header: 'Kutilayotgan', numeric: true, width: '160px',
            sortValue: item => remaining(item),
            exportValue: item => remaining(item),
            cell: item => (
                <span className="font-bold text-body" style={{ color: 'var(--text)' }}>
                    {formatNum(remaining(item))} <span className="text-micro font-bold ml-1 uppercase" style={{ color: 'var(--text-muted)' }}>so&apos;m</span>
                </span>
            ),
        },
        {
            key: 'status', header: t.status, align: 'center', width: '140px', mobile: 'status',
            sortValue: item => item.payment?.status ?? 'KUTILMOQDA',
            cell: item => item.payment ? (
                <Badge
                    tone={item.payment.status === PaymentStatus.PAID ? 'success' : item.payment.status === PaymentStatus.PENDING ? 'warning' : 'danger'}
                    icon={item.payment.status === PaymentStatus.PAID ? <CheckCircle2 size={12} strokeWidth={3} /> : <Clock size={12} strokeWidth={3} />}
                >
                    {item.payment.status}
                </Badge>
            ) : (
                <Badge tone="neutral" icon={<Clock size={12} strokeWidth={3} />}>Kutilmoqda</Badge>
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

    const paymentPostsCash = (s?: string) => s === PaymentStatus.PAID || s === PaymentStatus.PARTIAL;

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        // KIRIM MANBASIZ YOZILMAYDI — server bu holatda rad etadi
        // (server/kassa.ts upsertPayment), lekin so'rov ketishidan oldin
        // aniq xabar bilan to'xtatish yaxshiroq.
        if (editingPayment && paymentPostsCash(editingPayment.status) && !editingPayment.channelId) {
            toast.error(lang === 'uz'
                ? "To'lov qaysi hisobga tushganini tanlang"
                : 'Выберите, на какой счёт поступил платёж');
            return;
        }
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
                    {/* 200px li dekorativ hamyon rasmi olib tashlandi: u
                        kartaning yarmini egallar, hech qanday ma'lumot
                        bermas va boshqa kassa ekranlarida yo'q edi. */}

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
                                {formatNum(stats.remainingExpected)} <span className="text-xs font-bold ml-1" style={{ color: 'var(--text-muted)' }}>so&apos;m</span>
                            </div>
                        </div>
                        <div className="min-w-0">
                            <span className="text-meta font-bold uppercase tracking-widest mb-2 block" style={{ color: 'var(--success)' }}>To&apos;langan</span>
                            <div className="stat-metric text-2xl font-semibold tabular-nums leading-none" style={{ color: 'var(--success)' }}>
                                {formatNum(stats.totalPaid)} <span className="text-xs font-bold ml-1 opacity-60">so&apos;m</span>
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
                        <Badge tone={stats.percent >= 90 ? 'success' : 'warning'} dot>
                            {stats.pendingCount} ta korxona qoldi
                        </Badge>
                    </div>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" size={16} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
                    <input
                        type="text"
                        placeholder="STIR yoki firma nomi…"
                        aria-label="Firmalar ichidan qidirish"
                        className="erp-input w-full pl-10"
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
                                    <div className="text-micro font-bold uppercase" style={{ color: 'var(--text-muted)' }}>so&apos;m</div>
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
                        pageSize={pageSize}
                        onPageSizeChange={setPageSize}
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

            {/*
                OYNA `Modal` primitivida. Ilgari qo'lda yozilgan
                `fixed inset-0 z-[100] bg-black/60` qatlami turardi — u
                `--z-*` shkalasini chetlab o'tar va fonni Tailwind
                palitrasidan olardi (rang faqat tokenlardan kelishi kerak).
            */}
            <Modal
                open={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                dismissable={!isSaving}
                size="lg"
                title="To'lovni tasdiqlash"
                description="Tranzaksiya tafsilotlarini kiriting."
                footer={
                    <>
                        <Button type="button" variant="secondary" size="md" disabled={isSaving} onClick={() => setIsModalOpen(false)}>
                            {t.cancel}
                        </Button>
                        <Button type="submit" form={PAYMENT_FORM_ID} variant="primary" size="md" loading={isSaving} disabled={isSaving}>
                            {isSaving ? 'Saqlanmoqda…' : 'Tasdiqlash'}
                        </Button>
                    </>
                }
            >
                <form id={PAYMENT_FORM_ID} onSubmit={handleSave} className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Field label={t.amount} required>
                            <MoneyField
                                value={editingPayment?.amount ?? null}
                                onChange={(v) => setEditingPayment(prev => ({ ...prev, amount: v ?? 0 }))}
                                required
                            />
                        </Field>
                        <Field label={t.date} required>
                            <DateField
                                value={editingPayment?.paymentDate || ''}
                                onChange={(v) => setEditingPayment(prev => ({ ...prev, paymentDate: v }))}
                                required
                            />
                        </Field>
                        <Field label="To'lov holati" required>
                            <Select
                                value={editingPayment?.status || PaymentStatus.PENDING}
                                onChange={(e) => setEditingPayment(prev => ({ ...prev, status: e.target.value as PaymentStatus }))}
                            >
                                <option value={PaymentStatus.PAID}>To&apos;landi</option>
                                <option value={PaymentStatus.PENDING}>Kutilmoqda</option>
                                <option value={PaymentStatus.PARTIAL}>Qisman</option>
                                <option value={PaymentStatus.OVERDUE}>Muddati o&apos;tgan</option>
                            </Select>
                        </Field>
                        <Field label="To'lov usuli">
                            <Select
                                value={editingPayment?.paymentMethod || 'naqd'}
                                onChange={(e) => setEditingPayment(prev => ({ ...prev, paymentMethod: e.target.value }))}
                            >
                                {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </Select>
                        </Field>
                        {/* KIRIM MANBASIZ YOZILMAYDI — server ham rad etadi
                            (`server/kassa.ts upsertPayment`), lekin so'rov
                            ketishidan oldin to'xtatgan yaxshiroq. */}
                        {paymentPostsCash(editingPayment?.status) && (
                            <div className="md:col-span-2">
                                <Field label="Qaysi hisobga tushdi" required>
                                    <FundingSourceSelect
                                        value={editingPayment?.channelId || ''}
                                        onChange={(channelId) => setEditingPayment(prev => ({ ...prev, channelId }))}
                                        allowEmpty={!!editingPayment?.id}
                                    />
                                </Field>
                            </div>
                        )}
                        <div className="md:col-span-2">
                            <Field label={t.comment}>
                                <input
                                    type="text"
                                    placeholder="Ixtiyoriy izoh…"
                                    value={editingPayment?.comment || ''}
                                    onChange={(e) => setEditingPayment(prev => ({ ...prev, comment: e.target.value }))}
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

export default KassaModule;
