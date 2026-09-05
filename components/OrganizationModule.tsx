"use client";
import React, { useState, useMemo, useCallback } from 'react';
import { ModalLayer } from '@/components/ui';
import { useViewMode } from '@/hooks/useViewMode';
import { Company, Staff, TaxType, Language, OperationEntry } from '@/types';
import { translations } from '@/lib/translations';
import { Plus, Search, Edit3, Trash2, LayoutGrid, List, Eye, EyeOff, Download, Filter, Building2, Calculator, Users } from 'lucide-react';
import { toast } from 'sonner';
import { writeSheet } from '@/lib/exportTable';
import OnboardingWizard from './OnboardingWizard';
import { MonthPicker } from './ui/MonthPicker';
import { periodsEqual } from '@/lib/periods';
import { formatNum } from "@/lib/platform/format";
import RiskBadge from './RiskBadge';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { DataTable, type DataColumn } from '@/components/ui/DataTable';
import { Badge, IdentityCell } from '@/components/ui';
import { usePageSize } from '@/hooks/usePageSize';
import { useTableState } from '@/hooks/useTableState';
import type { TariffPreset } from '@/lib/tariffPresets';
import { hiddenMatchOnly, matchesCompanySearch } from '@/lib/companySearch';
import { TAX_REGIME_SHORT, normalizeTaxRegime } from '@/lib/taxRegimes';
import { friendlyError } from '@/lib/actionError';

interface Props {
  companies: Company[];
  staff: Staff[];
  lang: Language;
  selectedPeriod: string;
  operations: OperationEntry[];
  onPeriodChange: (p: string) => void;
  onSave: (company: Partial<Company>, assignments?: any[]) => void;
  onDelete: (id: string) => void;
  onCompanySelect: (c: Company) => void;
  /** "Standart taqsimot" tugmasi qo'yadigan foizlar (admin sozlamalaridan). */
  tariffPreset?: TariffPreset;
  /** "Ichki shartnoma tomoni" variantlari — bazadagi o'z firmalarimiz. */
  internalContractors?: { id: string; name: string }[];
  /**
   * Og'zaki shartnoma tomonlari — plastik/naqd kanallari (mas'ul odami bilan).
   * Mijoz 10 ta firmamizdan biri bilan shartnoma tuzmagan holat uchun.
   */
  internalParties?: { id: string; label: string; type: string; employee?: { fullName: string } | null }[];
  /**
   * Firma YARATISH mumkinmi (server: admin yoki bosh buxgalter).
   * Berilmasa `true` — mavjud chaqiruvlar buzilmasin; yangi chaqiruvlar
   * uni ochiq-oydin uzatadi.
   */
  canCreate?: boolean;
  /** Firma O'CHIRISH mumkinmi (server: faqat admin). */
  canDelete?: boolean;
}

const OrganizationModule: React.FC<Props> = ({ companies, staff, lang, selectedPeriod, operations, onPeriodChange, onSave, onDelete, onCompanySelect, tariffPreset, internalContractors, internalParties, canCreate = true, canDelete = true }) => {
  const confirm = useConfirm();
  const t = translations[lang];
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Butun jadval holati URL'da: qidiruv, saralash, sahifa, zichlik va
  // sakkizta filtr. Endi "mana bu 12 ta firma" havolasini yuborish mumkin.
  const table = useTableState({
    ns: 'org',
    defaultSortKey: 'name',
    defaultFilters: {
      active: 'true', tax: 'all', status: 'all', emp: 'all',
      risk: 'all', server: 'all', itpark: 'all', kpi: 'all',
      // 'exclude' — standart, mijozlar ro'yxati (avvalgi xatti-harakat).
      // 'only'    — "Ichki firmalar": ASRO'ning o'z yuridik shaxslari,
      // ularga ham buxgalter/bank-klient biriktiriladi va ish shu yerda
      // bajariladi (aks holda biriktirilgan xodim ishini topa olmasdi).
      own: 'exclude',
    },
  });
  const search = table.search;
  const setSearch = table.setSearch;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingAssignments, setEditingAssignments] = useState<any[] | undefined>(undefined);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<Partial<Company>>({});

  // SEHRGAR OYNASI — a11y xulqi.
  //
  // Bu oyna `fixed inset-0` bilan qo'lda yozilgan va uning HECH QANDAY dialog
  // semantikasi yo'q edi: DOM'da `role="dialog"` topilmasdi, ya'ni ekran
  // o'quvchi uni oyna deb e'lon qilmasdi; fokus tuzog'i bo'lmagani uchun Tab
  // foydalanuvchini oyna ORTIDAGI sahifaga olib chiqib ketardi va u yerdan
  // klaviatura bilan qaytib bo'lmasdi; Escape ham ishlamasdi.
  //
  // Tartib o'zgarmaydi — `OnboardingWizard` o'z to'liq kengligini saqlaydi.
  // O'zgargani faqat XULQ: `useModalA11y` fokusni tuzoqqa oladi, Escape'ni
  // eshitadi, scroll'ni qulflaydi va yopilganda fokusni "Yangi qo'shish"
  // tugmasiga qaytaradi.
  const closeWizard = useCallback(() => {
    if (isSaving) return;
    setIsAdding(false);
    setEditingId(null);
    setForm({});
    setEditingAssignments(undefined);
  }, [isSaving]);

  // Standart — RO'YXAT; tanlov brauzerda saqlanadi (hooks/useViewMode).
  // Ilgari 'table' deb atalardi — endi qolgan ekranlar bilan bir xil nom.
  const [viewMode, setViewMode] = useViewMode('firmalar');
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  const filterActive: boolean | null =
    table.filters.active === 'all' ? null : table.filters.active === 'true';
  const setFilterActive = (v: boolean | null) =>
    table.setFilter('active', v === null ? 'all' : String(v));

  // Smart Filters
  const filterTaxType = table.filters.tax;
  const setFilterTaxType = (v: string) => table.setFilter('tax', v);
  const filterStatus = table.filters.status;
  const setFilterStatus = (v: string) => table.setFilter('status', v);
  const filterEmployee = table.filters.emp;
  const setFilterEmployee = (v: string) => table.setFilter('emp', v);
  const filterRisk = table.filters.risk;
  const setFilterRisk = (v: string) => table.setFilter('risk', v);
  const filterServer = table.filters.server;
  const setFilterServer = (v: string) => table.setFilter('server', v);
  const filterItPark = table.filters.itpark;
  const setFilterItPark = (v: string) => table.setFilter('itpark', v);
  const filterKpi = table.filters.kpi;
  const setFilterKpi = (v: string) => table.setFilter('kpi', v);
  const filterOwn = table.filters.own;
  const setFilterOwn = (v: string) => table.setFilter('own', v);
  const [showFilters, setShowFilters] = useState(false);

  const [itemsPerPage, setItemsPerPage] = usePageSize("organizations", 100);

  // Risk darajasi. Rang YOLG'IZ ma'no tashimasligi kerak (ACCESSIBILITY §A6),
  // shuning uchun har daraja shakl (to'la / yarim / bo'sh doira) va matnli
  // nom ham oladi — avval faqat rangli chiziq va emoji bor edi.
  const getRiskIndicator = (company: Company) => {
    const risk = company.riskLevel || 'low';
    if (risk === 'high' || company.companyStatus === 'problem' || company.companyStatus === 'debtor') {
      return { stripe: 'var(--danger)', verdict: 'verdict-red', label: 'Yuqori risk' };
    }
    if (risk === 'medium' || company.companyStatus === 'suspended') {
      return { stripe: 'var(--warning)', verdict: 'verdict-yellow', label: "O'rta risk" };
    }
    return { stripe: 'var(--success)', verdict: 'verdict-green', label: 'Past risk' };
  };

  /**
   * Tanlangan davr uchun operatsiyalar — companyId bo'yicha bir marta indekslanadi.
   * Avval `operations.find(o => o.companyId === c.id && periodsEqual(...))` har bir
   * firma uchun, filtrlashda VA renderda alohida chaqirilardi.
   */
  const opByCompany = useMemo(() => {
    const m = new Map<string, OperationEntry>();
    for (const o of operations) {
      if (periodsEqual(o.period, selectedPeriod)) m.set(o.companyId, o);
    }
    return m;
  }, [operations, selectedPeriod]);

  const filtered = useMemo(() => {
    return companies
      .filter(c => {
        // Qidiruv: nom / brend / STIR / direktor — mantiq lib/companySearch.ts da.
        // Brend ATAYLAB qo'shildi: u jadvalda chizilgani uchun moslik sababi
        // ko'rinib turadi (direktor esa ko'rinmaydi — pastda tushuntiriladi).
        const matchesSearch = matchesCompanySearch(c, table.debouncedSearch);

        // Active/Archive filter
        const matchesActive = filterActive === null || c.isActive === filterActive;

        // Tax type filter
        const matchesTax = filterTaxType === 'all' || c.taxType === filterTaxType;

        // Status filter
        const matchesStatus = filterStatus === 'all' || (c.companyStatus || 'active') === filterStatus;

        // Employee filter (accountant) - Use historical assignment for the selected period if available
        const op = opByCompany.get(c.id);
        const currentAccountantId = op?.assigned_accountant_id || c.accountantId;
        const matchesEmployee = filterEmployee === 'all' || currentAccountantId === filterEmployee;

        // Risk filter
        const matchesRisk = filterRisk === 'all' || (c.riskLevel || 'low') === filterRisk;

        // Server filter
        const matchesServer = filterServer === 'all' || c.serverInfo === filterServer;

        // IT Park filter
        const matchesItPark = filterItPark === 'all' || (filterItPark === 'yes' ? c.itParkResident : !c.itParkResident);

        // KPI filter
        const matchesKpi = filterKpi === 'all' || (filterKpi === 'yes' ? c.kpiEnabled : !c.kpiEnabled);

        // Ichki firma / mijoz. Standart ('exclude') — ASRO'ning o'z yuridik
        // shaxslari mijozlar ro'yxatida ko'rinmaydi (moliyaviy qoida:
        // isOwnFirm o'z-firma-ajratmasi). "Ichki firmalar" tabida esa
        // FAQAT ular ko'rinadi, boshqa hech qanday filtr (Faol/Arxiv/soliq)
        // qo'llanmaydi — ular sanoq jihatidan kam va alohida mantiqqa ega emas.
        const matchesOwn = filterOwn === 'only' ? Boolean(c.isOwnFirm) : !c.isOwnFirm;

        return matchesSearch && matchesActive && matchesTax && matchesStatus && matchesEmployee && matchesRisk && matchesServer && matchesItPark && matchesKpi && matchesOwn;
      });
  }, [companies, table.debouncedSearch, filterActive, filterTaxType, filterStatus, filterEmployee, filterRisk, filterServer, filterItPark, filterKpi, filterOwn, opByCompany]);

  // Kartochka ko'rinishi uchun sahifalash (jadvalni DataTable o'zi sahifalaydi).
  const paginated = useMemo(
    () => filtered.slice((table.page - 1) * itemsPerPage, table.page * itemsPerPage),
    [filtered, table.page, itemsPerPage]
  );

  const orgColumns = useMemo<DataColumn<Company>[]>(() => [
    {
      key: 'name', header: t.companyName, width: '260px', sticky: true,
      sortValue: c => c.name,
      cell: (c) => {
        const risk = getRiskIndicator(c);
        return (
          <div className="relative pl-3">
            {/* Risk chizig'i — rang YOLG'IZ ma'no tashimasin uchun matnli nom `title` da */}
            <div className="absolute left-0 top-0 bottom-0 w-1 rounded-full" style={{ background: risk.stripe }} title={risk.label} />
            <div className="truncate max-w-[210px] uppercase tracking-tight font-bold" title={c.name} style={{ color: 'var(--text)' }}>{c.name}</div>
            {c.brandName && <div className="text-micro font-bold truncate uppercase tracking-widest mt-0.5" style={{ color: 'var(--text-muted)' }}>{c.brandName}</div>}
            {/* MOSLIK SABABI. Qator faqat direktor ismi bo'yicha topilgan bo'lsa,
                jadvalda direktor ustuni yo'qligi uchun u "nega chiqdi?" degan
                savol tug'diradi — buxgalter buni o'xshashlik izlash deb o'yladi.
                Sabab shu yerda yoziladi. */}
            {hiddenMatchOnly(c, table.debouncedSearch) && (
              <div
                className="text-micro font-bold truncate mt-0.5"
                style={{ color: 'var(--accent-blue)' }}
                title={`Qidiruv direktor ismi bo'yicha topdi: ${c.directorName}`}
              >
                Direktor: {c.directorName}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'inn', header: t.inn, width: '110px', mobile: 'meta',
      sortValue: c => c.inn,
      cell: c => <span className="font-mono text-meta font-bold" style={{ color: 'var(--text-secondary)' }}>{c.inn}</span>,
    },
    {
      key: 'contract', header: 'Shartnoma', numeric: true, width: '140px',
      sortValue: c => Number(opByCompany.get(c.id)?.contract_amount ?? c.contractAmount ?? 0),
      exportValue: c => Number(opByCompany.get(c.id)?.contract_amount ?? c.contractAmount ?? 0),
      cell: (c) => {
        const amount = opByCompany.get(c.id)?.contract_amount ?? c.contractAmount;
        return (
          <span className="font-bold text-xs" style={{ color: 'var(--text)' }}>
            {formatNum(amount) || '0'} <span className="text-micro font-bold uppercase ml-0.5" style={{ color: 'var(--text-muted)' }}>sum</span>
          </span>
        );
      },
    },
    {
      key: 'taxType', header: 'Rejim', align: 'center', width: '110px', mobile: 'status',
      sortValue: c => c.taxType ?? '',
      cell: c => (
        <Badge tone={c.taxType?.includes('nds') ? 'info' : 'neutral'}>
          {TAX_REGIME_SHORT[normalizeTaxRegime(c.taxRegime ?? c.taxType)]}
        </Badge>
      ),
    },
    {
      key: 'accountant', header: 'Buxgalter', width: '170px',
      sortValue: c => opByCompany.get(c.id)?.assigned_accountant_name ?? c.accountantName ?? '',
      cell: (c) => {
        const fromMatrix = opByCompany.get(c.id)?.assigned_accountant_name;
        const name = fromMatrix ?? c.accountantName;
        // Rasm FAQAT firma yozuvidagi buxgalter ko'rsatilganda chiziladi.
        // Matritsadan kelgan ism boshqa odamniki bo'lishi mumkin va `id` u
        // bilan birga kelmaydi — o'shanda begona odamning rasmi chiqardi.
        const own = !fromMatrix || fromMatrix === c.accountantName;
        return name
          ? <IdentityCell name={name} userId={own ? c.accountantId : undefined} avatarRef={own ? c.accountantAvatarRef : undefined} />
          : <span style={{ color: 'var(--text-muted)' }}>—</span>;
      },
    },
    {
      key: 'supervisor', header: 'Nazoratchi', width: '160px',
      sortValue: c => opByCompany.get(c.id)?.assigned_supervisor_name ?? c.supervisorName ?? '',
      cell: (c) => {
        const fromMatrix = opByCompany.get(c.id)?.assigned_supervisor_name;
        const name = fromMatrix ?? c.supervisorName;
        const own = !fromMatrix || fromMatrix === c.supervisorName;
        return name
          ? <IdentityCell name={name} userId={own ? c.supervisorId : undefined} avatarRef={own ? c.supervisorAvatarRef : undefined} />
          : <span style={{ color: 'var(--text-muted)' }}>—</span>;
      },
    },
    {
      key: 'server', header: '1C server', width: '140px',
      sortValue: c => `${c.serverInfo ?? ''} ${c.serverName ?? ''}`.trim(),
      cell: c => (
        <div className="flex flex-col">
          {c.serverInfo && <span className="text-micro font-semibold uppercase tracking-widest leading-none mb-0.5" style={{ color: 'var(--success)' }}>{c.serverInfo}</span>}
          <span className="text-micro font-bold truncate uppercase tracking-tight" style={{ color: 'var(--text-muted)' }} title={c.serverName}>{c.serverName || '—'}</span>
        </div>
      ),
    },
    {
      key: 'actions', header: t.actions, align: 'center', width: '100px',
      cell: c => (
        <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
          <button onClick={() => onCompanySelect(c)} className="icon-btn-sm rounded-lg" style={{ color: 'var(--accent-blue)' }} aria-label={`${c.name} — batafsil`}><Eye size={13} /></button>
          <button onClick={() => startEdit(c)} className="icon-btn-sm rounded-lg" style={{ color: 'var(--accent-blue)' }} aria-label={`${c.name} — tahrirlash`}><Edit3 size={13} /></button>
          {canDelete && (
            <button onClick={() => handleDelete(c.id, c.name)} className="icon-btn-sm rounded-lg" style={{ color: 'var(--danger)' }} aria-label={`${c.name} — o'chirish`}><Trash2 size={13} /></button>
          )}
        </div>
      ),
    },
    // `debouncedSearch` — "Direktor: …" moslik sababi shu qiymatga bog'liq;
    // usiz qidiruv o'zgarganda ustun eski holatda qotib qolardi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, opByCompany, onCompanySelect, table.debouncedSearch]);


  const handleExport = async () => {
    try {
      // DIQQAT: Login/Parol ATAYLAB eksport qilinmaydi. Bular ASRO paroli emas —
      // mijozning soliq portali kredensiali. Shifrlanmagan .xlsx Downloads'da qoladi,
      // pochta orqali yuboriladi va xodim ishdan ketgach ham saqlanib qoladi.
      // Ommaviy kredensial kerak bo'lsa — alohida, audit yoziladigan,
      // super_admin'ga cheklangan amal orqali beriladi, fayl orqali emas.
      const headers = ['Nomi', 'INN', 'Buxgalter', 'Rejim', 'Ega'];
      const rows = filtered.map(c => [
        c.name,
        c.inn,
        c.accountantName,
        c.taxRegime,
        c.ownerName || ''
      ]);

      await writeSheet(headers, rows, 'tashkilotlar_export', 'Tashkilotlar');
      toast.success('Excel fayl yuklab olindi');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Export qilishda xatolik');
    }
  };

  const startEdit = async (c: Company) => {
    try {
      setForm(c);
      setEditingId(c.id);

      // Kompaniyaning amaldagi qiymatlaridan boshlang'ich assignments yasaymiz
      const defaultAssignments = [
        c.accountantSum
          ? { role: 'accountant', userId: c.accountantId || '', salaryType: 'fixed', salaryValue: Number(c.accountantSum) }
          : { role: 'accountant', userId: c.accountantId || '', salaryType: 'percent', salaryValue: Number(c.accountantPerc ?? 0) },
        c.chiefAccountantSum
          ? { role: 'chief_accountant', userId: c.chiefAccountantId || '', salaryType: 'fixed', salaryValue: Number(c.chiefAccountantSum) }
          : { role: 'chief_accountant', userId: c.chiefAccountantId || '', salaryType: 'percent', salaryValue: Number(c.chiefAccountantPerc ?? 0) },
        c.supervisorSum
          ? { role: 'controller', userId: c.supervisorId || '', salaryType: 'fixed', salaryValue: Number(c.supervisorSum) }
          : { role: 'controller', userId: c.supervisorId || '', salaryType: 'percent', salaryValue: Number(c.supervisorPerc ?? 0) },
        c.bankClientSum
          ? { role: 'bank_manager', userId: c.bankClientId || '', salaryType: 'fixed', salaryValue: Number(c.bankClientSum) }
          : { role: 'bank_manager', userId: c.bankClientId || '', salaryType: 'percent', salaryValue: Number(c.bankClientPerc ?? 0) }
      ];

      setEditingAssignments(defaultAssignments);
      setIsAdding(true);
    } catch (err: any) {
      console.error('[OrganizationModule] startEdit failed:', err);
      setIsAdding(true);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: `"${name}" firmasi o'chirilsinmi?`,
      description: "Firma ro'yxatdan olib tashlanadi. Bu amalni ortga qaytarib bo'lmaydi.",
      confirmLabel: "O'chirish",
      tone: 'danger',
    });
    if (ok) onDelete(id);
  };

  const handleSave = async (data?: Partial<Company>, assignments?: any[]) => {
    if (isSaving) return;

    // If called from OnboardingWizard, it passes data and assignments
    // If called from legacy handleSave (line 196), it uses state 'form'
    const finalData = data || form;

    if (finalData.name && finalData.inn) {
      setIsSaving(true);
      try {
        await onSave({ ...finalData, id: editingId || finalData.id }, assignments);
        setEditingId(null);
        setIsAdding(false);
        setForm({});
        setEditingAssignments(undefined);
        toast.success(editingId ? 'Firma tahrirlandi' : 'Yangi firma qo\'shildi');
      } catch (error: any) {
        console.error('[OrganizationModule] handleSave error:', error);
        toast.error(friendlyError(error, "Saqlashda xatolik yuz berdi. Qaytadan kiring yoki ruxsatni tekshiring."));
      } finally {
        setIsSaving(false);
      }
    } else {
      toast.error('Iltimos, barcha majburiy maydonlarni to\'ldiring');
    }
  };

  const togglePassword = (id: string) => {
    setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="w-full space-y-4 animate-fade-in pb-24 min-w-0">
      {/* Bo'sh ro'yxat XATO EMAS. Ilgari bu yerda qizil "yuklanmadi" banneri turardi,
          ya'ni hali firma qo'shilmagan yangi tizim ham, filtr hech narsa topmagan
          holat ham nosozlikdek ko'rinardi. Haqiqiy so'rov xatosi endi `error.tsx`
          ga chiqadi, bu yerda esa neytral holat ko'rsatiladi. */}
      {companies.length === 0 && (
        <div className="empty-state rounded-lg" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
          <Building2 size={32} style={{ color: 'var(--text-muted)', opacity: 0.35 }} />
          <p className="font-bold text-meta uppercase tracking-widest mt-3" style={{ color: 'var(--text-secondary)' }}>
            Hozircha firma yo&apos;q
          </p>
          <p className="text-body mt-1" style={{ color: 'var(--text-muted)' }}>
            Birinchi firmani qo&apos;shish uchun &laquo;Yangi firma&raquo; tugmasidan foydalaning.
          </p>
        </div>
      )}
      {/* Header Section */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center dashboard-card p-5 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0" style={{ background: 'var(--accent-blue)' }}>
            <Building2 size={24} />
          </div>
          <div className="min-w-0">
            {/* `h1`, `h2` EMAS: bu blok sahifaning O'Z sarlavhasi (ikonka +
                nom + firmalar soni), ya'ni hujjatning eng yuqori darajasi.
                `h2` bo'lgani uchun `/organizations` da `h1` UMUMAN yo'q edi —
                ekran o'quvchi va brauzer tuzilmani topa olmasdi.
                `PageHeader` shartnomasi: har sahifada AYNAN bitta `h1`. */}
            <h1 className="text-sm font-semibold tracking-wider truncate" style={{ color: 'var(--text)' }}>{t.organizations}</h1>
            <p className="text-meta font-bold uppercase tracking-widest mt-1" style={{ color: 'var(--text-muted)' }}>
              {t.totalFirms}: <span className="tabular-nums" style={{ color: 'var(--accent-blue)' }}>{filtered.length}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto">
          <div className="flex p-1 rounded-lg transition-colors" style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
            {[
              { label: 'Faol', value: true },
              { label: 'Arxiv', value: false },
              { label: 'Barchasi', value: null }
            ].map((opt) => (
              <button
                key={String(opt.value)}
                onClick={() => setFilterActive(opt.value)}
                className={`px-3 py-1.5 rounded-lg transition-all text-meta font-bold uppercase tracking-widest ${filterActive === opt.value ? 'shadow-sm' : ''}`}
                style={filterActive === opt.value ? { background: 'var(--card-bg)', color: 'var(--accent-blue)', border: '1px solid var(--card-border)' } : { color: 'var(--text-secondary)', border: '1px solid transparent' }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* ICHKI FIRMALAR — mijozlar ro'yxatidan alohida, chunki ASRO'ning
              o'z yuridik shaxslari qarzdorlik/payrollga aralashmasligi kerak
              (isOwnFirm ajratmasi). Lekin ularga ham buxgalter/bank-klient
              biriktiriladi va ish bajarilishi shart — shu tugma shu ishga yo'l. */}
          <button
            onClick={() => setFilterOwn(filterOwn === 'only' ? 'exclude' : 'only')}
            className="px-3 py-1.5 rounded-lg transition-all text-meta font-bold uppercase tracking-widest"
            style={filterOwn === 'only'
              ? { background: 'var(--card-bg)', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue)' }
              : { background: 'var(--input-bg)', color: 'var(--text-secondary)', border: '1px solid var(--card-border)' }}
            title="ASRO'ning o'z yuridik shaxslari — mijoz emas"
          >
            Ichki firmalar
          </button>

          <div className="flex p-1 rounded-lg transition-colors" style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'shadow-sm' : ''}`}
              style={viewMode === 'grid' ? { background: 'var(--card-bg)', color: 'var(--accent-blue)', border: '1px solid var(--card-border)' } : { color: 'var(--text-secondary)', border: '1px solid transparent' }}
              title={t.gridView} aria-label={t.gridView}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'shadow-sm' : ''}`}
              style={viewMode === 'list' ? { background: 'var(--card-bg)', color: 'var(--accent-blue)', border: '1px solid var(--card-border)' } : { color: 'var(--text-secondary)', border: '1px solid transparent' }}
              title={t.tableView} aria-label={t.tableView}
            >
              <List size={15} />
            </button>
          </div>

          <div className="h-8 w-px mx-1 hidden sm:block" style={{ background: 'var(--card-border)' }} />

          <MonthPicker
            selectedPeriod={selectedPeriod}
            onChange={onPeriodChange}
            className="h-9 text-body rounded-lg"
          />

          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="w-9 h-9 flex items-center justify-center rounded-lg transition-all icon-btn-accent"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text-secondary)' }}
              title="Excelga eksport" aria-label="Excelga eksport"
            >
              <Download size={16} />
            </button>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className="w-9 h-9 flex items-center justify-center rounded-lg transition-all icon-btn-accent"
              style={showFilters ? { background: 'var(--accent-blue-light)', border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)' } : { background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text-secondary)' }}
              title="Filtrlar" aria-label="Filtrlar"
            >
              <Filter size={16} />
            </button>
          </div>

          {canCreate && (
          <button
            /**
             * YANGI FIRMA — TOZA VARAQ, `id` SIZ.
             *
             * Ilgari bu yerda `id: Math.random()...` bilan SOXTA id qo'yilardi va
             * u butun oqimni buzardi: sehrgar `isEdit = Boolean(initialData.id)`
             * deb o'ylab, YANGI firma uchun majburiy tekshiruvlarni (buxgalter,
             * INN/JSHSHIR formati, plastik/naqd taqsimoti) O'TKAZIB YUBORARDI.
             * Server esa id ro'yxatda yo'qligi uchun yaratish yo'liga tushib,
             * "Buxgalter tanlanishi shart" deb 500 qaytarardi — foydalanuvchi
             * uchun sababsiz "server xatosi".
             *
             * `editingId` va `editingAssignments` ham tozalanadi: aks holda oldin
             * tahrirlangan firmaning jamoasi yangi firmaga meros qolardi.
             */
            onClick={() => {
              setEditingId(null);
              setEditingAssignments(undefined);
              setForm({ createdAt: new Date().toISOString(), isActive: true });
              setIsAdding(true);
            }}
            className="ai-button-glow flex items-center gap-2"
          >
            <Plus size={16} />
            <span className="uppercase tracking-widest text-meta">{t.addCompany}</span>
          </button>
          )}
        </div>
      </div>

      {/* Smart Filters Panel */}
      {showFilters && (
        <div className="dashboard-card p-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-4 pb-3" style={{ borderBottom: '1px solid var(--card-border)' }}>
            <Filter size={14} style={{ color: 'var(--accent-blue)' }} />
            <h3 className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text)' }}>Aqlli Filtrlar</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {[
              { label: 'Soliq Turi', value: filterTaxType, onChange: setFilterTaxType, options: [{ label: 'Barchasi', val: 'all' }, ...Object.values(TaxType).map(v => ({ label: v.toUpperCase(), val: v }))] },
              {
                label: 'Holati', value: filterStatus, onChange: setFilterStatus, options: [
                  { label: 'Barchasi', val: 'all' },
                  { label: 'Faol', val: 'active' },
                  { label: 'To\'xtatilgan', val: 'suspended' },
                  { label: 'Qarzdor', val: 'debtor' },
                  { label: 'Muammoli', val: 'problem' },
                  { label: 'Bankrot', val: 'bankrupt' }
                ]
              },
              { label: 'Buxgalter', value: filterEmployee, onChange: setFilterEmployee, options: [{ label: 'Barchasi', val: 'all' }, ...staff.map(s => ({ label: s.name, val: s.id }))] },
              {
                label: 'Xavf', value: filterRisk, onChange: setFilterRisk, options: [
                  { label: 'Barchasi', val: 'all' },
                  { label: 'Past', val: 'low' },
                  { label: "O'rta", val: 'medium' },
                  { label: 'Yuqori', val: 'high' }
                ]
              },
              { label: 'Server', value: filterServer, onChange: setFilterServer, options: [{ label: 'Barchasi', val: 'all' }, { label: 'CR1', val: 'CR1' }, { label: 'CR2', val: 'CR2' }, { label: 'CR3', val: 'CR3' }] },
              { label: 'IT Park', value: filterItPark, onChange: setFilterItPark, options: [{ label: 'Barchasi', val: 'all' }, { label: 'Rezident', val: 'yes' }, { label: 'No-Rezident', val: 'no' }] },
              { label: 'KPI', value: filterKpi, onChange: setFilterKpi, options: [{ label: 'Barchasi', val: 'all' }, { label: 'Yoqilgan', val: 'yes' }, { label: "O'chirilgan", val: 'no' }] }
            ].map((f, idx) => (
              <div key={idx} className="space-y-1">
                <label className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{f.label}</label>
                <select
                  value={f.value}
                  onChange={(e) => f.onChange(e.target.value)}
                  className="c1-input text-micro font-bold uppercase tracking-tight"
                >
                  {f.options.map((o, i) => <option key={i} value={o.val}>{o.label}</option>)}
                </select>
              </div>
            ))}
          </div>

          <div className="flex justify-end mt-4 pt-3" style={{ borderTop: '1px solid var(--card-border)' }}>
            <button
              onClick={() => {
                setFilterTaxType('all'); setFilterStatus('all'); setFilterEmployee('all');
                setFilterRisk('all'); setFilterServer('all'); setFilterItPark('all');
                setFilterKpi('all');
              }}
              className="px-3 py-1 text-micro font-bold transition-colors uppercase tracking-widest icon-btn-danger"
              style={{ color: 'var(--text-muted)' }}
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative w-full max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 z-10" size={14} style={{ color: 'var(--text-muted)' }} />
        <input
          type="text"
          placeholder="INN, firma nomi yoki direktor..."
          className="erp-input !pl-9 text-xs font-semibold"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-4">
        {isAdding && (
          // Qatlam `ModalLayer` da (`align="start"` — sehrgar uzun, yuqoridan
          // boshlanadi). `OnboardingWizard` ning to'liq kenglikdagi qadam
          // sarlavhasi saqlanadi; ilgari `z-[100]` va `bg-black/60` qo'lda
          // terilgan edi, ya'ni z-shkalasi ham, rang tokenlari ham chetlab
          // o'tilardi.
          <ModalLayer
            open
            onClose={closeWizard}
            label={editingId ? "Firmani tahrirlash" : "Yangi firma qo'shish"}
            align="start"
            // Saqlash ketayotganda Escape va fon bosilishi yopmasin — yarim
            // yozilgan firma qolib ketadi.
            dismissable={!isSaving}
          >
            <div
              className="relative w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden outline-none"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--card-border)' }}
            >
              <OnboardingWizard
                staff={staff}
                initialData={form}
                initialAssignments={editingAssignments}
                tariffPreset={tariffPreset}
                internalContractors={internalContractors}
                internalParties={internalParties}
                onSave={handleSave}
                onCancel={closeWizard}
              />
              {isSaving && (
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ zIndex: "var(--z-panel, 110)", background: 'color-mix(in srgb, var(--bg-primary) 60%, transparent)' }}
                >
                  <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent-blue)', borderTopColor: 'transparent' }}></div>
                </div>
              )}
            </div>
          </ModalLayer>
        )}

        {/* Kartochkalar — mobilda doim, desktopda faqat 'grid' rejimida */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 ${viewMode === 'list' ? 'md:hidden' : ''}`}>
            {paginated.map(c => {
              const risk = getRiskIndicator(c);
              const avatarColor = `hsl(${(c.name.charCodeAt(0) * 15) % 360}, 70%, 60%)`;
              return (
                <div
                  key={c.id}
                  className={`dashboard-card p-4 transition-all cursor-pointer flex flex-col group relative overflow-hidden`}
                  onClick={() => onCompanySelect(c)}
                >
                  <div className="absolute top-0 left-0 bottom-0 w-1" style={{ background: risk.stripe }} aria-hidden></div>

                  <div className="flex gap-3 mb-4 pl-2">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-semibold shrink-0 shadow-sm transition-transform group-hover:scale-105" style={{ background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}99)` }}>
                      {c.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-body font-bold truncate mb-0.5" style={{ color: 'var(--text)' }} title={c.name}>{c.name}</h4>
                      {c.brandName && <p className="text-micro font-bold uppercase truncate mb-1" style={{ color: 'var(--text-muted)' }}>{c.brandName}</p>}
                      <div className="flex gap-1.5 mt-1 items-center flex-wrap">
                        <span className={`verdict ${risk.verdict}`} title={risk.label}>
                          <span className="verdict-mark" aria-hidden />
                          <span className="sr-only">{risk.label}</span>
                        </span>
                        <Badge tone="neutral">INN: {c.inn}</Badge>
                        <Badge tone={c.taxType?.includes('nds') ? 'info' : 'neutral'}>
                          {TAX_REGIME_SHORT[normalizeTaxRegime(c.taxRegime ?? c.taxType)]}
                        </Badge>
                      </div>
                    </div>
                    <RiskBadge riskLevel={c.riskLevel} companyStatus={c.companyStatus} companyName={c.name} compact className="self-start" />
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-4 mt-auto pl-2">
                    {[
                      { label: t.accountant, val: c.accountantName, icon: <Users size={12} /> },
                      { label: 'Soliq Rejimi', val: c.taxRegime || 'Standard', icon: <Calculator size={12} /> }
                    ].map((stat, i) => (
                      <div key={i} className="p-2 rounded-lg" style={{ background: 'var(--input-bg)' }}>
                        <div className="flex items-center gap-1.5 mb-1" style={{ color: 'var(--text-muted)' }}>
                          {stat.icon}
                          <p className="text-micro font-bold uppercase tracking-widest">{stat.label}</p>
                        </div>
                        <p className="text-meta font-bold truncate" style={{ color: 'var(--text)' }}>{stat.val || '—'}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-3 mt-auto pl-2" style={{ borderTop: '1px solid var(--card-border)' }}>
                    <div className="min-w-0 flex-1">
                      {(c.login || c.password || c.bankClientLogin || c.bankClientPassword) ? (
                        <div className="flex flex-col gap-1">
                          {(c.login || c.password) && (
                            <div className="flex items-center gap-1.5 cursor-help" onClick={(e) => { e.stopPropagation(); togglePassword(c.id); }}>
                              <div style={{ color: 'var(--text-muted)' }}>
                                {showPasswords[c.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                              </div>
                              <span className="text-[10px] uppercase font-bold text-gray-500">Soliq:</span>
                              <p className="text-meta font-bold font-mono whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: 'var(--accent-blue)' }}>
                                {showPasswords[c.id] ? `${c.login || '—'} / ${c.password || '—'}` : '•••• / ••••'}
                              </p>
                            </div>
                          )}
                          {(c.bankClientLogin || c.bankClientPassword) && (
                            <div className="flex items-center gap-1.5 cursor-help" onClick={(e) => { e.stopPropagation(); togglePassword(c.id); }}>
                              <div style={{ color: 'var(--text-muted)' }}>
                                {showPasswords[c.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                              </div>
                              <span className="text-[10px] uppercase font-bold text-gray-500">Bank:</span>
                              <p className="text-meta font-bold font-mono whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: 'var(--accent-blue)' }}>
                                {showPasswords[c.id] ? `${c.bankClientLogin || '—'} / ${c.bankClientPassword || '—'}` : '•••• / ••••'}
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Kirish ma&apos;lumotlari yo&apos;q</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 ml-2">
                      <button onClick={(e) => { e.stopPropagation(); startEdit(c); }} className="icon-btn-sm transition-all icon-btn-accent" style={{ color: 'var(--accent-blue)' }}><Edit3 size={15} /></button>
                      {canDelete && (
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id, c.name); }} className="icon-btn-sm transition-all icon-btn-danger" style={{ color: 'var(--danger)' }} aria-label={`${c.name} — o'chirish`}><Trash2 size={15} /></button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        {/* Jadval — DataTable platformasi (faqat desktop 'table' rejimida) */}
        {viewMode === 'list' && (
          <div className="hidden md:block">
            <DataTable<Company>
              caption="Firmalar ro'yxati"
              rows={filtered}
              columns={orgColumns}
              rowKey={c => c.id}
              sortKey={table.sortKey}
              sortDir={table.sortDir}
              onToggleSort={table.toggleSort}
              density={table.density}
              page={table.page}
              pageSize={itemsPerPage}
              onPageSizeChange={setItemsPerPage}
              onPageChange={table.setPage}
              selected={selectedIds}
              onSelectedChange={setSelectedIds}
              onRowClick={c => onCompanySelect(c)}
              rowLabel={c => `${c.name} — kartochkani ochish`}
              // Bir xil qiymatli ustunlar (masalan bitta buxgalterda bitta
              // nazoratchi yoki bitta 1C serveri) jadvalda 50 marta emas,
              // tepada bir marta ko'rinadi.
              collapseConstantColumns
              emptyIcon={<LayoutGrid size={36} />}
              emptyTitle={t.noData}
              emptyDescription={table.isDirty ? "Qidiruv yoki filtrni o'zgartirib ko'ring." : undefined}
              bulkActions={canDelete ? (ids) => (
                <button
                  type="button"
                  onClick={async () => {
                    const names = ids.map(id => companies.find(c => c.id === id)?.name).filter(Boolean).slice(0, 3).join(', ');
                    const ok = await confirm({
                      title: `${ids.length} ta firma o'chirilsinmi?`,
                      description: `${names}${ids.length > 3 ? ` va yana ${ids.length - 3} ta` : ''}. Bu amalni ortga qaytarib bo'lmaydi.`,
                      confirmLabel: "O'chirish",
                      tone: 'danger',
                    });
                    if (!ok) return;
                    for (const id of ids) onDelete(id);
                    setSelectedIds(new Set());
                  }}
                  className="text-meta font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg"
                  style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}
                >
                  O&apos;chirish
                </button>
              ) : undefined}
            />
          </div>
        )}
      </div>
    </div >
  );
};

export default OrganizationModule;
