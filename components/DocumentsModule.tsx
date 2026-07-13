"use client";

import React, { useState, useMemo } from 'react';
import { Language, Company } from '@/types';
import { translations } from '@/lib/translations';
import { FileText, Plus, Search, Trash2, ExternalLink, Building2 } from 'lucide-react';
import { toast } from 'sonner';

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
    const t = translations[lang];
    const [searchTerm, setSearchTerm] = useState('');
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
            const message = err instanceof Error ? err.message : String(err);
            toast.error((lang === 'uz' ? 'Xatolik: ' : 'Ошибка: ') + message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm(lang === 'uz' ? "Hujjatni o'chirishni tasdiqlaysizmi?" : 'Удалить документ?')) return;
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
            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2" size={18} style={{ color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        placeholder="QIDIRISH..."
                        className="w-full rounded-xl py-3 pl-12 pr-4 text-[12px] font-bold uppercase tracking-widest outline-none transition-all focus:ring-2 focus:ring-[var(--accent-blue)] focus:ring-opacity-20"
                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                {canEdit && (
                    <button
                        onClick={openNew}
                        className="font-bold px-5 py-3 rounded-xl text-[12px] flex items-center justify-center gap-2 transition-all shadow-sm whitespace-nowrap uppercase tracking-widest hover:shadow-md text-white"
                        style={{ background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-blue-hover))' }}
                    >
                        <Plus size={16} />
                        <span>{lang === 'uz' ? 'Hujjat qo\'shish' : 'Добавить документ'}</span>
                    </button>
                )}
            </div>

            {/* Mobil kartochkalar (Hujjatlar) */}
            <div className="md:hidden space-y-3">
                {filtered.map((d) => (
                    <div key={d.id} className="dashboard-card p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--accent-blue-light)', color: 'var(--accent-blue)' }}><FileText size={18} /></div>
                        <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-bold tracking-tight truncate" style={{ color: 'var(--text)' }}>{d.name}</div>
                            <div className="text-[11px] font-bold uppercase tracking-tight mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{d.companyName} · <span className="font-mono">{d.uploadedAt.slice(0, 10)}</span></div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <a href={d.filePath} target="_blank" rel="noopener noreferrer" className="w-9 h-9 flex items-center justify-center rounded-lg" style={{ color: 'var(--accent-blue)', background: 'var(--accent-blue-light)' }} title={lang === 'uz' ? 'Ochish' : 'Открыть'}><ExternalLink size={15} /></a>
                            {canEdit && <button onClick={() => handleDelete(d.id)} className="w-9 h-9 flex items-center justify-center rounded-lg" style={{ color: 'var(--danger)', background: 'var(--danger-bg)' }} title={t.delete}><Trash2 size={15} /></button>}
                        </div>
                    </div>
                ))}
                {filtered.length === 0 && (
                    <div className="dashboard-card p-12 text-center">
                        <FileText size={36} className="mx-auto mb-3 opacity-20" style={{ color: 'var(--text-muted)' }} />
                        <span className="text-[11px] uppercase font-black tracking-[0.2em] opacity-50" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? "Hujjatlar yo'q" : 'Нет документов'}</span>
                    </div>
                )}
            </div>

            {/* Table (desktop) */}
            <div className="hidden md:block dashboard-card overflow-hidden">
                <div className="overflow-x-auto scrollbar-hide">
                    <table className="w-full text-left border-collapse min-w-[720px]">
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
                                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Hujjat nomi' : 'Название'}</th>
                                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest w-[220px]" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Firma' : 'Компания'}</th>
                                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-center w-[120px]" style={{ color: 'var(--text-muted)' }}>{t.date}</th>
                                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-right w-[130px]" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Amallar' : 'Действия'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((d, i) => (
                                <tr key={d.id} className="transition-colors group" style={{ backgroundColor: i % 2 === 0 ? 'var(--card-bg)' : 'var(--input-bg)', borderBottom: '1px solid var(--card-border)' }}>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--accent-blue-light)', color: 'var(--accent-blue)' }}>
                                                <FileText size={16} />
                                            </div>
                                            <span className="text-[13px] font-bold tracking-tight truncate max-w-[320px]" style={{ color: 'var(--text)' }}>{d.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-[12px] font-bold uppercase tracking-tight" style={{ color: 'var(--text-secondary)' }}>{d.companyName}</td>
                                    <td className="px-6 py-4 text-center text-[11px] font-bold tabular-nums font-mono" style={{ color: 'var(--text-secondary)' }}>{d.uploadedAt.slice(0, 10)}</td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <a href={d.filePath} target="_blank" rel="noopener noreferrer" className="w-8 h-8 flex items-center justify-center rounded-lg transition-all" style={{ color: 'var(--accent-blue)' }} title={lang === 'uz' ? 'Ochish' : 'Открыть'}>
                                                <ExternalLink size={16} />
                                            </a>
                                            {canEdit && (
                                                <button onClick={() => handleDelete(d.id)} className="w-8 h-8 flex items-center justify-center rounded-lg opacity-60 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--danger)' }} title={t.delete}>
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-6 py-24 text-center">
                                        <div className="flex flex-col items-center" style={{ color: 'var(--text-muted)' }}>
                                            <FileText size={48} className="mb-4 opacity-20" />
                                            <span className="text-[11px] uppercase font-bold tracking-[0.2em] opacity-60">{lang === 'uz' ? "Hujjatlar yo'q" : 'Нет документов'}</span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {isModalOpen && canEdit && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="w-full max-w-lg shadow-2xl relative overflow-hidden dashboard-card !p-0">
                        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'var(--accent-blue)' }}></div>
                        <div className="px-6 py-5 flex justify-between items-center" style={{ borderBottom: '1px solid var(--card-border)' }}>
                            <h3 className="text-[13px] font-bold uppercase tracking-widest" style={{ color: 'var(--text)' }}>{lang === 'uz' ? 'Yangi hujjat' : 'Новый документ'}</h3>
                            <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg" style={{ color: 'var(--text-muted)', background: 'var(--input-bg)' }}>
                                <Plus size={20} className="rotate-45" />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 space-y-5">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Firma' : 'Компания'}</label>
                                <div className="relative">
                                    <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" size={16} style={{ color: 'var(--text-muted)' }} />
                                    <select value={form.companyId} onChange={(e) => setForm(f => ({ ...f, companyId: e.target.value }))} required
                                        className="w-full rounded-lg pl-11 pr-4 py-3 text-[12px] font-bold outline-none uppercase tracking-tight"
                                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}>
                                        {companies.map(c => <option key={c.id} value={c.id}>{c.name.toUpperCase()}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Hujjat nomi' : 'Название'}</label>
                                <input type="text" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} required placeholder={lang === 'uz' ? 'MASALAN: SHARTNOMA 2026' : 'НАЗВАНИЕ'}
                                    className="w-full rounded-lg px-4 py-3 text-[12px] font-bold outline-none uppercase tracking-tight"
                                    style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Havola (URL)' : 'Ссылка (URL)'}</label>
                                <input type="url" value={form.filePath} onChange={(e) => setForm(f => ({ ...f, filePath: e.target.value }))} required placeholder="https://..."
                                    className="w-full rounded-lg px-4 py-3 text-[12px] font-bold outline-none tracking-tight"
                                    style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }} />
                            </div>
                            <div className="flex gap-3 pt-6 mt-6" style={{ borderTop: '1px solid var(--card-border)' }}>
                                <button type="button" onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-4 py-3 rounded-xl font-bold text-[11px] uppercase tracking-widest transition-all shadow-sm"
                                    style={{ background: 'var(--input-bg)', color: 'var(--text-secondary)', border: '1px solid var(--card-border)' }}>
                                    {t.cancel}
                                </button>
                                <button type="submit" disabled={isSaving}
                                    className="flex-1 px-4 py-3 rounded-xl font-bold text-[11px] text-white transition-all shadow-md hover:shadow-lg uppercase tracking-widest active:scale-95 disabled:opacity-60"
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

export default DocumentsModule;
