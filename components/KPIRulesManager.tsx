import React, { useState, useEffect } from 'react';
import { KPIRule, Language, KPIRoleType, KPIInputType } from '../types';
import { fetchKPIRules, upsertKPIRule, deleteKPIRule } from '../lib/supabaseData';
import { translations } from '../lib/translations';
import { Settings, Plus, Edit3, Trash2, CheckCircle2, X, AlertCircle } from 'lucide-react';

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
        <div className="space-y-4 animate-fade-in p-4 bg-[#F0F2F5] dark:bg-[#1A1D23] min-h-screen font-inter">
            {/* KPI Header */}
            <div className="bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] p-3 rounded-sm shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3 transition-colors">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-sm bg-[#F2F7FF] dark:bg-[#1C2531] flex items-center justify-center border border-[#DEE2E6] dark:border-[#3A3D44] text-[#3366CC] shrink-0">
                        <Settings size={18} />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-gray-800 dark:text-white leading-none uppercase tracking-tight">
                            KPI Qoidalari
                        </h2>
                        <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-1">
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
                        className="c1-btn c1-btn-primary px-4 py-1.5 text-[10px] uppercase tracking-widest flex items-center gap-2"
                    >
                        <Plus size={14} />
                        Yangi Qoida
                    </button>
                </div>
            </div>

            <div className="space-y-6">
                {['automation', 'manual'].map(category => (
                    <div key={category} className="animate-fade-in">
                        <div className="mb-2">
                            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <span className="w-1 h-3 bg-[#3366CC] rounded-sm"></span>
                                {category === 'automation' ? "Avtomatik Operatsiyalar" : "Manual Baholash"}
                            </h3>
                        </div>

                        <div className="bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm shadow-sm overflow-hidden text-xs">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-[#F8F9FA] dark:bg-[#1e2025] text-[9px] font-bold uppercase tracking-widest text-gray-500 border-b border-[#DEE2E6] dark:border-[#3A3D44]">
                                        <th className="px-4 py-2 w-16 text-center">Status</th>
                                        <th className="px-4 py-2">Qoida Nomi</th>
                                        <th className="px-4 py-2">Rol / Tip</th>
                                        <th className="px-4 py-2 text-center text-[#28A745]">Bonus %</th>
                                        <th className="px-4 py-2 text-center text-[#DC3545]">Jarima %</th>
                                        <th className="px-4 py-2 text-right">Amallar</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#DEE2E6] dark:divide-[#3A3D44]">
                                    {rules.filter(r => r.category === category && r.isActive).map(rule => (
                                        <tr key={rule.id} className="hover:bg-[#F2F7FF] dark:hover:bg-[#2A2D33] transition-colors group">
                                            <td className="px-4 py-2 text-center">
                                                <div
                                                    onClick={() => toggleActive(rule)}
                                                    className={`w-9 h-5 rounded-sm relative cursor-pointer transition-all duration-300 inline-block align-middle border border-black/5 ${rule.isActive ? 'bg-[#28A745]' : 'bg-[#DEE2E6] dark:bg-[#3A3D44]'}`}
                                                >
                                                    <div className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-sm transition-transform duration-300 shadow-sm ${rule.isActive ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2">
                                                <p className="font-bold text-gray-800 dark:text-gray-100 uppercase tracking-tight">{rule.nameUz}</p>
                                                <p className="text-[8px] font-bold text-gray-400 uppercase font-mono mt-0.5">{rule.name}</p>
                                            </td>
                                            <td className="px-4 py-2">
                                                <div className="flex gap-2">
                                                    <span className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 bg-[#F8F9FA] dark:bg-[#1e2025] rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] text-gray-500 dark:text-gray-400">{rule.role}</span>
                                                    <span className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 bg-[#F2F7FF] dark:bg-[#1C2531] border border-[#DEE2E6] dark:border-[#3A3D44] text-[#3366CC] dark:text-[#4DA3FF] rounded-sm">{rule.inputType}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2 text-center font-bold text-[#28A745] tabular-nums border-l border-[#DEE2E6] dark:border-[#3A3D44]">
                                                +{rule.rewardPercent}%
                                            </td>
                                            <td className="px-4 py-2 text-center font-bold text-[#DC3545] tabular-nums border-l border-[#DEE2E6] dark:border-[#3A3D44]">
                                                {rule.penaltyPercent}%
                                            </td>
                                            <td className="px-4 py-2 text-right border-l border-[#DEE2E6] dark:border-[#3A3D44]">
                                                <button
                                                    onClick={() => setEditingRule(rule)}
                                                    className="p-1 px-2 text-gray-500 hover:text-[#3366CC] hover:bg-[#F2F7FF] dark:hover:bg-[#2A2D33] rounded-sm border border-transparent hover:border-[#DEE2E6] dark:hover:border-[#3A3D44] transition-colors inline-flex text-[10px] font-bold uppercase tracking-widest"
                                                    title="Tahrirlash"
                                                >
                                                    <Edit3 size={12} className="mr-1" /> Edit
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {rules.filter(r => r.category === category && r.isActive).length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-[10px] font-bold uppercase tracking-widest">
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
                    <div className="pt-4 mt-6 border-t border-[#DEE2E6] dark:border-[#3A3D44]">
                        <details className="group/archived">
                            <summary className="text-[10px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer hover:text-[#3366CC] transition-colors mb-3 flex items-center gap-2 list-none outline-none">
                                <div className="w-5 h-5 rounded-sm bg-[#F8F9FA] dark:bg-[#1e2025] border border-[#DEE2E6] dark:border-[#3A3D44] flex items-center justify-center group-open/archived:rotate-180 transition-transform">
                                    <Plus size={10} />
                                </div>
                                Arxivlangan Qoidalar ({rules.filter(r => !r.isActive).length})
                            </summary>
                            <div className="bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm shadow-sm overflow-hidden text-xs">
                                <table className="w-full text-left border-collapse">
                                    <tbody className="divide-y divide-[#DEE2E6] dark:divide-[#3A3D44]">
                                        {rules.filter(r => !r.isActive).map(rule => (
                                            <tr key={rule.id} className="hover:bg-[#F8F9FA] dark:hover:bg-[#1e2025] transition-colors opacity-60 hover:opacity-100">
                                                <td className="px-4 py-2">
                                                    <p className="font-bold text-gray-700 dark:text-gray-300 uppercase tracking-tight">{rule.nameUz}</p>
                                                    <p className="text-[8px] font-bold text-gray-400 uppercase font-mono mt-0.5">{rule.name}</p>
                                                </td>
                                                <td className="px-4 py-2 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => toggleActive(rule)}
                                                            className="text-[9px] font-bold uppercase tracking-widest text-[#28A745] px-2.5 py-1 bg-[#F2FFF7] dark:bg-[#1C3123] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm hover:opacity-80 transition-all uppercase tracking-widest"
                                                        >
                                                            Restore
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(rule.id, rule.nameUz)}
                                                            className="w-7 h-7 flex items-center justify-center text-[#DC3545] bg-[#FEEBF0] dark:bg-[#311C21] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm hover:opacity-80 transition-all"
                                                            title="O'chirish"
                                                        >
                                                            <Trash2 size={12} />
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
                <div className="fixed inset-0 bg-[#000]/60 z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={() => setEditingRule(null)}>
                    <div className="bg-white dark:bg-[#22252B] w-full max-w-3xl rounded-sm shadow-2xl border border-[#DEE2E6] dark:border-[#3A3D44] flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="px-4 py-3 border-b border-[#DEE2E6] dark:border-[#3A3D44] flex justify-between items-center bg-[#F8F9FA] dark:bg-[#1e2025]">
                            <h3 className="text-sm font-bold text-gray-800 dark:text-white uppercase tracking-widest">
                                {editingRule.id ? 'Qoidani Tahrirlash' : 'Yangi KPI Qoidasi'}
                            </h3>
                            <button onClick={() => setEditingRule(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">Nomi (Internal ID)</label>
                                        <input
                                            type="text"
                                            className="c1-input w-full font-bold uppercase"
                                            value={editingRule.name || ''}
                                            onChange={e => setEditingRule({ ...editingRule, name: e.target.value })}
                                            placeholder="e.g. QUARTERLY_AUDIT"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">Nomi (O'zbekcha)</label>
                                        <input
                                            type="text"
                                            className="c1-input w-full font-bold"
                                            value={editingRule.nameUz || ''}
                                            onChange={e => setEditingRule({ ...editingRule, nameUz: e.target.value })}
                                            placeholder="e.g. Choraklik Audit"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">Maso'ul Role</label>
                                        <select
                                            className="c1-input w-full font-bold uppercase"
                                            value={editingRule.role || 'accountant'}
                                            onChange={e => setEditingRule({ ...editingRule, role: e.target.value as KPIRoleType })}
                                        >
                                            <option value="accountant">Accountant</option>
                                            <option value="bank_client">Bank Client</option>
                                            <option value="supervisor">Supervisor</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">Turkum (Category)</label>
                                        <input
                                            type="text"
                                            className="c1-input w-full font-bold uppercase"
                                            value={editingRule.category || ''}
                                            onChange={e => setEditingRule({ ...editingRule, category: e.target.value })}
                                            placeholder="manual / automation"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[9px] font-bold uppercase tracking-widest text-[#28A745] mb-1 block">Bonus % (+)</label>
                                        <input
                                            type="number" step="0.01"
                                            className="c1-input w-full font-bold text-[#28A745] border-[#EBFBF0]"
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
                                        <label className="text-[9px] font-bold uppercase tracking-widest text-[#DC3545] mb-1 block">Jarima % (-)</label>
                                        <input
                                            type="number" step="0.01"
                                            className="c1-input w-full font-bold text-[#DC3545] border-[#FEEBF0]"
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
                                        <label className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">Input Tur (Input Type)</label>
                                        <select
                                            className="c1-input w-full font-bold uppercase"
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
                                        className={`px-4 py-2 rounded-sm border transition-all cursor-pointer flex items-center justify-between ${editingRule.isActive ? 'bg-[#EBFBF0] dark:bg-[#1C2F23] border-[#DEE2E6]' : 'bg-[#F8F9FA] dark:bg-[#1e2025] border-[#DEE2E6]'}`}
                                    >
                                        <span className={`font-bold uppercase tracking-widest text-[9px] ${editingRule.isActive ? 'text-[#28A745]' : 'text-gray-400'}`}>Qoida Holati</span>
                                        <div className={`w-9 h-5 rounded-sm relative transition-all duration-300 border border-black/5 ${editingRule.isActive ? 'bg-[#28A745]' : 'bg-[#DEE2E6] dark:bg-[#3A3D44]'}`}>
                                            <div className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-sm transition-transform duration-300 shadow-sm ${editingRule.isActive ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-3 border-t border-[#DEE2E6] dark:border-[#3A3D44] flex gap-3 bg-[#F8F9FA] dark:bg-[#1e2025]">
                            <button
                                onClick={() => setEditingRule(null)}
                                className="c1-btn c1-btn-secondary flex-1 py-1.5 text-[10px] uppercase tracking-widest font-bold"
                            >
                                Bekor qilish
                            </button>
                            <button
                                onClick={handleSave}
                                className="c1-btn c1-btn-primary flex-1 py-1.5 text-[10px] uppercase tracking-widest font-bold"
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
