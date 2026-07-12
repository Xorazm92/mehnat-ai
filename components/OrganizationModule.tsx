"use client";
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Company, Staff, TaxType, Language, OperationEntry } from '@/types';
import { translations } from '@/lib/translations';
import { Plus, Search, Edit3, Trash2, LayoutGrid, List, Eye, EyeOff, ChevronLeft, ChevronRight, Download, Filter, Building2, Calculator, Users, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import OnboardingWizard from './OnboardingWizard';
import { MonthPicker } from './ui/MonthPicker';
import { periodsEqual } from '@/lib/periods';

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
}

const OrganizationModule: React.FC<Props> = ({ companies, staff, lang, selectedPeriod, operations, onPeriodChange, onSave, onDelete, onCompanySelect }) => {
  const t = translations[lang];
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingAssignments, setEditingAssignments] = useState<any[] | undefined>(undefined);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<Partial<Company>>({});
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<keyof Company>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filterActive, setFilterActive] = useState<boolean | null>(true);

  // Dual Scroll Logic
  const topScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const top = topScrollRef.current;
    const bottom = bottomScrollRef.current;
    if (!viewMode || viewMode !== 'table' || !top || !bottom) return;

    const syncTop = () => { if (bottom.scrollLeft !== top.scrollLeft) bottom.scrollLeft = top.scrollLeft; };
    const syncBottom = () => { if (top.scrollLeft !== bottom.scrollLeft) top.scrollLeft = bottom.scrollLeft; };

    top.addEventListener('scroll', syncTop);
    bottom.addEventListener('scroll', syncBottom);

    return () => {
      top.removeEventListener('scroll', syncTop);
      bottom.removeEventListener('scroll', syncBottom);
    };
  }, [viewMode]);

  // Smart Filters
  const [filterTaxType, setFilterTaxType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterEmployee, setFilterEmployee] = useState<string>('all');
  const [filterRisk, setFilterRisk] = useState<string>('all');
  const [filterServer, setFilterServer] = useState<string>('all');
  const [filterItPark, setFilterItPark] = useState<string>('all');
  const [filterKpi, setFilterKpi] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  const itemsPerPage = 100;

  // Risk indicator helper
  const getRiskIndicator = (company: Company) => {
    const risk = company.riskLevel || 'low';
    if (risk === 'high' || company.companyStatus === 'problem' || company.companyStatus === 'debtor') {
      return { emoji: '🔴', stripe: 'var(--danger)' };
    }
    if (risk === 'medium' || company.companyStatus === 'suspended') {
      return { emoji: '🟡', stripe: 'var(--warning)' };
    }
    return { emoji: '🟢', stripe: 'var(--success)' };
  };

  const filtered = useMemo(() => {
    return companies
      .filter(c => {
        // Search: name, INN, or director name
        const searchLower = search.toLowerCase();
        const matchesSearch =
          c.name.toLowerCase().includes(searchLower) ||
          c.inn.includes(search) ||
          (c.directorName?.toLowerCase().includes(searchLower));

        // Active/Archive filter
        const matchesActive = filterActive === null || c.isActive === filterActive;

        // Tax type filter
        const matchesTax = filterTaxType === 'all' || c.taxType === filterTaxType;

        // Status filter
        const matchesStatus = filterStatus === 'all' || (c.companyStatus || 'active') === filterStatus;

        // Employee filter (accountant) - Use historical assignment for the selected period if available
        const op = operations.find(o => o.companyId === c.id && periodsEqual(o.period, selectedPeriod));
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

        return matchesSearch && matchesActive && matchesTax && matchesStatus && matchesEmployee && matchesRisk && matchesServer && matchesItPark && matchesKpi;
      })
      .sort((a, b) => {
        const valA = a[sortField] || '';
        const valB = b[sortField] || '';
        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
  }, [companies, search, sortField, sortOrder, filterActive, filterTaxType, filterStatus, filterEmployee, filterRisk, filterServer, filterItPark, filterKpi, operations, selectedPeriod]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleExport = async () => {
    try {
      const { utils, writeFile } = await import('xlsx');
      const headers = ['Nomi', 'INN', 'Buxgalter', 'Rejim', 'Login', 'Parol', 'Ega'];
      const rows = filtered.map(c => [
        c.name,
        c.inn,
        c.accountantName,
        c.taxRegime,
        c.login || '',
        c.password || '',
        c.ownerName || ''
      ]);

      const ws = utils.aoa_to_sheet([headers, ...rows]);

      // Auto-width
      const wscols = headers.map((h, i) => {
        let max = h.length;
        rows.forEach(r => {
          const val = String(r[i] || '');
          if (val.length > max) max = val.length;
        });
        return { wch: max + 2 };
      });
      ws['!cols'] = wscols;

      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Tashkilotlar");
      writeFile(wb, `tashkilotlar_export.xlsx`);
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
          ? { role: 'chief', userId: c.chiefAccountantId || '', salaryType: 'fixed', salaryValue: Number(c.chiefAccountantSum) }
          : { role: 'chief', userId: c.chiefAccountantId || '', salaryType: 'percent', salaryValue: Number(c.chiefAccountantPerc ?? 0) },
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

  const handleDelete = (id: string, name: string) => {
    if (confirm(`${name} firmasini o'chirishni tasdiqlaysizmi?`)) {
      onDelete(id);
    }
  };

  const handleSave = async (data?: Partial<Company>, assignments?: any[]) => {
    if (isSaving) return;

    // If called from OnboardingWizard, it passes data and assignments
    // If called from legacy handleSave (line 196), it uses state 'form'
    const finalData = data || form;

    if (finalData.name && finalData.inn) {
      setIsSaving(true);
      try {
        console.log('[OrganizationModule] handleSave starting onSave...');
        await onSave({ ...finalData, id: editingId || finalData.id }, assignments);
        console.log('[OrganizationModule] handleSave onSave resolved');

        setEditingId(null);
        setIsAdding(false);
        setForm({});
        setEditingAssignments(undefined);
        toast.success(editingId ? 'Firma tahrirlandi' : 'Yangi firma qo\'shildi');
      } catch (error: any) {
        console.error('[OrganizationModule] handleSave error:', error);
        toast.error(error.message || 'Saqlashda xatolik yuz berdi');
      } finally {
        console.log('[OrganizationModule] handleSave finally - setting isSaving to false');
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
      {companies.length === 0 && (
        <div className="rounded-lg p-6 text-center shadow-sm" style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)' }}>
          <p className="font-bold text-[11px] uppercase tracking-widest leading-relaxed" style={{ color: 'var(--danger)' }}>
            ⚠️ Hech qanday firma yuklanmadi. Sahifani yangilang yoki administratorga murojaat qiling.
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
            <h2 className="text-lg font-black uppercase tracking-wider truncate" style={{ color: 'var(--text)' }}>{t.organizations}</h2>
            <p className="text-[11px] font-bold uppercase tracking-widest mt-1" style={{ color: 'var(--text-muted)' }}>
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
                className={`px-3 py-1.5 rounded-md transition-all text-[11px] font-bold uppercase tracking-widest ${filterActive === opt.value ? 'shadow-sm' : ''}`}
                style={filterActive === opt.value ? { background: 'var(--card-bg)', color: 'var(--accent-blue)', border: '1px solid var(--card-border)' } : { color: 'var(--text-secondary)', border: '1px solid transparent' }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex p-1 rounded-lg transition-colors" style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'shadow-sm' : ''}`}
              style={viewMode === 'grid' ? { background: 'var(--card-bg)', color: 'var(--accent-blue)', border: '1px solid var(--card-border)' } : { color: 'var(--text-secondary)', border: '1px solid transparent' }}
              title={t.gridView}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'shadow-sm' : ''}`}
              style={viewMode === 'table' ? { background: 'var(--card-bg)', color: 'var(--accent-blue)', border: '1px solid var(--card-border)' } : { color: 'var(--text-secondary)', border: '1px solid transparent' }}
              title={t.tableView}
            >
              <List size={15} />
            </button>
          </div>

          <div className="h-8 w-px mx-1 hidden sm:block" style={{ background: 'var(--card-border)' }} />

          <MonthPicker
            selectedPeriod={selectedPeriod}
            onChange={onPeriodChange}
            className="h-9 text-[13px] rounded-lg"
          />

          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="w-9 h-9 flex items-center justify-center rounded-lg transition-all"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text-secondary)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent-blue)'; e.currentTarget.style.background = 'var(--accent-blue-light)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--input-bg)'; }}
              title="Excelga eksport"
            >
              <Download size={16} />
            </button>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className="w-9 h-9 flex items-center justify-center rounded-lg transition-all"
              style={showFilters ? { background: 'var(--accent-blue-light)', border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)' } : { background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text-secondary)' }}
              onMouseEnter={e => { if (!showFilters) { e.currentTarget.style.color = 'var(--accent-blue)'; e.currentTarget.style.background = 'var(--accent-blue-light)'; } }}
              onMouseLeave={e => { if (!showFilters) { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--input-bg)'; } }}
              title="Filtrlar"
            >
              <Filter size={16} />
            </button>
          </div>

          <button
            onClick={() => { setIsAdding(true); setForm({ id: Math.random().toString(36).substr(2, 9), createdAt: new Date().toISOString(), isActive: true }); }}
            className="ai-button-glow flex items-center gap-2"
          >
            <Plus size={16} />
            <span className="uppercase tracking-widest text-[11px]">{t.addCompany}</span>
          </button>
        </div>
      </div>

      {/* Smart Filters Panel */}
      {showFilters && (
        <div className="dashboard-card p-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-4 pb-3" style={{ borderBottom: '1px solid var(--card-border)' }}>
            <Filter size={14} style={{ color: 'var(--accent-blue)' }} />
            <h3 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text)' }}>Aqlli Filtrlar</h3>
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
                <label className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{f.label}</label>
                <select
                  value={f.value}
                  onChange={(e) => { f.onChange(e.target.value); setCurrentPage(1); }}
                  className="c1-input text-[10px] font-bold uppercase tracking-tight"
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
                setFilterKpi('all'); setCurrentPage(1);
              }}
              className="px-3 py-1 text-[9px] font-bold transition-colors uppercase tracking-widest"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
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
          className="erp-input !pl-9 text-[12px] font-semibold"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
        />
      </div>

      <div className="space-y-4">
        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4 sm:p-8 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="relative w-full max-w-4xl my-auto rounded-xl shadow-2xl overflow-hidden" style={{ background: 'var(--bg-primary)', border: '1px solid var(--card-border)' }}>
              <OnboardingWizard
                staff={staff}
                initialData={form}
                initialAssignments={editingAssignments}
                onSave={handleSave}
                onCancel={() => {
                  if (isSaving) return;
                  setIsAdding(false);
                  setEditingId(null);
                  setForm({});
                  setEditingAssignments(undefined);
                }}
              />
              {isSaving && (
                <div className="absolute inset-0 z-[110] flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--bg-primary) 60%, transparent)' }}>
                  <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent-blue)', borderTopColor: 'transparent' }}></div>
                </div>
              )}
            </div>
          </div>
        )}

        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginated.map(c => {
              const risk = getRiskIndicator(c);
              const avatarColor = `hsl(${(c.name.charCodeAt(0) * 15) % 360}, 70%, 60%)`;
              return (
                <div
                  key={c.id}
                  className={`dashboard-card p-4 transition-all cursor-pointer flex flex-col group relative overflow-hidden`}
                  onClick={() => onCompanySelect(c)}
                >
                  <div className="absolute top-0 left-0 bottom-0 w-1" style={{ background: risk.stripe }}></div>

                  <div className="flex gap-3 mb-4 pl-2">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-black shrink-0 shadow-sm transition-transform group-hover:scale-105" style={{ background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}99)` }}>
                      {c.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-[13px] font-bold truncate mb-0.5" style={{ color: 'var(--text)' }} title={c.name}>{c.name}</h4>
                      {c.brandName && <p className="text-[10px] font-bold uppercase truncate mb-1" style={{ color: 'var(--text-muted)' }}>{c.brandName}</p>}
                      <div className="flex gap-1.5 mt-1">
                        <span className="c1-badge" style={{ background: 'var(--input-bg)', color: 'var(--text-secondary)' }}>INN: {c.inn}</span>
                        <span className="c1-badge" style={{ background: c.taxType?.includes('nds') ? 'var(--danger-bg)' : 'var(--accent-blue-light)', color: c.taxType?.includes('nds') ? 'var(--danger)' : 'var(--accent-blue)' }}>
                          {c.taxType === 'nds_profit' ? 'VAT' : (c.taxType === 'turnover' ? 'AYLANMA' : (c.taxType?.toUpperCase() || 'FIX'))}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-4 mt-auto pl-2">
                    {[
                      { label: t.accountant, val: c.accountantName, icon: <Users size={12} /> },
                      { label: 'Soliq Rejimi', val: c.taxRegime || 'Standard', icon: <Calculator size={12} /> }
                    ].map((stat, i) => (
                      <div key={i} className="p-2 rounded-lg" style={{ background: 'var(--input-bg)' }}>
                        <div className="flex items-center gap-1.5 mb-1" style={{ color: 'var(--text-muted)' }}>
                          {stat.icon}
                          <p className="text-[9px] font-bold uppercase tracking-widest">{stat.label}</p>
                        </div>
                        <p className="text-[11px] font-bold truncate" style={{ color: 'var(--text)' }}>{stat.val || '—'}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-3 mt-auto pl-2" style={{ borderTop: '1px solid var(--card-border)' }}>
                    <div className="min-w-0 flex-1">
                      {(c.login || c.password) ? (
                        <div className="flex items-center gap-1.5 cursor-help" onClick={(e) => { e.stopPropagation(); togglePassword(c.id); }}>
                          <div style={{ color: 'var(--text-muted)' }}>
                            {showPasswords[c.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                          </div>
                          <p className="text-[11px] font-bold font-mono whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: 'var(--accent-blue)' }}>
                            {showPasswords[c.id] ? `${c.login || '—'} / ${c.password || '—'}` : '•••• / ••••'}
                          </p>
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Login yo&apos;q</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 ml-2">
                      <button onClick={(e) => { e.stopPropagation(); startEdit(c); }} className="w-8 h-8 flex items-center justify-center rounded-lg transition-all" style={{ color: 'var(--accent-blue)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-blue-light)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><Edit3 size={15} /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id, c.name); }} className="w-8 h-8 flex items-center justify-center rounded-lg transition-all" style={{ color: 'var(--danger)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--danger-bg)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><Trash2 size={15} /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="dashboard-card overflow-hidden relative">
            <div ref={bottomScrollRef} className="w-full overflow-x-auto">
              <table className="erp-table w-full text-left min-w-[1000px]">
                <thead>
                  <tr>
                    <th className="w-[40px] text-center">№</th>
                    <th
                      className="w-[240px] sticky left-0 z-20 cursor-pointer transition-colors"
                      style={{ background: 'var(--table-header-bg)' }}
                      onClick={() => { setSortField('name'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}
                    >
                      <div className="flex items-center gap-1.5">
                        <Building2 size={12} style={{ color: 'var(--text-muted)' }} />
                        <span>{t.companyName} {sortField === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}</span>
                      </div>
                    </th>
                    <th
                      className="w-[100px] cursor-pointer transition-colors"
                      onClick={() => { setSortField('inn'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}
                    >
                      {t.inn} {sortField === 'inn' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="w-[130px]" style={{ color: 'var(--accent-blue)' }}>
                      <div className="flex items-center justify-end gap-1"><DollarSign size={11} /> SHARTNOMA</div>
                    </th>
                    <th className="w-[110px] text-center">REJIM</th>
                    <th className="w-[160px]">BUXGALTER</th>
                    <th className="w-[150px]">NAZORATCHI</th>
                    <th className="w-[130px]">1C SERVER</th>
                    <th className="w-[90px] text-center">{t.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((c, i) => {
                    const risk = getRiskIndicator(c);
                    const op = operations.find(o => o.companyId === c.id && periodsEqual(o.period, selectedPeriod));

                    const displayAmount = op?.contract_amount ?? c.contractAmount;
                    const displayAccountant = op?.assigned_accountant_name ?? c.accountantName;
                    const displaySupervisor = op?.assigned_supervisor_name ?? c.supervisorName;

                    return (
                      <tr
                        key={c.id}
                        onClick={() => onCompanySelect(c)}
                        className="group cursor-pointer transition-colors"
                      >
                        <td className="text-center font-mono text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>
                          {c.originalIndex || (i + 1)}
                        </td>
                        <td className="sticky left-0 z-10 font-bold relative !pl-3" style={{ color: 'var(--text)', background: 'var(--card-bg)' }}>
                          <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: risk.stripe }}></div>
                          <div className="truncate max-w-[210px] uppercase tracking-tight" title={c.name}>{c.name}</div>
                          {c.brandName && <div className="text-[9px] font-bold truncate uppercase tracking-widest mt-0.5" style={{ color: 'var(--text-muted)' }}>{c.brandName}</div>}
                        </td>
                        <td className="font-mono text-[11px] font-bold" style={{ color: 'var(--text-secondary)' }}>
                          {c.inn}
                        </td>
                        <td className="font-bold text-right text-[12px] tabular-nums" style={{ color: 'var(--text)' }}>
                          {displayAmount?.toLocaleString() || '0'} <span className="text-[9px] font-bold uppercase ml-0.5" style={{ color: 'var(--text-muted)' }}>sum</span>
                        </td>
                        <td className="text-center">
                          <span className="c1-badge" style={{ background: c.taxType?.includes('nds') ? 'var(--danger-bg)' : 'var(--accent-blue-light)', color: c.taxType?.includes('nds') ? 'var(--danger)' : 'var(--accent-blue)' }}>
                            {c.taxType === 'nds_profit' ? 'VAT' : (c.taxType === 'turnover' ? 'AYLANMA' : (c.taxType?.toUpperCase() || 'FIX'))}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5 truncate">
                            <Users size={12} style={{ color: 'var(--text-muted)' }} className="shrink-0" />
                            <span className="truncate text-[11px] font-bold uppercase tracking-tight" style={{ color: 'var(--text)' }}>{displayAccountant || '—'}</span>
                          </div>
                        </td>
                        <td>
                          <span className="truncate block text-[11px] font-bold uppercase tracking-tight" style={{ color: 'var(--text-secondary)' }}>{displaySupervisor || '—'}</span>
                        </td>
                        <td>
                          <div className="flex flex-col">
                            {c.serverInfo && <span className="text-[10px] font-black uppercase tracking-widest leading-none mb-0.5" style={{ color: 'var(--success)' }}>{c.serverInfo}</span>}
                            <span className="text-[9px] font-bold truncate uppercase tracking-tight" style={{ color: 'var(--text-muted)' }} title={c.serverName}>{c.serverName || '—'}</span>
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center justify-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                            <button onClick={(e) => { e.stopPropagation(); onCompanySelect(c); }} className="w-7 h-7 flex items-center justify-center rounded-md transition-all" style={{ color: 'var(--accent-blue)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-blue-light)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'} title="Batafsil"><Eye size={13} /></button>
                            <button onClick={(e) => { e.stopPropagation(); startEdit(c); }} className="w-7 h-7 flex items-center justify-center rounded-md transition-all" style={{ color: 'var(--accent-blue)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-blue-light)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'} title="Edit"><Edit3 size={13} /></button>
                            <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id, c.name); }} className="w-7 h-7 flex items-center justify-center rounded-md transition-all" style={{ color: 'var(--danger)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--danger-bg)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'} title="Delete"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {paginated.length === 0 && (
                <div className="py-24 flex flex-col items-center justify-center" style={{ color: 'var(--text-muted)' }}>
                  <LayoutGrid size={48} className="mb-4 opacity-20" />
                  <p className="font-bold uppercase tracking-[0.2em] text-[11px] opacity-60">{t.noData}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 dashboard-card p-3">
            <p className="text-[11px] font-bold uppercase tracking-widest pl-2" style={{ color: 'var(--text-muted)' }}>
              {t.page} <span style={{ color: 'var(--accent-blue)' }}>{currentPage}</span> / {totalPages}
            </p>
            <div className="flex gap-2 pr-1">
              <button
                onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                disabled={currentPage === 1}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg disabled:opacity-30 text-[11px] font-bold uppercase tracking-widest transition-all disabled:cursor-not-allowed"
                style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text-secondary)' }}
                onMouseEnter={e => { if (currentPage !== 1) { e.currentTarget.style.color = 'var(--accent-blue)'; e.currentTarget.style.background = 'var(--accent-blue-light)'; } }}
                onMouseLeave={e => { if (currentPage !== 1) { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--input-bg)'; } }}
              >
                <ChevronLeft size={14} /> {t.prev}
              </button>
              <button
                onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                disabled={currentPage === totalPages}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg disabled:opacity-30 text-[11px] font-bold uppercase tracking-widest transition-all disabled:cursor-not-allowed"
                style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text-secondary)' }}
                onMouseEnter={e => { if (currentPage !== totalPages) { e.currentTarget.style.color = 'var(--accent-blue)'; e.currentTarget.style.background = 'var(--accent-blue-light)'; } }}
                onMouseLeave={e => { if (currentPage !== totalPages) { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--input-bg)'; } }}
              >
                {t.next} <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div >
  );
};

export default OrganizationModule;
