import React, { useState, useEffect } from 'react';
import { KPIRule, Language, KPIRoleType, KPIInputType } from '../types';
import { fetchKPIRules, upsertKPIRule, deleteKPIRule } from '../lib/supabaseData';
import { translations } from '../lib/translations';
import { Settings, Plus, Edit3, Trash2, CheckCircle2 } from 'lucide-react';

interface Props {
    lang: Language;
}

const KPIRulesManager: React.FC<Props> = ({ lang }) => {
    const t = translations[lang];
    const [rules, setRules] = useState<KPIRule[]>([]);
    const [loading, setLoading] = useState(false);
    const [editingRule, setEditingRule] = useState<Partial<KPIRule> | null>(null);

    useEffect(() => {
        loadRules();
    }, []);

    const loadRules = async () => {
        setLoading(true);
        const data = await fetchKPIRules();
        setRules(data);
        setLoading(false);
    };

    const handleSave = async () => {
        if (!editingRule || !editingRule.name || !editingRule.nameUz) return;

        try {
            await upsertKPIRule(editingRule as KPIRule); // ID logic handled in backend or existing ID
            setEditingRule(null);
            loadRules();
        } catch (e) {
            console.error(e);
            alert((e as any)?.message || 'Error saving rule');
        }
    };

    const toggleActive = async (rule: KPIRule) => {
        await upsertKPIRule({ ...rule, isActive: !rule.isActive });
        loadRules();
    };

    const handleDelete = async (id: string, name: string) => {
        if (confirm(`${name} qoidasini o'chirishni tasdiqlaysizmi?`)) {
            try {
                await deleteKPIRule(id);
                loadRules();
            } catch (e) {
                console.error(e);
                alert('Xatolik yuz berdi');
            }
        }
    };

    return (
        <div className="space-y-6 animate-fade-in p-6 bg-gray-50 dark:bg-[#1A1D23] min-h-screen">
            {/* KPI Header */}
            <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 p-4 rounded shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center border border-indigo-100 dark:border-indigo-800 text-indigo-600 shrink-0">
                        <Settings size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight uppercase">
                            KPI Qoidalari
                        </h2>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">
                            Metrika va mukofotlar konfiguratsiyasi
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setEditingRule({
                            id: undefined,
                            isActive: true,
                            inputType: 'checkbox',
                            role: 'accountant',
                            category: 'reports',
                            sortOrder: rules.length + 1
                        })}
                        className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded font-bold hover:bg-indigo-700 transition-colors shadow-sm text-sm uppercase tracking-widest"
                    >
                        <Plus size={16} />
                        Yangi Qoida
                    </button>
                </div>
            </div>

            <div className="space-y-6">
                {['automation', 'manual'].map(category => (
                    <div key={category} className="animate-fade-in">
                        <div className="mb-3">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-gray-200 dark:border-gray-700 pb-2">
                                {category === 'automation' ? "Avtomatik Operatsiyalar" : "Manual Baholash"}
                            </h3>
                        </div>

                        <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 rounded shadow-sm overflow-hidden text-sm">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 dark:bg-[#1e2025] text-[10px] font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200 dark:border-gray-700">
                                        <th className="px-4 py-2 w-12 text-center">Status</th>
                                        <th className="px-4 py-2">Qoida Nomi</th>
                                        <th className="px-4 py-2">Rol / Tip</th>
                                        <th className="px-4 py-2 text-center text-emerald-600">Bonus %</th>
                                        <th className="px-4 py-2 text-center text-rose-600">Jarima %</th>
                                        <th className="px-4 py-2 text-right">Amallar</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {rules.filter(r => r.category === category && r.isActive).map(rule => (
                                        <tr key={rule.id} className="hover:bg-gray-50 dark:hover:bg-[#1e2025] transition-colors">
                                            <td className="px-4 py-3 text-center">
                                                <div
                                                    onClick={() => toggleActive(rule)}
                                                    className={`w-10 h-6 rounded-full relative cursor-pointer transition-all duration-300 inline-block align-middle ${rule.isActive ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                                                >
                                                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 shadow-sm ${rule.isActive ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="font-bold text-gray-900 dark:text-gray-100">{rule.nameUz}</p>
                                                <p className="text-[10px] font-bold text-gray-500 uppercase font-mono mt-0.5">{rule.name}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex gap-2">
                                                    <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400">{rule.role}</span>
                                                    <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/30 text-indigo-600 dark:text-indigo-400 rounded">{rule.inputType}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center font-bold text-emerald-600 tabular-nums border-l border-gray-100 dark:border-gray-800">
                                                +{rule.rewardPercent}%
                                            </td>
                                            <td className="px-4 py-3 text-center font-bold text-rose-600 tabular-nums border-l border-gray-100 dark:border-gray-800">
                                                {rule.penaltyPercent}%
                                            </td>
                                            <td className="px-4 py-3 text-right border-l border-gray-100 dark:border-gray-800">
                                                <button
                                                    onClick={() => setEditingRule(rule)}
                                                    className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800/30 transition-colors inline-flex"
                                                    title="Tahrirlash"
                                                >
                                                    <Edit3 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {rules.filter(r => r.category === category && r.isActive).length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-4 py-8 text-center text-gray-500 text-sm italic">
                                                Bu turkumda faol qoidalar yo'q.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))}

                {rules.filter(r => !r.isActive).length > 0 && (
                    <div className="pt-6 mt-4 border-t border-gray-200 dark:border-gray-700">
                        <details className="group/archived">
                            <summary className="text-[10px] font-bold text-gray-500 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors mb-4 flex items-center gap-2 list-none outline-none">
                                <div className="w-6 h-6 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center border border-gray-200 dark:border-gray-700 group-open/archived:rotate-180 transition-transform">
                                    <Plus size={14} />
                                </div>
                                Arxivlangan Qoidalar ({rules.filter(r => !r.isActive).length})
                            </summary>
                            <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 rounded shadow-sm overflow-hidden text-sm">
                                <table className="w-full text-left border-collapse">
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                        {rules.filter(r => !r.isActive).map(rule => (
                                            <tr key={rule.id} className="hover:bg-gray-50 dark:hover:bg-[#1e2025] transition-colors opacity-70 hover:opacity-100">
                                                <td className="px-4 py-3">
                                                    <p className="font-bold text-gray-900 dark:text-gray-100">{rule.nameUz}</p>
                                                    <p className="text-[10px] font-bold text-gray-500 uppercase font-mono mt-0.5">{rule.name}</p>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => toggleActive(rule)}
                                                            className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/30 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-all"
                                                        >
                                                            Restore
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(rule.id, rule.nameUz)}
                                                            className="w-8 h-8 flex items-center justify-center text-rose-600 bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800/30 rounded hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-all"
                                                            title="O'chirish"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </details>
                    </div>
                )}
            </div>

            {/* Edit Modal */}
            {editingRule && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={() => setEditingRule(null)}>
                    <div className="bg-white dark:bg-[#22252B] w-full max-w-3xl rounded shadow-lg border border-gray-200 dark:border-gray-700 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-[#1e2025] rounded-t">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white uppercase tracking-widest">
                                {editingRule.id ? 'Qoidani Tahrirlash' : 'Yangi KPI Qoidasi'}
                            </h3>
                            <button onClick={() => setEditingRule(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                <Plus size={20} className="rotate-45" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 scrollbar-none">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1 block">Nomi (Internal ID)</label>
                                        <input
                                            type="text"
                                            className="w-full bg-gray-50 dark:bg-[#1e2025] border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-indigo-500 transition-colors"
                                            value={editingRule.name || ''}
                                            onChange={e => setEditingRule({ ...editingRule, name: e.target.value })}
                                            placeholder="e.g. quarterly_audit"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1 block">Nomi (O'zbekcha)</label>
                                        <input
                                            type="text"
                                            className="w-full bg-gray-50 dark:bg-[#1e2025] border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-indigo-500 transition-colors"
                                            value={editingRule.nameUz || ''}
                                            onChange={e => setEditingRule({ ...editingRule, nameUz: e.target.value })}
                                            placeholder="e.g. Choraklik Audit"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1 block">Maso'ul Role</label>
                                        <select
                                            className="w-full bg-gray-50 dark:bg-[#1e2025] border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-indigo-500 transition-colors"
                                            value={editingRule.role || 'accountant'}
                                            onChange={e => setEditingRule({ ...editingRule, role: e.target.value as KPIRoleType })}
                                        >
                                            <option value="accountant">Accountant</option>
                                            <option value="bank_client">Bank Client</option>
                                            <option value="supervisor">Supervisor</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1 block">Turkum (Category)</label>
                                        <input
                                            type="text"
                                            className="w-full bg-gray-50 dark:bg-[#1e2025] border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-indigo-500 transition-colors"
                                            value={editingRule.category || ''}
                                            onChange={e => setEditingRule({ ...editingRule, category: e.target.value })}
                                            placeholder="manual / automation"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 mb-1 block">Bonus % (+)</label>
                                        <input
                                            type="number" step="0.01"
                                            className="w-full bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-300 dark:border-emerald-800 rounded px-3 py-2 text-sm font-bold text-emerald-700 dark:text-emerald-400 outline-none focus:border-emerald-500 transition-colors"
                                            value={editingRule.rewardPercent ?? ''}
                                            onChange={e => {
                                                const v = e.target.value;
                                                setEditingRule({
                                                    ...editingRule,
                                                    rewardPercent: v === '' ? undefined : Number(v)
                                                });
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-rose-600 mb-1 block">Jarima % (-)</label>
                                        <input
                                            type="number" step="0.01"
                                            className="w-full bg-rose-50 dark:bg-rose-900/10 border border-rose-300 dark:border-rose-800 rounded px-3 py-2 text-sm font-bold text-rose-700 dark:text-rose-400 outline-none focus:border-rose-500 transition-colors"
                                            value={editingRule.penaltyPercent ?? ''}
                                            onChange={e => {
                                                const v = e.target.value;
                                                setEditingRule({
                                                    ...editingRule,
                                                    penaltyPercent: v === '' ? undefined : Number(v)
                                                });
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1 block">Input Tur (Input Type)</label>
                                        <select
                                            className="w-full bg-gray-50 dark:bg-[#1e2025] border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-indigo-500 transition-colors"
                                            value={editingRule.inputType || 'checkbox'}
                                            onChange={e => setEditingRule({ ...editingRule, inputType: e.target.value as KPIInputType })}
                                        >
                                            <option value="checkbox">Checkbox (Ha/Yo'q)</option>
                                            <option value="counter">Counter (Soni)</option>
                                            <option value="number">Number</option>
                                        </select>
                                    </div>
                                    <div
                                        onClick={() => setEditingRule({ ...editingRule, isActive: !editingRule.isActive })}
                                        className={`px-4 py-3 rounded border transition-colors cursor-pointer flex items-center justify-between ${editingRule.isActive ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/50' : 'bg-gray-50 dark:bg-[#1e2025] border-gray-200 dark:border-gray-700'}`}
                                    >
                                        <span className={`font-bold uppercase tracking-widest text-[10px] ${editingRule.isActive ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-500'}`}>Qoida Holati</span>
                                        <div className={`w-10 h-6 rounded-full relative transition-all duration-300 ${editingRule.isActive ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                                            <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 shadow-sm ${editingRule.isActive ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-3 bg-gray-50 dark:bg-[#1e2025] rounded-b">
                            <button
                                onClick={() => setEditingRule(null)}
                                className="flex-1 py-2 text-gray-600 dark:text-gray-400 font-bold border border-gray-300 dark:border-gray-600 rounded hover:bg-white dark:hover:bg-[#22252B] transition-colors text-[10px] uppercase tracking-widest"
                            >
                                Bekor qilish
                            </button>
                            <button
                                onClick={handleSave}
                                className="flex-1 py-2 bg-indigo-600 text-white rounded font-bold hover:bg-indigo-700 transition-colors text-[10px] uppercase tracking-widest shadow-sm"
                            >
                                Qoidani Saqlash
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default KPIRulesManager;
