
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="dashboard-card p-6 relative overflow-hidden flex flex-col justify-between">
                    <div className="absolute top-[-20px] right-[-20px] opacity-5 pointer-events-none">
                        <TrendingDown size={140} style={{ color: 'var(--danger)' }} />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0 bg-gradient-to-br from-[var(--danger)] to-[var(--danger-dark)]">
                                <TrendingDown size={20} />
                            </div>
                            <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>SHU OYDA</span>
                        </div>
                        <div className="text-3xl font-black tabular-nums leading-none mb-4" style={{ color: 'var(--text)' }}>
                            {stats.totalMonth.toLocaleString()} <span className="text-[14px] font-bold ml-1 uppercase" style={{ color: 'var(--text-3)' }}>sum</span>
                        </div>
                        <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                            <div className="h-full w-3/4 rounded-full" style={{ background: 'var(--danger)' }}></div>
                        </div>
                    </div>
                </div>

                <div className="dashboard-card p-6 flex flex-col justify-center relative">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-10 h-10 rounded-2xl flex items-center justify-center border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-3)' }}>
                            <Receipt size={20} />
                        </div>
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>UMUMIY</span>
                            <h4 className="font-bold text-[13px] uppercase tracking-tight" style={{ color: 'var(--text)' }}>Jami xarajat</h4>
                        </div>
                    </div>
                    <div className="text-2xl font-black tabular-nums tracking-tight leading-none" style={{ color: 'var(--text)' }}>
                        {stats.totalAll.toLocaleString()} <span className="text-[12px] font-bold ml-1 uppercase" style={{ color: 'var(--text-3)' }}>sum</span>
                    </div>
                </div>

                <div className="dashboard-card p-6 flex flex-col justify-center relative">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-10 h-10 rounded-2xl flex items-center justify-center border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-3)' }}>
                            <Tag size={20} />
                        </div>
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>FAOLLIK</span>
                            <h4 className="font-bold text-[13px] uppercase tracking-tight" style={{ color: 'var(--text)' }}>Tranzaksiyalar</h4>
                        </div>
                    </div>
                    <div className="flex items-end gap-2 leading-none">
                        <span className="text-3xl font-black tabular-nums" style={{ color: 'var(--text)' }}>{stats.count}</span>
                        <span className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-3)' }}>QAYD</span>
                    </div>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors" size={18} style={{ color: 'var(--text-3)' }} />
                    <input
                        type="text"
                        placeholder="QIDIRISH..."
                        className="w-full rounded-xl py-3 pl-12 pr-4 text-[12px] font-bold uppercase tracking-widest outline-none transition-all focus:ring-2 focus:ring-[var(--danger)] focus:ring-opacity-20"
                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
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
                    className="font-bold px-5 py-3 rounded-xl text-[12px] flex items-center justify-center gap-2 transition-all shadow-sm whitespace-nowrap uppercase tracking-widest hover:shadow-md text-white"
                    style={{ background: 'linear-gradient(135deg, var(--danger), var(--danger-dark))' }}
                >
                    <Plus size={16} />
                    <span>Yangi Xarajat</span>
                </button>
            </div>

            {/* Expense List */}
            <div className="dashboard-card overflow-hidden">
                <div className="overflow-x-auto scrollbar-hide">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest w-[120px]" style={{ color: 'var(--text-3)' }}>Sana</th>
                                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest w-[150px]" style={{ color: 'var(--text-3)' }}>Kategoriya</th>
                                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>Izoh</th>
                                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-right w-[150px]" style={{ color: 'var(--text-3)' }}>Summa</th>
                                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-right w-[100px]" style={{ color: 'var(--text-3)' }}>Amallar</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredExpenses.map((expense, i) => (
                                <tr key={expense.id} className="transition-colors group hover:bg-[var(--danger-light)] cursor-pointer" style={{ backgroundColor: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                                    <td className="px-6 py-4 text-[11px] font-bold uppercase tracking-tight font-mono" style={{ color: 'var(--text-2)' }}>{expense.date}</td>
                                    <td className="px-6 py-4">
                                        <span className="c1-badge" style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>{expense.category}</span>
                                    </td>
                                    <td className="px-6 py-4 text-[13px] font-bold truncate max-w-[300px] tracking-tight" style={{ color: 'var(--text)' }}>
                                        {expense.description || "—"}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className="font-bold text-[13px] tabular-nums" style={{ color: 'var(--danger)' }}>
                                            -{expense.amount.toLocaleString()} <span className="text-[10px] font-bold uppercase ml-1 opacity-60">sum</span>
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2 opacity-20 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => { setEditingExpense(expense); setIsModalOpen(true); }}
                                                className="w-8 h-8 flex items-center justify-center rounded-lg transition-all"
                                                style={{ color: 'var(--primary)' }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-ghost)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                title="Tahrirlash"
                                            >
                                                <Edit3 size={16} />
                                            </button>
                                            {onDeleteExpense && (
                                                <button
                                                    onClick={() => { if (confirm('Xarajatni o\'chirishni tasdiqlaysizmi?')) onDeleteExpense(expense.id); }}
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
                            {filteredExpenses.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-24 text-center">
                                        <div className="flex flex-col items-center" style={{ color: 'var(--text-3)' }}>
                                            <Search size={48} className="mb-4 opacity-20" />
                                            <span className="text-[11px] uppercase font-bold tracking-[0.2em] opacity-60">Ma'lumot topilmadi</span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity animate-fade-in">
                    <div className="w-full max-w-lg shadow-2xl relative overflow-hidden dashboard-card !p-0">
                        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'var(--danger)' }}></div>
                        <div className="px-6 py-5 flex justify-between items-center" style={{ borderBottom: '1px solid var(--border)' }}>
                            <div>
                                <h3 className="text-[13px] font-bold uppercase tracking-widest" style={{ color: 'var(--text)' }}>Xarajatni kiritish</h3>
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
                                            value={editingExpense?.amount || ''}
                                            onChange={(e) => setEditingExpense(prev => ({ ...prev, amount: Number(e.target.value) }))}
                                            className="w-full rounded-lg px-4 py-3 text-[12px] font-bold outline-none transition-all focus:ring-2 focus:ring-[var(--danger)] focus:ring-opacity-20 uppercase tracking-tight"
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
                                        value={editingExpense?.date || ''}
                                        onChange={(e) => setEditingExpense(prev => ({ ...prev, date: e.target.value }))}
                                        className="w-full rounded-lg px-4 py-3 text-[12px] font-bold outline-none transition-all focus:ring-2 focus:ring-[var(--danger)] focus:ring-opacity-20 uppercase tracking-tight"
                                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--danger)' }}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>{t.category}</label>
                                    <select
                                        value={editingExpense?.category || 'Other'}
                                        onChange={(e) => setEditingExpense(prev => ({ ...prev, category: e.target.value }))}
                                        className="w-full rounded-lg px-4 py-3 text-[12px] font-bold outline-none transition-all focus:ring-2 focus:ring-[var(--danger)] focus:ring-opacity-20 uppercase tracking-tight"
                                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                                    >
                                        {categories.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>{t.comment}</label>
                                    <input
                                        type="text"
                                        placeholder="IXTIYORIY IZOH..."
                                        value={editingExpense?.description || ''}
                                        onChange={(e) => setEditingExpense(prev => ({ ...prev, description: e.target.value }))}
                                        className="w-full rounded-lg px-4 py-3 text-[12px] font-bold outline-none transition-all focus:ring-2 focus:ring-[var(--danger)] focus:ring-opacity-20 uppercase tracking-tight"
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
                                    className="flex-1 px-4 py-3 rounded-xl font-bold text-[11px] text-white transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 uppercase tracking-widest active:scale-95"
                                    style={{ background: 'linear-gradient(135deg, var(--danger), var(--danger-dark))' }}
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
