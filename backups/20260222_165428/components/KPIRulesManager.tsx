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
        <div className="space-y-12 animate-fade-in pb-20">
            {/* KPI Header */}
            <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800 rounded-[3.5rem] p-12 text-white shadow-glass-lg group">
                <div className="absolute -top-10 -right-10 w-80 h-80 bg-indigo-500/10 rounded-full blur-[100px] animate-pulse"></div>
                <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-slate-500/10 rounded-full blur-[80px]"></div>
                <div className="absolute top-0 right-0 p-12 opacity-[0.05] group-hover:scale-110 group-hover:rotate-12 transition-all duration-700 pointer-events-none">
                    <Settings size={220} />
                </div>

                <div className="relative z-10 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-10">
                    <div>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-glass">
                                <Settings className="text-white" size={32} />
                            </div>
                            <h2 className="text-4xl md:text-5xl font-black tracking-tighter leading-tight premium-text-gradient">
                                KPI Qoidalari
                            </h2>
                        </div>
                        <p className="text-sm font-black text-white/40 uppercase tracking-[0.3em]">
                            System-wide performance metrics and reward architecture
                        </p>
                    </div>

                    <button
                        onClick={() => setEditingRule({
                            id: undefined,
                            isActive: true,
                            inputType: 'checkbox',
                            role: 'accountant',
                            category: 'reports',
                            sortOrder: rules.length + 1
                        })}
                        className="flex items-center gap-4 bg-white text-slate-900 px-10 py-5 rounded-[2rem] font-black hover:bg-slate-50 transition-all shadow-glass-lg active:scale-95 group/btn"
                    >
                        <Plus size={24} className="group-hover:rotate-90 transition-transform duration-500" />
                        <span className="uppercase tracking-widest text-xs">Yangi Qoida</span>
                    </button>
                </div>
            </div>

            <div className="space-y-12">
                {['automation', 'manual'].map(category => (
                    <div key={category} className="animate-fade-in">
                        <div className="flex items-center gap-4 mb-8 mx-4">
                            <div className="w-1.5 h-8 bg-indigo-500 rounded-full shadow-glass-indigo"></div>
                            <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.3em]">
                                {category === 'automation' ? "Avtomatik Operatsiyalar" : "Manual Baholash"}
                            </h3>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                            {rules.filter(r => r.category === category && r.isActive).map(rule => (
                                <div key={rule.id} className="liquid-glass-card rounded-[2.5rem] p-8 border border-white/10 hover:border-indigo-500/30 transition-all duration-500 group/item relative overflow-hidden">
                                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-colors"></div>

                                    <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8 h-full">
                                        <div className="flex items-center gap-6 flex-1">
                                            <div
                                                onClick={() => toggleActive(rule)}
                                                className={`w-14 h-8 rounded-full relative cursor-pointer transition-all duration-500 shadow-inner ${rule.isActive ? 'bg-emerald-500 shadow-glass-emerald' : 'bg-slate-200 dark:bg-white/10'}`}
                                            >
                                                <div className={`absolute top-1.5 left-1.5 w-5 h-5 bg-white rounded-full transition-all duration-500 shadow-md ${rule.isActive ? 'translate-x-6' : 'translate-x-0'}`}></div>
                                            </div>

                                            <div>
                                                <h4 className="font-black text-xl text-slate-800 dark:text-white tracking-tight mb-2">
                                                    {rule.nameUz}
                                                    <span className="text-xs font-black text-slate-400/60 ml-3 uppercase tracking-widest">{rule.name}</span>
                                                </h4>
                                                <div className="flex gap-3">
                                                    <span className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 bg-slate-100 dark:bg-white/5 border border-transparent rounded-xl text-slate-500">{rule.role}</span>
                                                    <span className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 rounded-xl">{rule.inputType}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-10 w-full sm:w-auto">
                                            <div className="flex-1 sm:text-right">
                                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Bonus / Jarima</p>
                                                <div className="flex items-center gap-3 sm:justify-end">
                                                    <span className="text-lg font-black text-emerald-500">+{rule.rewardPercent}%</span>
                                                    <div className="w-[1px] h-6 bg-slate-200 dark:bg-white/10"></div>
                                                    <span className="text-lg font-black text-rose-500">{rule.penaltyPercent}%</span>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => setEditingRule(rule)}
                                                className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-500/10 border border-transparent hover:border-indigo-500/20 transition-all flex items-center justify-center shadow-sm"
                                                title="Tahrirlash"
                                            >
                                                <Edit3 size={24} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}

                {rules.filter(r => !r.isActive).length > 0 && (
                    <div className="pt-12 border-t border-white/5">
                        <details className="group/archived">
                            <summary className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] cursor-pointer hover:text-indigo-500 transition-colors mb-8 flex items-center gap-4 list-none outline-none">
                                <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center group-open/archived:rotate-180 transition-transform">
                                    <Plus size={14} />
                                </div>
                                Arxivlangan Qoidalar ({rules.filter(r => !r.isActive).length})
                            </summary>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 p-10 bg-slate-50/50 dark:bg-white/5 rounded-[3rem] border border-white/5">
                                {rules.filter(r => !r.isActive).map(rule => (
                                    <div key={rule.id} className="flex items-center justify-between p-6 bg-white/40 dark:bg-white/5 rounded-[1.8rem] opacity-50 hover:opacity-100 transition-all group/architem border border-transparent hover:border-white/10 shadow-sm">
                                        <div>
                                            <p className="font-black text-slate-800 dark:text-white text-sm mb-1">{rule.nameUz}</p>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{rule.name}</p>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <button
                                                onClick={() => toggleActive(rule)}
                                                className="text-[9px] font-black uppercase tracking-widest text-emerald-500 px-3 py-1.5 bg-emerald-500/10 rounded-lg hover:bg-emerald-500/20 transition-all"
                                            >
                                                Restore
                                            </button>
                                            <button
                                                onClick={() => handleDelete(rule.id, rule.nameUz)}
                                                className="w-10 h-10 flex items-center justify-center text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </details>
                    </div>
                )}
            </div>

            {/* Edit Modal */}
            {editingRule && (
                <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xl z-[100] flex items-center justify-center p-6 sm:p-12 animate-fade-in-up">
                    <div className="liquid-glass-card w-full max-w-4xl rounded-[4rem] p-12 shadow-glass-lg border border-white/20 relative overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="absolute -top-40 -left-40 w-80 h-80 bg-indigo-500/10 rounded-full blur-[120px]"></div>
                        <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-emerald-500/10 rounded-full blur-[120px]"></div>

                        <div className="relative z-10 flex flex-col h-full">
                            <div className="flex items-center justify-between mb-12">
                                <h3 className="text-4xl font-black tracking-tighter premium-text-gradient">
                                    {editingRule.id ? 'Qoidani Tahrirlash' : 'Yangi KPI Qoidasi'}
                                </h3>
                                <div className="w-16 h-16 rounded-2xl bg-white/10 dark:bg-white/5 flex items-center justify-center border border-white/20">
                                    <Edit3 className="text-slate-800 dark:text-white" size={32} />
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto pr-4 scrollbar-none">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                    <div className="space-y-8">
                                        <div className="group">
                                            <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-3 block ml-2">Nomi (Internal ID)</label>
                                            <input
                                                type="text"
                                                className="w-full bg-white/40 dark:bg-white/5 border border-white/10 p-6 rounded-[1.8rem] font-black text-slate-800 dark:text-white outline-none focus:bg-white/60 dark:focus:bg-white/10 focus:border-indigo-500/30 transition-all shadow-inner"
                                                value={editingRule.name || ''}
                                                onChange={e => setEditingRule({ ...editingRule, name: e.target.value })}
                                                placeholder="e.g. quarterly_audit"
                                            />
                                        </div>
                                        <div className="group">
                                            <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-3 block ml-2">Nomi (O'zbekcha)</label>
                                            <input
                                                type="text"
                                                className="w-full bg-white/40 dark:bg-white/5 border border-white/10 p-6 rounded-[1.8rem] font-black text-slate-800 dark:text-white outline-none focus:bg-white/60 dark:focus:bg-white/10 focus:border-indigo-500/30 transition-all shadow-inner"
                                                value={editingRule.nameUz || ''}
                                                onChange={e => setEditingRule({ ...editingRule, nameUz: e.target.value })}
                                                placeholder="e.g. Choraklik Audit"
                                            />
                                        </div>
                                        <div className="group">
                                            <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-3 block ml-2">Maso'ul Role</label>
                                            <select
                                                className="w-full bg-white/40 dark:bg-white/5 border border-white/10 p-6 rounded-[1.8rem] font-black text-slate-800 dark:text-white outline-none focus:bg-white/60 dark:focus:bg-white/10 focus:border-indigo-500/30 transition-all shadow-inner appearance-none"
                                                value={editingRule.role || 'accountant'}
                                                onChange={e => setEditingRule({ ...editingRule, role: e.target.value as KPIRoleType })}
                                            >
                                                <option value="accountant">Accountant</option>
                                                <option value="bank_client">Bank Client</option>
                                                <option value="supervisor">Supervisor</option>
                                            </select>
                                        </div>
                                        <div className="group">
                                            <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-3 block ml-2">Turkum (Category)</label>
                                            <input
                                                type="text"
                                                className="w-full bg-white/40 dark:bg-white/5 border border-white/10 p-6 rounded-[1.8rem] font-black text-slate-800 dark:text-white outline-none focus:bg-white/60 dark:focus:bg-white/10 focus:border-indigo-500/30 transition-all shadow-inner"
                                                value={editingRule.category || ''}
                                                onChange={e => setEditingRule({ ...editingRule, category: e.target.value })}
                                                placeholder="manual / automation"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-8">
                                        <div className="group">
                                            <label className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500 mb-3 block ml-2">Bonus % (+)</label>
                                            <input
                                                type="number" step="0.01"
                                                className="w-full bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-[1.8rem] font-black text-2xl text-emerald-500 outline-none focus:bg-emerald-500/10 focus:border-emerald-500/40 transition-all shadow-inner"
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
                                        <div className="group">
                                            <label className="text-[10px] font-black uppercase tracking-[0.3em] text-rose-500 mb-3 block ml-2">Jarima % (-)</label>
                                            <input
                                                type="number" step="0.01"
                                                className="w-full bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/20 p-6 rounded-[1.8rem] font-black text-2xl text-rose-500 outline-none focus:bg-rose-500/10 focus:border-rose-500/40 transition-all shadow-inner"
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
                                        <div className="group">
                                            <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-3 block ml-2">Input Tur (Input Type)</label>
                                            <select
                                                className="w-full bg-white/40 dark:bg-white/5 border border-white/10 p-6 rounded-[1.8rem] font-black text-slate-800 dark:text-white outline-none focus:bg-white/60 dark:focus:bg-white/10 focus:border-indigo-500/30 transition-all shadow-inner appearance-none"
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
                                            className={`p-6 rounded-[1.8rem] border transition-all duration-500 cursor-pointer flex items-center justify-between group/status ${editingRule.isActive ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-100 dark:bg-white/5 border-white/10'}`}
                                        >
                                            <span className={`font-black uppercase tracking-widest text-xs ${editingRule.isActive ? 'text-emerald-500' : 'text-slate-400'}`}>Qoida Holati</span>
                                            <div className={`w-12 h-6 rounded-full relative transition-all duration-500 ${editingRule.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                                                <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${editingRule.isActive ? 'translate-x-6' : 'translate-x-0'}`}></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-6 mt-12 pt-10 border-t border-white/10">
                                <button
                                    onClick={() => setEditingRule(null)}
                                    className="flex-1 py-6 text-slate-400 font-extrabold uppercase tracking-widest hover:text-slate-600 transition-colors"
                                >
                                    Bekor qilish
                                </button>
                                <button
                                    onClick={handleSave}
                                    className="flex-[2] py-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-[2rem] font-black uppercase tracking-[0.2em] shadow-glass-lg hover:scale-[1.02] active:scale-95 transition-all text-sm"
                                >
                                    Qoidani Saqlash
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default KPIRulesManager;
