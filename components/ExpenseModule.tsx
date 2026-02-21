
import React, { useState, useMemo } from 'react';
import { Expense, Language } from '../types';
import { translations } from '../lib/translations';
import { Receipt, Plus, Search, Filter, Edit3, Trash2, Calendar, Tag, ChevronRight, TrendingDown } from 'lucide-react';

interface ExpenseModuleProps {
    expenses: Expense[];
    lang: Language;
    onSaveExpense: (expense: Partial<Expense>) => Promise<void>;
    onDeleteExpense?: (id: string) => Promise<void>;
}

const ExpenseModule: React.FC<ExpenseModuleProps> = ({ expenses, lang, onSaveExpense, onDeleteExpense }) => {
    const t = translations[lang];
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingExpense, setEditingExpense] = useState<Partial<Expense> | null>(null);

    const filteredExpenses = useMemo(() => {
        return expenses.filter(e =>
            e.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
            e.description?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [expenses, searchTerm]);

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
        <div className="space-y-10 animate-fade-in pb-20">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                <div className="relative overflow-hidden bg-gradient-to-br from-rose-600 to-rose-950 rounded-[2.5rem] md:rounded-[3.5rem] p-6 md:p-10 text-white shadow-glass-lg group hover:scale-[1.02] transition-all duration-500">
                    <div className="absolute -top-10 -right-10 w-64 h-64 bg-rose-400/20 rounded-full blur-[80px] group-hover:bg-rose-400/30 transition-colors duration-700"></div>
                    <div className="absolute top-0 right-0 p-6 md:p-10 opacity-[0.05] group-hover:scale-110 group-hover:rotate-12 transition-all duration-500 pointer-events-none">
                        <TrendingDown size={140} className="hidden sm:block" />
                    </div>
                    <div className="relative z-10">
                        <span className="text-white/40 font-black text-[10px] uppercase tracking-[0.3em] mb-4 block">Shu oyda</span>
                        <div className="text-3xl sm:text-4xl md:text-5xl font-black tabular-nums tracking-tighter mb-4">
                            {stats.totalMonth.toLocaleString()} <span className="text-sm md:text-xl font-black text-white/30 ml-2">UZS</span>
                        </div>
                        <div className="h-1.5 w-16 bg-white/20 rounded-full overflow-hidden">
                            <div className="h-full bg-white w-3/4 rounded-full shadow-[0_0_10px_white]"></div>
                        </div>
                    </div>
                </div>

                <div className="liquid-glass-card rounded-[2.5rem] md:rounded-[3.5rem] p-6 md:p-10 flex flex-col justify-between shadow-glass group hover:shadow-glass-lg transition-all duration-500 relative overflow-hidden">
                    <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-rose-500/5 rounded-full blur-[60px]"></div>
                    <div className="flex items-center gap-5 mb-4 md:mb-8">
                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-[1.2rem] md:rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center shadow-glass border border-rose-500/20 group-hover:scale-110 transition-transform">
                            <Receipt size={20} />
                        </div>
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Umumiy</span>
                            <h4 className="font-black text-slate-800 dark:text-white text-sm md:text-base">Jami xarajat</h4>
                        </div>
                    </div>
                    <div className="text-2xl md:text-4xl font-black text-slate-800 dark:text-white tabular-nums tracking-tighter">
                        {stats.totalAll.toLocaleString()} <span className="text-sm md:text-lg font-black text-slate-400 ml-2">UZS</span>
                    </div>
                </div>

                <div className="liquid-glass-card rounded-[2.5rem] md:rounded-[3.5rem] p-6 md:p-10 flex flex-col justify-between shadow-glass group hover:shadow-glass-lg transition-all duration-500 relative overflow-hidden sm:col-span-2 lg:col-span-1">
                    <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-indigo-500/5 rounded-full blur-[60px]"></div>
                    <div className="flex items-center gap-5 mb-4 md:mb-8">
                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-[1.2rem] md:rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shadow-glass border border-indigo-500/20 group-hover:scale-110 transition-transform">
                            <Tag size={20} />
                        </div>
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Faollik</span>
                            <h4 className="font-black text-slate-800 dark:text-white text-sm md:text-base">Tranzaksiyalar</h4>
                        </div>
                    </div>
                    <div className="flex items-end gap-3">
                        <span className="text-3xl md:text-5xl font-black text-slate-800 dark:text-white tabular-nums tracking-tighter">{stats.count}</span>
                        <span className="text-[10px] md:text-sm font-black text-slate-400 uppercase tracking-widest mb-1 md:mb-2">ta qayd</span>
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1 relative group">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-rose-600 transition-colors" size={24} />
                    <input
                        type="text"
                        placeholder={t.search}
                        className="w-full liquid-glass-input rounded-[1.8rem] py-5 pl-16 pr-8 font-black text-slate-700 dark:text-white focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500/50 transition-all outline-none border border-transparent shadow-glass"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <button
                    onClick={() => {
                        setEditingExpense({
                            date: new Date().toISOString().split('T')[0],
                            category: 'Office',
                            amount: 0
                        });
                        setIsModalOpen(true);
                    }}
                    className="bg-rose-600 text-white font-black px-10 py-5 rounded-[1.8rem] flex items-center justify-center gap-4 hover:bg-rose-700 transition-all shadow-glass-lg active:scale-95 whitespace-nowrap transform hover:-translate-y-1 group"
                >
                    <Plus size={24} className="group-hover:rotate-90 transition-transform duration-500" />
                    <span className="uppercase tracking-widest text-xs">Yangi xarajat</span>
                </button>
            </div>

            {/* Expense List */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {filteredExpenses.map((expense) => (
                    <div key={expense.id} className="liquid-glass-card rounded-[2.5rem] p-8 hover:shadow-glass-lg transition-all group flex items-center justify-between border border-white/10">
                        <div className="flex items-center gap-4 md:gap-6 min-w-0">
                            <div className="h-12 w-12 md:h-16 md:w-16 shrink-0 rounded-[1.2rem] md:rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center group-hover:bg-rose-600 group-hover:text-white transition-all duration-500 shadow-glass-lg">
                                <Receipt size={24} className="md:w-7 md:h-7" />
                            </div>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-1 md:mb-2">
                                    <span className="px-2 md:px-3 py-0.5 md:py-1 rounded-md md:rounded-lg bg-slate-100 dark:bg-white/10 text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">{expense.category}</span>
                                    <span className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest opacity-60">{expense.date}</span>
                                </div>
                                <div className="font-black text-slate-800 dark:text-white text-sm md:text-lg uppercase tracking-tight truncate group-hover:text-rose-600 transition-colors">{expense.description || "Izohsiz"}</div>
                            </div>
                        </div>
                        <div className="text-right flex items-center gap-4 md:gap-8 shrink-0">
                            <div>
                                <div className="font-black text-rose-600 text-lg md:text-2xl tracking-tighter">-{expense.amount.toLocaleString()}</div>
                                <div className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">UZS</div>
                            </div>
                            <div className="flex items-center gap-1 md:gap-2">
                                <button
                                    onClick={() => { setEditingExpense(expense); setIsModalOpen(true); }}
                                    className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center bg-slate-100 dark:bg-white/5 text-slate-400 hover:bg-indigo-500 hover:text-white rounded-lg md:rounded-xl transition-all opacity-0 md:opacity-0 group-hover:opacity-100"
                                    title="Tahrirlash"
                                >
                                    <Edit3 size={14} className="md:w-[18px] md:h-[18px]" />
                                </button>
                                {onDeleteExpense && (
                                    <button
                                        onClick={() => { if (confirm('Xarajatni o\'chirishni tasdiqlaysizmi?')) onDeleteExpense(expense.id); }}
                                        className="w-10 h-10 flex items-center justify-center bg-slate-100 dark:bg-white/5 text-slate-400 hover:bg-rose-500 hover:text-white rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                        title="O'chirish"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Expense Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-500">
                    <div className="liquid-glass-card w-full max-w-xl rounded-[2.5rem] md:rounded-[3.5rem] overflow-hidden shadow-glass-lg animate-in zoom-in-95 duration-500 border border-white/20">
                        <div className="px-6 md:px-12 py-6 md:py-10 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-rose-600/10 to-transparent">
                            <div>
                                <h3 className="text-lg md:text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Xarajatni kiritish</h3>
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
                                            value={editingExpense?.amount || ''}
                                            onChange={(e) => setEditingExpense(prev => ({ ...prev, amount: Number(e.target.value) }))}
                                            className="w-full bg-slate-50 dark:bg-white/5 rounded-[1.8rem] px-8 py-5 font-black text-slate-800 dark:text-white outline-none focus:ring-4 focus:ring-rose-500/10 transition-all border border-transparent focus:border-rose-500/50 shadow-inner"
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
                                            value={editingExpense?.date || ''}
                                            onChange={(e) => setEditingExpense(prev => ({ ...prev, date: e.target.value }))}
                                            className="w-full bg-slate-50 dark:bg-white/5 rounded-[1.8rem] px-8 py-5 font-black text-slate-800 dark:text-white outline-none focus:ring-4 focus:ring-rose-500/10 transition-all border border-transparent focus:border-rose-500/50 shadow-inner appearance-none"
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 block">{t.category}</label>
                                    <select
                                        value={editingExpense?.category || 'Other'}
                                        onChange={(e) => setEditingExpense(prev => ({ ...prev, category: e.target.value }))}
                                        className="w-full bg-slate-50 dark:bg-white/5 rounded-[1.8rem] px-8 py-5 font-black text-slate-800 dark:text-white outline-none border border-transparent focus:border-rose-500/50 appearance-none shadow-inner"
                                    >
                                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 block">{t.comment}</label>
                                    <input
                                        type="text"
                                        placeholder="Ixtiyoriy izoh..."
                                        value={editingExpense?.description || ''}
                                        onChange={(e) => setEditingExpense(prev => ({ ...prev, description: e.target.value }))}
                                        className="w-full bg-slate-50 dark:bg-white/5 rounded-[1.8rem] px-8 py-5 font-bold text-slate-800 dark:text-white outline-none border border-transparent focus:border-rose-500/50 shadow-inner"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-6 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-10 py-6 rounded-[1.8rem] font-black text-[11px] uppercase tracking-[0.2em] text-slate-400 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-all active:scale-95"
                                >
                                    {t.cancel}
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-10 py-6 rounded-[1.8rem] font-black text-[11px] uppercase tracking-[0.2em] text-white bg-rose-600 hover:bg-rose-700 shadow-glass-lg transition-all active:scale-95 transform hover:-translate-y-1"
                                >
                                    SAQLASH
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ExpenseModule;
