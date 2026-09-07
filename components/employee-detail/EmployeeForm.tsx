"use client";

/**
 * XODIM ANKETASI — qo'shish va tahrirlash uchun YAGONA forma.
 *
 * Ilgari u `StaffModule` ichida, ro'yxat bilan bir faylda yashardi. Xodim
 * kartasi alohida sahifaga chiqqach ("Tahrirlash" tugmasi) forma IKKI joyda
 * kerak bo'ldi — nusxa ko'chirish o'rniga shu yerga ajratildi. Holat
 * (`form`, `isSaving`, yangi parol) formaning O'ZIDA: chaqiruvchi faqat
 * boshlang'ich qiymat beradi va saqlash natijasini kutadi.
 */

import React, { useState } from 'react';
import { Staff } from '@/types';
import { ROLE_LABELS, type UserRole } from '@/lib/platform/permissions';
import { generateMemorablePassword } from '@/lib/passwordUtils';
import {
  UserPlus, Phone, Briefcase, X, Check, ShieldCheck, Mail, IdCard,
  GraduationCap, CalendarDays, Building, KeyRound, Eye, EyeOff, RefreshCw,
} from 'lucide-react';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import AvatarUploader from '@/components/AvatarUploader';
import { DateField } from '@/components/ui/DateField';
import { friendlyError } from '@/lib/actionError';

const ROLE_OPTIONS: UserRole[] = [
  'super_admin', 'admin', 'chief_accountant', 'supervisor', 'accountant', 'bank_manager',
];

export interface EmployeeFormProps {
  /** Bo'sh obyekt — yangi xodim; `id` bo'lsa — tahrirlash. */
  initial: Partial<Staff>;
  onSave: (s: Staff) => Promise<void>;
  onResetPassword?: (id: string, newPassword: string) => Promise<void>;
  /** Bekor qilinganda VA muvaffaqiyatli saqlangandan keyin chaqiriladi. */
  onCancel: () => void;
}

export default function EmployeeForm({ initial, onSave, onResetPassword, onCancel }: EmployeeFormProps) {
  const [form, setForm] = useState<Partial<Staff>>(initial);
  const [isSaving, setIsSaving] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  const isEditing = Boolean(form.id);
  const set = (k: keyof Staff, v: unknown) => setForm(prev => ({ ...prev, [k]: v }));

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
        avatarColor: form.avatarColor || 'var(--brand)',
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
      const createdEmail = form.email;
      import('sonner').then(({ toast }) => {
        if (isEditing) {
          toast.success("Xodim yangilandi");
        } else {
          // Parol ATAYLAB ko'rsatilmaydi: uni administratorning o'zi shu formaga
          // kiritgan, ya'ni allaqachon biladi — ekranga qayta chiqarish hech qanday
          // ma'lumot bermaydi, faqat ochiq ofisda yelka ortidan o'qish xavfini yaratadi.
          toast.success("Yangi xodim qo'shildi", {
            description: `Login: ${createdEmail} — parolni xodimga alohida yetkazing`,
            duration: 8000,
          });
        }
      });
      onCancel();
    } catch (e) {
      import('sonner').then(({ toast }) => toast.error(friendlyError(e, "Xatolik yuz berdi")));
    } finally {
      setIsSaving(false);
    }
  };

  return (
      <div className="dashboard-card p-5 border-t-[4px] animate-fade-in" style={{ borderTopColor: 'var(--accent-blue)' }}>
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-sm border" style={{ background: 'var(--accent-blue-light)', borderColor: 'var(--accent-blue)', color: 'var(--accent-blue)' }}>
            <UserPlus size={22} />
          </div>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              {isEditing ? 'Xodim anketasini tahrirlash' : "Yangi xodim anketasi"}
            </h3>
            <p className="text-micro font-bold uppercase tracking-[0.2em] mt-1" style={{ color: 'var(--text-muted)' }}>
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
            <Select value={form.gender || ''} onChange={e => set('gender', e.target.value)}>
              <option value="">Tanlanmagan</option>
              <option value="erkak">Erkak</option>
              <option value="ayol">Ayol</option>
            </Select>
          </Field>
          <Field label="Tug'ilgan sana" icon={CalendarDays}>
            <DateField value={form.birthDate ? String(form.birthDate).slice(0, 10) : ''} onChange={v => set('birthDate', v)} />
          </Field>
          <Field label="Ma'lumoti" icon={GraduationCap}>
            <Select value={form.education || ''} onChange={e => set('education', e.target.value)}>
              <option value="">Tanlanmagan</option>
              <option value="orta">O&apos;rta / O&apos;rta-maxsus</option>
              <option value="oliy">Oliy</option>
              <option value="magistratura">Magistratura</option>
            </Select>
          </Field>
        </FormSection>

        {/* 2. LAVOZIM & LOGIN */}
        <FormSection icon={ShieldCheck} title="Lavozim va tizimga kirish">
          <Field label="Lavozim *" icon={Briefcase}>
            <Select value={form.role || ''} onChange={e => set('role', e.target.value)}>
              <option value="" disabled>Tanlang...</option>
              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
            </Select>
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
              <PasswordInput
                value={newPassword}
                onChange={setNewPassword}
                show={showPw}
                onToggle={() => setShowPw(s => !s)}
                onGenerate={() => { setNewPassword(generateMemorablePassword(form.name)); setShowPw(true); }}
                placeholder="Bo'sh qoldiring — o'zgarmaydi"
              />
            </Field>
          ) : (
            <Field label="Parol * (xodimga beriladi)" icon={KeyRound}>
              <PasswordInput
                value={form.password || ''}
                onChange={(v) => set('password', v)}
                show={showPw}
                onToggle={() => setShowPw(s => !s)}
                onGenerate={() => { set('password', generateMemorablePassword(form.name)); setShowPw(true); }}
                placeholder="Kamida 6 ta belgi — yoki yonidagi tugma bilan yarating"
              />
            </Field>
          )}
        </FormSection>

        {/* 3. ISH SHARTI */}
        <FormSection icon={CalendarDays} title="Ish sharti">
          <Field label="Ishga kirgan sana" icon={CalendarDays}>
            <DateField value={form.hiredAt ? String(form.hiredAt).slice(0, 10) : ''} onChange={v => set('hiredAt', v)} />
          </Field>
          <Field label="Holati">
            <Select value={form.status || 'active'} onChange={e => set('status', e.target.value)}>
              <option value="active">Faol (ishda)</option>
              <option value="vacation">Mehnat ta&apos;tilida</option>
              <option value="sick">Betob / kasal</option>
            </Select>
          </Field>
          <Field label="Avatar rangi">
            <div className="flex items-center gap-3">
              <input type="color" className="w-12 h-11 rounded-lg cursor-pointer border" style={{ borderColor: 'var(--card-border)', background: 'var(--input-bg)' }} value={form.avatarColor || 'var(--brand)'} onChange={e => set('avatarColor', e.target.value)} />
              <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{form.avatarColor || 'var(--brand)'}</span>
            </div>
          </Field>
          {/* Rasm YANGI xodimda chiqmaydi: uni yuklash uchun avval yozuv
              yaratilib, `id` olinishi kerak. Mavjud xodimda esa rasm shu
              yerdan qo'yiladi va rang faqat rasmsiz holat uchun qoladi. */}
          {form.id && (
            <Field label="Avatar rasmi">
              <AvatarUploader
                userId={form.id}
                name={form.name || '—'}
                color={form.avatarColor}
                avatarRef={form.avatarRef}
              />
            </Field>
          )}
        </FormSection>

        {/* Actions */}
        <div className="flex gap-4 pt-8 mt-4 justify-end" style={{ borderTop: '1px solid var(--card-border)' }}>
          <Button variant="secondary" size="md" onClick={onCancel} icon={<X size={16} />}>
            Bekor qilish
          </Button>
          <Button variant="primary" size="md" onClick={handleSave} loading={isSaving} icon={<Check size={16} />}>
            {isEditing ? 'Yangilash' : "Qo'shish"}
          </Button>
        </div>
      </div>
  );
}

// ─── Kichik yordamchi komponentlar ─────────────────────────
function FormSection({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={15} style={{ color: 'var(--accent-blue)' }} />
        <span className="text-meta font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--text-secondary)' }}>{title}</span>
        <div className="flex-1 h-px ml-2" style={{ background: 'var(--card-border)' }} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">{children}</div>
    </div>
  );
}

function PasswordInput({ value, onChange, show, onToggle, onGenerate, placeholder }: {
  value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void; onGenerate: () => void; placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        className="erp-input tracking-wider font-mono"
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      <Button
        variant="secondary"
        onClick={onToggle}
        aria-label="Parolni ko'rsatish yoki yashirish"
        title={show ? 'Yashirish' : "Ko'rsatish"}
        icon={show ? <EyeOff size={15} /> : <Eye size={15} />}
        className="shrink-0"
      />
      <Button
        variant="secondary"
        onClick={onGenerate}
        aria-label="Yangi parol yaratish"
        title="Parol yaratish"
        icon={<RefreshCw size={15} />}
        className="shrink-0"
      />
    </div>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-micro font-semibold uppercase tracking-widest ml-1 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
        {Icon && <Icon size={12} />} {label}
      </label>
      {children}
    </div>
  );
}
