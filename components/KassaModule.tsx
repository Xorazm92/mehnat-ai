
import React, { useState, useMemo } from 'react';
import { Company, Payment, PaymentStatus, Language } from '../types';
import { translations } from '../lib/translations';
import { Wallet, Search, Plus, Filter, CheckCircle2, Clock, AlertTriangle, Trash2, MoreVertical, CreditCard } from 'lucide-react';

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
        if (editingPayment) {
            await onSavePayment(editingPayment);
            setIsModalOpen(false);
            setEditingPayment(null);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header & Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[2.5rem] p-6 sm:p-8 text-white shadow-2xl shadow-blue-500/20 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                        <div>
                            <h2 className="text-3xl font-black tracking-tight">{t.kassa || 'Kassa'}</h2>
                            <p className="text-blue-100 font-bold uppercase tracking-widest text-xs mt-1">{selectedPeriod} Davri bo'yicha</p>
                        </div>
                        <Wallet className="opacity-20" size={64} />
                    </div>
                    <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                        <div>
                            <span className="text-blue-100/60 font-black text-[10px] uppercase tracking-[0.2em]">{t.totalExpected || 'Kutilayotgan'}</span>
                            <div className="text-3xl font-black mt-1">
                                {stats.totalExpected.toLocaleString()} <span className="text-sm font-bold opacity-60">UZS</span>
                            </div>
                        </div>
                        <div>
                            <span className="text-blue-100/60 font-black text-[10px] uppercase tracking-[0.2em]">{t.totalPaid || 'To\'langan'}</span>
                            <div className="text-3xl font-black mt-1 text-emerald-300">
                                {stats.totalPaid.toLocaleString()} <span className="text-sm font-bold opacity-60">UZS</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-apple-darkCard rounded-[2.5rem] p-8 border border-slate-100 dark:border-apple-darkBorder flex flex-col justify-center items-center text-center">
                    <div className="relative h-32 w-32 flex items-center justify-center">
                        <svg className="h-full w-full transform -rotate-90">
                            <circle
                                cx="64" cy="64" r="58"
                                fill="transparent"
                                stroke="currentColor"
                                strokeWidth="12"
                                className="text-slate-100 dark:text-apple-darkBg"
                            />
                            <circle
                                cx="64" cy="64" r="58"
                                fill="transparent"
                                stroke="currentColor"
                                strokeWidth="12"
                                strokeDasharray={364.4}
                                strokeDashoffset={364.4 - (364.4 * stats.percent) / 100}
                                className="text-blue-500 transition-all duration-1000 ease-out"
                                strokeLinecap="round"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-3xl font-black text-slate-800 dark:text-white">{stats.percent}%</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Yig'ildi</span>
                        </div>
                    </div>
                    <p className="mt-4 text-sm font-bold text-slate-500 uppercase tracking-widest">
                        {stats.pendingCount} ta korxona qoldi
                    </p>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative group">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                    <input
                        type="text"
                        placeholder={t.search}
                        className="w-full bg-white dark:bg-apple-darkCard border border-slate-100 dark:border-apple-darkBorder rounded-2xl py-4 pl-14 pr-6 font-bold text-slate-700 dark:text-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all outline-none"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <input
                    type="month"
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                    className="bg-white dark:bg-apple-darkCard border border-slate-100 dark:border-apple-darkBorder rounded-2xl px-6 py-4 font-black text-slate-700 dark:text-white outline-none focus:ring-4 focus:ring-blue-500/10"
                />
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-apple-darkCard rounded-[2.5rem] border border-slate-100 dark:border-apple-darkBorder overflow-hidden shadow-xl shadow-slate-200/50 dark:shadow-none">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-slate-50 dark:border-apple-darkBorder">
                                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{t.companyName}</th>
                                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{t.inn}</th>
                                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{t.amount}</th>
                                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{t.status}</th>
                                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{t.actions}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-apple-darkBorder">
                            {filteredData.map((item) => (
                                <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors group">
                                    <td className="px-8 py-6">
                                        <div className="font-black text-slate-800 dark:text-white group-hover:text-blue-600 transition-colors uppercase tracking-tight text-sm">{item.name}</div>
                                    </td>
                                    <td className="px-8 py-6 font-bold text-slate-400 text-xs">{item.inn}</td>
                                    <td className="px-8 py-6">
                                        <div className="font-black text-slate-700 dark:text-slate-200 uppercase tracking-tighter text-sm">
                                            {(item.contractAmount || 0).toLocaleString()} <span className="text-[10px] opacity-50">UZS</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        {item.payment ? (
                                            <span className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${item.payment.status === PaymentStatus.PAID
                                                ? 'bg-emerald-500/10 text-emerald-600'
                                                : item.payment.status === PaymentStatus.PENDING
                                                    ? 'bg-amber-500/10 text-amber-600'
                                                    : 'bg-rose-500/10 text-rose-600'
                                                }`}>
                                                {item.payment.status === PaymentStatus.PAID ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                                                {item.payment.status}
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-100 dark:bg-apple-darkBg text-slate-400">
                                                <Clock size={12} />
                                                Kutilmoqda
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-2">
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
                                                className="text-blue-500 hover:text-blue-700 p-2 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all active:scale-95"
                                                title="To'lov / Tahrirlash"
                                            >
                                                <CreditCard size={18} />
                                            </button>
                                            {item.payment && (
                                                <button
                                                    onClick={() => { if (confirm('To\'lovni o\'chirishni tasdiqlaysizmi?')) onDeletePayment(item.payment!.id); }}
                                                    className="text-slate-300 hover:text-rose-500 p-2 rounded-xl hover:bg-rose-500/10 transition-all active:scale-95"
                                                    title="O'chirish"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Payment Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-xl bg-black/20">
                    <div className="bg-white dark:bg-apple-darkCard w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 dark:border-apple-darkBorder animate-macos">
                        <div className="px-10 py-8 border-b border-slate-50 dark:border-apple-darkBorder flex justify-between items-center bg-slate-50/50 dark:bg-white/5">
                            <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">To'lovni tasdiqlash</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <Plus size={24} className="rotate-45" />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-10 space-y-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-2 block">{t.amount}</label>
                                    <input
                                        type="number"
                                        value={editingPayment?.amount || ''}
                                        onChange={(e) => setEditingPayment(prev => ({ ...prev, amount: Number(e.target.value) }))}
                                        className="w-full bg-slate-50 dark:bg-apple-darkBg rounded-2xl px-6 py-4 font-black text-slate-800 dark:text-white outline-none focus:ring-4 focus:ring-blue-500/10 transition-all border border-transparent focus:border-blue-500"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-2 block">{t.date}</label>
                                    <input
                                        type="date"
                                        value={editingPayment?.paymentDate || ''}
                                        onChange={(e) => setEditingPayment(prev => ({ ...prev, paymentDate: e.target.value }))}
                                        className="w-full bg-slate-50 dark:bg-apple-darkBg rounded-2xl px-6 py-4 font-black text-slate-800 dark:text-white outline-none focus:ring-4 focus:ring-blue-500/10 transition-all border border-transparent focus:border-blue-500"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-2 block">Holati</label>
                                    <select
                                        value={editingPayment?.status || PaymentStatus.PENDING}
                                        onChange={(e) => setEditingPayment(prev => ({ ...prev, status: e.target.value as PaymentStatus }))}
                                        className="w-full bg-slate-50 dark:bg-apple-darkBg rounded-2xl px-6 py-4 font-black text-slate-800 dark:text-white outline-none appearance-none"
                                    >
                                        <option value={PaymentStatus.PAID}>To'landi</option>
                                        <option value={PaymentStatus.PENDING}>Kutilmoqda</option>
                                        <option value={PaymentStatus.PARTIAL}>Qisman</option>
                                        <option value={PaymentStatus.OVERDUE}>Muddati o'tgan</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-2 block">{t.comment}</label>
                                    <textarea
                                        value={editingPayment?.comment || ''}
                                        onChange={(e) => setEditingPayment(prev => ({ ...prev, comment: e.target.value }))}
                                        className="w-full bg-slate-50 dark:bg-apple-darkBg rounded-2xl px-6 py-4 font-bold text-slate-800 dark:text-white outline-none resize-none h-24"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-4 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-8 py-5 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-500 bg-slate-100 hover:bg-slate-200 transition-all"
                                >
                                    {t.cancel}
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-8 py-5 rounded-2xl font-black text-[10px] uppercase tracking-widest text-white bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-500/20 transition-all active:scale-[0.98]"
                                >
                                    {t.save}
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
