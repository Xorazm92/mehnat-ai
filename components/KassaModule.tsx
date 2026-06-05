
import React, { useState, useMemo } from 'react';
import { Company, Payment, PaymentStatus, Language } from '../types';
import { translations } from '../lib/translations';
import { Wallet, Search, Plus, Filter, CheckCircle2, Clock, AlertTriangle, Trash2, MoreVertical, CreditCard, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface KassaModuleProps {
    companies: Company[];
    payments: Payment[];
    lang: Language;
    onSavePayment: (payment: Partial<Payment>) => Promise<void>;
    onDeletePayment: (id: string) => Promise<void>;
}

const KassaModule: React.FC<KassaModuleProps> = ({ companies, payments, lang, onSavePayment, onDeletePayment }) => {
    const t = translations[lang];
    const [searchTerm, setSearchTerm] = useState('');
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
        const totalExpected = companies.reduce((sum, c) => sum + (c.contractAmount || 0), 0);
        const totalPaid = payments
            .filter(p => p.period === selectedPeriod && p.status === PaymentStatus.PAID)
            .reduce((sum, p) => sum + (p.amount || 0), 0);
        const pendingCount = filteredData.filter(c => !c.payment || c.payment.status !== PaymentStatus.PAID).length;

        return {
            totalExpected,
            totalPaid,
            percent: totalExpected > 0 ? Math.round((totalPaid / totalExpected) * 100) : 0,
            pendingCount
        };
    }, [companies, payments, selectedPeriod, filteredData]);

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
                <div className="md:col-span-2 dashboard-card p-6 relative overflow-hidden flex flex-col justify-between">
                    <div className="absolute top-[-20px] right-[-20px] opacity-5 pointer-events-none">
                        <Wallet size={200} style={{ color: 'var(--primary)' }} />
                    </div>

                    <div className="relative z-10 flex justify-between items-start mb-8">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0 bg-gradient-to-br from-[var(--primary)] to-[var(--primary-dark)]">
                                <Wallet size={24} />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black uppercase tracking-tight" style={{ color: 'var(--text)' }}>{t.kassa || 'Kassa'}</h2>
                                <p className="text-[12px] font-bold uppercase tracking-widest leading-none mt-1" style={{ color: 'var(--text-3)' }}>{selectedPeriod} DAVRI BO'YICHA</p>
                            </div>
                        </div>
                    </div>

                    <div className="relative z-10 grid grid-cols-2 gap-8">
                        <div>
                            <span className="text-[11px] font-bold uppercase tracking-widest mb-2 block" style={{ color: 'var(--text-3)' }}>Kutilayotgan</span>
                            <div className="text-3xl font-black tabular-nums leading-none" style={{ color: 'var(--text)' }}>
                                {stats.totalExpected.toLocaleString()} <span className="text-[14px] font-bold ml-1 uppercase" style={{ color: 'var(--text-3)' }}>sum</span>
                            </div>
                        </div>
                        <div>
                            <span className="text-[11px] font-bold uppercase tracking-widest mb-2 block" style={{ color: 'var(--success)' }}>To'langan</span>
                            <div className="text-3xl font-black tabular-nums leading-none" style={{ color: 'var(--success)' }}>
                                {stats.totalPaid.toLocaleString()} <span className="text-[14px] font-bold ml-1 uppercase opacity-60">sum</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="dashboard-card p-6 flex flex-col justify-center items-center text-center">
                    <div className="relative h-32 w-32 flex items-center justify-center">
                        <svg className="h-full w-full transform -rotate-90">
                            <circle
                                cx="50%" cy="50%" r="42%"
                                fill="transparent"
                                stroke="var(--border)"
                                strokeWidth="8"
                            />
                            <circle
                                cx="50%" cy="50%" r="42%"
                                fill="transparent"
                                stroke="var(--primary)"
                                strokeWidth="10"
                                strokeDasharray="263.8%"
                                strokeDashoffset={`${263.8 - (263.8 * stats.percent) / 100}%`}
                                className="transition-all duration-1000 ease-out"
                                strokeLinecap="round"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-3xl font-black tabular-nums" style={{ color: 'var(--text)' }}>{stats.percent}%</span>
                        </div>
                    </div>
                    <div className="mt-6 flex flex-col items-center">
                        <div className="c1-badge" style={{ background: stats.percent >= 90 ? 'var(--success-light)' : 'var(--warning-light)', color: stats.percent >= 90 ? 'var(--success)' : 'var(--warning)' }}>
                            {stats.pendingCount} TA KORXONA QOLDI
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors" size={18} style={{ color: 'var(--text-3)' }} />
                    <input
                        type="text"
                        placeholder="INN YOKI FIRMA NOMI..."
                        className="w-full rounded-xl py-3 pl-12 pr-4 text-[12px] font-bold uppercase tracking-widest outline-none transition-all focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-20"
                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="relative group min-w-[200px]">
                    <input
                        type="month"
                        value={selectedPeriod}
                        onChange={(e) => setSelectedPeriod(e.target.value)}
                        className="w-full rounded-xl px-4 py-3 pr-12 text-[12px] font-bold uppercase outline-none transition-all appearance-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-20 cursor-pointer"
                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--primary)' }}
                    />
                    <Clock className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none transition-colors" size={18} style={{ color: 'var(--text-3)' }} />
                </div>
            </div>

            <div className="dashboard-card overflow-hidden">
                <div className="overflow-x-auto scrollbar-hide">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>{t.companyName}</th>
                                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>{t.inn}</th>
                                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>{t.amount}</th>
                                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-center" style={{ color: 'var(--text-3)' }}>{t.status}</th>
                                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-right" style={{ color: 'var(--text-3)' }}>{t.actions}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredData.map((item, i) => (
                                <tr key={item.id} className="transition-colors group hover:bg-[var(--primary-ghost)] cursor-pointer" style={{ backgroundColor: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                                    <td className="px-6 py-3">
                                        <div className="font-bold text-[13px] uppercase tracking-tight truncate max-w-[250px]" style={{ color: 'var(--text)' }}>
                                            {item.name}
                                        </div>
                                        {item.brandName && <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5 truncate max-w-[250px]" style={{ color: 'var(--text-3)' }}>{item.brandName}</p>}
                                    </td>
                                    <td className="px-6 py-3 font-mono text-[11px] font-bold" style={{ color: 'var(--text-2)' }}>{item.inn}</td>
                                    <td className="px-6 py-3">
                                        <div className="font-bold text-[13px] tabular-nums" style={{ color: 'var(--text)' }}>
                                            {(item.contractAmount || 0).toLocaleString()} <span className="text-[10px] font-bold ml-1 uppercase" style={{ color: 'var(--text-3)' }}>sum</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-3 text-center">
                                        {item.payment ? (
                                            <span className={`c1-badge inline-flex items-center gap-1.5`} style={{
                                                background: item.payment.status === PaymentStatus.PAID ? 'var(--success-light)' : item.payment.status === PaymentStatus.PENDING ? 'var(--warning-light)' : 'var(--danger-light)',
                                                color: item.payment.status === PaymentStatus.PAID ? 'var(--success)' : item.payment.status === PaymentStatus.PENDING ? 'var(--warning)' : 'var(--danger)'
                                            }}>
                                                {item.payment.status === PaymentStatus.PAID ? <CheckCircle2 size={12} strokeWidth={3} /> : <Clock size={12} strokeWidth={3} />}
                                                {item.payment.status}
                                            </span>
                                        ) : (
                                            <span className="c1-badge inline-flex items-center gap-1.5" style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
                                                <Clock size={12} strokeWidth={3} />
                                                Kutilmoqda
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2 opacity-20 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => {
                                                    setEditingPayment(item.payment || {
                                                        companyId: item.id,
                                                        amount: item.contractAmount,
                                                        period: selectedPeriod,
                                                        status: PaymentStatus.PAID,
                                                        paymentDate: new Date().toISOString().split('T')[0]
                                                    });
                                                    setIsModalOpen(true);
                                                }}
                                                className="w-8 h-8 flex items-center justify-center rounded-lg transition-all"
                                                style={{ color: 'var(--primary)' }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-ghost)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                title="To'lov / Tahrirlash"
                                            >
                                                <CreditCard size={16} />
                                            </button>
                                            {item.payment && (
                                                <button
                                                    onClick={() => { if (confirm('To\'lovni o\'chirishni tasdiqlaysizmi?')) onDeletePayment(item.payment!.id); }}
                                                    className="w-8 h-8 flex items-center justify-center rounded-lg transition-all"
                                                    style={{ color: 'var(--danger)' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--danger-light)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                    title="O'chirish"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredData.length === 0 && (
                        <div className="py-24 flex flex-col items-center justify-center" style={{ color: 'var(--text-3)' }}>
                            <Search size={48} className="opacity-20 mb-4" />
                            <p className="font-bold uppercase tracking-[0.2em] text-[11px] opacity-60">Ma'lumot topilmadi</p>
                        </div>
                    )}
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity animate-fade-in">
                    <div className="w-full max-w-lg shadow-2xl relative overflow-hidden dashboard-card !p-0">
                        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'var(--primary)' }}></div>
                        <div className="px-6 py-5 flex justify-between items-center" style={{ borderBottom: '1px solid var(--border)' }}>
                            <div>
                                <h3 className="text-[13px] font-bold uppercase tracking-widest" style={{ color: 'var(--text)' }}>To'lovni tasdiqlash</h3>
                                <p className="text-[10px] font-bold uppercase tracking-widest mt-1" style={{ color: 'var(--text-3)' }}>TRANZAKSIYA TAFSILOTLARINI KIRITING</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg transition-all" style={{ color: 'var(--text-3)', background: 'var(--surface-2)' }} onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'var(--danger-light)'; }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = 'var(--surface-2)'; }}>
                                <Plus size={20} className="rotate-45" />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>{t.amount}</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={editingPayment?.amount || ''}
                                            onChange={(e) => setEditingPayment(prev => ({ ...prev, amount: Number(e.target.value) }))}
                                            className="w-full rounded-lg px-4 py-3 text-[12px] font-bold outline-none transition-all focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-20 uppercase tracking-tight"
                                            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                                            required
                                        />
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase" style={{ color: 'var(--text-3)' }}>sum</div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>{t.date}</label>
                                    <input
                                        type="date"
                                        value={editingPayment?.paymentDate || ''}
                                        onChange={(e) => setEditingPayment(prev => ({ ...prev, paymentDate: e.target.value }))}
                                        className="w-full rounded-lg px-4 py-3 text-[12px] font-bold outline-none transition-all focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-20 uppercase tracking-tight"
                                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--primary)' }}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>To'lov Holati</label>
                                    <select
                                        value={editingPayment?.status || PaymentStatus.PENDING}
                                        onChange={(e) => setEditingPayment(prev => ({ ...prev, status: e.target.value as PaymentStatus }))}
                                        className="w-full rounded-lg px-4 py-3 text-[12px] font-bold outline-none transition-all focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-20 uppercase tracking-tight"
                                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                                    >
                                        <option value={PaymentStatus.PAID}>To'landi</option>
                                        <option value={PaymentStatus.PENDING}>Kutilmoqda</option>
                                        <option value={PaymentStatus.PARTIAL}>Qisman</option>
                                        <option value={PaymentStatus.OVERDUE}>Muddati o'tgan</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>{t.comment}</label>
                                    <input
                                        type="text"
                                        placeholder="IXTIYORIY IZOH..."
                                        value={editingPayment?.comment || ''}
                                        onChange={(e) => setEditingPayment(prev => ({ ...prev, comment: e.target.value }))}
                                        className="w-full rounded-lg px-4 py-3 text-[12px] font-bold outline-none transition-all focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-20 uppercase tracking-tight"
                                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 pt-6 mt-6" style={{ borderTop: '1px solid var(--border)' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-4 py-3 rounded-xl font-bold text-[11px] uppercase tracking-widest transition-all shadow-sm"
                                    style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
                                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--text-3)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                                >
                                    {t.cancel}
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="flex-1 px-4 py-3 rounded-xl font-bold text-[11px] text-white transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 uppercase tracking-widest disabled:opacity-50"
                                    style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))' }}
                                >
                                    {isSaving ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            SAQLANMOQDA...
                                        </>
                                    ) : (
                                        'TASDIQLASH'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default KassaModule;
