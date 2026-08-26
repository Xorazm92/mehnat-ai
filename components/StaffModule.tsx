"use client";

import React, { useState } from 'react';
import { useViewMode } from '@/hooks/useViewMode';
import { Staff, Company, Language, OperationEntry } from '@/types';
import { translations } from '@/lib/translations';
import { ROLE_LABELS, ROLE_COLORS, type UserRole } from '@/lib/permissions';
import { generateMemorablePassword } from '@/lib/passwordUtils';
import StaffDrawer from './StaffDrawer';
import {
  UserPlus, UserX, Phone, Briefcase, Edit3, X, Check, Search, Filter,
  ShieldCheck, Mail, IdCard, GraduationCap, CalendarDays, Building, KeyRound, Loader2,
  Eye, EyeOff, RefreshCw,
} from 'lucide-react';
import { TableToolbar } from "@/components/ui/TableToolbar";
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { DataTable, type DataColumn } from '@/components/ui/DataTable';
import { useTableState } from '@/hooks/useTableState';
import { exportRowsToCsv, exportRowsToExcel } from '@/lib/exportTable';
import { Button } from "@/components/ui/Button";
import { friendlyError } from "@/lib/actionError";

interface Props {
  staff: Staff[];
  companies: Company[];
  operations: OperationEntry[];
  lang: Language;
  onSave: (s: Staff) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onResetPassword?: (id: string, newPassword: string) => Promise<void>;
  onStaffSelect?: (s: Staff) => void;
  /**
   * Xodim QO'SHISH va FAOLSIZLANTIRISH mumkinmi.
   * Server sharti: `["super_admin", "admin"]` (server/users.ts).
   * Berilmasa `true` — mavjud chaqiruvlar buzilmasin.
   */
  canManageStaff?: boolean;
}

const ROLE_OPTIONS: UserRole[] = [
  'super_admin', 'admin', 'chief_accountant', 'supervisor', 'accountant', 'bank_manager',
];

const STATUS_META: Record<string, { label: string; dot: string; c: string; bg: string }> = {
  active: { label: 'Faol', dot: 'bg-[var(--success)]', c: 'var(--success)', bg: 'rgba(16,185,129,.12)' },
  vacation: { label: "Ta'til", dot: 'bg-[var(--danger)]', c: 'var(--danger)', bg: 'rgba(244,63,94,.12)' },
  sick: { label: 'Betob', dot: 'bg-[var(--warning)]', c: 'var(--warning)', bg: 'rgba(245,158,11,.12)' },
};

const StaffModule: React.FC<Props> = ({ staff, companies, lang, onSave, onDelete, onResetPassword, canManageStaff = true }) => {
  const confirm = useConfirm();
  const t = translations[lang];
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<Partial<Staff>>({});
  const [selected, setSelected] = useState<Staff | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  // Standart — RO'YXAT; tanlov brauzerda saqlanadi (hooks/useViewMode).
  const [viewMode, setViewMode] = useViewMode('xodimlar');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Qidiruv/saralash/filtr/sahifa — URL'da. Endi filtrlangan ko'rinishni
  // havola sifatida yuborish mumkin (avval hammasi faqat React state'da edi).
  const table = useTableState({
    ns: 'staff',
    defaultSortKey: 'name',
    defaultFilters: { role: 'all', status: 'all' },
  });
  const searchTerm = table.debouncedSearch;
  const roleFilter = table.filters.role;
  const statusFilter = table.filters.status;

  const newParamHandledRef = React.useRef(false);

  // URL'dan userId o'qish (masalan Buxgalterlar holati bo'limidan o'tganda),
  // hamda `?new=1` bilan to'g'ridan-to'g'ri "yangi xodim" formasini ochish
  // (Admin kabinetidagi "Yangi Xodim" tezkor havolasi shu yerga keladi).
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const uid = params.get('userId');
      if (uid && staff.length > 0 && !selected) {
        const u = staff.find(s => s.id === uid);
        if (u) setSelected(u);
      }
      // Bir martalik: `useAutoRefresh` har 15 soniyada `staff` propini yangilaydi
      // va bu effektni qayta ishga tushiradi. Qo'riqchisiz foydalanuvchi yopgan
      // forma har yangilanishda o'z-o'zidan qayta ochilib turardi.
      if (params.get('new') === '1' && !newParamHandledRef.current) {
        newParamHandledRef.current = true;
        setForm({ status: 'active', role: 'accountant' });
        setNewPassword('');
        setIsAdding(true);
      }
    }
  }, [staff]);

  const isEditing = Boolean(form.id);

  const openAdd = () => { setForm({ status: 'active', role: 'accountant' }); setNewPassword(''); setIsAdding(true); };
  const openEdit = (person: Staff) => { setForm(person); setNewPassword(''); setIsAdding(true); };
  const closeForm = () => { setIsAdding(false); setForm({}); setNewPassword(''); };

  /**
   * Har bir xodimga biriktirilgan firmalar soni — BIR MARTA hisoblanadi.
   * Avval bu har qatorda `companies.filter(...)` bilan qayta hisoblanardi:
   * 45 xodim × 212 firma ≈ 9500 ta taqqoslash, har renderda, va aynan shu
   * hisob karta ko'rinishida yana takrorlanardi.
   */
  const companyCountById = React.useMemo(() => {
    const byId = new Map<string, number>();
    const byName = new Map<string, number>();
    for (const c of companies) {
      const cc = c as { accountantId?: string; accountantName?: string };
      if (cc.accountantId) byId.set(cc.accountantId, (byId.get(cc.accountantId) ?? 0) + 1);
      else if (cc.accountantName) byName.set(cc.accountantName, (byName.get(cc.accountantName) ?? 0) + 1);
    }
    const out = new Map<string, number>();
    for (const p of staff) out.set(p.id, (byId.get(p.id) ?? 0) + (byName.get(p.name) ?? 0));
    return out;
  }, [companies, staff]);

  const filteredStaff = React.useMemo(() => {
    const q = searchTerm.toLowerCase();
    return staff.filter(person => {
      const matchSearch = !q ||
        (person.name || '').toLowerCase().includes(q) ||
        (person.email || '').toLowerCase().includes(q) ||
        (person.phone || '').toLowerCase().includes(q) ||
        (person.pinfl || '').includes(searchTerm);
      const matchRole = roleFilter === 'all' || person.role === roleFilter;
      const matchStatus = statusFilter === 'all' || person.status === statusFilter || (statusFilter === 'active' && !person.status);
      return matchSearch && matchRole && matchStatus;
    });
  }, [staff, searchTerm, roleFilter, statusFilter]);

  const staffColumns = React.useMemo<DataColumn<Staff>[]>(() => [
    {
      key: 'name',
      header: 'Xodim',
      sortValue: p => p.name,
      exportValue: p => p.name,
      cell: (person) => {
        const sm = STATUS_META[person.status || 'active'] || STATUS_META.active;
        return (
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-semibold text-white" style={{ backgroundColor: person.avatarColor || 'var(--accent-blue)' }}>
                {person.name.charAt(0)}
              </div>
              <div className={`absolute -bottom-1 -right-1 w-3 h-3 border-2 rounded-full ${sm.dot}`} style={{ borderColor: 'var(--card-bg)' }} />
            </div>
            <div className="min-w-0">
              <div className="text-body font-bold truncate" style={{ color: 'var(--text)' }}>{person.name}</div>
              {/* JSHSHIR bo'lmasa — HECH NARSA. Ilgari bu yerda ichki
                  identifikatorning sakkiz belgisi (`657913b3`) chizilardi:
                  foydalanuvchi uchun ma'nosiz, lekin ism ostidagi eng
                  qimmatli qatorni egallab turardi. */}
              {person.pinfl && (
                <div className="text-micro font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  JSHSHIR: {person.pinfl}
                </div>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'role',
      header: 'Lavozim',
      align: 'center',
      sortValue: p => ROLE_LABELS[p.role as UserRole] || p.role,
      cell: (person) => {
        const roleColor = ROLE_COLORS[person.role as UserRole] || 'var(--text-muted)';
        return (
          <span className="text-micro font-semibold uppercase tracking-widest px-2.5 py-1 rounded-lg whitespace-nowrap"
            style={{ color: roleColor, background: `${roleColor}1a`, border: `1px solid ${roleColor}40` }}>
            {ROLE_LABELS[person.role as UserRole] || person.role}
          </span>
        );
      },
    },
    {
      key: 'department',
      header: "Bo'lim",
      sortValue: p => p.department || '',
      cell: p => <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>{p.department || '—'}</span>,
    },
    {
      key: 'contact',
      header: 'Aloqa',
      sortValue: p => p.email || '',
      exportValue: p => `${p.phone || ''} ${p.email || ''}`.trim(),
      cell: p => (
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold" style={{ color: 'var(--text)' }}>{p.phone || '—'}</span>
          <span className="text-micro font-bold truncate max-w-[180px]" style={{ color: 'var(--text-muted)' }}>{p.email || '—'}</span>
        </div>
      ),
    },
    {
      key: 'companies',
      header: 'Firma',
      numeric: true,
      sortValue: p => companyCountById.get(p.id) ?? 0,
      cell: p => <span style={{ color: 'var(--accent-blue)', fontWeight: 700 }}>{companyCountById.get(p.id) ?? 0}</span>,
    },
    {
      key: 'status',
      header: 'Holat',
      align: 'center',
      sortValue: p => STATUS_META[p.status || 'active']?.label ?? '',
      cell: (person) => {
        const sm = STATUS_META[person.status || 'active'] || STATUS_META.active;
        return (
          <span className="text-micro font-semibold uppercase tracking-widest px-2.5 py-1 rounded-lg whitespace-nowrap"
            style={{ color: sm.c, background: sm.bg }}>{sm.label}</span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Boshqaruv',
      align: 'right',
      cell: (person) => (
        <div className="flex items-center justify-end gap-1.5">
          <button onClick={(e) => { e.stopPropagation(); openEdit(person); }} className="icon-btn-sm rounded-lg" style={{ color: 'var(--accent-blue)' }} aria-label={`${person.name} — tahrirlash`}>
            <Edit3 size={15} />
          </button>
          {/* IKONKA AMALGA MOS BO'LSIN. Bu tugma xodimni O'CHIRMAYDI —
              faolsizlantiradi ("Yozuvlari saqlanib qoladi" deb tasdiq
              oynasining o'zi aytadi). Axlat qutisi esa "ma'lumot yo'q
              qilinadi" degan va'da beradi: ikonka amaldan qattiqroq
              gapiradi va foydalanuvchini keraksiz ikkilanishga soladi. */}
          {canManageStaff && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (await confirm({ title: `${person.name} faolsizlantirilsinmi?`, description: "Xodim tizimga kira olmaydi. Yozuvlari saqlanib qoladi.", confirmLabel: "Faolsizlantirish", tone: 'danger' })) onDelete(person.id);
              }}
              className="icon-btn-sm rounded-lg" style={{ color: 'var(--danger)' }} aria-label={`${person.name} — faolsizlantirish`}>
              <UserX size={15} />
            </button>
          )}
        </div>
      ),
    },
  ], [companyCountById, confirm, onDelete, canManageStaff]);

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
      closeForm();
    } catch (e) {
      import('sonner').then(({ toast }) => toast.error(friendlyError(e, "Xatolik yuz berdi")));
    } finally {
      setIsSaving(false);
    }
  };

  const set = (k: keyof Staff, v: unknown) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {/* Header */}
      <div className="dashboard-card p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-md bg-gradient-to-br from-[var(--primary)] to-[var(--accent-blue-hover)]">
            <UserPlus size={24} />
          </div>
          <div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>{t.staff}</h2>
            <p className="text-meta font-bold uppercase tracking-widest mt-1" style={{ color: 'var(--text-muted)' }}>
              {staff.length} ta xodim · {staff.filter(s => (s.status || 'active') === 'active').length} faol
            </p>
          </div>
        </div>
        {canManageStaff && (
          <Button variant="primary" size="md" onClick={openAdd} className="whitespace-nowrap">
            <UserPlus size={16} />
            {t.addStaff}
          </Button>
        )}
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-grow">
          <input
            type="text"
            className="w-full pl-12 pr-4 py-3.5 rounded-xl text-xs font-bold outline-none transition-all focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-20"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}
            placeholder="ISM, EMAIL, TELEFON YOKI JSHSHIR..."
            value={table.search}
            onChange={(e) => table.setSearch(e.target.value)}
            aria-label="Xodimlarni qidirish"
          />
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <select
              className="w-full pl-12 pr-10 py-3.5 rounded-xl text-meta font-bold uppercase tracking-widest outline-none appearance-none sm:min-w-[200px]"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}
              value={roleFilter}
              onChange={(e) => table.setFilter('role', e.target.value)}
              aria-label="Lavozim bo'yicha filtr"
            >
              <option value="all">BARCHA LAVOZIMLAR</option>
              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{(ROLE_LABELS[r] || r).toUpperCase()}</option>)}
            </select>
            <Briefcase size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          </div>
          <div className="relative flex-1">
            <select
              className="w-full pl-12 pr-10 py-3.5 rounded-xl text-meta font-bold uppercase tracking-widest outline-none appearance-none sm:min-w-[170px]"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}
              value={statusFilter}
              onChange={(e) => table.setFilter('status', e.target.value)}
              aria-label="Holat bo'yicha filtr"
            >
              <option value="all">BARCHA HOLATLAR</option>
              <option value="active">FAOL (ISHDA)</option>
              <option value="sick">BETOB / KASAL</option>
              <option value="vacation">MEHNAT TA&apos;TILIDA</option>
            </select>
            <Filter size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          </div>
        </div>
        <div className="flex items-center justify-end">
          <TableToolbar
            view={viewMode}
            onViewChange={setViewMode}
            onExport={() => exportRowsToExcel(filteredStaff, staffColumns, `xodimlar_${new Date().toISOString().slice(0, 10)}`)}
          >
            <button
              type="button"
              onClick={() => exportRowsToCsv(filteredStaff, staffColumns, `xodimlar_${new Date().toISOString().slice(0, 10)}`)}
              className="font-bold px-3 py-2 rounded-xl text-meta uppercase tracking-widest shadow-sm"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
            >
              CSV
            </button>
            <button
              type="button"
              onClick={() => table.setDensity(table.density === 'compact' ? 'comfortable' : 'compact')}
              aria-pressed={table.density === 'compact'}
              className="font-bold px-3 py-2 rounded-xl text-meta uppercase tracking-widest shadow-sm"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
            >
              {table.density === 'compact' ? 'Zich' : 'Keng'}
            </button>
            {table.isDirty && (
              <button
                type="button"
                onClick={table.reset}
                className="font-bold px-3 py-2 rounded-xl text-meta uppercase tracking-widest shadow-sm"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--danger)' }}
              >
                Tozalash
              </button>
            )}
          </TableToolbar>
        </div>
      </div>

      {/* ANKETA — kengaytirilgan forma */}
      {isAdding && (
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
                <input type="color" className="w-12 h-11 rounded-lg cursor-pointer border" style={{ borderColor: 'var(--card-border)', background: 'var(--input-bg)' }} value={form.avatarColor || 'var(--brand)'} onChange={e => set('avatarColor', e.target.value)} />
                <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{form.avatarColor || 'var(--brand)'}</span>
              </div>
            </Field>
          </FormSection>

          {/* Actions */}
          <div className="flex gap-4 pt-8 mt-4 justify-end" style={{ borderTop: '1px solid var(--card-border)' }}>
            <button onClick={closeForm} className="px-8 py-3 rounded-xl text-meta font-semibold uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2" style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text-secondary)' }}>
              <X size={16} /> Bekor qilish
            </button>
            <button onClick={handleSave} disabled={isSaving} className={`px-10 py-3 rounded-xl font-semibold text-meta uppercase tracking-widest flex items-center gap-3 shadow-md transition-all active:scale-95 ${isSaving ? 'opacity-70 cursor-not-allowed' : 'hover:shadow-lg'}`} style={{ background: 'linear-gradient(135deg, var(--primary), var(--accent-blue-hover))', color: 'white' }}>
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {isSaving ? 'SAQLANMOQDA...' : (isEditing ? 'YANGILASH' : "QO'SHISH")}
            </button>
          </div>
        </div>
      )}

      {/* MOBIL KARTOCHKA RO'YXATI (kichik ekranlar) */}
      {/* Karta ko'rinishi — ATAYLAB unmount qilinadi. Avval `hidden` sinfi
          bilan yashirilardi, ya'ni React ikkala ko'rinishni ham quraverardi. */}
      {viewMode === 'grid' && (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredStaff.map((person) => {
          const myCompaniesCount = companyCountById.get(person.id) ?? 0;
          const status = person.status || 'active';
          const sm = STATUS_META[status] || STATUS_META.active;
          const roleColor = ROLE_COLORS[person.role as UserRole] || 'var(--text-muted)';
          return (
            <div key={person.id} onClick={() => setSelected(person)} className="dashboard-card p-4 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-transform">
              <div className="relative shrink-0">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-semibold text-white shadow-sm" style={{ backgroundColor: person.avatarColor || 'var(--accent-blue)' }}>
                  {person.name.charAt(0)}
                </div>
                <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 border-2 rounded-full ${sm.dot}`} style={{ borderColor: 'var(--card-bg)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold tracking-tight truncate" style={{ color: 'var(--text)' }}>{person.name}</span>
                  <span className="text-micro font-semibold uppercase tracking-widest px-2 py-0.5 rounded-lg" style={{ color: roleColor, background: `${roleColor}1a` }}>{ROLE_LABELS[person.role as UserRole] || person.role}</span>
                </div>
                <div className="text-meta font-bold mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{person.phone || person.email || '—'}</div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-micro font-semibold uppercase tracking-widest px-2 py-0.5 rounded-lg" style={{ color: sm.c, background: sm.bg }}>{sm.label}</span>
                  <span className="text-micro font-bold" style={{ color: 'var(--text-muted)' }}>{myCompaniesCount} firma</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <button onClick={(e) => { e.stopPropagation(); openEdit(person); }} className="icon-btn-sm" style={{ color: 'var(--accent-blue)', background: 'var(--accent-blue-light)' }} title="Tahrirlash">
                  <Edit3 size={15} />
                </button>
                {canManageStaff && (
                <button onClick={async (e) => { e.stopPropagation(); if (await confirm({ title: `${person.name} faolsizlantirilsinmi?`, description: "Xodim tizimga kira olmaydi. Yozuvlari saqlanib qoladi.", confirmLabel: "Faolsizlantirish", tone: 'danger' })) onDelete(person.id); }} className="icon-btn-sm" style={{ color: 'var(--danger)', background: 'var(--danger-bg)' }} aria-label={`${person.name} — faolsizlantirish`}>
                  <UserX size={15} />
                </button>
                )}
              </div>
            </div>
          );
        })}
        {filteredStaff.length === 0 && (
          <div className="dashboard-card p-5 text-center">
            <Search size={36} className="mx-auto mb-3 opacity-20" style={{ color: 'var(--text-muted)' }} />
            <span className="text-meta font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>MA&apos;LUMOT TOPILMADI</span>
          </div>
        )}
      </div>
      )}

      {/* STAFF TABLE (desktop) — DataTable platformasi */}
      {viewMode === 'list' && (
        <DataTable<Staff>
          caption="Xodimlar ro'yxati"
          rows={filteredStaff}
          columns={staffColumns}
          rowKey={p => p.id}
          sortKey={table.sortKey}
          sortDir={table.sortDir}
          onToggleSort={table.toggleSort}
          density={table.density}
          page={table.page}
          pageSize={50}
          onPageChange={table.setPage}
          selected={selectedIds}
          onSelectedChange={setSelectedIds}
          onRowClick={person => setSelected(person)}
          rowLabel={person => `${person.name} — kartochkani ochish`}
          emptyIcon={<Search size={36} />}
          emptyTitle="Xodim topilmadi"
          emptyDescription={table.isDirty ? "Qidiruv yoki filtrni o'zgartirib ko'ring." : undefined}
          bulkActions={(ids) => (
            <button
              type="button"
              onClick={async () => {
                const names = ids
                  .map(id => staff.find(p => p.id === id)?.name)
                  .filter(Boolean)
                  .slice(0, 3)
                  .join(', ');
                const ok = await confirm({
                  title: `${ids.length} ta xodim faolsizlantirilsinmi?`,
                  description: `${names}${ids.length > 3 ? ` va yana ${ids.length - 3} ta` : ''}. Ular tizimga kira olmaydi, yozuvlari saqlanib qoladi.`,
                  confirmLabel: 'Faolsizlantirish',
                  tone: 'danger',
                });
                if (!ok) return;
                for (const id of ids) await onDelete(id);
                setSelectedIds(new Set());
              }}
              className="text-meta font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg"
              style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}
            >
              Faolsizlantirish
            </button>
          )}
        />
      )}

      {/* XODIM DETAL DRAWER */}
      {selected && (
        <StaffDrawer
          person={selected}
          companies={companies}
          onClose={() => setSelected(null)}
          onEdit={(p) => { setSelected(null); openEdit(p); }}
          onResetPassword={onResetPassword}
        />
      )}
    </div>
  );
};

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
  const btn: React.CSSProperties = { background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text-secondary)' };
  return (
    <div className="flex items-center gap-2">
      <input
        className="erp-input tracking-wider font-mono"
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      <button type="button" onClick={onToggle} aria-label="Parolni ko'rsatish yoki yashirish" className="shrink-0 w-11 h-11 flex items-center justify-center rounded-lg transition-all" style={btn} title={show ? 'Yashirish' : "Ko'rsatish"}>
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
      <button type="button" onClick={onGenerate} aria-label="Yangi parol yaratish" className="shrink-0 w-11 h-11 flex items-center justify-center rounded-lg transition-all" style={btn} title="Parol yaratish">
        <RefreshCw size={15} />
      </button>
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

export default StaffModule;
