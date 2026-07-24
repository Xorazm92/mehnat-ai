"use client";

import React, { useState, useMemo } from 'react';
import { Language, Staff } from '@/types';
import { translations } from '@/lib/translations';
import { Package, Plus, Search, Edit3, Trash2, User, CheckCircle2, Wrench, Archive } from 'lucide-react';
import { TableToolbar, type ViewMode } from "@/components/ui/TableToolbar";
import { toast } from 'sonner';

export interface InventoryRecord {
    id: string;
    name: string;
    serialNumber?: string;
    status: string;    // available | assigned | maintenance | retired
    condition: string; // good | fair | poor
    assignedToId?: string;
    assignedToName?: string;
}

interface Props {
    items: InventoryRecord[];
    staff: Staff[];
    lang: Language;
    onSave: (data: { id?: string; name: string; serialNumber?: string; status: string; condition: string; assignedToId?: string }) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
}

const STATUS_META: Record<string, { labelUz: string; labelRu: string; color: string; bg: string; icon: React.ReactNode }> = {
    available: { labelUz: 'Bo\'sh', labelRu: 'Свободно', color: 'var(--success)', bg: 'var(--success-bg)', icon: <CheckCircle2 size={14} /> },
    assigned: { labelUz: 'Biriktirilgan', labelRu: 'Закреплено', color: 'var(--accent-blue)', bg: 'var(--accent-blue-light)', icon: <User size={14} /> },
    maintenance: { labelUz: 'Ta\'mirda', labelRu: 'Ремонт', color: 'var(--warning)', bg: 'var(--warning-bg)', icon: <Wrench size={14} /> },
    retired: { labelUz: 'Chiqarilgan', labelRu: 'Списано', color: 'var(--danger)', bg: 'var(--danger-bg)', icon: <Archive size={14} /> },
};

const CONDITIONS = ['good', 'fair', 'poor'];
const CONDITION_LABEL: Record<string, { uz: string; ru: string }> = {
    good: { uz: 'Yaxshi', ru: 'Хорошее' },
    fair: { uz: "O'rtacha", ru: 'Среднее' },
    poor: { uz: 'Yomon', ru: 'Плохое' },
};

interface InventoryForm {
    id?: string;
    name: string;
    serialNumber: string;
    status: string;
    condition: string;
    assignedToId: string;
}

const InventoryModule: React.FC<Props> = ({ items, staff, lang, onSave, onDelete }) => {
    const t = translations[lang];
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState<InventoryForm>({ id: undefined, name: '', serialNumber: '', status: 'available', condition: 'good', assignedToId: '' });

    const filtered = useMemo(() => {
        return items.filter(it =>
            it.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (it.serialNumber || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [items, searchTerm]);

    const stats = useMemo(() => ({
        total: items.length,
        available: items.filter(i => i.status === 'available').length,
        assigned: items.filter(i => i.status === 'assigned').length,
        maintenance: items.filter(i => i.status === 'maintenance').length,
    }), [items]);

    const openNew = () => {
        setForm({ id: undefined, name: '', serialNumber: '', status: 'available', condition: 'good', assignedToId: '' });
        setIsModalOpen(true);
    };

    const openEdit = (it: InventoryRecord) => {
        setForm({ id: it.id, name: it.name, status: it.status, condition: it.condition, serialNumber: it.serialNumber || '', assignedToId: it.assignedToId || '' });
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSaving || !form.name) return;
        setIsSaving(true);
        try {
            await onSave({
                id: form.id,
                name: form.name,
                serialNumber: form.serialNumber || undefined,
                status: form.status,
                condition: form.condition,
                assignedToId: form.status === 'assigned' ? (form.assignedToId || undefined) : undefined,
            });
            toast.success(lang === 'uz' ? 'Saqlandi' : 'Сохранено');
            setIsModalOpen(false);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            toast.error((lang === 'uz' ? 'Xatolik: ' : 'Ошибка: ') + message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm(lang === 'uz' ? "O'chirishni tasdiqlaysizmi?" : 'Удалить?')) return;
        try {
            await onDelete(id);
            toast.success(lang === 'uz' ? "O'chirildi" : 'Удалено');
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            toast.error((lang === 'uz' ? 'Xatolik: ' : 'Ошибка: ') + message);
        }
    };

    return (
        <div className="space-y-4 animate-fade-in pb-20">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: lang === 'uz' ? 'Jami' : 'Всего', value: stats.total, color: 'var(--text)' },
                    { label: lang === 'uz' ? 'Bo\'sh' : 'Свободно', value: stats.available, color: 'var(--success)' },
                    { label: lang === 'uz' ? 'Biriktirilgan' : 'Закреплено', value: stats.assigned, color: 'var(--accent-blue)' },
                    { label: lang === 'uz' ? 'Ta\'mirda' : 'Ремонт', value: stats.maintenance, color: 'var(--warning)' },
                ].map((s, i) => (
                    <div key={i} className="dashboard-card p-5">
                        <span className="text-micro font-bold uppercase tracking-widest block mb-2" style={{ color: 'var(--text-muted)' }}>{s.label}</span>
                        <div className="text-3xl font-black tabular-nums leading-none" style={{ color: s.color }}>{s.value}</div>
                    </div>
                ))}
            </div>

            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2" size={18} style={{ color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        placeholder="QIDIRISH..."
                        className="w-full rounded-xl py-3 pl-12 pr-4 text-xs font-bold uppercase tracking-widest outline-none transition-all focus:ring-2 focus:ring-[var(--accent-blue)] focus:ring-opacity-20"
                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <button
                    onClick={openNew}
                    className="font-bold px-5 py-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-sm whitespace-nowrap uppercase tracking-widest hover:shadow-md text-white"
                    style={{ background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-blue-hover))' }}
                >
                    <Plus size={16} />
                    <span>{lang === 'uz' ? 'Yangi jihoz' : 'Новый предмет'}</span>
                </button>
                <div className="flex items-center justify-end">
                    <TableToolbar view={viewMode} onViewChange={setViewMode} />
                </div>
            </div>
            <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" : "hidden"}>
                {filtered.map((it) => {
                    const meta = STATUS_META[it.status] || STATUS_META.available;
                    return (
                        <div key={it.id} className="dashboard-card p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--input-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}><Package size={18} /></div>
                            <div className="flex-1 min-w-0">
                                <div className="text-body font-black uppercase tracking-tight truncate" style={{ color: 'var(--text)' }}>{it.name}</div>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-micro font-black uppercase tracking-widest" style={{ background: meta.bg, color: meta.color }}>{meta.icon}{lang === 'uz' ? meta.labelUz : meta.labelRu}</span>
                                    {it.serialNumber && <span className="text-micro font-mono font-bold" style={{ color: 'var(--text-muted)' }}>#{it.serialNumber}</span>}
                                </div>
                                <div className="text-meta font-bold uppercase tracking-tight mt-1 truncate" style={{ color: 'var(--text-secondary)' }}>{it.assignedToName || '—'}</div>
                            </div>
                            <div className="flex flex-col gap-1.5 shrink-0">
                                <button onClick={() => openEdit(it)} className="icon-btn-sm" style={{ color: 'var(--accent-blue)', background: 'var(--accent-blue-light)' }} title={t.edit}><Edit3 size={15} /></button>
                                <button onClick={() => handleDelete(it.id)} className="icon-btn-sm" style={{ color: 'var(--danger)', background: 'var(--danger-bg)' }} title={t.delete}><Trash2 size={15} /></button>
                            </div>
                        </div>
                    );
                })}
                {filtered.length === 0 && (
                    <div className="dashboard-card p-12 text-center">
                        <Package size={36} className="mx-auto mb-3 opacity-20" style={{ color: 'var(--text-muted)' }} />
                        <span className="text-meta uppercase font-black tracking-[0.2em] opacity-50" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? "Inventar yo'q" : 'Нет предметов'}</span>
                    </div>
                )}
            </div>

            {/* Table (desktop) */}
            <div className={viewMode === 'list' ? "dashboard-card overflow-hidden overflow-x-auto" : "hidden"}>
                <div className="overflow-x-auto scrollbar-hide">
                    <table className="w-full text-left border-collapse min-w-[820px]">
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
                                <th className="px-6 py-4 text-meta font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Nomi' : 'Название'}</th>
                                <th className="px-6 py-4 text-meta font-bold uppercase tracking-widest w-[160px]" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Seriya raqami' : 'Серийный №'}</th>
                                <th className="px-6 py-4 text-meta font-bold uppercase tracking-widest w-[150px]" style={{ color: 'var(--text-muted)' }}>{t.status}</th>
                                <th className="px-6 py-4 text-meta font-bold uppercase tracking-widest w-[180px]" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Kimda' : 'У кого'}</th>
                                <th className="px-6 py-4 text-meta font-bold uppercase tracking-widest text-right w-[100px]" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Amallar' : 'Действия'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((it, i) => {
                                const meta = STATUS_META[it.status] || STATUS_META.available;
                                return (
                                    <tr key={it.id} className="transition-colors group" style={{ backgroundColor: i % 2 === 0 ? 'var(--card-bg)' : 'var(--input-bg)', borderBottom: '1px solid var(--card-border)' }}>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--input-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>
                                                    <Package size={16} />
                                                </div>
                                                <span className="text-body font-bold uppercase tracking-tight" style={{ color: 'var(--text)' }}>{it.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-xs font-bold tabular-nums font-mono" style={{ color: 'var(--text-secondary)' }}>{it.serialNumber || '—'}</td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-micro font-bold uppercase tracking-widest" style={{ background: meta.bg, color: meta.color }}>
                                                {meta.icon}
                                                {lang === 'uz' ? meta.labelUz : meta.labelRu}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-xs font-bold uppercase tracking-tight" style={{ color: 'var(--text-secondary)' }}>{it.assignedToName || '—'}</td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => openEdit(it)} className="icon-btn-sm" style={{ color: 'var(--accent-blue)' }} title={t.edit}>
                                                    <Edit3 size={16} />
                                                </button>
                                                <button onClick={() => handleDelete(it.id)} className="icon-btn-sm" style={{ color: 'var(--danger)' }} title={t.delete}>
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-24 text-center">
                                        <div className="flex flex-col items-center" style={{ color: 'var(--text-muted)' }}>
                                            <Package size={48} className="mb-4 opacity-20" />
                                            <span className="text-meta uppercase font-bold tracking-[0.2em] opacity-60">{lang === 'uz' ? "Inventar yo'q" : 'Нет предметов'}</span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="w-full max-w-lg shadow-2xl relative overflow-hidden dashboard-card !p-0">
                        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'var(--accent-blue)' }}></div>
                        <div className="px-6 py-5 flex justify-between items-center" style={{ borderBottom: '1px solid var(--card-border)' }}>
                            <h3 className="text-body font-bold uppercase tracking-widest" style={{ color: 'var(--text)' }}>{form.id ? (lang === 'uz' ? 'Jihozni tahrirlash' : 'Изменить предмет') : (lang === 'uz' ? 'Yangi jihoz' : 'Новый предмет')}</h3>
                            <button onClick={() => setIsModalOpen(false)} className="icon-btn-sm" style={{ color: 'var(--text-muted)', background: 'var(--input-bg)' }}>
                                <Plus size={20} className="rotate-45" />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="space-y-2 md:col-span-2">
                                    <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Nomi' : 'Название'}</label>
                                    <input type="text" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} required placeholder={lang === 'uz' ? 'MASALAN: NOUTBUK HP' : 'НАЗВАНИЕ'}
                                        className="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none uppercase tracking-tight"
                                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Seriya raqami' : 'Серийный №'}</label>
                                    <input type="text" value={form.serialNumber} onChange={(e) => setForm(f => ({ ...f, serialNumber: e.target.value }))}
                                        className="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none uppercase tracking-tight"
                                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Holati' : 'Состояние'}</label>
                                    <select value={form.condition} onChange={(e) => setForm(f => ({ ...f, condition: e.target.value }))}
                                        className="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none uppercase tracking-tight"
                                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}>
                                        {CONDITIONS.map(c => <option key={c} value={c}>{(lang === 'uz' ? CONDITION_LABEL[c].uz : CONDITION_LABEL[c].ru).toUpperCase()}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{t.status}</label>
                                    <select value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}
                                        className="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none uppercase tracking-tight"
                                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}>
                                        {Object.entries(STATUS_META).map(([key, meta]) => (
                                            <option key={key} value={key}>{(lang === 'uz' ? meta.labelUz : meta.labelRu).toUpperCase()}</option>
                                        ))}
                                    </select>
                                </div>
                                {form.status === 'assigned' && (
                                    <div className="space-y-2">
                                        <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Kimga' : 'Кому'}</label>
                                        <select value={form.assignedToId} onChange={(e) => setForm(f => ({ ...f, assignedToId: e.target.value }))}
                                            className="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none uppercase tracking-tight"
                                            style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}>
                                            <option value="">—</option>
                                            {staff.map(s => <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-3 pt-6 mt-6" style={{ borderTop: '1px solid var(--card-border)' }}>
                                <button type="button" onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-4 py-3 rounded-xl font-bold text-meta uppercase tracking-widest transition-all shadow-sm"
                                    style={{ background: 'var(--input-bg)', color: 'var(--text-secondary)', border: '1px solid var(--card-border)' }}>
                                    {t.cancel}
                                </button>
                                <button type="submit" disabled={isSaving}
                                    className="flex-1 px-4 py-3 rounded-xl font-bold text-meta text-white transition-all shadow-md hover:shadow-lg uppercase tracking-widest active:scale-95 disabled:opacity-60"
                                    style={{ background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-blue-hover))' }}>
                                    {isSaving ? '...' : t.save}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InventoryModule;
