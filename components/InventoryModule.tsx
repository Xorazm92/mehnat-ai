"use client";

import React, { useState, useMemo } from 'react';
import { ModalLayer } from "@/components/ui/ModalLayer";
import { useViewMode } from '@/hooks/useViewMode';
import { Language, Staff } from '@/types';
import { translations } from '@/lib/translations';
import { Package, Plus, Search, Edit3, Trash2, User, CheckCircle2, Wrench, Archive } from 'lucide-react';
import { TableToolbar } from "@/components/ui/TableToolbar";
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { useTableState } from "@/hooks/useTableState";
import { friendlyError } from "@/lib/actionError";

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
    const table = useTableState({ ns: 'inv', defaultSortKey: 'name' });
  const confirm = useConfirm();
    const t = translations[lang];
    const [searchTerm, setSearchTerm] = useState('');
    // Standart — RO'YXAT; tanlov brauzerda saqlanadi (hooks/useViewMode).
    const [viewMode, setViewMode] = useViewMode('inventar');
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
            const message = friendlyError(err);
            toast.error((lang === 'uz' ? 'Xatolik: ' : 'Ошибка: ') + message);
        } finally {
            setIsSaving(false);
        }
    };
    const invColumns = useMemo<DataColumn<typeof items[number]>[]>(() => [
        {
            key: 'name', header: 'Nomi',
            sortValue: it => it.name,
            cell: it => (
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--input-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>
                        <Package size={16} />
                    </div>
                    <span className="text-body font-bold tracking-tight" style={{ color: 'var(--text)' }}>{it.name}</span>
                </div>
            ),
        },
        {
            key: 'serial', header: 'Seriya raqami', width: '160px', mobile: 'meta',
            sortValue: it => it.serialNumber ?? '',
            cell: it => <span className="text-xs font-bold tabular-nums font-mono" style={{ color: 'var(--text-secondary)' }}>{it.serialNumber || '—'}</span>,
        },
        {
            key: 'status', header: t.status, width: '150px', mobile: 'status',
            sortValue: it => it.status ?? '',
            cell: it => {
                const meta = STATUS_META[it.status] || STATUS_META.available;
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-micro font-bold uppercase tracking-widest whitespace-nowrap" style={{ background: meta.bg, color: meta.color }}>
                        {meta.icon}{meta.labelUz}
                    </span>
                );
            },
        },
        {
            key: 'assigned', header: 'Kimda', width: '180px',
            sortValue: it => it.assignedToName ?? '',
            cell: it => <span className="text-xs font-bold tracking-tight" style={{ color: 'var(--text-secondary)' }}>{it.assignedToName || '—'}</span>,
        },
        {
            key: 'actions', header: 'Amallar', align: 'right', width: '100px',
            cell: it => (
                <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEdit(it)} className="icon-btn-sm icon-btn-accent rounded-lg" style={{ color: 'var(--accent-blue)' }} aria-label={t.edit}><Edit3 size={15} /></button>
                    <button onClick={() => handleDelete(it.id)} className="icon-btn-sm icon-btn-danger rounded-lg" style={{ color: 'var(--danger)' }} aria-label={t.delete}><Trash2 size={15} /></button>
                </div>
            ),
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [t]);


    const handleDelete = async (id: string) => {
        if (!await confirm({ title: "Inventar yozuvi o'chirilsinmi?", description: "Bu amalni ortga qaytarib bo'lmaydi.", confirmLabel: "O'chirish", tone: 'danger' })) return;
        try {
            await onDelete(id);
            toast.success(lang === 'uz' ? "O'chirildi" : 'Удалено');
        } catch (err) {
            const message = friendlyError(err);
            toast.error((lang === 'uz' ? 'Xatolik: ' : 'Ошибка: ') + message);
        }
    };

    return (
        <div className="space-y-4 animate-fade-in pb-20">
      <PageHeader
        icon={<Package size={20} />}
        title="Inventar"
        description="Jihozlar va ularning biriktirilishi"
      />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: lang === 'uz' ? 'Jami' : 'Всего', value: stats.total, color: 'var(--text)' },
                    { label: lang === 'uz' ? 'Bo\'sh' : 'Свободно', value: stats.available, color: 'var(--success)' },
                    { label: lang === 'uz' ? 'Biriktirilgan' : 'Закреплено', value: stats.assigned, color: 'var(--accent-blue)' },
                    { label: lang === 'uz' ? 'Ta\'mirda' : 'Ремонт', value: stats.maintenance, color: 'var(--warning)' },
                ].map((s, i) => (
                    <div key={i} className="dashboard-card p-5">
                        <span className="text-micro font-bold uppercase tracking-widest block mb-2" style={{ color: 'var(--text-muted)' }}>{s.label}</span>
                        <div className="text-3xl font-semibold tabular-nums leading-none" style={{ color: s.color }}>{s.value}</div>
                    </div>
                ))}
            </div>

            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2" size={18} style={{ color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        placeholder="QIDIRISH..."
                        className="w-full rounded-xl py-3 pl-12 pr-4 text-xs font-bold outline-none transition-all focus:ring-2 focus:ring-[var(--accent-blue)] focus:ring-opacity-20"
                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Button variant="primary" size="md" onClick={openNew} className="whitespace-nowrap">
                    <Plus size={16} />
                    <span>{lang === 'uz' ? 'Yangi jihoz' : 'Новый предмет'}</span>
                </Button>
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
                                <div className="text-body font-semibold tracking-tight truncate" style={{ color: 'var(--text)' }}>{it.name}</div>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-micro font-semibold uppercase tracking-widest" style={{ background: meta.bg, color: meta.color }}>{meta.icon}{lang === 'uz' ? meta.labelUz : meta.labelRu}</span>
                                    {it.serialNumber && <span className="text-micro font-mono font-bold" style={{ color: 'var(--text-muted)' }}>#{it.serialNumber}</span>}
                                </div>
                                <div className="text-meta font-bold uppercase tracking-tight mt-1 truncate" style={{ color: 'var(--text-secondary)' }}>{it.assignedToName || '—'}</div>
                            </div>
                            <div className="flex flex-col gap-1.5 shrink-0">
                                <button onClick={() => openEdit(it)} className="icon-btn-sm" style={{ color: 'var(--accent-blue)', background: 'var(--accent-blue-light)' }} title={t.edit} aria-label={t.edit}><Edit3 size={15} /></button>
                                <button onClick={() => handleDelete(it.id)} className="icon-btn-sm" style={{ color: 'var(--danger)', background: 'var(--danger-bg)' }} title={t.delete} aria-label={t.delete}><Trash2 size={15} /></button>
                            </div>
                        </div>
                    );
                })}
                {filtered.length === 0 && (
                    <div className="dashboard-card p-5 text-center">
                        <Package size={36} className="mx-auto mb-3 opacity-20" style={{ color: 'var(--text-muted)' }} />
                        <span className="text-meta font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? "Inventar yo'q" : 'Нет предметов'}</span>
                    </div>
                )}
            </div>

            {/* Table (desktop) */}
            <div className={viewMode === 'list' ? "dashboard-card overflow-hidden overflow-x-auto" : "hidden"}>
                <div className="overflow-x-auto scrollbar-hide">
                    <DataTable
                        caption="Inventar ro'yxati"
                        rows={filtered}
                        columns={invColumns}
                        rowKey={it => it.id}
                        sortKey={table.sortKey}
                        sortDir={table.sortDir}
                        onToggleSort={table.toggleSort}
                        density={table.density}
                        page={table.page}
                        pageSize={50}
                        onPageChange={table.setPage}
                        emptyIcon={<Package size={36} />}
                        emptyTitle="Inventar yo'q"
                    />
                </div>
            </div>

            {isModalOpen && (
                <ModalLayer open={isModalOpen} onClose={() => setIsModalOpen(false)} label="Inventar yozuvi">
                    <div className="w-full max-w-lg shadow-2xl relative overflow-hidden dashboard-card !p-0">
                        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'var(--accent-blue)' }}></div>
                        <div className="px-6 py-5 flex justify-between items-center" style={{ borderBottom: '1px solid var(--card-border)' }}>
                            <h3 className="text-body font-bold" style={{ color: 'var(--text)' }}>{form.id ? (lang === 'uz' ? 'Jihozni tahrirlash' : 'Изменить предмет') : (lang === 'uz' ? 'Yangi jihoz' : 'Новый предмет')}</h3>
                            <button onClick={() => setIsModalOpen(false)} className="icon-btn-sm" style={{ color: 'var(--text-muted)', background: 'var(--input-bg)' }}>
                                <Plus size={20} className="rotate-45" />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="space-y-2 md:col-span-2">
                                    <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Nomi' : 'Название'}</label>
                                    <input type="text" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} required placeholder={lang === 'uz' ? 'MASALAN: NOUTBUK HP' : 'НАЗВАНИЕ'}
                                        className="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none tracking-tight"
                                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Seriya raqami' : 'Серийный №'}</label>
                                    <input type="text" value={form.serialNumber} onChange={(e) => setForm(f => ({ ...f, serialNumber: e.target.value }))}
                                        className="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none tracking-tight"
                                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Holati' : 'Состояние'}</label>
                                    <select value={form.condition} onChange={(e) => setForm(f => ({ ...f, condition: e.target.value }))}
                                        className="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none tracking-tight"
                                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}>
                                        {CONDITIONS.map(c => <option key={c} value={c}>{(lang === 'uz' ? CONDITION_LABEL[c].uz : CONDITION_LABEL[c].ru).toUpperCase()}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{t.status}</label>
                                    <select value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}
                                        className="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none tracking-tight"
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
                                            className="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none tracking-tight"
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
                                <Button variant="primary" size="md" type="submit" disabled={isSaving} className="flex-1">
                                    {isSaving ? '...' : t.save}
                                </Button>
                            </div>
                        </form>
                    </div>
                </ModalLayer>
            )}
        </div>
    );
};

export default InventoryModule;
