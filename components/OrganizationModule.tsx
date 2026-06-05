import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Company, Staff, TaxType, StatsType, Language, CompanyStatus, RiskLevel, OperationEntry } from '../types';
import { supabase } from '../lib/supabaseClient';
import { translations } from '../lib/translations';
import { Plus, Search, Edit3, Trash2, X, Check, LayoutGrid, List, Eye, EyeOff, ChevronLeft, ChevronRight, Download, Filter, AlertTriangle, Building2, Server, Calculator, Users, DollarSign, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import OnboardingWizard from './OnboardingWizard';
import { MonthPicker } from './ui/MonthPicker';
import { periodsEqual } from '../lib/periods';

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
      return { emoji: '🔴', color: 'text-rose-600', bg: 'bg-[#FEEBF0]', border: 'border-[#F5C6CB]' };
    }
    if (risk === 'medium' || company.companyStatus === 'suspended') {
      return { emoji: '🟡', color: 'text-amber-600', bg: 'bg-[#FFF3CD]', border: 'border-[#FFEEBA]' };
    }
    return { emoji: '🟢', color: 'text-emerald-600', bg: 'bg-[#EBFBF0]', border: 'border-[#C3E6CB]' };
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

      // Fetch current assignments for this company to pass to the wizard
      // We add a short timeout here to prevent the UI from locking up
      const { data: assRes, error: assErr } = await Promise.race([
        supabase.from('contract_assignments').select('*').eq('client_id', c.id),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Assignments fetch timeout')), 5000))
      ]);

      if (assErr) {
        console.warn('[OrganizationModule] Failed to fetch assignments:', assErr);
        toast.error('Mas\'ullar ro\'yxatini yuklashda xatolik, ammo tahrirlashni davom ettirishingiz mumkin');
      }

      const existingAssignments = (assRes || []).map((a: any) => ({
        role: a.role,
        userId: a.user_id,
        salaryType: a.salary_type,
        salaryValue: a.salary_value
      }));

      // If we have existing assignments, use them; otherwise, provide defaults
      const finalAssignments = existingAssignments.length > 0 ? existingAssignments : [
        { role: 'accountant', userId: '', salaryType: 'percent', salaryValue: 70 },
        { role: 'controller', userId: '', salaryType: 'fixed', salaryValue: 50000 },
        { role: 'bank_manager', userId: '', salaryType: 'fixed', salaryValue: 50000 }
      ];

      setEditingAssignments(finalAssignments);
      setIsAdding(true);
    } catch (err: any) {
      console.error('[OrganizationModule] startEdit failed:', err);
      // Even if fetch fails, let user open the wizard
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
        <div className="bg-[#FEEBF0] border border-[#F5C6CB] rounded-sm p-6 text-center shadow-sm">
          <p className="text-rose-700 font-bold text-[11px] uppercase tracking-widest leading-relaxed">
            ⚠️ Hech qanday firma yuklanmadi. Sahifani yangilang yoki administratorga murojaat qiling.
          </p>
        </div>
      )}
      {/* Header Section */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center dashboard-card p-5 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0" style={{ background: 'var(--primary)' }}>
            <Building2 size={24} />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-black uppercase tracking-wider truncate" style={{ color: 'var(--text)' }}>{t.organizations}</h2>
            <p className="text-[11px] font-bold uppercase tracking-widest mt-1" style={{ color: 'var(--text-3)' }}>
              {t.totalFirms}: <span className="tabular-nums" style={{ color: 'var(--primary)' }}>{filtered.length}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto">
          <div className="flex p-1 rounded-lg transition-colors" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            {[
              { label: 'Faol', value: true },
              { label: 'Arxiv', value: false },
              { label: 'Barchasi', value: null }
            ].map((opt) => (
              <button
                key={String(opt.value)}
                onClick={() => setFilterActive(opt.value)}
                className={`px-3 py-1.5 rounded-md transition-all text-[11px] font-bold uppercase tracking-widest ${filterActive === opt.value ? 'shadow-sm' : ''}`}
                style={filterActive === opt.value ? { background: 'var(--surface)', color: 'var(--primary)', border: '1px solid var(--border)' } : { color: 'var(--text-2)', border: '1px solid transparent' }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex p-1 rounded-lg transition-colors" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'shadow-sm' : ''}`}
              style={viewMode === 'grid' ? { background: 'var(--surface)', color: 'var(--primary)', border: '1px solid var(--border)' } : { color: 'var(--text-2)', border: '1px solid transparent' }}
              title={t.gridView}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'shadow-sm' : ''}`}
              style={viewMode === 'table' ? { background: 'var(--surface)', color: 'var(--primary)', border: '1px solid var(--border)' } : { color: 'var(--text-2)', border: '1px solid transparent' }}
              title={t.tableView}
            >
              <List size={15} />
            </button>
          </div>

          <div className="h-8 w-px mx-1 hidden sm:block" style={{ background: 'var(--border)' }} />

          <MonthPicker
            selectedPeriod={selectedPeriod}
            onChange={onPeriodChange}
            className="h-9 text-[13px] rounded-lg"
          />

          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="w-9 h-9 flex items-center justify-center rounded-lg transition-all"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.background = 'var(--primary-ghost)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.background = 'var(--surface-2)'; }}
              title="Excelga eksport"
            >
              <Download size={16} />
            </button>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className="w-9 h-9 flex items-center justify-center rounded-lg transition-all"
              style={showFilters ? { background: 'var(--primary-ghost)', border: '1px solid var(--primary)', color: 'var(--primary)' } : { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
              onMouseEnter={e => { if (!showFilters) { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.background = 'var(--primary-ghost)'; } }}
              onMouseLeave={e => { if (!showFilters) { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.background = 'var(--surface-2)'; } }}
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
        <div className="bg-white dark:bg-[#22252B] p-4 rounded-sm shadow-sm border border-[#DEE2E6] dark:border-[#3A3D44] animate-fade-in transition-colors">
          <div className="flex items-center gap-2 mb-4 border-b border-[#F0F2F5] dark:border-[#1e2025] pb-3">
            <Filter size={14} className="text-[#3366CC]" />
            <h3 className="text-[10px] font-bold text-gray-800 dark:text-white uppercase tracking-widest">Aqlli Filtrlar</h3>
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
                <label className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">{f.label}</label>
                <select
                  value={f.value}
                  onChange={(e) => { f.onChange(e.target.value); setCurrentPage(1); }}
                  className="w-full px-2 py-1.5 rounded-sm bg-[#F8F9FA] dark:bg-[#1A1D23] border border-[#DEE2E6] dark:border-[#3A3D44] outline-none focus:border-[#3366CC] text-[10px] font-bold text-gray-700 dark:text-gray-300 transition-all uppercase tracking-tight"
                >
                  {f.options.map((o, i) => <option key={i} value={o.val}>{o.label}</option>)}
                </select>
              </div>
            ))}
          </div>

          <div className="flex justify-end mt-4 pt-3 border-t border-[#F0F2F5] dark:border-[#1e2025]">
            <button
              onClick={() => {
                setFilterTaxType('all'); setFilterStatus('all'); setFilterEmployee('all');
                setFilterRisk('all'); setFilterServer('all'); setFilterItPark('all');
                setFilterKpi('all'); setCurrentPage(1);
              }}
              className="px-3 py-1 text-[8px] font-bold text-gray-400 hover:text-red-500 transition-colors uppercase tracking-widest"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative w-full max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
        <input
          type="text"
          placeholder="INN, FIRMA NOMI YOKI DIREKTOR..."
          className="w-full pl-9 pr-4 py-2 bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm text-[11px] font-bold text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:border-[#3366CC] transition-all shadow-sm uppercase tracking-tight"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
        />
      </div>

      <div className="space-y-4">
        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 transition-colors animate-fade-in">
            <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-sm border border-[#DEE2E6] bg-[#F0F2F5] dark:bg-[#111318] shadow-2xl">
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
                <div className="absolute inset-0 z-[110] flex items-center justify-center bg-white/50 dark:bg-black/50">
                  <div className="w-8 h-8 border-3 border-[#3366CC] border-t-transparent rounded-full animate-spin"></div>
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
                  <div className={`absolute top-0 left-0 bottom-0 w-1 ${risk.bg.replace('bg-', 'bg-')} ${risk.color.replace('text-', 'bg-')}`}></div>
                  
                  <div className="flex gap-3 mb-4 pl-2">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-black shrink-0 shadow-sm transition-transform group-hover:scale-105" style={{ background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}99)` }}>
                      {c.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-[13px] font-bold truncate mb-0.5" style={{ color: 'var(--text)' }} title={c.name}>{c.name}</h4>
                      {c.brandName && <p className="text-[10px] font-bold uppercase truncate mb-1" style={{ color: 'var(--text-3)' }}>{c.brandName}</p>}
                      <div className="flex gap-1.5 mt-1">
                        <span className="c1-badge" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>INN: {c.inn}</span>
                        <span className="c1-badge" style={{ background: c.taxType?.includes('nds') ? 'var(--danger-light)' : 'var(--primary-ghost)', color: c.taxType?.includes('nds') ? 'var(--danger)' : 'var(--primary)' }}>
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
                      <div key={i} className="p-2 rounded-lg" style={{ background: 'var(--surface-2)' }}>
                        <div className="flex items-center gap-1.5 mb-1" style={{ color: 'var(--text-3)' }}>
                          {stat.icon}
                          <p className="text-[9px] font-bold uppercase tracking-widest">{stat.label}</p>
                        </div>
                        <p className="text-[11px] font-bold truncate" style={{ color: 'var(--text)' }}>{stat.val || '—'}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-3 mt-auto pl-2" style={{ borderTop: '1px solid var(--border)' }}>
                    <div className="min-w-0 flex-1">
                      {(c.login || c.password) ? (
                        <div className="flex items-center gap-1.5 cursor-help" onClick={(e) => { e.stopPropagation(); togglePassword(c.id); }}>
                          <div style={{ color: 'var(--text-3)' }}>
                            {showPasswords[c.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                          </div>
                          <p className="text-[11px] font-bold font-mono whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: 'var(--primary)' }}>
                            {showPasswords[c.id] ? `${c.login || '—'} / ${c.password || '—'}` : '•••• / ••••'}
                          </p>
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>Login yo'q</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 ml-2">
                      <button onClick={(e) => { e.stopPropagation(); startEdit(c); }} className="w-8 h-8 flex items-center justify-center rounded-lg transition-all" style={{ color: 'var(--primary)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-ghost)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><Edit3 size={15} /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id, c.name); }} className="w-8 h-8 flex items-center justify-center rounded-lg transition-all" style={{ color: 'var(--danger)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--danger-light)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><Trash2 size={15} /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="dashboard-card overflow-hidden relative">
            <div ref={bottomScrollRef} className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr>
                    <th className="w-[40px] text-center">№</th>
                    <th
                      className="w-[240px] sticky left-0 z-20 cursor-pointer hover:bg-[var(--primary-ghost)] transition-colors"
                      onClick={() => { setSortField('name'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}
                    >
                      <div className="flex items-center gap-1.5">
                        <Building2 size={12} style={{ color: 'var(--text-3)' }} />
                        <span>{t.companyName} {sortField === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}</span>
                      </div>
                    </th>
                    <th
                      className="w-[100px] cursor-pointer hover:bg-[var(--primary-ghost)] transition-colors"
                      onClick={() => { setSortField('inn'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}
                    >
                      {t.inn} {sortField === 'inn' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="w-[130px]" style={{ color: 'var(--primary)' }}>
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
                        className="group cursor-pointer transition-colors hover:bg-[var(--primary-ghost)]"
                        style={{ backgroundColor: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}
                      >
                        <td className="text-center font-mono text-[10px] font-bold" style={{ color: 'var(--text-3)' }}>
                          {c.originalIndex || (i + 1)}
                        </td>
                        <td className="sticky left-0 bg-inherit z-10 font-bold relative pl-3" style={{ color: 'var(--text)' }}>
                          <div className={`absolute left-0 top-0 bottom-0 w-1 ${risk.bg.replace('bg-', 'bg-')} ${risk.color.replace('text-', 'bg-')}`}></div>
                          <div className="truncate max-w-[210px] uppercase tracking-tight" title={c.name}>{c.name}</div>
                          {c.brandName && <div className="text-[9px] font-bold truncate uppercase tracking-widest mt-0.5" style={{ color: 'var(--text-3)' }}>{c.brandName}</div>}
                        </td>
                        <td className="font-mono text-[11px] font-bold" style={{ color: 'var(--text-2)' }}>
                          {c.inn}
                        </td>
                        <td className="font-bold text-right text-[12px] tabular-nums" style={{ color: 'var(--text)' }}>
                          {displayAmount?.toLocaleString() || '0'} <span className="text-[9px] font-bold uppercase ml-0.5" style={{ color: 'var(--text-3)' }}>sum</span>
                        </td>
                        <td className="text-center">
                          <span className="c1-badge" style={{ background: c.taxType?.includes('nds') ? 'var(--danger-light)' : 'var(--primary-ghost)', color: c.taxType?.includes('nds') ? 'var(--danger)' : 'var(--primary)' }}>
                            {c.taxType === 'nds_profit' ? 'VAT' : (c.taxType === 'turnover' ? 'AYLANMA' : (c.taxType?.toUpperCase() || 'FIX'))}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5 truncate">
                            <Users size={12} style={{ color: 'var(--text-3)' }} className="shrink-0" />
                            <span className="truncate text-[11px] font-bold uppercase tracking-tight" style={{ color: 'var(--text)' }}>{displayAccountant || '—'}</span>
                          </div>
                        </td>
                        <td>
                          <span className="truncate block text-[11px] font-bold uppercase tracking-tight" style={{ color: 'var(--text-2)' }}>{displaySupervisor || '—'}</span>
                        </td>
                        <td>
                          <div className="flex flex-col">
                            {c.serverInfo && <span className="text-[10px] font-black uppercase tracking-widest leading-none mb-0.5" style={{ color: 'var(--success)' }}>{c.serverInfo}</span>}
                            <span className="text-[9px] font-bold truncate uppercase tracking-tight" style={{ color: 'var(--text-3)' }} title={c.serverName}>{c.serverName || '—'}</span>
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center justify-center gap-1 opacity-20 group-hover:opacity-100 transition-opacity">
                            <button onClick={(e) => { e.stopPropagation(); onCompanySelect(c); }} className="w-7 h-7 flex items-center justify-center rounded-md transition-all" style={{ color: 'var(--primary)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-ghost)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'} title="Batafsil"><Eye size={13} /></button>
                            <button onClick={(e) => { e.stopPropagation(); startEdit(c); }} className="w-7 h-7 flex items-center justify-center rounded-md transition-all" style={{ color: 'var(--primary)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-ghost)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'} title="Edit"><Edit3 size={13} /></button>
                            <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id, c.name); }} className="w-7 h-7 flex items-center justify-center rounded-md transition-all" style={{ color: 'var(--danger)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--danger-light)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'} title="Delete"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {paginated.length === 0 && (
                <div className="py-24 flex flex-col items-center justify-center" style={{ color: 'var(--text-3)' }}>
                  <LayoutGrid size={48} className="mb-4 opacity-20" />
                  <p className="font-bold uppercase tracking-[0.2em] text-[11px] opacity-60">{t.noData}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 dashboard-card p-3">
            <p className="text-[11px] font-bold uppercase tracking-widest pl-2" style={{ color: 'var(--text-3)' }}>
              {t.page} <span style={{ color: 'var(--primary)' }}>{currentPage}</span> / {totalPages}
            </p>
            <div className="flex gap-2 pr-1">
              <button
                onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                disabled={currentPage === 1}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg disabled:opacity-30 text-[11px] font-bold uppercase tracking-widest transition-all disabled:cursor-not-allowed"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
                onMouseEnter={e => { if (currentPage !== 1) { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.background = 'var(--primary-ghost)'; } }}
                onMouseLeave={e => { if (currentPage !== 1) { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.background = 'var(--surface-2)'; } }}
              >
                <ChevronLeft size={14} /> {t.prev}
              </button>
              <button
                onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                disabled={currentPage === totalPages}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg disabled:opacity-30 text-[11px] font-bold uppercase tracking-widest transition-all disabled:cursor-not-allowed"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
                onMouseEnter={e => { if (currentPage !== totalPages) { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.background = 'var(--primary-ghost)'; } }}
                onMouseLeave={e => { if (currentPage !== totalPages) { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.background = 'var(--surface-2)'; } }}
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
