"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useViewMode } from '@/hooks/useViewMode';
import EmployeeForm from '@/components/employee-detail/EmployeeForm';
import { Staff, Company, Language, OperationEntry } from '@/types';
import { translations } from '@/lib/translations';
import { ROLE_LABELS, type UserRole } from '@/lib/platform/permissions';
import { UserPlus, UserX, Briefcase, Edit3, Search, Filter } from 'lucide-react';
import { TableToolbar } from "@/components/ui/TableToolbar";
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { DataTable, type DataColumn } from '@/components/ui/DataTable';
import { Avatar, Badge, IdentityCell, type BadgeTone } from '@/components/ui';
import { useTableState } from '@/hooks/useTableState';
import { usePageSize } from "@/hooks/usePageSize";
import { exportRowsToCsv, exportRowsToExcel } from '@/lib/exportTable';
import { Button } from "@/components/ui/Button";

interface Props {
  staff: Staff[];
  companies: Company[];
  operations: OperationEntry[];
  lang: Language;
  onSave: (s: Staff) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onResetPassword?: (id: string, newPassword: string) => Promise<void>;
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

const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: 'Faol', tone: 'success' },
  // Ta'til QIZIL edi — ya'ni "muammo" rangida. Ta'tilda bo'lish muammo emas,
  // bu shunchaki ma'lumot; qizil faqat harakat talab qiladigan holat uchun.
  vacation: { label: "Ta'til", tone: 'info' },
  sick: { label: 'Betob', tone: 'warning' },
};

const StaffModule: React.FC<Props> = ({ staff, companies, lang, onSave, onDelete, onResetPassword, canManageStaff = true }) => {
  const confirm = useConfirm();
  const router = useRouter();
  const t = translations[lang];
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<Partial<Staff>>({});
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
  const [pageSize, setPageSize] = usePageSize("staff");
  const searchTerm = table.debouncedSearch;
  const roleFilter = table.filters.role;
  const statusFilter = table.filters.status;

  const newParamHandledRef = React.useRef(false);

  // `?new=1` bilan to'g'ridan-to'g'ri "yangi xodim" formasini ochish
  // (Admin kabinetidagi "Yangi Xodim" tezkor havolasi shu yerga keladi).
  // Eski `?userId=` esa endi serverda `/staff/[id]` ga ko'chiriladi.
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      // Bir martalik: `useAutoRefresh` har 15 soniyada `staff` propini yangilaydi
      // va bu effektni qayta ishga tushiradi. Qo'riqchisiz foydalanuvchi yopgan
      // forma har yangilanishda o'z-o'zidan qayta ochilib turardi.
      if (params.get('new') === '1' && !newParamHandledRef.current) {
        newParamHandledRef.current = true;
        setForm({ status: 'active', role: 'accountant' });
        setIsAdding(true);
      }
    }
  }, [staff]);

  const openAdd = () => { setForm({ status: 'active', role: 'accountant' }); setIsAdding(true); };
  const openEdit = (person: Staff) => { setForm(person); setIsAdding(true); };
  const closeForm = () => { setIsAdding(false); setForm({}); };

  /** Xodim kartasi — alohida sahifa (`/staff/[id]`). */
  const openCard = (person: Staff) => router.push(`/staff/${person.id}`);

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
      // JSHSHIR bo'lmasa — HECH NARSA. Ilgari bu yerda ichki identifikatorning
      // sakkiz belgisi (`657913b3`) chizilardi: foydalanuvchi uchun ma'nosiz,
      // lekin ism ostidagi eng qimmatli qatorni egallab turardi.
      //
      // Avatar ustidagi holat nuqtasi ham olib tashlandi: xuddi shu holat
      // o'ng tomonda "Holat" ustunida MATNI bilan turadi, ya'ni nuqta bir xil
      // narsani ikkinchi marta, faqat rang bilan aytardi.
      // Ism HAQIQIY havola: butun qator ham bosiladi, lekin `onRowClick`
      // o'rta tugmani ham, "yangi oynada ochish" menyusini ham bermaydi —
      // xodim kartasini yonma-yon ochish esa kundalik ish (masalan oylik
      // hisoblashda uch kishini solishtirish).
      cell: (person) => (
        <Link
          href={`/staff/${person.id}`}
          onClick={(e) => e.stopPropagation()}
          className="block"
        >
          <IdentityCell
            name={person.name}
            color={person.avatarColor}
            userId={person.id}
            avatarRef={person.avatarRef}
            size="md"
            secondary={person.pinfl ? `JSHSHIR: ${person.pinfl}` : undefined}
          />
        </Link>
      ),
    },
    {
      key: 'role',
      header: 'Lavozim',
      align: 'center',
      mobile: 'meta',
      sortValue: p => ROLE_LABELS[p.role as UserRole] || p.role,
      // Lavozim HOLAT emas, tasnif — shuning uchun u endi rang tashimaydi.
      // Ilgari `ROLE_COLORS` dan olti xil rang (qizil/to'q sariq/binafsha/
      // ko'k/yashil/moviy) berilardi va jadvalda qizil "Super Admin" nishoni
      // qizil "muddati o'tgan" bilan bir xil shoshilinchlikda ko'rinardi.
      cell: (person) => (
        <span className="text-body" style={{ color: "var(--text-secondary)" }}>
          {ROLE_LABELS[person.role as UserRole] || person.role}
        </span>
      ),
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
      mobile: 'status',
      sortValue: p => STATUS_META[p.status || 'active']?.label ?? '',
      cell: (person) => {
        const sm = STATUS_META[person.status || 'active'] || STATUS_META.active;
        return <Badge tone={sm.tone} dot>{sm.label}</Badge>;
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

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {/* Header */}
      <div className="dashboard-card p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-md bg-gradient-to-br from-[var(--primary)] to-[var(--accent-blue-hover)]">
            <UserPlus size={24} />
          </div>
          <div>
            {/* `h1` — `/staff` sahifasining yagona sarlavhasi. */}
            <h1 className="text-sm font-bold" style={{ color: 'var(--text)' }}>{t.staff}</h1>
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
            {/*
              ISTISNO — `components/ui/Select` ga ko'chirilmaydi. Bu tanlagichda
              CHAP tomonda ikonka bor (`pl-12` + absolyut joylashgan ikonka), ya'ni
              boshlovchi ikonka sloti kerak. Butun ilovada bunday tanlagich ATIGI
              3 ta (shu fayl + `DocumentsModule`) — primitivga slot qo'shish uchun
              yetarli dalil emas (aks holda bitta joy uchun variant paydo bo'ladi).
              Qachonki bunday holat ko'paysa — primitivga `icon` sloti qo'shiladi,
              bu yerga to'rtinchi tanlagich uslubi YOZILMAYDI.
            */}
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

      {/* ANKETA — qo'shish/tahrirlash formasi.
          Forma `components/employee-detail/EmployeeForm.tsx` da: xodim kartasi
          sahifasidagi "Tahrirlash" ham AYNAN shu komponentni ochadi. */}
      {isAdding && (
        <EmployeeForm
          // KALIT — forma ochiq turganda boshqa xodim "Tahrirlash" ga
          // bosilsa, komponent QAYTA o'rnatilsin. Holat endi formaning
          // ichida (`useState(initial)`), ya'ni kalitsiz eski xodimning
          // qiymatlari ekranda qolib ketardi.
          key={form.id ?? 'new'}
          initial={form}
          onSave={onSave}
          onResetPassword={onResetPassword}
          onCancel={closeForm}
        />
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
          return (
            <div key={person.id} onClick={() => openCard(person)} className="dashboard-card p-4 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-transform">
              <Avatar name={person.name} color={person.avatarColor} userId={person.id} avatarRef={person.avatarRef} size="lg" className="shadow-sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold tracking-tight truncate" style={{ color: 'var(--text)' }}>{person.name}</span>
                  <Badge tone="neutral">{ROLE_LABELS[person.role as UserRole] || person.role}</Badge>
                </div>
                <div className="text-meta font-bold mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{person.phone || person.email || '—'}</div>
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge tone={sm.tone} dot>{sm.label}</Badge>
                  <span className="text-micro font-bold" style={{ color: 'var(--text-muted)' }}>{myCompaniesCount} firma</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <button onClick={(e) => { e.stopPropagation(); openEdit(person); }} className="icon-btn-sm" style={{ color: 'var(--accent-blue)', background: 'var(--accent-blue-light)' }} title="Tahrirlash" aria-label="Tahrirlash">
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
          pageSize={pageSize}
                        onPageSizeChange={setPageSize}
          onPageChange={table.setPage}
          selected={selectedIds}
          onSelectedChange={setSelectedIds}
          onRowClick={openCard}
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

    </div>
  );
};

export default StaffModule;
