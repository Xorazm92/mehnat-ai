"use client";

import React, { useState } from 'react';
import { Language } from '@/types';
import { translations } from '@/lib/translations';
import { User, Phone, Building2, Lock, Save, ShieldCheck, Palette } from 'lucide-react';
import { toast } from 'sonner';

export interface ProfileData {
    id: string;
    fullName: string;
    email: string;
    phone?: string;
    department?: string;
    avatarColor?: string;
    role: string;
}

interface Props {
    profile: ProfileData;
    lang: Language;
    onSaveProfile: (data: { fullName: string; phone?: string; department?: string; avatarColor?: string }) => Promise<void>;
    onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const COLORS = ['#2563EB', '#7C3AED', '#DB2777', '#DC2626', '#EA580C', '#16A34A', '#0891B2', '#4F46E5'];

const SettingsModule: React.FC<Props> = ({ profile, lang, onSaveProfile, onChangePassword }) => {
    const t = translations[lang];
    const [tab, setTab] = useState<'profile' | 'security'>('profile');

    const [form, setForm] = useState({
        fullName: profile.fullName,
        phone: profile.phone || '',
        department: profile.department || '',
        avatarColor: profile.avatarColor || COLORS[0],
    });
    const [savingProfile, setSavingProfile] = useState(false);

    const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
    const [savingPw, setSavingPw] = useState(false);

    const saveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (savingProfile) return;
        setSavingProfile(true);
        try {
            await onSaveProfile({
                fullName: form.fullName,
                phone: form.phone || undefined,
                department: form.department || undefined,
                avatarColor: form.avatarColor,
            });
            toast.success(lang === 'uz' ? 'Profil saqlandi' : 'Профиль сохранён');
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            toast.error((lang === 'uz' ? 'Xatolik: ' : 'Ошибка: ') + message);
        } finally {
            setSavingProfile(false);
        }
    };

    const savePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (savingPw) return;
        if (pw.next.length < 6) {
            toast.error(lang === 'uz' ? 'Yangi parol kamida 6 belgidan iborat bo\'lsin' : 'Пароль минимум 6 символов');
            return;
        }
        if (pw.next !== pw.confirm) {
            toast.error(lang === 'uz' ? 'Parollar mos kelmadi' : 'Пароли не совпадают');
            return;
        }
        setSavingPw(true);
        try {
            await onChangePassword(pw.current, pw.next);
            toast.success(lang === 'uz' ? 'Parol o\'zgartirildi' : 'Пароль изменён');
            setPw({ current: '', next: '', confirm: '' });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            toast.error((lang === 'uz' ? 'Xatolik: ' : 'Ошибка: ') + message);
        } finally {
            setSavingPw(false);
        }
    };

    const inputStyle = { background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' } as React.CSSProperties;
    const inputClass = "w-full rounded-lg pl-11 pr-4 py-3 text-[12px] font-bold outline-none transition-all focus:ring-2 focus:ring-[var(--accent-blue)] focus:ring-opacity-20 tracking-tight";

    return (
        <div className="max-w-2xl mx-auto space-y-4 animate-fade-in pb-20">
            {/* Tabs */}
            <div className="flex items-center gap-2 p-1 rounded-xl w-fit" style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
                {([['profile', lang === 'uz' ? 'Profil' : 'Профиль'], ['security', lang === 'uz' ? 'Xavfsizlik' : 'Безопасность']] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setTab(key)}
                        className="px-5 py-2 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all flex items-center gap-2"
                        style={tab === key ? { background: 'var(--accent-blue)', color: '#fff' } : { color: 'var(--text-muted)' }}>
                        {key === 'profile' ? <User size={14} /> : <ShieldCheck size={14} />}
                        {label}
                    </button>
                ))}
            </div>

            {tab === 'profile' && (
                <form onSubmit={saveProfile} className="dashboard-card p-6 space-y-5">
                    <div className="flex items-center gap-4 pb-5" style={{ borderBottom: '1px solid var(--card-border)' }}>
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-lg font-black shrink-0" style={{ background: form.avatarColor }}>
                            {form.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h3 className="text-[14px] font-black uppercase tracking-tight" style={{ color: 'var(--text)' }}>{form.fullName}</h3>
                            <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{profile.email}</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'F.I.SH' : 'Ф.И.О'}</label>
                        <div className="relative">
                            <User className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" size={16} style={{ color: 'var(--text-muted)' }} />
                            <input type="text" value={form.fullName} onChange={(e) => setForm(f => ({ ...f, fullName: e.target.value }))} required className={inputClass} style={inputStyle} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{t.phone}</label>
                            <div className="relative">
                                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" size={16} style={{ color: 'var(--text-muted)' }} />
                                <input type="tel" value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} className={inputClass} style={inputStyle} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Bo\'lim' : 'Отдел'}</label>
                            <div className="relative">
                                <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" size={16} style={{ color: 'var(--text-muted)' }} />
                                <input type="text" value={form.department} onChange={(e) => setForm(f => ({ ...f, department: e.target.value }))} className={inputClass} style={inputStyle} />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}><Palette size={12} /> {lang === 'uz' ? 'Avatar rangi' : 'Цвет аватара'}</label>
                        <div className="flex flex-wrap gap-2">
                            {COLORS.map(c => (
                                <button key={c} type="button" onClick={() => setForm(f => ({ ...f, avatarColor: c }))}
                                    className="w-9 h-9 rounded-xl transition-all"
                                    style={{ background: c, outline: form.avatarColor === c ? '2px solid var(--text)' : 'none', outlineOffset: '2px' }} />
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-end pt-5" style={{ borderTop: '1px solid var(--card-border)' }}>
                        <button type="submit" disabled={savingProfile}
                            className="px-6 py-3 rounded-xl font-bold text-[11px] text-white transition-all shadow-md hover:shadow-lg uppercase tracking-widest active:scale-95 disabled:opacity-60 flex items-center gap-2"
                            style={{ background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-blue-hover))' }}>
                            <Save size={15} /> {savingProfile ? '...' : t.save}
                        </button>
                    </div>
                </form>
            )}

            {tab === 'security' && (
                <form onSubmit={savePassword} className="dashboard-card p-6 space-y-5">
                    <div className="pb-5" style={{ borderBottom: '1px solid var(--card-border)' }}>
                        <h3 className="text-[13px] font-bold uppercase tracking-widest" style={{ color: 'var(--text)' }}>{lang === 'uz' ? 'Parolni o\'zgartirish' : 'Смена пароля'}</h3>
                        <p className="text-[10px] font-bold uppercase tracking-widest mt-1" style={{ color: 'var(--text-muted)' }}>{lang === 'uz' ? 'Xavfsizlik uchun kuchli parol tanlang' : 'Выберите надёжный пароль'}</p>
                    </div>

                    {([['current', lang === 'uz' ? 'Hozirgi parol' : 'Текущий пароль'], ['next', lang === 'uz' ? 'Yangi parol' : 'Новый пароль'], ['confirm', lang === 'uz' ? 'Yangi parolni tasdiqlang' : 'Подтвердите пароль']] as const).map(([key, label]) => (
                        <div key={key} className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{label}</label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" size={16} style={{ color: 'var(--text-muted)' }} />
                                <input type="password" value={pw[key]} onChange={(e) => setPw(p => ({ ...p, [key]: e.target.value }))} required className={inputClass} style={inputStyle} />
                            </div>
                        </div>
                    ))}

                    <div className="flex justify-end pt-5" style={{ borderTop: '1px solid var(--card-border)' }}>
                        <button type="submit" disabled={savingPw}
                            className="px-6 py-3 rounded-xl font-bold text-[11px] text-white transition-all shadow-md hover:shadow-lg uppercase tracking-widest active:scale-95 disabled:opacity-60 flex items-center gap-2"
                            style={{ background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-blue-hover))' }}>
                            <ShieldCheck size={15} /> {savingPw ? '...' : (lang === 'uz' ? 'Yangilash' : 'Обновить')}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
};

export default SettingsModule;
