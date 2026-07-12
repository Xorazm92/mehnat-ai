"use client";

import React, { useState } from 'react';
import { Staff, Company, Language, OperationEntry } from '@/types';
import { translations } from '@/lib/translations';
import { ROLE_LABELS, ROLE_COLORS, type UserRole } from '@/lib/permissions';
import {
  UserPlus, Phone, Briefcase, Trash2, Edit3, X, Check, Search, Filter,
  ShieldCheck, Mail, IdCard, GraduationCap, CalendarDays, Building, KeyRound, Loader2,
} from 'lucide-react';

interface Props {
  staff: Staff[];
  companies: Company[];
  operations: OperationEntry[];
  lang: Language;
  onSave: (s: Staff) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onResetPassword?: (id: string, newPassword: string) => Promise<void>;
  onStaffSelect?: (s: Staff) => void;
}

const ROLE_OPTIONS: UserRole[] = [
  'super_admin', 'admin', 'chief_accountant', 'supervisor', 'accountant', 'bank_manager',
];

const STATUS_META: Record<string, { label: string; dot: string; c: string; bg: string }> = {
  active: { label: 'Faol', dot: 'bg-emerald-500', c: '#10b981', bg: 'rgba(16,185,129,.12)' },
  vacation: { label: "Ta'til", dot: 'bg-rose-500', c: '#f43f5e', bg: 'rgba(244,63,94,.12)' },
  sick: { label: 'Betob', dot: 'bg-amber-400', c: '#f59e0b', bg: 'rgba(245,158,11,.12)' },
};

const StaffModule: React.FC<Props> = ({ staff, companies, lang, onSave, onDelete, onResetPassword }) => {
  const t = translations[lang];
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<Partial<Staff>>({});
  const [newPassword, setNewPassword] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const isEditing = Boolean(form.id);

  const openAdd = () => { setForm({ status: 'active', role: 'accountant' }); setNewPassword(''); setIsAdding(true); };
  const openEdit = (person: Staff) => { setForm(person); setNewPassword(''); setIsAdding(true); };
  const closeForm = () => { setIsAdding(false); setForm({}); setNewPassword(''); };

  const filteredStaff = React.useMemo(() => {
    return staff.filter(person => {
      const matchSearch = (person.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (person.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (person.phone || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (person.pinfl || '').includes(searchTerm);
      const matchRole = roleFilter === 'all' || person.role === roleFilter;
      const matchStatus = statusFilter === 'all' || person.status === statusFilter || (statusFilter === 'active' && !person.status);
      return matchSearch && matchRole && matchStatus;
    });
  }, [staff, searchTerm, roleFilter, statusFilter]);

  const handleSave = async () => {
    if (!form.name || !form.role) {
      import('sonner').then(({ toast }) => toast.error("Iltimos, F.I.SH va lavozimni kiriting"));
      return;
    }
    if (!isEditing && !form.email?.trim()) {
      import('sonner').then(({ toast }) => toast.error("Email (login) kiritilishi shart"));
      return;
    }
    if (!isEditing && (!form.password || form.password.length < 6)) {
      import('sonner').then(({ toast }) => toast.error("Parol kamida 6 ta belgidan iborat bo'lishi kerak"));
      return;
    }
    if (form.pinfl && !/^\d{14}$/.test(form.pinfl)) {
      import('sonner').then(({ toast }) => toast.error("JSHSHIR 14 ta raqamdan iborat bo'lishi kerak"));
      return;
    }

    try {
      setIsSaving(true);
      await onSave({
        ...(form as Staff),
        id: form.id || '',
        avatarColor: form.avatarColor || '#2563eb',
      });
      // Tahrirlashda ixtiyoriy parol tiklash
      if (isEditing && newPassword && onResetPassword) {
        if (newPassword.length < 6) {
          import('sonner').then(({ toast }) => toast.error("Yangi parol kamida 6 ta belgi bo'lishi kerak"));
          setIsSaving(false);
          return;
        }
        await onResetPassword(form.id!, newPassword);
      }
      import('sonner').then(({ toast }) => toast.success(isEditing ? "Xodim yangilandi" : "Yangi xodim qo'shildi"));
      closeForm();
    } catch (e) {
      import('sonner').then(({ toast }) => toast.error(e instanceof Error ? e.message : "Xatolik yuz berdi"));
    } finally {
      setIsSaving(false);
    }
  };

  const set = (k: keyof Staff, v: unknown) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {/* Header */}
      <div className="dashboard-card p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md bg-gradient-to-br from-[var(--primary)] to-[var(--accent-blue-hover)]">
            <UserPlus size={24} />
          </div>
          <div>
            <h2 className="text-[15px] font-bold uppercase tracking-widest" style={{ color: 'var(--text)' }}>{t.staff}</h2>
            <p className="text-[11px] font-bold uppercase tracking-widest mt-1" style={{ color: 'var(--text-muted)' }}>
              {staff.length} ta xodim · {staff.filter(s => (s.status || 'active') === 'active').length} faol
            </p>
          </div>
        </div>
        <button
          onClick={openAdd}
          className="font-bold px-6 py-3 rounded-xl text-[12px] flex items-center justify-center gap-2 transition-all shadow-sm whitespace-nowrap uppercase tracking-widest hover:shadow-md"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--accent-blue-hover))', color: '#fff' }}
        >
          <UserPlus size={16} />
          {t.addStaff}
        </button>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-grow">
          <input
            type="text"
            className="w-full pl-12 pr-4 py-3.5 rounded-xl text-[12px] font-bold uppercase tracking-widest outline-none transition-all focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-20"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}
            placeholder="ISM, EMAIL, TELEFON YOKI JSHSHIR..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        </div>
        <div className="flex gap-4">
          <div className="relative">
            <select
              className="pl-12 pr-10 py-3.5 rounded-xl text-[11px] font-bold uppercase tracking-widest outline-none appearance-none min-w-[200px]"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="all">BARCHA LAVOZIMLAR</option>
              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{(ROLE_LABELS[r] || r).toUpperCase()}</option>)}
            </select>
            <Briefcase size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          </div>
          <div className="relative">
            <select
              className="pl-12 pr-10 py-3.5 rounded-xl text-[11px] font-bold uppercase tracking-widest outline-none appearance-none min-w-[170px]"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">BARCHA HOLATLAR</option>
              <option value="active">FAOL (ISHDA)</option>
              <option value="sick">BETOB / KASAL</option>
              <option value="vacation">MEHNAT TA&apos;TILIDA</option>
            </select>
            <Filter size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          </div>
        </div>
      </div>

      {/* ANKETA — kengaytirilgan forma */}
      {isAdding && (
        <div className="dashboard-card p-8 border-t-[4px] animate-fade-in" style={{ borderTopColor: 'var(--accent-blue)' }}>
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm border" style={{ background: 'var(--accent-blue-light)', borderColor: 'var(--accent-blue)', color: 'var(--accent-blue)' }}>
              <UserPlus size={22} />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest" style={{ color: 'var(--text)' }}>
                {isEditing ? 'Xodim anketasini tahrirlash' : "Yangi xodim anketasi"}
              </h3>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] mt-1" style={{ color: 'var(--text-muted)' }}>
                Barcha maydonlarni to&apos;ldiring
              </p>
            </div>
          </div>

          {/* 1. SHAXSIY */}
          <FormSection icon={IdCard} title="Shaxsiy ma'lumotlar">
            <Field label="F.I.SH *" icon={UserPlus}>
              <input className="erp-input" autoFocus placeholder="Masalan: Aliyev Ali Valiyevich" value={form.name || ''} onChange={e => set('name', e.target.value)} />
            </Field>
            <Field label="JSHSHIR (14 raqam)" icon={IdCard}>
              <input className="erp-input font-mono tracking-wider" placeholder="12345678901234" maxLength={14} value={form.pinfl || ''} onChange={e => set('pinfl', e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field label="Telefon" icon={Phone}>
              <input className="erp-input" placeholder="+998 90 123 45 67" value={form.phone || ''} onChange={e => set('phone', e.target.value)} />
            </Field>
            <Field label="Jinsi">
              <select className="erp-input" value={form.gender || ''} onChange={e => set('gender', e.target.value)}>
                <option value="">Tanlanmagan</option>
                <option value="erkak">Erkak</option>
                <option value="ayol">Ayol</option>
              </select>
            </Field>
            <Field label="Tug'ilgan sana" icon={CalendarDays}>
              <input type="date" className="erp-input" value={form.birthDate ? String(form.birthDate).slice(0, 10) : ''} onChange={e => set('birthDate', e.target.value)} />
            </Field>
            <Field label="Ma'lumoti" icon={GraduationCap}>
              <select className="erp-input" value={form.education || ''} onChange={e => set('education', e.target.value)}>
                <option value="">Tanlanmagan</option>
                <option value="orta">O&apos;rta / O&apos;rta-maxsus</option>
                <option value="oliy">Oliy</option>
                <option value="magistratura">Magistratura</option>
              </select>
            </Field>
          </FormSection>

          {/* 2. LAVOZIM & LOGIN */}
          <FormSection icon={ShieldCheck} title="Lavozim va tizimga kirish">
            <Field label="Lavozim *" icon={Briefcase}>
              <select className="erp-input" value={form.role || ''} onChange={e => set('role', e.target.value)}>
                <option value="" disabled>Tanlang...</option>
                {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
              </select>
            </Field>
            <Field label="Bo'lim" icon={Building}>
              <input className="erp-input" placeholder="Masalan: Buxgalteriya" value={form.department || ''} onChange={e => set('department', e.target.value)} />
            </Field>
            <Field label={isEditing ? 'Email (login) — o\'zgartirib bo\'lmaydi' : 'Email (login) *'} icon={Mail}>
              <input
                className="erp-input"
                type="email"
                placeholder="ism@asro.uz"
                value={form.email || ''}
                disabled={isEditing}
                style={isEditing ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
                onChange={e => set('email', e.target.value)}
              />
            </Field>
            {isEditing ? (
              <Field label="Yangi parol (ixtiyoriy — tiklash)" icon={KeyRound}>
                <input className="erp-input tracking-widest" type="password" placeholder="Bo'sh qoldiring — o'zgarmaydi" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
              </Field>
            ) : (
              <Field label="Parol *" icon={KeyRound}>
                <input className="erp-input tracking-widest" type="password" placeholder="Kamida 6 ta belgi" value={form.password || ''} onChange={e => set('password', e.target.value)} />
              </Field>
            )}
          </FormSection>

          {/* 3. ISH SHARTI */}
          <FormSection icon={CalendarDays} title="Ish sharti">
            <Field label="Ishga kirgan sana" icon={CalendarDays}>
              <input type="date" className="erp-input" value={form.hiredAt ? String(form.hiredAt).slice(0, 10) : ''} onChange={e => set('hiredAt', e.target.value)} />
            </Field>
            <Field label="Holati">
              <select className="erp-input" value={form.status || 'active'} onChange={e => set('status', e.target.value)}>
                <option value="active">Faol (ishda)</option>
                <option value="vacation">Mehnat ta&apos;tilida</option>
                <option value="sick">Betob / kasal</option>
              </select>
            </Field>
            <Field label="Avatar rangi">
              <div className="flex items-center gap-3">
                <input type="color" className="w-12 h-11 rounded-lg cursor-pointer border" style={{ borderColor: 'var(--card-border)', background: 'var(--input-bg)' }} value={form.avatarColor || '#2563eb'} onChange={e => set('avatarColor', e.target.value)} />
                <span className="text-[12px] font-mono" style={{ color: 'var(--text-muted)' }}>{form.avatarColor || '#2563eb'}</span>
              </div>
            </Field>
          </FormSection>

          {/* Actions */}
          <div className="flex gap-4 pt-8 mt-4 justify-end" style={{ borderTop: '1px solid var(--card-border)' }}>
            <button onClick={closeForm} className="px-8 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2" style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text-secondary)' }}>
              <X size={16} /> Bekor qilish
            </button>
            <button onClick={handleSave} disabled={isSaving} className={`px-10 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest flex items-center gap-3 shadow-md transition-all active:scale-95 ${isSaving ? 'opacity-70 cursor-not-allowed' : 'hover:shadow-lg'}`} style={{ background: 'linear-gradient(135deg, var(--primary), var(--accent-blue-hover))', color: 'white' }}>
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {isSaving ? 'SAQLANMOQDA...' : (isEditing ? 'YANGILASH' : "QO'SHISH")}
            </button>
          </div>
        </div>
      )}

      {/* STAFF TABLE */}
      <div className="dashboard-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[960px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
                <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Xodim</th>
                <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-widest text-center" style={{ color: 'var(--text-muted)' }}>Lavozim</th>
                <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Bo&apos;lim</th>
                <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Aloqa</th>
                <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-widest text-center" style={{ color: 'var(--text-muted)' }}>Firma</th>
                <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-widest text-center" style={{ color: 'var(--text-muted)' }}>Holat</th>
                <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-widest text-right" style={{ color: 'var(--text-muted)' }}>Boshqaruv</th>
              </tr>
            </thead>
            <tbody>
              {filteredStaff.map((person, i) => {
                const myCompanies = companies.filter(c => {
                  const cc = c as { accountantId?: string; accountantName?: string };
                  return cc.accountantId === person.id || cc.accountantName === person.name;
                });
                const status = person.status || 'active';
                const sm = STATUS_META[status] || STATUS_META.active;
                const roleColor = ROLE_COLORS[person.role as UserRole] || '#64748b';
                return (
                  <tr
                    key={person.id}
                    className="transition-colors group"
                    style={{ backgroundColor: i % 2 === 0 ? 'var(--card-bg)' : 'var(--input-bg)', borderBottom: '1px solid var(--card-border)' }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--table-row-hover)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = i % 2 === 0 ? 'var(--card-bg)' : 'var(--input-bg)'}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <div className="w-10 h-10 rounded-2xl shrink-0 flex items-center justify-center text-sm font-black text-white shadow-sm transition-transform group-hover:scale-110" style={{ backgroundColor: person.avatarColor || 'var(--accent-blue)' }}>
                            {person.name.charAt(0)}
                          </div>
                          <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 border-2 rounded-full ${sm.dot}`} style={{ borderColor: 'var(--card-bg)' }} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13px] font-black tracking-tight truncate" style={{ color: 'var(--text)' }}>{person.name}</div>
                          <div className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>{person.pinfl ? `JSHSHIR: ${person.pinfl}` : person.id.slice(0, 8)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg" style={{ color: roleColor, background: `${roleColor}1a`, border: `1px solid ${roleColor}40` }}>
                        {ROLE_LABELS[person.role as UserRole] || person.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[12px] font-bold" style={{ color: 'var(--text-secondary)' }}>{person.department || '—'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="text-[12px] font-bold tracking-tight" style={{ color: 'var(--text)' }}>{person.phone || '—'}</div>
                        <div className="text-[10px] font-bold truncate max-w-[180px]" style={{ color: 'var(--text-muted)' }}>{person.email || '—'}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center min-w-[36px] h-9 border text-[12px] font-black rounded-xl tabular-nums" style={{ background: 'var(--input-bg)', borderColor: 'var(--card-border)', color: 'var(--accent-blue)' }}>
                        {myCompanies.length}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg" style={{ color: sm.c, background: sm.bg }}>{sm.label}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(person)} className="w-9 h-9 flex items-center justify-center rounded-lg transition-all" style={{ color: 'var(--accent-blue)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-blue-light)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'} title="Tahrirlash">
                          <Edit3 size={16} />
                        </button>
                        <button onClick={() => { if (confirm(person.name + (t.confirmDelete || " ni o'chirasizmi?"))) onDelete(person.id); }} className="w-9 h-9 flex items-center justify-center rounded-lg transition-all" style={{ color: 'var(--danger)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--danger-bg)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'} title="O'chirish">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredStaff.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-8 py-20 text-center">
                    <Search size={40} className="mx-auto mb-4 opacity-20" style={{ color: 'var(--text-muted)' }} />
                    <span className="text-[11px] uppercase font-black tracking-[0.3em] opacity-50" style={{ color: 'var(--text-muted)' }}>MA&apos;LUMOT TOPILMADI</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── Kichik yordamchi komponentlar ─────────────────────────
function FormSection({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={15} style={{ color: 'var(--accent-blue)' }} />
        <span className="text-[11px] font-black uppercase tracking-[0.2em]" style={{ color: 'var(--text-secondary)' }}>{title}</span>
        <div className="flex-1 h-px ml-2" style={{ background: 'var(--card-border)' }} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">{children}</div>
    </div>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black uppercase tracking-widest ml-1 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
        {Icon && <Icon size={12} />} {label}
      </label>
      {children}
    </div>
  );
}

export default StaffModule;
