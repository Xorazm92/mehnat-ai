
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
        <div className="space-y-10 animate-fade-in pb-20">
            {/* Header & Stats */}
            {/* Header & Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                <div className="sm:col-span-2 bg-white dark:bg-[#22252B] border-t-4 border-t-blue-600 border border-gray-200 dark:border-gray-700 rounded p-6 shadow-sm relative overflow-hidden group flex flex-col justify-between">
                    <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                        <Wallet size={180} className="hidden sm:block text-blue-600" />
                    </div>

                    <div className="relative z-10 flex justify-between items-start mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-1">{t.kassa || 'Kassa'}</h2>
                            <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">{selectedPeriod} Davri bo'yicha</p>
                        </div>
                    </div>

                    <div className="relative z-10 grid grid-cols-1 xs:grid-cols-2 gap-6 md:gap-8">
                        <div className="group/stat">
                            <span className="text-gray-500 font-bold text-[10px] uppercase tracking-widest mb-1 block">Kutilayotgan</span>
                            <div className="text-xl md:text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">
                                {stats.totalExpected.toLocaleString()} <span className="text-sm font-bold text-gray-400 ml-1">UZS</span>
                            </div>
                        </div>
                        <div className="group/stat">
                            <span className="text-emerald-600 dark:text-emerald-500 font-bold text-[10px] uppercase tracking-widest mb-1 block">To'langan</span>
                            <div className="text-xl md:text-3xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                                {stats.totalPaid.toLocaleString()} <span className="text-sm font-bold text-emerald-400/50 ml-1">UZS</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-[#22252B] rounded border border-gray-200 dark:border-gray-700 p-6 flex flex-col justify-center items-center text-center shadow-sm sm:col-span-2 lg:col-span-1">
                    <div className="relative h-24 w-24 md:h-32 md:w-32 flex items-center justify-center">
                        <svg className="h-full w-full transform -rotate-90">
                            <circle
                                cx="50%" cy="50%" r="40%"
                                fill="transparent"
                                stroke="currentColor"
                                strokeWidth="8"
                                className="text-gray-100 dark:text-gray-800"
                            />
                            <circle
                                cx="50%" cy="50%" r="40%"
                                fill="transparent"
                                stroke="#2563eb"
                                strokeWidth="10"
                                strokeDasharray="251.2%"
                                strokeDashoffset={`${251.2 - (251.2 * stats.percent) / 100}%`}
                                className="transition-all duration-1000 ease-out"
                                strokeLinecap="round"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{stats.percent}%</span>
                        </div>
                    </div>
                    <p className="mt-4 text-[11px] font-bold text-gray-500 uppercase flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        {stats.pendingCount} ta korxona qoldi
                    </p>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                    <input
                        type="text"
                        placeholder={t.search}
                        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1e2025] py-2 pl-10 pr-3 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500 shadow-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="relative group">
                    <input
                        type="month"
                        value={selectedPeriod}
                        onChange={(e) => setSelectedPeriod(e.target.value)}
                        className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1e2025] px-3 py-2 pr-10 text-sm text-gray-800 dark:text-gray-200 outline-none focus:border-blue-500 shadow-sm appearance-none min-w-[200px]"
                    />
                    <Clock className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none group-focus-within:text-blue-500 transition-colors" size={18} />
                </div>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-[#22252B] rounded border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="overflow-x-auto scrollbar-thin">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-100 dark:bg-gray-800 text-[10px] font-bold uppercase text-gray-500 border-b border-gray-200 dark:border-gray-700">
                                <th className="px-4 py-3 sticky left-0 z-20 bg-gray-100 dark:bg-gray-800 md:relative md:z-0">{t.companyName}</th>
                                <th className="px-4 py-3">{t.inn}</th>
                                <th className="px-4 py-3">{t.amount}</th>
                                <th className="px-4 py-3">{t.status}</th>
                                <th className="px-4 py-3 text-right md:sticky md:right-0 z-20 bg-gray-100 dark:bg-gray-800 md:relative md:z-0">{t.actions}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                            {filteredData.map((item) => (
                                <tr key={item.id} className="hover:bg-blue-50 dark:hover:bg-gray-800/50 transition-all group/row">
                                    <td className="px-4 py-2 sticky left-0 z-10 bg-white dark:bg-[#22252B] group-hover/row:bg-blue-50 dark:group-hover/row:bg-gray-800/50 md:relative md:z-0">
                                        <div className="font-bold text-xs text-gray-800 dark:text-gray-100 group-hover/row:text-blue-600 transition-colors truncate max-w-[200px] md:max-w-none">
                                            {item.name}
                                        </div>
                                        {item.brandName && <p className="text-[10px] font-semibold text-gray-500 mt-0.5 truncate max-w-[200px] md:max-w-none">{item.brandName}</p>}
                                    </td>
                                    <td className="px-4 py-2 font-mono text-gray-500 text-xs">{item.inn}</td>
                                    <td className="px-4 py-2">
                                        <div className="font-bold text-gray-800 dark:text-gray-200 text-xs">
                                            {(item.contractAmount || 0).toLocaleString()} <span className="text-[10px] font-normal text-gray-500 ml-1">UZS</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2">
                                        {item.payment ? (
                                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase border ${item.payment.status === PaymentStatus.PAID
                                                ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800/50'
                                                : item.payment.status === PaymentStatus.PENDING
                                                    ? 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800/50'
                                                    : 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/30 dark:border-rose-800/50'
                                                }`}>
                                                {item.payment.status === PaymentStatus.PAID ? <CheckCircle2 size={12} strokeWidth={2} /> : <Clock size={12} strokeWidth={2} />}
                                                {item.payment.status}
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase bg-gray-100 dark:bg-gray-800 text-gray-500 border border-gray-200 dark:border-gray-700">
                                                <Clock size={12} strokeWidth={2} />
                                                Kutilmoqda
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2 text-right">
                                        <div className="flex items-center justify-end gap-2">
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
                                                className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 rounded transition-colors"
                                                title="To'lov / Tahrirlash"
                                            >
                                                <CreditCard size={14} />
                                            </button>
                                            {item.payment && (
                                                <button
                                                    onClick={() => { if (confirm('To\'lovni o\'chirishni tasdiqlaysizmi?')) onDeletePayment(item.payment!.id); }}
                                                    className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:hover:bg-rose-900/40 rounded transition-colors"
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
                        <div className="py-20 flex flex-col items-center justify-center text-gray-400">
                            <Search size={32} className="opacity-20 mb-4" />
                            <p className="font-bold uppercase text-xs opacity-60">Ma'lumot topilmadi</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Payment Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-[#22252B] w-full max-w-lg rounded shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-[#1A1D23]">
                            <div>
                                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">To'lovni tasdiqlash</h3>
                                <p className="text-[10px] text-gray-500 mt-0.5">Tranzaksiya tafsilotlarini kiriting</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-800 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors">
                                <Plus size={18} className="rotate-45" />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-600 dark:text-gray-400">{t.amount}</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={editingPayment?.amount || ''}
                                            onChange={(e) => setEditingPayment(prev => ({ ...prev, amount: Number(e.target.value) }))}
                                            className="w-full bg-white dark:bg-[#1e2025] border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm text-gray-800 dark:text-white focus:outline-none focus:border-blue-500 shadow-sm"
                                            required
                                        />
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400 UZS">UZS</div>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-600 dark:text-gray-400">{t.date}</label>
                                    <input
                                        type="date"
                                        value={editingPayment?.paymentDate || ''}
                                        onChange={(e) => setEditingPayment(prev => ({ ...prev, paymentDate: e.target.value }))}
                                        className="w-full bg-white dark:bg-[#1e2025] border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm text-gray-800 dark:text-white focus:outline-none focus:border-blue-500 shadow-sm"
                                        required
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-600 dark:text-gray-400">To'lov Holati</label>
                                    <select
                                        value={editingPayment?.status || PaymentStatus.PENDING}
                                        onChange={(e) => setEditingPayment(prev => ({ ...prev, status: e.target.value as PaymentStatus }))}
                                        className="w-full bg-white dark:bg-[#1e2025] border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm text-gray-800 dark:text-white focus:outline-none focus:border-blue-500 shadow-sm"
                                    >
                                        <option value={PaymentStatus.PAID}>To'landi</option>
                                        <option value={PaymentStatus.PENDING}>Kutilmoqda</option>
                                        <option value={PaymentStatus.PARTIAL}>Qisman</option>
                                        <option value={PaymentStatus.OVERDUE}>Muddati o'tgan</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-600 dark:text-gray-400">{t.comment}</label>
                                    <input
                                        type="text"
                                        placeholder="Ixtiyoriy izoh..."
                                        value={editingPayment?.comment || ''}
                                        onChange={(e) => setEditingPayment(prev => ({ ...prev, comment: e.target.value }))}
                                        className="w-full bg-white dark:bg-[#1e2025] border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm text-gray-800 dark:text-white focus:outline-none focus:border-blue-500 shadow-sm"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700 mt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-4 py-2 rounded border border-gray-300 dark:border-gray-600 font-bold text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
                                >
                                    {t.cancel}
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="flex-1 px-4 py-2 rounded font-bold text-xs text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm flex items-center justify-center gap-2"
                                >
                                    {isSaving ? (
                                        <>
                                            <Loader2 size={14} className="animate-spin" />
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
