
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                <div className="bg-white dark:bg-[#22252B] border-l-4 border-l-rose-600 border border-gray-200 dark:border-gray-700 rounded p-6 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:scale-110 transition-all pointer-events-none">
                        <TrendingDown size={140} className="hidden sm:block text-rose-600" />
                    </div>
                    <div className="relative z-10">
                        <span className="text-gray-500 font-bold text-[10px] uppercase tracking-widest mb-2 block">Shu oyda</span>
                        <div className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums mb-4">
                            {stats.totalMonth.toLocaleString()} <span className="text-sm font-bold text-gray-400 ml-1">UZS</span>
                        </div>
                        <div className="h-1.5 w-16 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-rose-600 w-3/4 rounded-full"></div>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-[#22252B] rounded border border-gray-200 dark:border-gray-700 p-6 flex flex-col justify-center shadow-sm relative overflow-hidden">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-10 h-10 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 flex items-center justify-center">
                            <Receipt size={20} />
                        </div>
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Umumiy</span>
                            <h4 className="font-bold text-gray-800 dark:text-white text-sm">Jami xarajat</h4>
                        </div>
                    </div>
                    <div className="text-2xl font-bold text-gray-800 dark:text-white tabular-nums tracking-tight">
                        {stats.totalAll.toLocaleString()} <span className="text-sm font-bold text-gray-400 ml-1">UZS</span>
                    </div>
                </div>

                <div className="bg-white dark:bg-[#22252B] rounded border border-gray-200 dark:border-gray-700 p-6 flex flex-col justify-center shadow-sm relative overflow-hidden sm:col-span-2 lg:col-span-1">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-10 h-10 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 flex items-center justify-center">
                            <Tag size={20} />
                        </div>
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Faollik</span>
                            <h4 className="font-bold text-gray-800 dark:text-white text-sm">Tranzaksiyalar</h4>
                        </div>
                    </div>
                    <div className="flex items-end gap-2">
                        <span className="text-3xl font-bold text-gray-800 dark:text-white tabular-nums">{stats.count}</span>
                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">ta qayd</span>
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-rose-600 transition-colors" size={20} />
                    <input
                        type="text"
                        placeholder={t.search}
                        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1e2025] py-2 pl-10 pr-3 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:border-rose-500 shadow-sm"
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
                    className="bg-white dark:bg-[#22252B] border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 font-bold px-4 py-2 rounded text-xs flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm whitespace-nowrap"
                >
                    <Plus size={16} />
                    <span>YANGI XARAJAT</span>
                </button>
            </div>

            {/* Expense List */}
            <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 rounded shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-100 dark:bg-gray-800 text-[10px] font-bold uppercase text-gray-500 border-b border-gray-200 dark:border-gray-700">
                                <th className="px-4 py-3">Sana</th>
                                <th className="px-4 py-3">Kategoriya</th>
                                <th className="px-4 py-3">Izoh</th>
                                <th className="px-4 py-3 text-right">Summa</th>
                                <th className="px-4 py-3 text-right">Amallar</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                            {filteredExpenses.map((expense) => (
                                <tr key={expense.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                    <td className="px-4 py-2 text-xs text-gray-500">{expense.date}</td>
                                    <td className="px-4 py-2">
                                        <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[10px] font-bold uppercase tracking-wider rounded">{expense.category}</span>
                                    </td>
                                    <td className="px-4 py-2 text-xs font-bold text-gray-800 dark:text-gray-200 truncate max-w-[200px]">
                                        {expense.description || "—"}
                                    </td>
                                    <td className="px-4 py-2 text-right">
                                        <span className="font-bold text-rose-600 text-sm">
                                            -{expense.amount.toLocaleString()} <span className="text-[10px] text-gray-400">UZS</span>
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 text-right">
                                        <div className="flex items-center justify-end gap-2 text-gray-400">
                                            <button
                                                onClick={() => { setEditingExpense(expense); setIsModalOpen(true); }}
                                                className="p-1.5 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                                                title="Tahrirlash"
                                            >
                                                <Edit3 size={14} />
                                            </button>
                                            {onDeleteExpense && (
                                                <button
                                                    onClick={() => { if (confirm('Xarajatni o\'chirishni tasdiqlaysizmi?')) onDeleteExpense(expense.id); }}
                                                    className="p-1.5 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded transition-colors"
                                                    title="O'chirish"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredExpenses.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                                        <Search size={24} className="mx-auto mb-2 opacity-20" />
                                        <span className="text-xs uppercase font-bold opacity-60">Ma'lumot topilmadi</span>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Expense Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-[#22252B] w-full max-w-lg rounded shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-[#1A1D23]">
                            <div>
                                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">Xarajatni kiritish</h3>
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
                                            value={editingExpense?.amount || ''}
                                            onChange={(e) => setEditingExpense(prev => ({ ...prev, amount: Number(e.target.value) }))}
                                            className="w-full bg-white dark:bg-[#1e2025] border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm text-gray-800 dark:text-white focus:outline-none focus:border-rose-500 shadow-sm"
                                            required
                                        />
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">UZS</div>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-600 dark:text-gray-400">{t.date}</label>
                                    <input
                                        type="date"
                                        value={editingExpense?.date || ''}
                                        onChange={(e) => setEditingExpense(prev => ({ ...prev, date: e.target.value }))}
                                        className="w-full bg-white dark:bg-[#1e2025] border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm text-gray-800 dark:text-white focus:outline-none focus:border-rose-500 shadow-sm"
                                        required
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-600 dark:text-gray-400">{t.category}</label>
                                    <select
                                        value={editingExpense?.category || 'Other'}
                                        onChange={(e) => setEditingExpense(prev => ({ ...prev, category: e.target.value }))}
                                        className="w-full bg-white dark:bg-[#1e2025] border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm text-gray-800 dark:text-white focus:outline-none focus:border-rose-500 shadow-sm"
                                    >
                                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-600 dark:text-gray-400">{t.comment}</label>
                                    <input
                                        type="text"
                                        placeholder="Ixtiyoriy izoh..."
                                        value={editingExpense?.description || ''}
                                        onChange={(e) => setEditingExpense(prev => ({ ...prev, description: e.target.value }))}
                                        className="w-full bg-white dark:bg-[#1e2025] border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm text-gray-800 dark:text-white focus:outline-none focus:border-rose-500 shadow-sm"
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
                                    className="flex-1 px-4 py-2 rounded font-bold text-xs text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-sm flex items-center justify-center gap-2"
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
