
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
        <div className="space-y-4 animate-fade-in pb-20">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm p-5 shadow-sm relative overflow-hidden flex flex-col justify-between transition-colors">
                    <div className="absolute top-[-20px] right-[-20px] opacity-[0.03] pointer-events-none">
                        <TrendingDown size={140} className="text-rose-600" />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 rounded-sm bg-rose-600 flex items-center justify-center text-white shadow-sm shrink-0">
                                <TrendingDown size={18} />
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">SHU OYDA</span>
                        </div>
                        <div className="text-[22px] font-bold text-gray-800 dark:text-white tabular-nums leading-none mb-4">
                            {stats.totalMonth.toLocaleString()} <span className="text-[10px] font-bold text-gray-400 ml-1 uppercase">sum</span>
                        </div>
                        <div className="h-2 w-full bg-[#F0F2F5] dark:bg-[#1e2025] rounded-sm overflow-hidden border border-[#DEE2E6] dark:border-[#3A3D44]">
                            <div className="h-full bg-rose-600 w-3/4 rounded-sm"></div>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-[#22252B] rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] p-5 flex flex-col justify-center shadow-sm relative transition-colors">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-9 h-9 rounded-sm bg-[#F8F9FA] dark:bg-[#1A1D23] text-gray-400 flex items-center justify-center border border-[#DEE2E6] dark:border-[#3A3D44]">
                            <Receipt size={18} />
                        </div>
                        <div>
                            <span className="text-[8px] font-bold uppercase tracking-widest text-gray-400">UMUMIY</span>
                            <h4 className="font-bold text-gray-800 dark:text-white text-[11px] uppercase tracking-tight">Jami xarajat</h4>
                        </div>
                    </div>
                    <div className="text-[20px] font-bold text-gray-800 dark:text-white tabular-nums tracking-tight leading-none">
                        {stats.totalAll.toLocaleString()} <span className="text-[10px] font-bold text-gray-400 ml-1 uppercase">sum</span>
                    </div>
                </div>

                <div className="bg-white dark:bg-[#22252B] rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] p-5 flex flex-col justify-center shadow-sm relative transition-colors">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-9 h-9 rounded-sm bg-[#F8F9FA] dark:bg-[#1A1D23] text-gray-400 flex items-center justify-center border border-[#DEE2E6] dark:border-[#3A3D44]">
                            <Tag size={18} />
                        </div>
                        <div>
                            <span className="text-[8px] font-bold uppercase tracking-widest text-gray-400">FAOLLIK</span>
                            <h4 className="font-bold text-gray-800 dark:text-white text-[11px] uppercase tracking-tight">Tranzaksiyalar</h4>
                        </div>
                    </div>
                    <div className="flex items-end gap-1.5 leading-none">
                        <span className="text-[22px] font-bold text-gray-800 dark:text-white tabular-nums">{stats.count}</span>
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">QAYD</span>
                    </div>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-rose-600 transition-colors" size={14} />
                    <input
                        type="text"
                        placeholder="QIDIRISH..."
                        className="w-full rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] bg-white dark:bg-[#22252B] py-2 pl-9 pr-3 text-[11px] font-bold uppercase tracking-tight text-gray-800 dark:text-white outline-none focus:border-rose-500 shadow-sm transition-all"
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
                    className="bg-[#3366CC] text-white font-bold px-4 py-2 rounded-sm text-[10px] flex items-center justify-center gap-2 hover:bg-[#2A52A3] transition-all shadow-sm whitespace-nowrap uppercase tracking-widest active:scale-95"
                >
                    <Plus size={14} />
                    <span>Yangi Xarajat</span>
                </button>
            </div>

            {/* Expense List */}
            <div className="bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm shadow-sm overflow-hidden transition-colors">
                <div className="overflow-x-auto scrollbar-hide">
                    <table className="w-full text-left border-collapse c1-table">
                        <thead>
                            <tr className="bg-[#F8F9FA] dark:bg-[#1A1D23] text-[9px] font-bold uppercase text-gray-400 border-b border-[#DEE2E6] dark:border-[#3A3D44] tracking-widest">
                                <th className="px-5 py-3 w-[120px]">Sana</th>
                                <th className="px-5 py-3 w-[150px]">Kategoriya</th>
                                <th className="px-5 py-3">Izoh</th>
                                <th className="px-5 py-3 text-right w-[150px]">Summa</th>
                                <th className="px-5 py-3 text-right w-[100px]">Amallar</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F0F2F5] dark:divide-[#1e2025]">
                            {filteredExpenses.map((expense) => (
                                <tr key={expense.id} className="hover:bg-[#EBF3FF] dark:hover:bg-[#1C2531] transition-all group">
                                    <td className="px-5 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-tight font-mono">{expense.date}</td>
                                    <td className="px-5 py-2.5">
                                        <span className="px-2 py-0.5 bg-[#F8F9FA] dark:bg-[#1A1D23] text-gray-500 border border-[#DEE2E6] dark:border-[#3A3D44] text-[8px] font-black uppercase tracking-widest rounded-sm">{expense.category}</span>
                                    </td>
                                    <td className="px-5 py-2.5 text-[11px] font-bold text-gray-800 dark:text-white truncate max-w-[300px] tracking-tight">
                                        {expense.description || "—"}
                                    </td>
                                    <td className="px-5 py-2.5 text-right">
                                        <span className="font-bold text-rose-600 text-[11px] tabular-nums">
                                            -{expense.amount.toLocaleString()} <span className="text-[8px] font-bold text-gray-400 uppercase ml-0.5">sum</span>
                                        </span>
                                    </td>
                                    <td className="px-5 py-2.5 text-right">
                                        <div className="flex items-center justify-end gap-1 opacity-20 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => { setEditingExpense(expense); setIsModalOpen(true); }}
                                                className="p-1.5 text-[#3366CC] hover:bg-[#EBF3FF] dark:hover:bg-[#1C2531] rounded-sm border border-transparent hover:border-[#3366CC]/30 transition-all font-bold"
                                                title="Tahrirlash"
                                            >
                                                <Edit3 size={14} />
                                            </button>
                                            {onDeleteExpense && (
                                                <button
                                                    onClick={() => { if (confirm('Xarajatni o\'chirishni tasdiqlaysizmi?')) onDeleteExpense(expense.id); }}
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
                            {filteredExpenses.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-5 py-20 text-center text-gray-300">
                                        <div className="flex flex-col items-center">
                                            <Search size={28} className="mb-4 opacity-20" />
                                            <span className="text-[9px] uppercase font-bold tracking-widest opacity-40">Ma'lumot topilmadi</span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 transition-colors animate-fade-in">
                    <div className="bg-[#F0F2F5] dark:bg-[#111318] w-full max-w-lg rounded-sm shadow-2xl border border-[#DEE2E6] dark:border-[#3A3D44] overflow-hidden">
                        <div className="px-5 py-3 border-b border-[#DEE2E6] dark:border-[#3A3D44] flex justify-between items-center bg-white dark:bg-[#1A1D23]">
                            <div>
                                <h3 className="text-[11px] font-bold text-gray-800 dark:text-white uppercase tracking-widest">Xarajatni kiritish</h3>
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
                                            value={editingExpense?.amount || ''}
                                            onChange={(e) => setEditingExpense(prev => ({ ...prev, amount: Number(e.target.value) }))}
                                            className="w-full bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm px-3 py-1.5 text-[11px] font-bold text-gray-800 dark:text-white outline-none focus:border-rose-500 shadow-sm uppercase tracking-tight"
                                            required
                                        />
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] font-bold text-gray-400 uppercase">sum</div>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">{t.date}</label>
                                    <input
                                        type="date"
                                        value={editingExpense?.date || ''}
                                        onChange={(e) => setEditingExpense(prev => ({ ...prev, date: e.target.value }))}
                                        className="w-full bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm px-3 py-1.5 text-[11px] font-bold text-rose-500 outline-none focus:border-rose-500 shadow-sm uppercase tracking-tight"
                                        required
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">{t.category}</label>
                                    <select
                                        value={editingExpense?.category || 'Other'}
                                        onChange={(e) => setEditingExpense(prev => ({ ...prev, category: e.target.value }))}
                                        className="w-full bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm px-3 py-1.5 text-[11px] font-bold text-gray-800 dark:text-white outline-none focus:border-rose-500 shadow-sm uppercase tracking-tight"
                                    >
                                        {categories.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">{t.comment}</label>
                                    <input
                                        type="text"
                                        placeholder="IXTIYORIY IZOH..."
                                        value={editingExpense?.description || ''}
                                        onChange={(e) => setEditingExpense(prev => ({ ...prev, description: e.target.value }))}
                                        className="w-full bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm px-3 py-1.5 text-[11px] font-bold text-gray-800 dark:text-white outline-none focus:border-rose-500 shadow-sm uppercase tracking-tight"
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
                                    className="flex-1 px-4 py-2 rounded-sm font-bold text-[10px] text-white bg-rose-600 hover:bg-rose-700 transition-all shadow-sm flex items-center justify-center gap-2 uppercase tracking-widest active:scale-95"
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
