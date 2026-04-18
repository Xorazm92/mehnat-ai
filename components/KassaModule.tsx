
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm p-5 shadow-sm relative overflow-hidden flex flex-col justify-between transition-colors">
                    <div className="absolute top-[-20px] right-[-20px] opacity-[0.03] pointer-events-none">
                        <Wallet size={160} className="text-[#3366CC]" />
                    </div>

                    <div className="relative z-10 flex justify-between items-start mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-sm bg-[#3366CC] flex items-center justify-center text-white shadow-sm shrink-0">
                                <Wallet size={20} />
                            </div>
                            <div>
                                <h2 className="text-[14px] font-bold text-gray-800 dark:text-white uppercase tracking-wider">{t.kassa || 'Kassa'}</h2>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mt-0.5">{selectedPeriod} DAVRI BO'YICHA</p>
                            </div>
                        </div>
                    </div>

                    <div className="relative z-10 grid grid-cols-2 gap-8">
                        <div>
                            <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-1 block">Kutilayotgan</span>
                            <div className="text-[22px] font-bold text-gray-800 dark:text-white tabular-nums leading-none">
                                {stats.totalExpected.toLocaleString()} <span className="text-[10px] font-bold text-gray-400 ml-1 uppercase">sum</span>
                            </div>
                        </div>
                        <div>
                            <span className="text-[8px] font-bold text-emerald-600 uppercase tracking-widest mb-1 block">To'langan</span>
                            <div className="text-[22px] font-bold tabular-nums text-emerald-600 leading-none">
                                {stats.totalPaid.toLocaleString()} <span className="text-[10px] font-bold text-emerald-600/50 ml-1 uppercase">sum</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-[#22252B] rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] p-5 flex flex-col justify-center items-center text-center shadow-sm transition-colors">
                    <div className="relative h-24 w-24 flex items-center justify-center">
                        <svg className="h-full w-full transform -rotate-90">
                            <circle
                                cx="50%" cy="50%" r="42%"
                                fill="transparent"
                                stroke="currentColor"
                                strokeWidth="6"
                                className="text-[#F0F2F5] dark:text-[#1e2025]"
                            />
                            <circle
                                cx="50%" cy="50%" r="42%"
                                fill="transparent"
                                stroke="#3366CC"
                                strokeWidth="8"
                                strokeDasharray="263.8%"
                                strokeDashoffset={`${263.8 - (263.8 * stats.percent) / 100}%`}
                                className="transition-all duration-1000 ease-out"
                                strokeLinecap="square"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-[18px] font-bold text-gray-800 dark:text-white tabular-nums">{stats.percent}%</span>
                        </div>
                    </div>
                    <div className="mt-4 flex flex-col items-center">
                        <div className={`px-2 py-0.5 rounded-sm text-[8px] font-bold uppercase tracking-widest border ${stats.percent >= 90 ? 'bg-[#EBFBF0] text-emerald-600 border-[#C3E6CB]' : 'bg-[#FFF3CD] text-amber-600 border-[#FFEEBA]'}`}>
                            {stats.pendingCount} TA KORXONA QOLDI
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#3366CC] transition-colors" size={14} />
                    <input
                        type="text"
                        placeholder="INN YOKI FIRMA NOMI..."
                        className="w-full rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] bg-white dark:bg-[#22252B] py-2 pl-9 pr-3 text-[11px] font-bold uppercase tracking-tight text-gray-800 dark:text-white outline-none focus:border-[#3366CC] shadow-sm transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="relative group">
                    <input
                        type="month"
                        value={selectedPeriod}
                        onChange={(e) => setSelectedPeriod(e.target.value)}
                        className="rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] bg-white dark:bg-[#22252B] px-3 py-2 pr-10 text-[11px] font-bold uppercase text-[#3366CC] outline-none focus:border-[#3366CC] shadow-sm appearance-none min-w-[180px] transition-all"
                    />
                    <Clock className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none group-focus-within:text-[#3366CC] transition-colors" size={14} />
                </div>
            </div>

            <div className="bg-white dark:bg-[#22252B] rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] shadow-sm overflow-hidden transition-colors">
                <div className="overflow-x-auto scrollbar-hide">
                    <table className="w-full text-left border-collapse c1-table">
                        <thead>
                            <tr className="bg-[#F8F9FA] dark:bg-[#1A1D23] text-[9px] font-bold uppercase text-gray-400 border-b border-[#DEE2E6] dark:border-[#3A3D44] tracking-widest">
                                <th className="px-5 py-3">{t.companyName}</th>
                                <th className="px-5 py-3">{t.inn}</th>
                                <th className="px-5 py-3">{t.amount}</th>
                                <th className="px-5 py-3 text-center">{t.status}</th>
                                <th className="px-5 py-3 text-right">{t.actions}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F0F2F5] dark:divide-[#1e2025]">
                            {filteredData.map((item) => (
                                <tr key={item.id} className="hover:bg-[#EBF3FF] dark:hover:bg-[#1C2531] transition-all group">
                                    <td className="px-5 py-2.5">
                                        <div className="font-bold text-[11px] text-gray-800 dark:text-white uppercase tracking-tight truncate max-w-[250px]">
                                            {item.name}
                                        </div>
                                        {item.brandName && <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-0.5 truncate max-w-[250px]">{item.brandName}</p>}
                                    </td>
                                    <td className="px-5 py-2.5 font-mono text-gray-500 text-[10px] font-bold">{item.inn}</td>
                                    <td className="px-5 py-2.5">
                                        <div className="font-bold text-gray-800 dark:text-white text-[11px] tabular-nums">
                                            {(item.contractAmount || 0).toLocaleString()} <span className="text-[8px] font-bold text-gray-400 ml-1 uppercase">sum</span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-2.5 text-center">
                                        {item.payment ? (
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[8px] font-black uppercase tracking-widest border transition-colors ${item.payment.status === PaymentStatus.PAID
                                                ? 'bg-[#EBFBF0] text-emerald-600 border-[#C3E6CB]'
                                                : item.payment.status === PaymentStatus.PENDING
                                                    ? 'bg-[#FFF3CD] text-amber-600 border-[#FFEEBA]'
                                                    : 'bg-[#FEEBF0] text-rose-600 border-[#F5C6CB]'
                                                }`}>
                                                {item.payment.status === PaymentStatus.PAID ? <CheckCircle2 size={10} strokeWidth={3} /> : <Clock size={10} strokeWidth={3} />}
                                                {item.payment.status}
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[8px] font-black uppercase tracking-widest bg-[#F8F9FA] dark:bg-[#1A1D23] text-gray-400 border border-[#DEE2E6] dark:border-[#3A3D44]">
                                                <Clock size={10} strokeWidth={3} />
                                                Kutilmoqda
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-5 py-2.5 text-right">
                                        <div className="flex items-center justify-end gap-1 opacity-20 group-hover:opacity-100 transition-opacity">
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
                                                className="p-1.5 text-[#3366CC] hover:bg-[#EBF3FF] dark:hover:bg-[#1C2531] rounded-sm border border-transparent hover:border-[#3366CC]/30 transition-all"
                                                title="To'lov / Tahrirlash"
                                            >
                                                <CreditCard size={14} />
                                            </button>
                                            {item.payment && (
                                                <button
                                                    onClick={() => { if (confirm('To\'lovni o\'chirishni tasdiqlaysizmi?')) onDeletePayment(item.payment!.id); }}
                                                    className="p-1.5 text-rose-500 hover:bg-[#FEEBF0] dark:hover:bg-[#2D1B1E] rounded-sm border border-transparent hover:border-rose-300 transition-all"
                                                    title="O'chirish"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredData.length === 0 && (
                        <div className="py-24 flex flex-col items-center justify-center text-gray-300">
                            <Search size={32} className="opacity-20 mb-4" />
                            <p className="font-bold uppercase tracking-widest text-[9px] opacity-40">Ma'lumot topilmadi</p>
                        </div>
                    )}
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 transition-colors animate-fade-in">
                    <div className="bg-[#F0F2F5] dark:bg-[#111318] w-full max-w-lg rounded-sm shadow-2xl border border-[#DEE2E6] dark:border-[#3A3D44] overflow-hidden">
                        <div className="px-5 py-3 border-b border-[#DEE2E6] dark:border-[#3A3D44] flex justify-between items-center bg-white dark:bg-[#1A1D23]">
                            <div>
                                <h3 className="text-[11px] font-bold text-gray-800 dark:text-white uppercase tracking-widest">To'lovni tasdiqlash</h3>
                                <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">TRANZAKSIYA TAFSILOTLARINI KIRITING</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-1 text-gray-400 hover:text-rose-500 transition-colors">
                                <Plus size={18} className="rotate-45" />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-5 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">{t.amount}</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={editingPayment?.amount || ''}
                                            onChange={(e) => setEditingPayment(prev => ({ ...prev, amount: Number(e.target.value) }))}
                                            className="w-full bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm px-3 py-1.5 text-[11px] font-bold text-gray-800 dark:text-white outline-none focus:border-[#3366CC] shadow-sm uppercase tracking-tight"
                                            required
                                        />
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] font-bold text-gray-400 uppercase">sum</div>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">{t.date}</label>
                                    <input
                                        type="date"
                                        value={editingPayment?.paymentDate || ''}
                                        onChange={(e) => setEditingPayment(prev => ({ ...prev, paymentDate: e.target.value }))}
                                        className="w-full bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm px-3 py-1.5 text-[11px] font-bold text-[#3366CC] outline-none focus:border-[#3366CC] shadow-sm uppercase tracking-tight"
                                        required
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">To'lov Holati</label>
                                    <select
                                        value={editingPayment?.status || PaymentStatus.PENDING}
                                        onChange={(e) => setEditingPayment(prev => ({ ...prev, status: e.target.value as PaymentStatus }))}
                                        className="w-full bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm px-3 py-1.5 text-[11px] font-bold text-gray-800 dark:text-white outline-none focus:border-[#3366CC] shadow-sm uppercase tracking-tight"
                                    >
                                        <option value={PaymentStatus.PAID}>To'landi</option>
                                        <option value={PaymentStatus.PENDING}>Kutilmoqda</option>
                                        <option value={PaymentStatus.PARTIAL}>Qisman</option>
                                        <option value={PaymentStatus.OVERDUE}>Muddati o'tgan</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">{t.comment}</label>
                                    <input
                                        type="text"
                                        placeholder="IXTIYORIY IZOH..."
                                        value={editingPayment?.comment || ''}
                                        onChange={(e) => setEditingPayment(prev => ({ ...prev, comment: e.target.value }))}
                                        className="w-full bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm px-3 py-1.5 text-[11px] font-bold text-gray-800 dark:text-white outline-none focus:border-[#3366CC] shadow-sm uppercase tracking-tight"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-2.5 pt-4 border-t border-[#DEE2E6] dark:border-[#3A3D44] mt-5">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-4 py-2 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] font-bold text-[10px] text-gray-500 uppercase tracking-widest bg-white dark:bg-[#22252B] hover:bg-[#F8F9FA] transition-all"
                                >
                                    {t.cancel}
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="flex-1 px-4 py-2 rounded-sm font-bold text-[10px] text-white bg-[#3366CC] hover:bg-[#2A52A3] disabled:opacity-50 transition-all shadow-sm flex items-center justify-center gap-2 uppercase tracking-widest"
                                >
                                    {isSaving ? (
                                        <>
                                            <Loader2 size={12} className="animate-spin" />
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
