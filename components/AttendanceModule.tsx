"use client";

import React, { useState, useMemo } from 'react';
import { useModalA11y } from '@/hooks/useModalA11y';
import { useViewMode } from '@/hooks/useViewMode';
import { Language, Staff } from '@/types';
import { translations } from '@/lib/translations';
import { Calendar, Plus, Search, Edit3, Trash2, CheckCircle2, XCircle, Clock, UserCheck, DownloadCloud } from 'lucide-react';
import { TableToolbar } from "@/components/ui/TableToolbar";
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { Badge, IdentityCell, TONE_COLORS, type BadgeTone } from "@/components/ui";
import { useTableState } from "@/hooks/useTableState";
import { usePageSize } from "@/hooks/usePageSize";
import { friendlyError } from "@/lib/actionError";
import { DateField } from './ui/DateField';

export interface AttendanceRecord {
    id: string;
    userId: string;
    userName: string;
    date: string;       // ISO
    status: string;     // present | absent | late | excused
    checkIn?: string;   // ISO or ''
    checkOut?: string;
    notes?: string;
    /** Kechikish uzrli deb tasdiqlanganmi — jarimaga kirmaydi. */
    lateExcused?: boolean;
    lateExcuseReason?: string;
}

interface Props {
    records: AttendanceRecord[];
    staff: Staff[];
    lang: Language;
    canEdit: boolean;
    /** Ko'rilayotgan oy, "YYYY-MM". */
    month: string;
    /** Yozuvi bor oylar, yangisidan eskisiga. */
    months: string[];
    onMonthChange: (month: string) => void;
    onSave: (data: {
        userId: string;
        date: string;
        status: string;
        checkIn?: string;
        checkOut?: string;
        notes?: string;
    }) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    /** Kechikkan kunni uzrli deb belgilash / belgini olish. */
    onExcuseLate?: (id: string, excused: boolean, reason?: string) => Promise<void>;
    onSyncEjurnal?: (date: string) => Promise<{ imported: number; total: number; unmatched: string[] }>;
}

const STATUS_META: Record<string, { labelUz: string; labelRu: string; tone: BadgeTone; icon: React.ReactNode }> = {
    present: { labelUz: 'Kelgan', labelRu: 'Пришёл', tone: 'success', icon: <CheckCircle2 size={14} /> },
    late: { labelUz: 'Kechikkan', labelRu: 'Опоздал', tone: 'warning', icon: <Clock size={14} /> },
    absent: { labelUz: 'Kelmagan', labelRu: 'Отсутствовал', tone: 'danger', icon: <XCircle size={14} /> },
    excused: { labelUz: 'Sababli', labelRu: 'Уважительно', tone: 'info', icon: <UserCheck size={14} /> },
};

const fmtTime = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toTimeString().slice(0, 5);
};

const MONTH_NAMES_UZ = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
    'Iyul', 'Avgust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];

/** "2026-08" → "2026 Avgust". Intl ishlatilmaydi — SSR bilan mos kelmaydi. */
const monthLabel = (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    return `${y} ${MONTH_NAMES_UZ[m - 1] ?? m}`;
};

const AttendanceModule: React.FC<Props> = ({ records, staff, lang, canEdit, month, months, onMonthChange, onSave, onDelete, onExcuseLate, onSyncEjurnal }) => {
    const table = useTableState({ ns: 'att', defaultSortKey: 'user' });
    const [pageSize, setPageSize] = usePageSize("attendance");
  const confirm = useConfirm();
    const t = translations[lang];
    const [isSyncing, setIsSyncing] = useState(false);

    const handleSyncEjurnal = async () => {
        if (!onSyncEjurnal) return;
        setIsSyncing(true);
        try {
            const res = await onSyncEjurnal(selectedDate);
            if (res.unmatched.length > 0) {
                toast.warning(`${res.imported}/${res.total} import qilindi. Topilmadi: ${res.unmatched.slice(0, 5).join(', ')}${res.unmatched.length > 5 ? '…' : ''}`);
            } else {
                toast.success(`${res.imported} ta davomat e-jurnaldan import qilindi`);
            }
        } catch (e) {
            toast.error(friendlyError(e));
        } finally {
            setIsSyncing(false);
        }
    };
    const [searchTerm, setSearchTerm] = useState('');
    // Standart — RO'YXAT; tanlov brauzerda saqlanadi (hooks/useViewMode).
    const [viewMode, setViewMode] = useViewMode('davomat');
    // Boshlang'ich sana — YOZUVI BOR eng oxirgi kun, bugun emas. Bugun uchun
    // davomat odatda hali kiritilmagan (e-jurnal importi kechroq bo'ladi), shu
    // sababli ekran har safar bo'sh ochilib "davomat yo'q" degan taassurot
    // qoldirardi — aslida ma'lumot bor, faqat boshqa kunda.
    const latestRecordDate = useMemo(() => {
        let latest = '';
        for (const r of records) {
            const day = r.date.slice(0, 10);
            if (day > latest) latest = day;
        }
        return latest;
    }, [records]);
    const [selectedDate, setSelectedDate] = useState(
        latestRecordDate || `${month}-01`,
    );

    // Oy almashsa tanlangan kun eski oyda qolib ketardi va ekran bo'sh
    // ko'rinardi. Yangi oyning yozuvi bor oxirgi kuniga o'tamiz.
    React.useEffect(() => {
        setSelectedDate(latestRecordDate || `${month}-01`);
    }, [month, latestRecordDate]);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // DIALOG XULQI — fokus tuzog'i, Escape, scroll qulfi, fokusni qaytarish.
    //
    // Bu oyna `fixed inset-0` bilan qo'lda yozilgan va DOM'da `role="dialog"`
    // umuman yo'q edi: ekran o'quvchi uni oyna deb e'lon qilmasdi, Tab esa
    // foydalanuvchini oyna ORTIDAGI sahifaga olib chiqib ketardi va u yerdan
    // klaviatura bilan qaytib bo'lmasdi. Tartib o'zgarmaydi — faqat xulq.
    const modalRef = useModalA11y<HTMLDivElement>({
        open: isModalOpen,
        onClose: () => setIsModalOpen(false),
    });
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
            const message = friendlyError(err);
            toast.error((lang === 'uz' ? 'Xatolik: ' : 'Ошибка: ') + message);
        } finally {
            setIsSaving(false);
        }
    };
    // Davomat yozuvida faqat `userId` bor — rasm havolasi esa xodimlar
    // ro'yxatida. Har katakda `staff.find()` qilish O(n·m) bo'lardi.
    const avatarRefById = useMemo(
        () => new Map(staff.map(p => [p.id, p.avatarRef ?? null])),
        [staff],
    );

    const attColumns = useMemo<DataColumn<typeof records[number]>[]>(() => [
        {
            key: 'user', header: 'Xodim',
            sortValue: r => r.userName ?? '',
            cell: r => (
                <IdentityCell
                    name={r.userName ?? '—'}
                    userId={r.userId}
                    avatarRef={avatarRefById.get(r.userId)}
                />
            ),
        },
        {
            key: 'status', header: t.status, width: '140px', mobile: 'status',
            sortValue: r => r.status ?? '',
            cell: r => {
                const meta = STATUS_META[r.status] || STATUS_META.present;
                return (
                    <span className="inline-flex items-center gap-1.5 flex-wrap">
                        <Badge tone={meta.tone} icon={meta.icon}>{meta.labelUz}</Badge>
                        {r.lateExcused && (
                            <span
                                title={r.lateExcuseReason || undefined}
                                className="inline-flex px-2 py-0.5 rounded-lg text-micro font-bold uppercase tracking-widest whitespace-nowrap"
                                style={{ background: 'var(--accent-blue-light)', color: 'var(--accent-blue)' }}
                            >
                                Uzrli
                            </span>
                        )}
                    </span>
                );
            },
        },
        {
            key: 'in', header: 'Kelish', align: 'center', width: '110px', numeric: true,
            sortValue: r => r.checkIn ?? '',
            exportValue: r => fmtTime(r.checkIn),
            cell: r => <span className="text-xs font-bold tabular-nums font-mono" style={{ color: 'var(--text-secondary)' }}>{fmtTime(r.checkIn)}</span>,
        },
        {
            key: 'out', header: 'Ketish', align: 'center', width: '110px', numeric: true,
            sortValue: r => r.checkOut ?? '',
            exportValue: r => fmtTime(r.checkOut),
            cell: r => <span className="text-xs font-bold tabular-nums font-mono" style={{ color: 'var(--text-secondary)' }}>{fmtTime(r.checkOut)}</span>,
        },
        {
            key: 'notes', header: t.comment,
            sortValue: r => r.notes ?? '',
            cell: r => <span className="text-xs font-bold truncate max-w-[240px] inline-block align-middle tracking-tight" style={{ color: 'var(--text)' }}>{r.notes || '—'}</span>,
        },
        {
            key: 'actions', header: 'Amallar', align: 'right', width: '100px', hidden: !canEdit,
            cell: r => (
                <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                    {/* Jarima faqat UZRSIZ kechikishga qo'yiladi (reglament) —
                        nazoratchi shu tugma bilan kunni jarimadan chiqaradi. */}
                    {onExcuseLate && r.status === 'late' && (
                        <button
                            onClick={() => handleExcuse(r)}
                            className="icon-btn-sm rounded-lg"
                            style={{ color: r.lateExcused ? 'var(--accent-blue)' : 'var(--text-muted)' }}
                            aria-label={r.lateExcused ? 'Uzrli belgisini olish' : 'Uzrli deb belgilash'}
                            title={r.lateExcused ? (r.lateExcuseReason || 'Uzrli') : 'Uzrli deb belgilash'}
                        >
                            <UserCheck size={15} />
                        </button>
                    )}
                    <button onClick={() => openEdit(r)} className="icon-btn-sm icon-btn-accent rounded-lg" style={{ color: 'var(--accent-blue)' }} aria-label={t.edit}><Edit3 size={15} /></button>
                    <button onClick={() => handleDelete(r.id)} className="icon-btn-sm icon-btn-danger rounded-lg" style={{ color: 'var(--danger)' }} aria-label={t.delete}><Trash2 size={15} /></button>
                </div>
            ),
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [t, canEdit, onExcuseLate]);

    /**
     * Uzrli belgisini qo'yish/olish. Qo'yishda sabab so'raladi — "nega
     * kechirildi" degan savol keyin javobsiz qolmasligi uchun; olishda esa
     * sabab tozalanadi (server ham shuni qiladi).
     */
    const handleExcuse = async (r: AttendanceRecord) => {
        if (!onExcuseLate) return;
        try {
            if (r.lateExcused) {
                await onExcuseLate(r.id, false);
                toast.success('Uzrli belgisi olindi');
                return;
            }
            const reason = window.prompt('Kechikish sababi (shifokor, xizmat safari, rahbar ruxsati...):', '');
            if (reason === null) return;
            await onExcuseLate(r.id, true, reason.trim() || undefined);
            toast.success('Uzrli deb belgilandi — jarimaga kirmaydi');
        } catch (e) {
            toast.error(friendlyError(e));
        }
    };


    const handleDelete = async (id: string) => {
        if (!await confirm({ title: "Yozuv o'chirilsinmi?", description: "Davomat yozuvi butunlay o'chiriladi.", confirmLabel: "O'chirish", tone: 'danger' })) return;
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
        icon={<Calendar size={20} />}
        title="Davomat"
        description="Xodimlar ish vaqti va yo'qliklar"
      />
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {(['present', 'late', 'absent', 'excused'] as const).map(key => {
                    const meta = STATUS_META[key];
                    return (
                        <div key={key} className="dashboard-card p-5 flex flex-col justify-between">
                            <div className="flex items-center gap-3 mb-3">
                                <div
                                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                                    style={{ background: TONE_COLORS[meta.tone].bg, color: TONE_COLORS[meta.tone].fg }}
                                >
                                    {meta.icon}
                                </div>
                                <span className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                                    {lang === 'uz' ? meta.labelUz : meta.labelRu}
                                </span>
                            </div>
                            <div className="text-3xl font-semibold tabular-nums leading-none" style={{ color: TONE_COLORS[meta.tone].fg }}>{stats[key]}</div>
                        </div>
                    );
                })}
            </div>

            {/* Controls */}
            <div className="flex flex-col md:flex-row gap-4">
                <select
                    value={month}
                    onChange={(e) => onMonthChange(e.target.value)}
                    className="rounded-xl py-3 px-4 text-xs font-bold outline-none transition-all focus:ring-2 focus:ring-[var(--accent-blue)] focus:ring-opacity-20"
                    style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}
                >
                    {/* Joriy oy ro'yxatda bo'lmasligi mumkin (hali yozuv yo'q) —
                        u holda ham tanlangan qiymat ko'rinib turishi kerak. */}
                    {(months.includes(month) ? months : [month, ...months]).map(m => (
                        <option key={m} value={m}>{monthLabel(m)}</option>
                    ))}
                </select>
                <div className="relative">
                    <DateField
                        className="w-auto"
                        value={selectedDate}
                        onChange={setSelectedDate}
                        inputClassName="rounded-xl py-3 px-4 text-xs font-bold outline-none transition-all focus:ring-2 focus:ring-[var(--accent-blue)] focus:ring-opacity-20"
                        inputStyle={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}
                    />
                </div>
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
                {canEdit && onSyncEjurnal && (
                    <button
                        onClick={handleSyncEjurnal}
                        aria-label="E-jurnaldan davomatni yuklash"
                        disabled={isSyncing}
                        className="font-bold px-5 py-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-sm whitespace-nowrap hover:shadow-md disabled:opacity-50"
                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--accent-blue)' }}
                        title="E-jurnaldan tanlangan kun davomatini yuklab olish"
                    >
                        <DownloadCloud size={16} />
                        <span>{isSyncing ? 'Yuklanmoqda…' : 'E-jurnaldan'}</span>
                    </button>
                )}
                {canEdit && (
                    <Button variant="primary" size="md" onClick={openNew} className="whitespace-nowrap">
                        <Plus size={16} />
                        <span>{lang === 'uz' ? 'Davomat qo\'shish' : 'Добавить'}</span>
                    </Button>
                )}
                <div className="flex items-center justify-end">
                    <TableToolbar view={viewMode} onViewChange={setViewMode} />
                </div>
            </div>
            <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" : "hidden"}>
                {dayRecords.map((r) => {
                    const meta = STATUS_META[r.status] || STATUS_META.present;
                    return (
                        <div key={r.id} className="dashboard-card p-4 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                                <IdentityCell
                                    name={r.userName ?? '—'}
                                    userId={r.userId}
                                    avatarRef={avatarRefById.get(r.userId)}
                                />
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                    <Badge tone={meta.tone} icon={meta.icon}>{lang === 'uz' ? meta.labelUz : meta.labelRu}</Badge>
                                    <span className="text-meta font-mono font-bold" style={{ color: 'var(--text-muted)' }}>{fmtTime(r.checkIn)} – {fmtTime(r.checkOut)}</span>
                                </div>
                                {r.notes && <div className="text-meta mt-1 truncate" style={{ color: 'var(--text-secondary)' }}>{r.notes}</div>}
                            </div>
                            {canEdit && (
                                <div className="flex flex-col gap-1.5 shrink-0">
                                    <button onClick={() => openEdit(r)} className="icon-btn-sm" style={{ color: 'var(--accent-blue)', background: 'var(--accent-blue-light)' }} title={t.edit} aria-label={t.edit}><Edit3 size={15} /></button>
                                    <button onClick={() => handleDelete(r.id)} className="icon-btn-sm" style={{ color: 'var(--danger)', background: 'var(--danger-bg)' }} title={t.delete} aria-label={t.delete}><Trash2 size={15} /></button>
                                </div>
                            )}
                        </div>
                    );
                })}
                {dayRecords.length === 0 && (
                    <div className="dashboard-card p-5 text-center">
                        <Calendar size={36} className="mx-auto mb-3 opacity-20" style={{ color: 'var(--text-muted)' }} />
                        <span className="text-meta font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? "Bu kun uchun davomat yo'q" : 'Нет записей'}</span>
                    </div>
                )}
            </div>

            {/* Table (desktop) */}
            <div className={viewMode === 'list' ? "dashboard-card overflow-hidden overflow-x-auto" : "hidden"}>
                <div className="overflow-x-auto scrollbar-hide">
                    <DataTable
                        caption="Davomat yozuvlari"
                        rows={dayRecords}
                        columns={attColumns}
                        rowKey={r => r.id}
                        sortKey={table.sortKey}
                        sortDir={table.sortDir}
                        onToggleSort={table.toggleSort}
                        density={table.density}
                        page={table.page}
                        pageSize={pageSize}
                        onPageSizeChange={setPageSize}
                        onPageChange={table.setPage}
                        emptyIcon={<Calendar size={36} />}
                        emptyTitle="Bu kun uchun yozuv yo'q"
                    />
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && canEdit && (
                <div
                    // `Modal` bu yerda ishlatilmaydi: u o'z sarlavhasi va ichki
                    // bo'shlig'ini qo'shadi, bu oyna esa o'z yuqori rangli
                    // chizig'i va tartibiga ega. Shu sababdan tartib qo'lda
                    // qoladi, XULQ esa `useModalA11y` dan olinadi — hook aynan
                    // shu holat uchun yozilgan.
                    // eslint-disable-next-line no-restricted-syntax
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
                    onMouseDown={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}
                >
                    <div
                        ref={modalRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Davomat oynasi"
                        tabIndex={-1}
                        className="w-full max-w-lg shadow-2xl relative overflow-hidden dashboard-card !p-0 outline-none"
                    >
                        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'var(--accent-blue)' }}></div>
                        <div className="px-6 py-5 flex justify-between items-center" style={{ borderBottom: '1px solid var(--card-border)' }}>
                            <h3 className="text-body font-bold" style={{ color: 'var(--text)' }}>{lang === 'uz' ? 'Davomat yozuvi' : 'Запись посещаемости'}</h3>
                            <button onClick={() => setIsModalOpen(false)} className="icon-btn-sm" style={{ color: 'var(--text-muted)', background: 'var(--input-bg)' }}>
                                <Plus size={20} className="rotate-45" />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="space-y-2 md:col-span-2">
                                    <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Xodim' : 'Сотрудник'}</label>
                                    <select value={form.userId} onChange={(e) => setForm(f => ({ ...f, userId: e.target.value }))} required
                                        className="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none transition-all tracking-tight"
                                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}>
                                        {staff.map(s => <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{t.date}</label>
                                    <DateField value={form.date} onChange={(v) => setForm(f => ({ ...f, date: v }))} required
                                        inputClassName="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none tracking-tight"
                                        inputStyle={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }} />
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
                                <div className="space-y-2">
                                    <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Kelish vaqti' : 'Приход'}</label>
                                    <input type="time" value={form.checkIn} onChange={(e) => setForm(f => ({ ...f, checkIn: e.target.value }))}
                                        className="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none tracking-tight"
                                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Ketish vaqti' : 'Уход'}</label>
                                    <input type="time" value={form.checkOut} onChange={(e) => setForm(f => ({ ...f, checkOut: e.target.value }))}
                                        className="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none tracking-tight"
                                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }} />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{t.comment}</label>
                                    <input type="text" value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} placeholder={lang === 'uz' ? 'IXTIYORIY IZOH...' : 'КОММЕНТАРИЙ...'}
                                        className="w-full rounded-lg px-4 py-3 text-xs font-bold outline-none tracking-tight"
                                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }} />
                                </div>
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
                </div>
            )}
        </div>
    );
};

export default AttendanceModule;
