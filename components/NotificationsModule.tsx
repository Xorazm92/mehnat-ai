"use client";

import React, { useState } from 'react';
import { Language } from '@/types';
import { Bell, Check, CheckCheck, AlertTriangle, Info, TrendingUp, Clock, ExternalLink, Database, BarChart3, ListChecks, ArrowUpCircle, Receipt, MessageSquareWarning } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { friendlyError } from "@/lib/actionError";
import { formatUzDateTime } from "@/lib/platform/format";

export interface NotificationRecord {
    id: string;
    type: string; // deadline | status_change | kpi_alert | system | approval_request
    title: string;
    message: string;
    link?: string;
    isRead: boolean;
    createdAt: string;
    /** 'low' | 'normal' | 'high' | 'critical' — eskisida yo'q, shuning uchun ixtiyoriy. */
    priority?: string;
}

interface Props {
    notifications: NotificationRecord[];
    lang: Language;
    onMarkRead: (ids?: string[]) => Promise<void>;
}

// Sana `lib/platform/format.ts` orqali — AGENTS.md qoidasi.
//
// Ilgari bu yerda `Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Tashkent" })`
// turardi va izohi "server bilan mijozda bir xil" derdi. Vaqt mintaqasi
// qadalgani ROST, lekin yetarli emas: `ru-RU` NAQSHI ICU ma'lumotidan
// o'qiladi. `small-icu` bilan qurilgan Node'da faqat `en-US` bo'ladi va
// format jimgina unga tushadi — server "09/06/2026, 14:30", brauzer esa
// "06.09.2026, 14:30" chizadi. Bu — gidratatsiya nomuvofiqligi, ya'ni React
// butun daraxtni qayta chizadi (yoki prodda xato beradi).
//
// `formatUzDateTime` locale NOMLARIGA umuman tayanmaydi: `Intl` dan faqat
// RAQAMLI qismlarni o'qiydi (har ICU qurilishida bir xil) va oy nomini o'zi
// qo'yadi. Ustiga ekrandagi qolgan sanalar bilan bitta shaklga tushadi.
function formatCreatedAt(iso: string): string {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? "" : formatUzDateTime(d);
}

// Turi bu ro'yxatda bo'lmagan xabar kulrang qo'ng'iroq bilan chiziladi. Shu
// sababdan ro'yxat kod yozadigan HAR BIR turni qamrashi kerak — aks holda
// kunlik yig'ma (endi asosiy xabar) tizim xabari kabi ko'rinardi.
const TYPE_META: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
    deadline: { color: 'var(--warning)', bg: 'var(--warning-bg)', icon: <Clock size={16} /> },
    status_change: { color: 'var(--accent-blue)', bg: 'var(--accent-blue-light)', icon: <Info size={16} /> },
    kpi_alert: { color: 'var(--success)', bg: 'var(--success-bg)', icon: <TrendingUp size={16} /> },
    kpi_penalty_proposed: { color: 'var(--danger)', bg: 'var(--danger-bg)', icon: <TrendingUp size={16} /> },
    approval_request: { color: 'var(--danger)', bg: 'var(--danger-bg)', icon: <AlertTriangle size={16} /> },
    onec_base_request: { color: 'var(--accent-purple)', bg: 'var(--accent-blue-light)', icon: <Database size={16} /> },
    director_report: { color: 'var(--accent-blue)', bg: 'var(--accent-blue-light)', icon: <BarChart3 size={16} /> },
    // Kunlik yig'ma — majburiyatlar bo'yicha asosiy xabar.
    obligation_rollup: { color: 'var(--warning)', bg: 'var(--warning-bg)', icon: <ListChecks size={16} /> },
    // Eski qatorlar (sweep endi bularni yozmaydi, tarixda qoladi).
    obligation_reminder: { color: 'var(--warning)', bg: 'var(--warning-bg)', icon: <Clock size={16} /> },
    escalation_obligation: { color: 'var(--danger)', bg: 'var(--danger-bg)', icon: <ArrowUpCircle size={16} /> },
    escalation_question: { color: 'var(--danger)', bg: 'var(--danger-bg)', icon: <ArrowUpCircle size={16} /> },
    sla_warning: { color: 'var(--warning)', bg: 'var(--warning-bg)', icon: <MessageSquareWarning size={16} /> },
    payment_receipt: { color: 'var(--success)', bg: 'var(--success-bg)', icon: <Receipt size={16} /> },
    system: { color: 'var(--text-muted)', bg: 'var(--input-bg)', icon: <Bell size={16} /> },
};

/** `high`/`critical` — byudjet ularni hech qachon kechiktirmaydi; ro'yxatda ham ko'rinsin. */
const URGENT = new Set(['high', 'critical']);

const NotificationsModule: React.FC<Props> = ({ notifications, lang, onMarkRead }) => {
    const [filter, setFilter] = useState<'all' | 'unread'>('all');
    const [busy, setBusy] = useState(false);

    const list = notifications.filter(n => (filter === 'unread' ? !n.isRead : true));
    const unreadCount = notifications.filter(n => !n.isRead).length;

    const markAll = async () => {
        if (busy || unreadCount === 0) return;
        setBusy(true);
        try {
            await onMarkRead();
            toast.success(lang === 'uz' ? "Barchasi o'qildi deb belgilandi" : 'Все отмечены прочитанными');
        } catch (err) {
            const message = friendlyError(err);
            toast.error((lang === 'uz' ? 'Xatolik: ' : 'Ошибка: ') + message);
        } finally {
            setBusy(false);
        }
    };

    const markOne = async (id: string) => {
        try {
            await onMarkRead([id]);
        } catch (err) {
            const message = friendlyError(err);
            toast.error((lang === 'uz' ? 'Xatolik: ' : 'Ошибка: ') + message);
        }
    };

    return (
        <div className="space-y-4 animate-fade-in pb-20">
      <PageHeader
        icon={<Bell size={20} />}
        title="Xabarlar"
        description="Tizim bildirishnomalari va tasdiq so'rovlari"
      />
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-2 p-1 rounded-xl" style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
                    {(['all', 'unread'] as const).map(f => (
                        <Button variant="primary" size="md" key={f} onClick={() => setFilter(f)} style={filter === f ? { background: 'var(--accent-blue)', color: '#fff' } : { color: 'var(--text-muted)' }}>
                            {f === 'all' ? (lang === 'uz' ? 'Barchasi' : 'Все') : (lang === 'uz' ? 'O\'qilmagan' : 'Непрочитанные')}
                            {f === 'unread' && unreadCount > 0 && <span className="ml-1.5">({unreadCount})</span>}
                        </Button>
                    ))}
                </div>
                <button onClick={markAll} disabled={busy || unreadCount === 0}
                    className="font-bold px-5 py-2.5 rounded-xl text-meta flex items-center justify-center gap-2 transition-all uppercase tracking-widest disabled:opacity-40"
                    style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text-secondary)' }}>
                    <CheckCheck size={15} />
                    {lang === 'uz' ? 'Barchasini o\'qildi' : 'Прочитать всё'}
                </button>
            </div>

            <div className="space-y-2">
                {list.map(n => {
                    const meta = TYPE_META[n.type] || TYPE_META.system;
                    return (
                        <div key={n.id} className="dashboard-card p-4 flex items-start gap-4 transition-all"
                            style={{ borderLeft: n.isRead ? '3px solid transparent' : `3px solid ${meta.color}` }}>
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: meta.bg, color: meta.color }}>
                                {meta.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <h4 className="text-body font-bold tracking-tight" style={{ color: 'var(--text)' }}>{n.title}</h4>
                                    {!n.isRead && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.color }} />}
                                    {URGENT.has(n.priority ?? '') && (
                                        <span
                                            className="text-micro font-bold uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0"
                                            style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}
                                        >
                                            {lang === 'uz' ? 'Shoshilinch' : 'Срочно'}
                                        </span>
                                    )}
                                </div>
                                {/* Yig'ma matni ko'p qatorli (har majburiyat — alohida qator);
                                    `whitespace-pre-line` bo'lmasa hammasi bitta qatorga yopishardi. */}
                                <p className="text-xs font-medium mt-0.5 whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>{n.message}</p>
                                <div className="flex items-center gap-3 mt-2">
                                    <span className="text-micro font-bold uppercase tracking-widest tabular-nums" style={{ color: 'var(--text-muted)' }}>
                                        {formatCreatedAt(n.createdAt)}
                                    </span>
                                    {n.link && (
                                        <Link href={n.link} onClick={() => { if (!n.isRead) onMarkRead([n.id]); }} className="text-micro font-bold uppercase tracking-widest flex items-center gap-1" style={{ color: 'var(--accent-blue)' }}>
                                            <ExternalLink size={11} /> {lang === 'uz' ? 'Ochish' : 'Открыть'}
                                        </Link>
                                    )}
                                </div>
                            </div>
                            {!n.isRead && (
                                <button onClick={() => markOne(n.id)} className="icon-btn-sm shrink-0 transition-all" style={{ color: 'var(--success)' }} title={lang === 'uz' ? "O'qildi" : 'Прочитано'} aria-label={lang === 'uz' ? "O'qildi" : 'Прочитано'}>
                                    <Check size={16} />
                                </button>
                            )}
                        </div>
                    );
                })}
                {list.length === 0 && (
                    <div className="dashboard-card p-5 flex flex-col items-center" style={{ color: 'var(--text-muted)' }}>
                        <Bell size={48} className="mb-4 opacity-20" />
                        <span className="text-meta font-bold uppercase tracking-widest">{lang === 'uz' ? 'Xabarlar yo\'q' : 'Нет уведомлений'}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotificationsModule;
