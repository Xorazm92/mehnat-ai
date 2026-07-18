"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { KPIRule, KpiRuleOption, Language, KPIRoleType } from '@/types';
import { Settings, Edit3, Trash2, X, Shield, Landmark, Calculator, Plus } from 'lucide-react';
import { getKpiRules, createKpiRule, updateKpiRule, deleteKpiRule } from '@/server/kpi';
import { submitOnCtrlEnter } from '@/lib/format';

// inputTypeV2 → legacy inputType (yangi qoida yaratishda talab qilinadi)
const LEGACY_INPUT: Record<string, string> = {
    select: 'checkbox', counter: 'counter', checkbox_bonus: 'checkbox',
    checkbox_penalty: 'checkbox', amount_penalty: 'number',
};
const slugify = (s: string) =>
    s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `rule_${Date.now()}`;

interface Props { lang: Language; }

const ROLE_META: { key: KPIRoleType; label: string; icon: React.ElementType; accent: string; base: string; kpi: string }[] = [
    { key: 'accountant', label: 'Buxgalter', icon: Calculator, accent: 'var(--success)', base: '20%', kpi: '5%' },
    { key: 'bank_client', label: 'Bank-klient', icon: Landmark, accent: 'var(--accent-indigo)', base: '5%', kpi: '2.5%' },
    { key: 'supervisor', label: 'Nazoratchi', icon: Shield, accent: 'var(--warning)', base: '5%', kpi: '1%' },
];

const COLOR: Record<string, { fg: string; bg: string; bd: string }> = {
    green: { fg: 'var(--success)', bg: 'var(--success-bg)', bd: 'var(--success-border)' },
    yellow: { fg: 'var(--warning)', bg: 'var(--warning-bg)', bd: 'var(--warning-border)' },
    red: { fg: 'var(--danger)', bg: 'var(--danger-bg)', bd: 'var(--danger-border)' },
};

const Badge: React.FC<{ children: React.ReactNode; tone?: 'muted' | 'blue' }> = ({ children, tone = 'muted' }) => (
    <span className="text-2xs font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
        style={tone === 'blue'
            ? { background: 'var(--accent-blue-light)', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue)' }
            : { background: 'var(--input-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>
        {children}
    </span>
);

const KPIRulesManager: React.FC<Props> = () => {
    const [rules, setRules] = useState<KPIRule[]>([]);
    const [loading, setLoading] = useState(false);
    const [editingRule, setEditingRule] = useState<Partial<KPIRule> | null>(null);

    useEffect(() => { loadRules(); }, []);

    const loadRules = async () => {
        setLoading(true);
        try {
            const data = await getKpiRules();
            setRules(data as unknown as KPIRule[]);
        } finally { setLoading(false); }
    };

    const byRole = useMemo(() => {
        const map: Record<string, KPIRule[]> = {};
        for (const r of rules.filter(r => r.isActive)) (map[r.role] ??= []).push(r);
        for (const k in map) map[k].sort((a, b) => a.sortOrder - b.sortOrder);
        return map;
    }, [rules]);

    const archived = rules.filter(r => !r.isActive);

    const toggleActive = async (rule: KPIRule) => { await updateKpiRule(rule.id, { isActive: !rule.isActive }); loadRules(); };
    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`${name} qoidasini o'chirishni tasdiqlaysizmi?`)) return;
        try { await deleteKpiRule(id); loadRules(); } catch (e) { alert((e as Error).message); }
    };

    const openCreate = () => setEditingRule({
        name: '', nameUz: '', role: 'accountant', category: 'general',
        inputTypeV2: 'select', scope: 'per_company', maxBonus: null, maxPenalty: null,
        descriptionUz: '', options: [], isActive: true,
    });

    const handleSave = async () => {
        if (!editingRule) return;
        const mb = editingRule.maxBonus == null ? null : Number(editingRule.maxBonus);
        const mp = editingRule.maxPenalty == null ? null : Number(editingRule.maxPenalty);
        const v2 = editingRule.inputTypeV2 || 'select';
        try {
            if (editingRule.id) {
                await updateKpiRule(editingRule.id, {
                    nameUz: editingRule.nameUz,
                    descriptionUz: editingRule.descriptionUz,
                    category: editingRule.category,
                    scope: editingRule.scope,
                    inputTypeV2: editingRule.inputTypeV2,
                    maxBonus: mb,
                    maxPenalty: mp,
                    isActive: editingRule.isActive,
                });
            } else {
                if (!editingRule.nameUz?.trim()) { alert("Nomi (o'zbekcha) kiritilishi shart"); return; }
                await createKpiRule({
                    name: (editingRule.name?.trim() || slugify(editingRule.nameUz)),
                    nameUz: editingRule.nameUz.trim(),
                    role: editingRule.role || 'accountant',
                    category: editingRule.category || 'general',
                    rewardPercent: mb ?? 0,
                    penaltyPercent: mp ?? 0,
                    inputType: LEGACY_INPUT[v2] || 'checkbox',
                    inputTypeV2: v2,
                    scope: editingRule.scope || 'per_company',
                    descriptionUz: editingRule.descriptionUz,
                    maxBonus: mb,
                    maxPenalty: mp,
                    options: [],
                });
            }
            setEditingRule(null);
            loadRules();
        } catch (e) { alert((e as Error).message); }
    };

    const OptionPills: React.FC<{ rule: KPIRule }> = ({ rule }) => {
        const opts = (rule.options ?? []) as KpiRuleOption[];
        if (rule.inputTypeV2 === 'counter') {
            return (
                <div className="flex flex-wrap gap-1.5">
                    {opts.map(o => {
                        const per = o.coeff_per_unit ?? 0;
                        const c = COLOR[o.color || (per >= 0 ? 'green' : 'red')];
                        return (
                            <span key={o.key} className="text-2xs font-bold px-2 py-1 rounded-lg" style={{ background: c.bg, color: c.fg, border: `1px solid ${c.bd}` }}>
                                {o.label_uz} · {per > 0 ? '+' : ''}{per}%{o.max_coeff != null ? ` (max ${o.max_coeff}%)` : '/birlik'}
                            </span>
                        );
                    })}
                </div>
            );
        }
        if (rule.inputTypeV2 === 'amount_penalty') {
            return <span className="text-2xs font-bold px-2 py-1 rounded-lg" style={{ background: COLOR.red.bg, color: COLOR.red.fg, border: `1px solid ${COLOR.red.bd}` }}>So&apos;mda jarima (qo&apos;lda)</span>;
        }
        return (
            <div className="flex flex-wrap gap-1.5">
                {opts.map(o => {
                    const c = COLOR[o.color || 'yellow'];
                    return (
                        <span key={o.key} className="text-2xs font-bold px-2 py-1 rounded-lg" style={{ background: c.bg, color: c.fg, border: `1px solid ${c.bd}` }}>
                            {o.label_uz}{typeof o.coeff === 'number' && o.coeff !== 0 ? ` (${o.coeff > 0 ? '+' : ''}${o.coeff}%)` : ''}
                        </span>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="space-y-5 animate-fade-in p-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 p-5 rounded-xl"
                style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow)' }}>
                <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white"
                        style={{ background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-indigo))' }}>
                        <Settings size={20} />
                    </div>
                    <div>
                        <h2 className="text-[15px] font-bold leading-none" style={{ color: 'var(--text-primary)' }}>KPI Qoidalari (v2)</h2>
                        <p className="text-[11px] mt-1 font-medium" style={{ color: 'var(--text-muted)' }}>Uch holatli tizim — bonus / neytral / jarima</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {ROLE_META.map(m => (
                        <div key={m.key} className="px-3 py-2 rounded-lg text-center" style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
                            <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: m.accent }}>{m.label}</p>
                            <p className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>{m.base} + KPI {m.kpi}</p>
                        </div>
                    ))}
                    <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-widest text-white"
                        style={{ background: 'var(--accent-blue)' }}>
                        <Plus size={14} /> Yangi qoida
                    </button>
                </div>
            </div>

            {loading && <p className="text-center text-[12px] py-4" style={{ color: 'var(--text-muted)' }}>Yuklanmoqda…</p>}

            {/* Rules grouped by role */}
            {ROLE_META.map(meta => {
                const list = byRole[meta.key] || [];
                if (list.length === 0) return null;
                return (
                    <div key={meta.key} className="rounded-xl overflow-hidden" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow)' }}>
                        <div className="px-5 py-3 flex items-center gap-2" style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--card-border)' }}>
                            <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white" style={{ background: meta.accent }}>
                                <meta.icon size={13} />
                            </div>
                            <h3 className="text-[12px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-primary)' }}>{meta.label}</h3>
                            <span className="c1-badge" style={{ background: 'var(--input-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>{list.length} qoida</span>
                        </div>
                        <div className="divide-y" style={{ borderColor: 'var(--card-border)' }}>
                            {list.map(rule => (
                                <div key={rule.id} className="px-5 py-3.5 flex items-start gap-4 transition-colors"
                                    style={{ borderColor: 'var(--card-border)' }}>
                                    {/* toggle */}
                                    <div onClick={() => toggleActive(rule)} className="mt-0.5 w-9 h-5 rounded-full relative cursor-pointer transition-all shrink-0"
                                        style={{ background: rule.isActive ? 'var(--success)' : 'var(--card-border)' }}>
                                        <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform" style={{ left: 2, transform: rule.isActive ? 'translateX(16px)' : 'translateX(0)' }} />
                                    </div>
                                    {/* body */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                            <p className="font-bold text-xs" style={{ color: 'var(--text-primary)' }}>{rule.nameUz}</p>
                                            <span className="text-2xs font-mono font-bold" style={{ color: 'var(--text-muted)' }}>{rule.name}</span>
                                            <Badge tone="blue">{rule.inputTypeV2 || rule.inputType}</Badge>
                                            <Badge>{rule.category}</Badge>
                                            <Badge>{rule.scope}</Badge>
                                        </div>
                                        {rule.descriptionUz && <p className="text-[10px] mb-2 leading-snug" style={{ color: 'var(--text-muted)' }}>{rule.descriptionUz}</p>}
                                        <OptionPills rule={rule} />
                                    </div>
                                    {/* caps + edit */}
                                    <div className="flex items-center gap-3 shrink-0">
                                        <div className="text-right">
                                            <p className="text-[11px] font-bold tabular-nums" style={{ color: 'var(--success)' }}>+{rule.maxBonus ?? 0}%</p>
                                            <p className="text-[11px] font-bold tabular-nums" style={{ color: 'var(--danger)' }}>{rule.maxPenalty ?? 0}%</p>
                                        </div>
                                        <button onClick={() => setEditingRule(rule)} className="p-2 rounded-lg transition-colors"
                                            style={{ color: 'var(--text-muted)', border: '1px solid var(--card-border)' }} title="Tahrirlash">
                                            <Edit3 size={13} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}

            {/* Archived */}
            {archived.length > 0 && (
                <details className="rounded-xl overflow-hidden" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                    <summary className="px-5 py-3 text-[11px] font-bold uppercase tracking-widest cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                        Arxivlangan qoidalar ({archived.length})
                    </summary>
                    <div className="divide-y" style={{ borderColor: 'var(--card-border)' }}>
                        {archived.map(rule => (
                            <div key={rule.id} className="px-5 py-2.5 flex items-center justify-between" style={{ borderColor: 'var(--card-border)' }}>
                                <p className="font-bold text-[12px]" style={{ color: 'var(--text-secondary)' }}>{rule.nameUz} <span className="text-2xs font-mono" style={{ color: 'var(--text-muted)' }}>{rule.name}</span></p>
                                <div className="flex gap-2">
                                    <button onClick={() => toggleActive(rule)} className="text-[9px] font-bold uppercase px-2.5 py-1 rounded-lg" style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-border)' }}>Tiklash</button>
                                    <button onClick={() => handleDelete(rule.id, rule.nameUz)} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-border)' }}><Trash2 size={12} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </details>
            )}

            {/* Edit modal */}
            {editingRule && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={() => setEditingRule(null)}>
                    <div className="w-full max-w-2xl rounded-2xl overflow-hidden animate-scale-in max-h-[90vh] flex flex-col"
                        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', boxShadow: '0 25px 60px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}
                        onKeyDown={submitOnCtrlEnter(handleSave)}>
                        <div className="px-6 py-4 flex justify-between items-center" style={{ borderBottom: '1px solid var(--card-border)', background: 'var(--table-header-bg)' }}>
                            <div>
                                <h3 className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>{editingRule.id ? editingRule.nameUz : 'Yangi KPI qoidasi'}</h3>
                                <p className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>{editingRule.id ? editingRule.name : "rol va nom tanlang"}</p>
                            </div>
                            <button onClick={() => setEditingRule(null)} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            <div>
                                <label className="text-[9px] font-bold uppercase tracking-widest mb-1 block" style={{ color: 'var(--text-muted)' }}>Nomi (O&apos;zbekcha)</label>
                                <input className="erp-input font-bold" value={editingRule.nameUz || ''} onChange={e => setEditingRule({ ...editingRule, nameUz: e.target.value })} />
                            </div>
                            {!editingRule.id && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[9px] font-bold uppercase tracking-widest mb-1 block" style={{ color: 'var(--text-muted)' }}>Rol</label>
                                        <select className="erp-input font-bold" value={editingRule.role || 'accountant'} onChange={e => setEditingRule({ ...editingRule, role: e.target.value as KPIRule['role'] })}>
                                            <option value="accountant">Buxgalter</option>
                                            <option value="bank_client">Bank-klient</option>
                                            <option value="supervisor">Nazoratchi</option>
                                            <option value="all">Hammasi</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-bold uppercase tracking-widest mb-1 block" style={{ color: 'var(--text-muted)' }}>Ichki nom (ixtiyoriy)</label>
                                        <input className="erp-input font-mono text-[12px]" placeholder="avto (nomdan)" value={editingRule.name || ''} onChange={e => setEditingRule({ ...editingRule, name: e.target.value })} />
                                    </div>
                                </div>
                            )}
                            <div>
                                <label className="text-[9px] font-bold uppercase tracking-widest mb-1 block" style={{ color: 'var(--text-muted)' }}>Izoh</label>
                                <textarea className="erp-input min-h-[70px] resize-none" value={editingRule.descriptionUz || ''} onChange={e => setEditingRule({ ...editingRule, descriptionUz: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[9px] font-bold uppercase tracking-widest mb-1 block" style={{ color: 'var(--text-muted)' }}>Qamrov</label>
                                    <select className="erp-input font-bold" value={editingRule.scope || 'per_company'} onChange={e => setEditingRule({ ...editingRule, scope: e.target.value as KPIRule['scope'] })}>
                                        <option value="global">Umumiy</option>
                                        <option value="per_company">Firma bo&apos;yicha</option>
                                        <option value="per_group">Guruh bo&apos;yicha</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold uppercase tracking-widest mb-1 block" style={{ color: 'var(--text-muted)' }}>Kirish turi</label>
                                    <select className="erp-input font-bold" value={editingRule.inputTypeV2 || 'select'} onChange={e => setEditingRule({ ...editingRule, inputTypeV2: e.target.value as KPIRule['inputTypeV2'] })}>
                                        <option value="select">Ro&apos;yxatdan tanlash</option>
                                        <option value="counter">Sanagich</option>
                                        <option value="checkbox_bonus">Belgi (bonus)</option>
                                        <option value="checkbox_penalty">Belgi (jarima)</option>
                                        <option value="amount_penalty">Summa (jarima)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold uppercase tracking-widest mb-1 block" style={{ color: 'var(--success)' }}>Maksimal bonus %</label>
                                    <input type="number" step="0.01" className="erp-input font-bold" value={editingRule.maxBonus ?? ''} onChange={e => setEditingRule({ ...editingRule, maxBonus: e.target.value === '' ? null : Number(e.target.value) })} />
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold uppercase tracking-widest mb-1 block" style={{ color: 'var(--danger)' }}>Maksimal jarima %</label>
                                    <input type="number" step="0.01" className="erp-input font-bold" value={editingRule.maxPenalty ?? ''} onChange={e => setEditingRule({ ...editingRule, maxPenalty: e.target.value === '' ? null : Number(e.target.value) })} />
                                </div>
                            </div>
                            <div>
                                <label className="text-[9px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Holatlar</label>
                                <OptionPills rule={editingRule as KPIRule} />
                                <p className="text-[9px] mt-1.5" style={{ color: 'var(--text-muted)' }}>Holat koeffitsiyentlari maxsus skript orqali boshqariladi.</p>
                            </div>
                        </div>
                        <div className="p-4 flex gap-3" style={{ borderTop: '1px solid var(--card-border)', background: 'var(--table-header-bg)' }}>
                            <button onClick={() => setEditingRule(null)} className="btn-secondary flex-1">Bekor qilish</button>
                            <button onClick={handleSave} className="btn-primary flex-1">Saqlash</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default KPIRulesManager;
