"use client";

import React, { useState, useMemo } from 'react';
import { Language, Staff } from '@/types';
import { translations } from '@/lib/translations';
import { Calendar, Plus, Search, Edit3, Trash2, CheckCircle2, XCircle, Clock, UserCheck } from 'lucide-react';
import { toast } from 'sonner';

export interface AttendanceRecord {
    id: string;
    userId: string;
    userName: string;
    date: string;       // ISO
    status: string;     // present | absent | late | excused
    checkIn?: string;   // ISO or ''
    checkOut?: string;
    notes?: string;
}

interface Props {
    records: AttendanceRecord[];
    staff: Staff[];
    lang: Language;
    canEdit: boolean;
    onSave: (data: {
        userId: string;
        date: string;
        status: string;
        checkIn?: string;
        checkOut?: string;
        notes?: string;
    }) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
}

const STATUS_META: Record<string, { labelUz: string; labelRu: string; color: string; bg: string; icon: React.ReactNode }> = {
    present: { labelUz: 'Kelgan', labelRu: 'Пришёл', color: 'var(--success)', bg: 'var(--success-bg)', icon: <CheckCircle2 size={14} /> },
    late: { labelUz: 'Kechikkan', labelRu: 'Опоздал', color: 'var(--warning)', bg: 'var(--warning-bg)', icon: <Clock size={14} /> },
    absent: { labelUz: 'Kelmagan', labelRu: 'Отсутствовал', color: 'var(--danger)', bg: 'var(--danger-bg)', icon: <XCircle size={14} /> },
    excused: { labelUz: 'Sababli', labelRu: 'Уважительно', color: 'var(--accent-blue)', bg: 'var(--accent-blue-light)', icon: <UserCheck size={14} /> },
};

const fmtTime = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toTimeString().slice(0, 5);
};

const AttendanceModule: React.FC<Props> = ({ records, staff, lang, canEdit, onSave, onDelete }) => {
    const t = translations[lang];
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState<{ id?: string; userId: string; date: string; status: string; checkIn: string; checkOut: string; notes: string }>({
        userId: '', date: selectedDate, status: 'present', checkIn: '', checkOut: '', notes: '',
    });

    const dayRecords = useMemo(() => {
        return records.filter(r => r.date.slice(0, 10) === selectedDate)
            .filter(r => r.userName.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [records, selectedDate, searchTerm]);

    const stats = useMemo(() => {
        const day = records.filter(r => r.date.slice(0, 10) === selectedDate);
        return {
            present: day.filter(r => r.status === 'present').length,
            late: day.filter(r => r.status === 'late').length,
            absent: day.filter(r => r.status === 'absent').length,
            excused: day.filter(r => r.status === 'excused').length,
        };
    }, [records, selectedDate]);

    const openNew = () => {
        setForm({ userId: staff[0]?.id || '', date: selectedDate, status: 'present', checkIn: '', checkOut: '', notes: '' });
        setIsModalOpen(true);
    };

    const openEdit = (r: AttendanceRecord) => {
        setForm({
            id: r.id,
            userId: r.userId,
            date: r.date.slice(0, 10),
            status: r.status,
            checkIn: fmtTime(r.checkIn) === '—' ? '' : fmtTime(r.checkIn),
            checkOut: fmtTime(r.checkOut) === '—' ? '' : fmtTime(r.checkOut),
            notes: r.notes || '',
        });
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSaving || !form.userId) return;
        setIsSaving(true);
        try {
            await onSave({
                userId: form.userId,
                date: form.date,
                status: form.status,
                checkIn: form.checkIn || undefined,
                checkOut: form.checkOut || undefined,
                notes: form.notes || undefined,
            });
            toast.success(lang === 'uz' ? 'Davomat saqlandi' : 'Посещаемость сохранена');
            setIsModalOpen(false);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            toast.error((lang === 'uz' ? 'Xatolik: ' : 'Ошибка: ') + message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm(lang === 'uz' ? "Yozuvni o'chirishni tasdiqlaysizmi?" : 'Удалить запись?')) return;
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
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {(['present', 'late', 'absent', 'excused'] as const).map(key => {
                    const meta = STATUS_META[key];
                    return (
                        <div key={key} className="dashboard-card p-5 flex flex-col justify-between">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: meta.bg, color: meta.color }}>
                                    {meta.icon}
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                                    {lang === 'uz' ? meta.labelUz : meta.labelRu}
                                </span>
                            </div>
                            <div className="text-3xl font-black tabular-nums leading-none" style={{ color: meta.color }}>{stats[key]}</div>
                        </div>
                    );
                })}
            </div>

            {/* Controls */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2" size={18} style={{ color: 'var(--text-muted)' }} />
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="rounded-xl py-3 pl-12 pr-4 text-[12px] font-bold uppercase tracking-widest outline-none transition-all focus:ring-2 focus:ring-[var(--accent-blue)] focus:ring-opacity-20"
                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}
                    />
                </div>
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
                        <span>{lang === 'uz' ? 'Davomat qo\'shish' : 'Добавить'}</span>
                    </button>
                )}
            </div>

            {/* Mobil kartochkalar (Davomat) */}
            <div className="md:hidden space-y-3">
                {dayRecords.map((r) => {
                    const meta = STATUS_META[r.status] || STATUS_META.present;
                    return (
                        <div key={r.id} className="dashboard-card p-4 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                                <div className="text-[13px] font-black uppercase tracking-tight truncate" style={{ color: 'var(--text)' }}>{r.userName}</div>
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest" style={{ background: meta.bg, color: meta.color }}>{meta.icon}{lang === 'uz' ? meta.labelUz : meta.labelRu}</span>
                                    <span className="text-[11px] font-mono font-bold" style={{ color: 'var(--text-muted)' }}>{fmtTime(r.checkIn)} – {fmtTime(r.checkOut)}</span>
                                </div>
                                {r.notes && <div className="text-[11px] mt-1 truncate" style={{ color: 'var(--text-secondary)' }}>{r.notes}</div>}
                            </div>
                            {canEdit && (
                                <div className="flex flex-col gap-1.5 shrink-0">
                                    <button onClick={() => openEdit(r)} className="w-9 h-9 flex items-center justify-center rounded-lg" style={{ color: 'var(--accent-blue)', background: 'var(--accent-blue-light)' }} title={t.edit}><Edit3 size={15} /></button>
                                    <button onClick={() => handleDelete(r.id)} className="w-9 h-9 flex items-center justify-center rounded-lg" style={{ color: 'var(--danger)', background: 'var(--danger-bg)' }} title={t.delete}><Trash2 size={15} /></button>
                                </div>
                            )}
                        </div>
                    );
                })}
                {dayRecords.length === 0 && (
                    <div className="dashboard-card p-12 text-center">
                        <Calendar size={36} className="mx-auto mb-3 opacity-20" style={{ color: 'var(--text-muted)' }} />
                        <span className="text-[11px] uppercase font-black tracking-[0.2em] opacity-50" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? "Bu kun uchun davomat yo'q" : 'Нет записей'}</span>
                    </div>
                )}
            </div>

            {/* Table (desktop) */}
            <div className="hidden md:block dashboard-card overflow-hidden">
                <div className="overflow-x-auto scrollbar-hide">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
                                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Xodim' : 'Сотрудник'}</th>
                                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest w-[140px]" style={{ color: 'var(--text-muted)' }}>{t.status}</th>
                                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-center w-[110px]" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Kelish' : 'Приход'}</th>
                                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-center w-[110px]" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Ketish' : 'Уход'}</th>
                                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{t.comment}</th>
                                {canEdit && <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-right w-[100px]" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Amallar' : 'Действия'}</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {dayRecords.map((r, i) => {
                                const meta = STATUS_META[r.status] || STATUS_META.present;
                                return (
                                    <tr key={r.id} className="transition-colors group" style={{ backgroundColor: i % 2 === 0 ? 'var(--card-bg)' : 'var(--input-bg)', borderBottom: '1px solid var(--card-border)' }}>
                                        <td className="px-6 py-4 text-[13px] font-bold uppercase tracking-tight" style={{ color: 'var(--text)' }}>{r.userName}</td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest" style={{ background: meta.bg, color: meta.color }}>
                                                {meta.icon}
                                                {lang === 'uz' ? meta.labelUz : meta.labelRu}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center text-[12px] font-bold tabular-nums font-mono" style={{ color: 'var(--text-secondary)' }}>{fmtTime(r.checkIn)}</td>
                                        <td className="px-6 py-4 text-center text-[12px] font-bold tabular-nums font-mono" style={{ color: 'var(--text-secondary)' }}>{fmtTime(r.checkOut)}</td>
                                        <td className="px-6 py-4 text-[12px] font-bold truncate max-w-[240px] tracking-tight" style={{ color: 'var(--text)' }}>{r.notes || '—'}</td>
                                        {canEdit && (
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => openEdit(r)} className="w-8 h-8 flex items-center justify-center rounded-lg" style={{ color: 'var(--accent-blue)' }} title={t.edit}>
                                                        <Edit3 size={16} />
                                                    </button>
                                                    <button onClick={() => handleDelete(r.id)} className="w-8 h-8 flex items-center justify-center rounded-lg" style={{ color: 'var(--danger)' }} title={t.delete}>
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                            {dayRecords.length === 0 && (
                                <tr>
                                    <td colSpan={canEdit ? 6 : 5} className="px-6 py-24 text-center">
                                        <div className="flex flex-col items-center" style={{ color: 'var(--text-muted)' }}>
                                            <Calendar size={48} className="mb-4 opacity-20" />
                                            <span className="text-[11px] uppercase font-bold tracking-[0.2em] opacity-60">{lang === 'uz' ? "Bu kun uchun davomat yo'q" : 'Нет записей за этот день'}</span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && canEdit && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="w-full max-w-lg shadow-2xl relative overflow-hidden dashboard-card !p-0">
                        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'var(--accent-blue)' }}></div>
                        <div className="px-6 py-5 flex justify-between items-center" style={{ borderBottom: '1px solid var(--card-border)' }}>
                            <h3 className="text-[13px] font-bold uppercase tracking-widest" style={{ color: 'var(--text)' }}>{lang === 'uz' ? 'Davomat yozuvi' : 'Запись посещаемости'}</h3>
                            <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg" style={{ color: 'var(--text-muted)', background: 'var(--input-bg)' }}>
                                <Plus size={20} className="rotate-45" />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="space-y-2 md:col-span-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Xodim' : 'Сотрудник'}</label>
                                    <select value={form.userId} onChange={(e) => setForm(f => ({ ...f, userId: e.target.value }))} required
                                        className="w-full rounded-lg px-4 py-3 text-[12px] font-bold outline-none transition-all uppercase tracking-tight"
                                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}>
                                        {staff.map(s => <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{t.date}</label>
                                    <input type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} required
                                        className="w-full rounded-lg px-4 py-3 text-[12px] font-bold outline-none uppercase tracking-tight"
                                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{t.status}</label>
                                    <select value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}
                                        className="w-full rounded-lg px-4 py-3 text-[12px] font-bold outline-none uppercase tracking-tight"
                                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}>
                                        {Object.entries(STATUS_META).map(([key, meta]) => (
                                            <option key={key} value={key}>{(lang === 'uz' ? meta.labelUz : meta.labelRu).toUpperCase()}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Kelish vaqti' : 'Приход'}</label>
                                    <input type="time" value={form.checkIn} onChange={(e) => setForm(f => ({ ...f, checkIn: e.target.value }))}
                                        className="w-full rounded-lg px-4 py-3 text-[12px] font-bold outline-none uppercase tracking-tight"
                                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Ketish vaqti' : 'Уход'}</label>
                                    <input type="time" value={form.checkOut} onChange={(e) => setForm(f => ({ ...f, checkOut: e.target.value }))}
                                        className="w-full rounded-lg px-4 py-3 text-[12px] font-bold outline-none uppercase tracking-tight"
                                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }} />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{t.comment}</label>
                                    <input type="text" value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} placeholder={lang === 'uz' ? 'IXTIYORIY IZOH...' : 'КОММЕНТАРИЙ...'}
                                        className="w-full rounded-lg px-4 py-3 text-[12px] font-bold outline-none uppercase tracking-tight"
                                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }} />
                                </div>
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

export default AttendanceModule;
