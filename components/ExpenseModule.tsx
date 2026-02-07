
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
        <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-rose-500 to-rose-700 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-rose-500/20">
                    <div className="flex justify-between items-start">
                        <div>
                            <span className="text-rose-100/60 font-black text-[10px] uppercase tracking-[0.2em]">Shu oyda</span>
                            <div className="text-3xl font-black mt-1">
                                {stats.totalMonth.toLocaleString()} <span className="text-sm font-bold opacity-60">UZS</span>
                            </div>
                        </div>
                        <TrendingDown className="opacity-20" size={48} />
                    </div>
                </div>
                <div className="bg-white dark:bg-apple-darkCard rounded-[2.5rem] p-8 border border-slate-100 dark:border-apple-darkBorder">
                    <span className="text-slate-400 font-black text-[10px] uppercase tracking-[0.2em]">Jami xarajatlar</span>
                    <div className="text-3xl font-black mt-1 text-slate-800 dark:text-white">
                        {stats.totalAll.toLocaleString()} <span className="text-sm font-bold text-slate-400">UZS</span>
                    </div>
                </div>
                <div className="bg-white dark:bg-apple-darkCard rounded-[2.5rem] p-8 border border-slate-100 dark:border-apple-darkBorder">
                    <span className="text-slate-400 font-black text-[10px] uppercase tracking-[0.2em]">Tranzaksiyalar</span>
                    <div className="text-3xl font-black mt-1 text-slate-800 dark:text-white">
                        {stats.count} <span className="text-sm font-bold text-slate-400">ta</span>
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative group">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-rose-500 transition-colors" size={20} />
                    <input
                        type="text"
                        placeholder={t.search}
                        className="w-full bg-white dark:bg-apple-darkCard border border-slate-100 dark:border-apple-darkBorder rounded-2xl py-4 pl-14 pr-6 font-bold text-slate-700 dark:text-white focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 transition-all outline-none"
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
                    className="bg-rose-600 text-white font-black px-8 py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-rose-700 transition-all shadow-xl shadow-rose-500/20 active:scale-95 whitespace-nowrap"
                >
                    <Plus size={20} />
                    <span>Yangi xarajat</span>
                </button>
            </div>

            {/* Expense List */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredExpenses.map((expense) => (
                    <div key={expense.id} className="bg-white dark:bg-apple-darkCard rounded-3xl p-6 border border-slate-100 dark:border-apple-darkBorder hover:shadow-lg transition-all group flex items-center justify-between">
                        <div className="flex items-center gap-5">
                            <div className="h-14 w-14 rounded-2xl bg-slate-50 dark:bg-apple-darkBg flex items-center justify-center text-rose-500 group-hover:bg-rose-500 group-hover:text-white transition-all">
                                <Receipt size={24} />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-apple-darkBg text-[10px] font-black text-slate-500 uppercase tracking-widest">{expense.category}</span>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{expense.date}</span>
                                </div>
                                <div className="font-black text-slate-800 dark:text-white text-sm uppercase tracking-tight line-clamp-1">{expense.description || "Izohsiz"}</div>
                            </div>
                        </div>
                        <div className="text-right flex items-center gap-6">
                            <div>
                                <div className="font-black text-rose-600 text-lg tracking-tighter">-{expense.amount.toLocaleString()}</div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">UZS</div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => { setEditingExpense(expense); setIsModalOpen(true); }}
                                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-apple-accent transition-all p-2"
                                    title="Tahrirlash"
                                >
                                    <Edit3 size={18} />
                                </button>
                                {onDeleteExpense && (
                                    <button
                                        onClick={() => { if (confirm('Xarajatni o\'chirishni tasdiqlaysizmi?')) onDeleteExpense(expense.id); }}
                                        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 transition-all p-2"
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
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-xl bg-black/20">
                    <div className="bg-white dark:bg-apple-darkCard w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 dark:border-apple-darkBorder animate-macos">
                        <div className="px-10 py-8 border-b border-slate-50 dark:border-apple-darkBorder flex justify-between items-center bg-slate-50/50 dark:bg-white/5">
                            <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Xarajatni kiritish</h3>
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
                                        value={editingExpense?.amount || ''}
                                        onChange={(e) => setEditingExpense(prev => ({ ...prev, amount: Number(e.target.value) }))}
                                        className="w-full bg-slate-50 dark:bg-apple-darkBg rounded-2xl px-6 py-4 font-black text-slate-800 dark:text-white outline-none"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-2 block">{t.date}</label>
                                    <input
                                        type="date"
                                        value={editingExpense?.date || ''}
                                        onChange={(e) => setEditingExpense(prev => ({ ...prev, date: e.target.value }))}
                                        className="w-full bg-slate-50 dark:bg-apple-darkBg rounded-2xl px-6 py-4 font-black text-slate-800 dark:text-white outline-none"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-2 block">{t.category}</label>
                                    <select
                                        value={editingExpense?.category || 'Other'}
                                        onChange={(e) => setEditingExpense(prev => ({ ...prev, category: e.target.value }))}
                                        className="w-full bg-slate-50 dark:bg-apple-darkBg rounded-2xl px-6 py-4 font-black text-slate-800 dark:text-white outline-none appearance-none"
                                    >
                                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-2 block">{t.comment}</label>
                                    <textarea
                                        value={editingExpense?.description || ''}
                                        onChange={(e) => setEditingExpense(prev => ({ ...prev, description: e.target.value }))}
                                        className="w-full bg-slate-50 dark:bg-apple-darkBg rounded-2xl px-6 py-4 font-bold text-slate-800 dark:text-white outline-none h-24"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-4 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-8 py-5 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-500 bg-slate-100 hover:bg-slate-200"
                                >
                                    {t.cancel}
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-8 py-5 rounded-2xl font-black text-[10px] uppercase tracking-widest text-white bg-rose-600 hover:bg-rose-700 shadow-xl shadow-rose-500/20 active:scale-[0.98]"
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

export default ExpenseModule;
