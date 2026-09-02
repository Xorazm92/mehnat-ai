"use client";

import React, { useState, useMemo } from 'react';
import { ModalLayer } from "@/components/ui/ModalLayer";
import { useViewMode } from '@/hooks/useViewMode';
import { Language, Company } from '@/types';
import { translations } from '@/lib/translations';
import { FileText, Plus, Search, Trash2, ExternalLink, Building2 } from 'lucide-react';
import { TableToolbar } from "@/components/ui/TableToolbar";
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { useTableState } from "@/hooks/useTableState";
import { usePageSize } from "@/hooks/usePageSize";
import { friendlyError } from "@/lib/actionError";

export interface DocumentRecord {
    id: string;
    companyId: string;
    companyName: string;
    name: string;
    filePath: string;
    mimeType?: string;
    uploadedAt: string;
}

interface Props {
    documents: DocumentRecord[];
    companies: Company[];
    lang: Language;
    canEdit: boolean;
    onSave: (data: { companyId: string; name: string; filePath: string }) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
}

const DocumentsModule: React.FC<Props> = ({ documents, companies, lang, canEdit, onSave, onDelete }) => {
    const table = useTableState({ ns: 'doc', defaultSortKey: 'date', defaultSortDir: 'desc' });
    const [pageSize, setPageSize] = usePageSize("documents");
  const confirm = useConfirm();
    const t = translations[lang];
    const [searchTerm, setSearchTerm] = useState('');
    // Standart — RO'YXAT; tanlov brauzerda saqlanadi (hooks/useViewMode).
    const [viewMode, setViewMode] = useViewMode('hujjatlar');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState<{ companyId: string; name: string; filePath: string }>({ companyId: '', name: '', filePath: '' });

    const filtered = useMemo(() => {
        return documents.filter(d =>
            d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            d.companyName.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [documents, searchTerm]);

    const openNew = () => {
        setForm({ companyId: companies[0]?.id || '', name: '', filePath: '' });
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSaving || !form.companyId || !form.name || !form.filePath) return;
        setIsSaving(true);
        try {
            await onSave(form);
            toast.success(lang === 'uz' ? 'Hujjat qo\'shildi' : 'Документ добавлен');
            setIsModalOpen(false);
        } catch (err) {
            const message = friendlyError(err);
            toast.error((lang === 'uz' ? 'Xatolik: ' : 'Ошибка: ') + message);
        } finally {
            setIsSaving(false);
        }
    };
    const docColumns = useMemo<DataColumn<typeof documents[number]>[]>(() => [
        {
            key: 'name', header: "Hujjat nomi",
            sortValue: d => d.name,
            cell: d => (
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--accent-blue-light)', color: 'var(--accent-blue)' }}>
                        <FileText size={16} />
                    </div>
                    <span className="text-body font-bold tracking-tight truncate max-w-[320px]" style={{ color: 'var(--text)' }}>{d.name}</span>
                </div>
            ),
        },
        {
            key: 'company', header: "Firma", width: '220px', mobile: 'meta',
            sortValue: d => d.companyName ?? '',
            cell: d => <span className="text-xs font-bold tracking-tight" style={{ color: 'var(--text-secondary)' }}>{d.companyName}</span>,
        },
        {
            key: 'date', header: t.date, align: 'center', width: '120px',
            sortValue: d => d.uploadedAt,
            exportValue: d => d.uploadedAt.slice(0, 10),
            cell: d => <span className="text-meta font-bold tabular-nums font-mono" style={{ color: 'var(--text-secondary)' }}>{d.uploadedAt.slice(0, 10)}</span>,
        },
        {
            key: 'actions', header: "Amallar", align: 'right', width: '130px',
            cell: d => (
                <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                    <a href={d.filePath} target="_blank" rel="noopener noreferrer" className="icon-btn-sm icon-btn-accent rounded-lg" style={{ color: 'var(--accent-blue)' }} aria-label="Ochish">
                        <ExternalLink size={15} />
                    </a>
                    {canEdit && (
                        <button onClick={() => handleDelete(d.id)} className="icon-btn-sm icon-btn-danger rounded-lg" style={{ color: 'var(--danger)' }} aria-label={t.delete}>
                            <Trash2 size={15} />
                        </button>
                    )}
                </div>
            ),
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [canEdit, t]);


    const handleDelete = async (id: string) => {
        if (!await confirm({ title: "Hujjat o'chirilsinmi?", description: "Hujjat ro'yxatdan olib tashlanadi.", confirmLabel: "O'chirish", tone: 'danger' })) return;
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
        icon={<FileText size={20} />}
        title="Hujjatlar"
        description="Firma hujjatlari arxivi"
      />
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
                {canEdit && (
                    <Button variant="primary" size="md" onClick={openNew} className="whitespace-nowrap">
                        <Plus size={16} />
                        <span>{lang === 'uz' ? 'Hujjat qo\'shish' : 'Добавить документ'}</span>
                    </Button>
                )}
                <div className="flex items-center justify-end">
                    <TableToolbar view={viewMode} onViewChange={setViewMode} />
                </div>
            </div>
            <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" : "hidden"}>
                {filtered.map((d) => (
                    <div key={d.id} className="dashboard-card p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--accent-blue-light)', color: 'var(--accent-blue)' }}><FileText size={18} /></div>
                        <div className="flex-1 min-w-0">
                            <div className="text-body font-bold tracking-tight truncate" style={{ color: 'var(--text)' }}>{d.name}</div>
                            <div className="text-meta font-bold uppercase tracking-tight mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{d.companyName} · <span className="font-mono">{d.uploadedAt.slice(0, 10)}</span></div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <a href={d.filePath} target="_blank" rel="noopener noreferrer" className="w-9 h-9 flex items-center justify-center rounded-lg" style={{ color: 'var(--accent-blue)', background: 'var(--accent-blue-light)' }} title={lang === 'uz' ? 'Ochish' : 'Открыть'}><ExternalLink size={15} /></a>
                            {canEdit && <button onClick={() => handleDelete(d.id)} className="icon-btn-sm" style={{ color: 'var(--danger)', background: 'var(--danger-bg)' }} title={t.delete} aria-label={t.delete}><Trash2 size={15} /></button>}
                        </div>
                    </div>
                ))}
                {filtered.length === 0 && (
                    <div className="dashboard-card p-5 text-center">
                        <FileText size={36} className="mx-auto mb-3 opacity-20" style={{ color: 'var(--text-muted)' }} />
                        <span className="text-meta font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? "Hujjatlar yo'q" : 'Нет документов'}</span>
                    </div>
                )}
            </div>

            {/* Table (desktop) */}
            <div className={viewMode === 'list' ? "dashboard-card overflow-hidden overflow-x-auto" : "hidden"}>
                <div className="overflow-x-auto scrollbar-hide">
                    <DataTable
                        caption="Hujjatlar ro'yxati"
                        rows={filtered}
                        columns={docColumns}
                        rowKey={d => d.id}
                        sortKey={table.sortKey}
                        sortDir={table.sortDir}
                        onToggleSort={table.toggleSort}
                        density={table.density}
                        page={table.page}
                        pageSize={pageSize}
                        onPageSizeChange={setPageSize}
                        onPageChange={table.setPage}
                        emptyIcon={<FileText size={36} />}
                        emptyTitle="Hujjatlar yo'q"
                    />
                </div>
            </div>

            {isModalOpen && canEdit && (
                <ModalLayer open={isModalOpen && canEdit} onClose={() => setIsModalOpen(false)} label="Yangi hujjat">
                    <div className="w-full max-w-lg shadow-2xl relative overflow-hidden dashboard-card !p-0">
                        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'var(--accent-blue)' }}></div>
                        <div className="px-6 py-5 flex justify-between items-center" style={{ borderBottom: '1px solid var(--card-border)' }}>
                            <h3 className="text-body font-bold" style={{ color: 'var(--text)' }}>{lang === 'uz' ? 'Yangi hujjat' : 'Новый документ'}</h3>
                            <button onClick={() => setIsModalOpen(false)} className="icon-btn-sm" style={{ color: 'var(--text-muted)', background: 'var(--input-bg)' }}>
                                <Plus size={20} className="rotate-45" />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 space-y-5">
                            <div className="space-y-2">
                                <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Firma' : 'Компания'}</label>
                                <div className="relative">
                                    <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" size={16} style={{ color: 'var(--text-muted)' }} />
                                    <select value={form.companyId} onChange={(e) => setForm(f => ({ ...f, companyId: e.target.value }))} required
                                        className="w-full rounded-lg pl-11 pr-4 py-3 text-xs font-bold outline-none tracking-tight"
                                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}>
                                        {companies.map(c => <option key={c.id} value={c.id}>{c.name.toUpperCase()}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Hujjat nomi' : 'Название'}</label>
                                <input type="text" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} required placeholder={lang === 'uz' ? 'MASALAN: SHARTNOMA 2026' : 'НАЗВАНИЕ'}
                                    className="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none tracking-tight"
                                    style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Havola (URL)' : 'Ссылка (URL)'}</label>
                                <input type="url" value={form.filePath} onChange={(e) => setForm(f => ({ ...f, filePath: e.target.value }))} required placeholder="https://..."
                                    className="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none tracking-tight"
                                    style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }} />
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

export default DocumentsModule;
