import React, { useState, useEffect } from 'react';
import { KPIRule, Language, KPIRoleType, KPIInputType } from '../types';
import { fetchKPIRules, upsertKPIRule } from '../lib/supabaseData';
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
            alert('Error saving rule');
        }
    };

    const toggleActive = async (rule: KPIRule) => {
        await upsertKPIRule({ ...rule, isActive: !rule.isActive });
        loadRules();
    };

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-black text-slate-800 dark:text-white">KPI Qoidalari Sozlamalari</h2>
                <button
                    onClick={() => setEditingRule({
                        id: undefined,
                        isActive: true,
                        inputType: 'checkbox',
                        role: 'accountant',
                        category: 'reports',
                        sortOrder: rules.length + 1
                    })}
                    className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-black hover:bg-slate-800 transition-all shadow-lg active:scale-95"
                >
                    <Plus size={18} /> Yangi Qoida
                </button>
            </div>

            <div className="bg-white dark:bg-apple-darkCard rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder overflow-hidden shadow-xl p-8">
                <div className="grid grid-cols-1 gap-4">
                    {rules.length === 0 && !loading && (
                        <p className="text-center text-slate-400 py-10">Qoidalar mavjud emas</p>
                    )}

                    {rules.map(rule => (
                        <div key={rule.id} className="flex flex-col md:flex-row items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-2xl gap-4 border border-transparent hover:border-apple-border/50 transition-colors">
                            <div className="flex items-center gap-4 flex-1">
                                <div onClick={() => toggleActive(rule)} className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${rule.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${rule.isActive ? 'translate-x-6' : 'translate-x-0'}`}></div>
                                </div>

                                <div>
                                    <h4 className="font-bold text-slate-800 dark:text-white">{rule.nameUz} <span className="text-xs font-normal text-slate-400 ml-2">({rule.name})</span></h4>
                                    <div className="flex gap-2 mt-1">
                                        <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-slate-200 dark:bg-white/10 rounded-md text-slate-500">{rule.role}</span>
                                        <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-slate-200 dark:bg-white/10 rounded-md text-slate-500">{rule.category}</span>
                                        <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-blue-100 dark:bg-blue-500/20 text-blue-500 rounded-md">{rule.inputType}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-6">
                                <div className="text-right">
                                    <p className="text-xs font-black uppercase text-slate-400">Bonus / Jarima</p>
                                    <p className="font-mono font-bold">
                                        <span className="text-emerald-500">+{rule.rewardPercent}%</span>
                                        <span className="text-slate-300 mx-2">/</span>
                                        <span className="text-rose-500">{rule.penaltyPercent}%</span>
                                    </p>
                                </div>

                                <button
                                    onClick={() => setEditingRule(rule)}
                                    className="p-3 bg-slate-100 dark:bg-white/10 text-slate-400 hover:text-apple-accent hover:bg-apple-accent/10 rounded-xl transition-all"
                                >
                                    <Edit3 size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Edit Modal */}
            {editingRule && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white dark:bg-apple-darkCard w-full max-w-2xl rounded-[2rem] p-8 shadow-2xl border border-apple-border dark:border-apple-darkBorder h-[90vh] overflow-y-auto">
                        <h3 className="text-2xl font-black mb-6">
                            {editingRule.id ? 'Qoidani Tahrirlash' : 'Yangi Qoida'}
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-black uppercase text-slate-400 mb-1 block">Nomi (Internal ID)</label>
                                    <input
                                        type="text"
                                        className="w-full bg-slate-50 border p-3 rounded-xl font-bold"
                                        value={editingRule.name || ''}
                                        onChange={e => setEditingRule({ ...editingRule, name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-black uppercase text-slate-400 mb-1 block">Nomi (O'zbekcha)</label>
                                    <input
                                        type="text"
                                        className="w-full bg-slate-50 border p-3 rounded-xl font-bold"
                                        value={editingRule.nameUz || ''}
                                        onChange={e => setEditingRule({ ...editingRule, nameUz: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-black uppercase text-slate-400 mb-1 block">Role</label>
                                    <select
                                        className="w-full bg-slate-50 border p-3 rounded-xl font-bold"
                                        value={editingRule.role || 'accountant'}
                                        onChange={e => setEditingRule({ ...editingRule, role: e.target.value as KPIRoleType })}
                                    >
                                        <option value="accountant">Accountant</option>
                                        <option value="bank_client">Bank Client</option>
                                        <option value="supervisor">Supervisor</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-black uppercase text-slate-400 mb-1 block">Category</label>
                                    <input
                                        type="text"
                                        className="w-full bg-slate-50 border p-3 rounded-xl font-bold"
                                        value={editingRule.category || ''}
                                        onChange={e => setEditingRule({ ...editingRule, category: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-black uppercase text-slate-400 mb-1 block">Bonus % (+)</label>
                                    <input
                                        type="number" step="0.01"
                                        className="w-full bg-slate-50 border p-3 rounded-xl font-bold text-emerald-600"
                                        value={editingRule.rewardPercent}
                                        onChange={e => setEditingRule({ ...editingRule, rewardPercent: parseFloat(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-black uppercase text-slate-400 mb-1 block">Jarima % (-)</label>
                                    <input
                                        type="number" step="0.01"
                                        className="w-full bg-slate-50 border p-3 rounded-xl font-bold text-rose-600"
                                        value={editingRule.penaltyPercent}
                                        onChange={e => setEditingRule({ ...editingRule, penaltyPercent: parseFloat(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-black uppercase text-slate-400 mb-1 block">Input Type</label>
                                    <select
                                        className="w-full bg-slate-50 border p-3 rounded-xl font-bold"
                                        value={editingRule.inputType || 'checkbox'}
                                        onChange={e => setEditingRule({ ...editingRule, inputType: e.target.value as KPIInputType })}
                                    >
                                        <option value="checkbox">Checkbox (Ha/Yo'q)</option>
                                        <option value="counter">Counter (Soni)</option>
                                        <option value="number">Number</option>
                                    </select>
                                </div>
                                <div className="flex items-center gap-2 mt-8">
                                    <input
                                        type="checkbox"
                                        id="isActive"
                                        checked={editingRule.isActive}
                                        onChange={e => setEditingRule({ ...editingRule, isActive: e.target.checked })}
                                        className="w-5 h-5"
                                    />
                                    <label htmlFor="isActive" className="font-bold">Aktiv holatda</label>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-4 mt-8 pt-6 border-t">
                            <button
                                onClick={() => setEditingRule(null)}
                                className="flex-1 py-4 text-slate-400 font-bold hover:text-slate-600"
                            >
                                Bekor qilish
                            </button>
                            <button
                                onClick={handleSave}
                                className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black hover:bg-slate-800"
                            >
                                Saqlash
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default KPIRulesManager;
