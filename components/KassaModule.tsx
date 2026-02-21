
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
        <div className="space-y-10 animate-fade-in pb-20">
            {/* Header & Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                <div className="sm:col-span-2 relative overflow-hidden bg-gradient-to-br from-indigo-900 to-indigo-950 rounded-[2.5rem] md:rounded-[3.5rem] p-8 md:p-12 text-white shadow-glass-lg group">
                    <div className="absolute -top-10 -right-10 w-64 h-64 bg-indigo-500/20 rounded-full blur-[80px] group-hover:bg-indigo-400/30 transition-colors duration-700"></div>
                    <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-blue-500/10 rounded-full blur-[60px]"></div>
                    <div className="absolute top-0 right-0 p-8 md:p-12 opacity-[0.05] group-hover:scale-110 group-hover:rotate-12 transition-all duration-500 pointer-events-none">
                        <Wallet size={180} className="hidden sm:block" />
                    </div>

                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-8 md:mb-12">
                            <div>
                                <h2 className="text-3xl md:text-4xl font-black tracking-tighter mb-2">{t.kassa || 'Kassa'}</h2>
                                <p className="text-indigo-400/80 font-black uppercase tracking-[0.2em] text-[10px]">{selectedPeriod} Davri bo'yicha</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 xs:grid-cols-2 gap-8 md:gap-10">
                            <div className="group/stat">
                                <span className="text-white/40 font-black text-[10px] uppercase tracking-[0.3em] mb-2 md:mb-3 block">Kutilayotgan</span>
                                <div className="text-2xl md:text-4xl font-black tabular-nums tracking-tight">
                                    {stats.totalExpected.toLocaleString()} <span className="text-sm md:text-lg font-black text-white/30 ml-2">UZS</span>
                                </div>
                                <div className="h-1 w-12 bg-indigo-500 mt-3 md:mt-4 rounded-full group-hover/stat:w-24 transition-all duration-500"></div>
                            </div>
                            <div className="group/stat">
                                <span className="text-emerald-400/60 font-black text-[10px] uppercase tracking-[0.3em] mb-2 md:mb-3 block">To'langan</span>
                                <div className="text-2xl md:text-4xl font-black tabular-nums tracking-tight text-emerald-400">
                                    {stats.totalPaid.toLocaleString()} <span className="text-sm md:text-lg font-black text-emerald-400/30 ml-2">UZS</span>
                                </div>
                                <div className="h-1 w-12 bg-emerald-500 mt-3 md:mt-4 rounded-full group-hover/stat:w-24 transition-all duration-500"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="liquid-glass-card rounded-[2.5rem] md:rounded-[3.5rem] p-8 md:p-10 flex flex-col justify-center items-center text-center shadow-glass relative overflow-hidden group sm:col-span-2 lg:col-span-1">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-indigo-500/5 rounded-full blur-3xl"></div>
                    <div className="relative h-32 w-32 md:h-44 md:w-44 flex items-center justify-center">
                        <svg className="h-full w-full transform -rotate-90">
                            <circle
                                cx="50%" cy="50%" r="40%"
                                fill="transparent"
                                stroke="currentColor"
                                strokeWidth="8"
                                className="text-slate-100 dark:text-white/5"
                            />
                            <circle
                                cx="50%" cy="50%" r="40%"
                                fill="transparent"
                                stroke="url(#kassa-gradient)"
                                strokeWidth="10"
                                strokeDasharray="251.2%"
                                strokeDashoffset={`${251.2 - (251.2 * stats.percent) / 100}%`}
                                className="transition-all duration-[1.5s] ease-out drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]"
                                strokeLinecap="round"
                            />
                            <defs>
                                <linearGradient id="kassa-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#6366f1" />
                                    <stop offset="100%" stopColor="#a855f7" />
                                </linearGradient>
                            </defs>
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-3xl md:text-5xl font-black text-slate-800 dark:text-white tabular-nums tracking-tighter">{stats.percent}%</span>
                            <span className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 md:mt-2">Yig'ildi</span>
                        </div>
                    </div>
                    <p className="mt-6 md:mt-8 text-[10px] md:text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                        {stats.pendingCount} ta korxona qoldi
                    </p>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1 relative group">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={24} />
                    <input
                        type="text"
                        placeholder={t.search}
                        className="w-full liquid-glass-input rounded-[1.8rem] py-5 pl-16 pr-8 font-black text-slate-700 dark:text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/50 transition-all outline-none border border-transparent shadow-glass"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="relative group">
                    <input
                        type="month"
                        value={selectedPeriod}
                        onChange={(e) => setSelectedPeriod(e.target.value)}
                        className="liquid-glass-input rounded-[1.8rem] px-8 py-5 font-black text-slate-700 dark:text-white outline-none focus:ring-4 focus:ring-indigo-500/10 border border-transparent focus:border-indigo-500/50 shadow-glass appearance-none min-w-[200px]"
                    />
                    <Clock className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-focus-within:text-indigo-500 transition-colors" size={20} />
                </div>
            </div>

            {/* Table */}
            <div className="liquid-glass-card rounded-[3.5rem] shadow-glass-lg border border-white/10 overflow-hidden">
                <div className="overflow-x-auto scrollbar-thin">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80 dark:bg-white/5 backdrop-blur-md text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-white/10">
                                <th className="px-6 md:px-10 py-6 md:py-8 sticky left-0 z-20 bg-slate-50 dark:bg-apple-darkBg md:relative md:z-0 md:bg-transparent">{t.companyName}</th>
                                <th className="px-6 md:px-8 py-6 md:py-8">{t.inn}</th>
                                <th className="px-6 md:px-8 py-6 md:py-8">{t.amount}</th>
                                <th className="px-6 md:px-8 py-6 md:py-8">{t.status}</th>
                                <th className="px-6 md:px-10 py-6 md:py-8 text-right md:sticky md:right-0 z-20 bg-slate-50 dark:bg-apple-darkBg md:relative md:z-0 md:bg-transparent">{t.actions}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredData.map((item) => (
                                <tr key={item.id} className="hover:bg-white/60 dark:hover:bg-white/10 transition-all group/row">
                                    <td className="px-6 md:px-10 py-5 md:py-7 sticky left-0 z-10 bg-white dark:bg-apple-darkBg md:relative md:z-0 md:bg-transparent shadow-[10px_0_20px_-10px_rgba(0,0,0,0.05)] md:shadow-none">
                                        <div className="font-black text-slate-800 dark:text-white group-hover/row:text-indigo-600 transition-colors uppercase tracking-tight text-sm md:text-base leading-tight truncate max-w-[140px] md:max-w-none">
                                            {item.name}
                                        </div>
                                        {item.brandName && <p className="text-[8px] md:text-[9px] font-black text-slate-400 mt-1 uppercase tracking-widest opacity-60 truncate max-w-[140px] md:max-w-none">{item.brandName}</p>}
                                    </td>
                                    <td className="px-6 md:px-8 py-5 md:py-7 font-black text-slate-400 text-[10px] md:text-[11px] font-mono tabular-nums">{item.inn}</td>
                                    <td className="px-6 md:px-8 py-5 md:py-7">
                                        <div className="font-black text-slate-800 dark:text-slate-200 tabular-nums text-sm md:text-base">
                                            {(item.contractAmount || 0).toLocaleString()} <span className="text-[8px] md:text-[10px] font-black text-slate-400 ml-1">UZS</span>
                                        </div>
                                    </td>
                                    <td className="px-6 md:px-8 py-5 md:py-7">
                                        {item.payment ? (
                                            <span className={`inline-flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 md:py-2 rounded-full text-[8px] md:text-[10px] font-black uppercase tracking-widest border shadow-sm ${item.payment.status === PaymentStatus.PAID
                                                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                                                : item.payment.status === PaymentStatus.PENDING
                                                    ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                                    : 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                                                }`}>
                                                {item.payment.status === PaymentStatus.PAID ? <CheckCircle2 size={10} className="md:w-3 md:h-3" strokeWidth={3} /> : <Clock size={10} className="md:w-3 md:h-3" strokeWidth={3} />}
                                                {item.payment.status}
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 md:py-2 rounded-full text-[8px] md:text-[10px] font-black uppercase tracking-widest bg-slate-100/50 dark:bg-white/5 text-slate-400 border border-transparent">
                                                <Clock size={10} className="md:w-3 md:h-3" strokeWidth={3} />
                                                Kutilmoqda
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 md:px-10 py-5 md:py-7 text-right">
                                        <div className="flex items-center justify-end gap-2 md:gap-3">
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
                                                className="w-9 h-9 md:w-11 md:h-11 flex items-center justify-center bg-indigo-600/10 text-indigo-600 rounded-xl md:rounded-2xl hover:bg-indigo-600 hover:text-white transition-all transform hover:scale-110 active:scale-95 shadow-glass border border-indigo-600/10"
                                                title="To'lov / Tahrirlash"
                                            >
                                                <CreditCard size={16} className="md:w-[18px] md:h-[18px]" />
                                            </button>
                                            {item.payment && (
                                                <button
                                                    onClick={() => { if (confirm('To\'lovni o\'chirishni tasdiqlaysizmi?')) onDeletePayment(item.payment!.id); }}
                                                    className="w-9 h-9 md:w-11 md:h-11 flex items-center justify-center bg-rose-500/10 text-rose-500 rounded-xl md:rounded-2xl hover:bg-rose-500 hover:text-white transition-all transform hover:scale-110 active:scale-95 shadow-glass border border-rose-500/10"
                                                    title="O'chirish"
                                                >
                                                    <Trash2 size={16} className="md:w-[18px] md:h-[18px]" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredData.length === 0 && (
                        <div className="py-40 flex flex-col items-center justify-center text-slate-300">
                            <div className="w-24 h-24 rounded-[3rem] bg-slate-50 dark:bg-white/5 flex items-center justify-center mb-6 shadow-inner">
                                <Search size={48} className="opacity-20 translate-y-1" />
                            </div>
                            <p className="font-black uppercase tracking-[0.3em] text-sm opacity-40">Ma'lumot topilmadi</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Payment Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-500">
                    <div className="liquid-glass-card w-full max-w-xl rounded-[2.5rem] md:rounded-[3.5rem] overflow-hidden shadow-glass-lg animate-in zoom-in-95 duration-500 border border-white/20">
                        <div className="px-6 md:px-12 py-6 md:py-10 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-indigo-600/10 to-transparent">
                            <div>
                                <h3 className="text-lg md:text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter tracking-tight">To'lovni tasdiqlash</h3>
                                <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Tranzaksiya tafsilotlarini kiriting</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-3 md:p-4 bg-white/50 dark:bg-white/5 hover:bg-rose-500 hover:text-white rounded-xl md:rounded-2xl transition-all group">
                                <Plus size={20} className="rotate-45 group-hover:rotate-[135deg] transition-transform duration-500 md:w-6 md:h-6" />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 md:p-12 space-y-6 md:space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 block">{t.amount}</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={editingPayment?.amount || ''}
                                            onChange={(e) => setEditingPayment(prev => ({ ...prev, amount: Number(e.target.value) }))}
                                            className="w-full bg-slate-50 dark:bg-white/5 rounded-[1.8rem] px-8 py-5 font-black text-slate-800 dark:text-white outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all border border-transparent focus:border-indigo-500/50 shadow-inner"
                                            required
                                        />
                                        <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase tracking-widest opacity-40">UZS</div>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 block">{t.date}</label>
                                    <div className="relative">
                                        <input
                                            type="date"
                                            value={editingPayment?.paymentDate || ''}
                                            onChange={(e) => setEditingPayment(prev => ({ ...prev, paymentDate: e.target.value }))}
                                            className="w-full bg-slate-50 dark:bg-white/5 rounded-[1.8rem] px-8 py-5 font-black text-slate-800 dark:text-white outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all border border-transparent focus:border-indigo-500/50 shadow-inner appearance-none"
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 block">To'lov Holati</label>
                                    <select
                                        value={editingPayment?.status || PaymentStatus.PENDING}
                                        onChange={(e) => setEditingPayment(prev => ({ ...prev, status: e.target.value as PaymentStatus }))}
                                        className="w-full bg-slate-50 dark:bg-white/5 rounded-[1.8rem] px-8 py-5 font-black text-slate-800 dark:text-white outline-none border border-transparent focus:border-indigo-500/50 appearance-none shadow-inner"
                                    >
                                        <option value={PaymentStatus.PAID}>To'landi</option>
                                        <option value={PaymentStatus.PENDING}>Kutilmoqda</option>
                                        <option value={PaymentStatus.PARTIAL}>Qisman</option>
                                        <option value={PaymentStatus.OVERDUE}>Muddati o'tgan</option>
                                    </select>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 block">{t.comment}</label>
                                    <input
                                        type="text"
                                        placeholder="Ixtiyoriy izoh..."
                                        value={editingPayment?.comment || ''}
                                        onChange={(e) => setEditingPayment(prev => ({ ...prev, comment: e.target.value }))}
                                        className="w-full bg-slate-50 dark:bg-white/5 rounded-[1.8rem] px-8 py-5 font-bold text-slate-800 dark:text-white outline-none border border-transparent focus:border-indigo-500/50 shadow-inner"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-6 pt-6">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-10 py-6 rounded-[1.8rem] font-black text-[11px] uppercase tracking-[0.2em] text-slate-400 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-all active:scale-95"
                                >
                                    {t.cancel}
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-10 py-6 rounded-[1.8rem] font-black text-[11px] uppercase tracking-[0.2em] text-white bg-indigo-600 hover:bg-indigo-700 shadow-glass-lg transition-all active:scale-95 transform hover:-translate-y-1"
                                >
                                    TASDIQLASH
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
