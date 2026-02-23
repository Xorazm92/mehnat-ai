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
      return { emoji: '🔴', color: 'text-rose-500', bg: 'bg-rose-500/10' };
    }
    if (risk === 'medium' || company.companyStatus === 'suspended') {
      return { emoji: '🟡', color: 'text-amber-500', bg: 'bg-amber-500/10' };
    }
    return { emoji: '🟢', color: 'text-emerald-500', bg: 'bg-emerald-500/10' };
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
    <div className="space-y-6 md:space-y-10 animate-fade-in pb-24">
      {/* Header Section */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center liquid-glass-card p-6 md:p-10 rounded-[2.5rem] md:rounded-[3.5rem] gap-8 shadow-glass border border-white/10 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-[100px] -mr-48 -mt-48 group-hover:bg-indigo-500/10 transition-colors duration-700"></div>

        <div className="flex-1 relative z-10">
          <h2 className="text-4xl md:text-5xl font-black text-slate-800 dark:text-white tracking-tighter leading-tight mb-3 premium-text-gradient">{t.organizations}</h2>
          <div className="flex items-center gap-3">
            <div className="flex -space-x-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-8 h-8 rounded-full border-2 border-white dark:border-slate-800 bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-black text-slate-500">
                  <Building2 size={12} />
                </div>
              ))}
            </div>
            <p className="text-sm font-black text-slate-400 uppercase tracking-widest">
              {t.totalFirms}: <span className="text-indigo-500 tabular-nums">{filtered.length}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto relative z-10">
          {/* Active/Archive Toggle */}
          <div className="flex bg-slate-100/50 dark:bg-white/5 p-1.5 rounded-2xl border border-white/10 shadow-inner backdrop-blur-md">
            {[
              { label: 'Faol', value: true },
              { label: 'Arxiv', value: false },
              { label: 'Hammasi', value: null }
            ].map((opt) => (
              <button
                key={String(opt.value)}
                onClick={() => setFilterActive(opt.value)}
                className={`px-6 py-2.5 rounded-xl transition-all text-[11px] font-black uppercase tracking-widest ${filterActive === opt.value ? 'bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white shadow-glass' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* View Mode Toggle */}
          <div className="flex bg-slate-100/50 dark:bg-white/5 p-1.5 rounded-2xl border border-white/10 shadow-inner backdrop-blur-md">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-3.5 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white shadow-glass' : 'text-slate-400 hover:text-slate-600'}`}
              title={t.gridView}
            >
              <LayoutGrid size={20} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-3.5 rounded-xl transition-all ${viewMode === 'table' ? 'bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white shadow-glass' : 'text-slate-400 hover:text-slate-600'}`}
              title={t.tableView}
            >
              <List size={20} />
            </button>
          </div>

          <MonthPicker
            selectedPeriod={selectedPeriod}
            onChange={onPeriodChange}
          />

          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="p-4 bg-white/40 dark:bg-white/5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-2xl transition-all shadow-glass border border-white/10 group/btn"
              title="Excelga eksport"
            >
              <Download size={22} className="group-hover:scale-110 group-hover:-translate-y-0.5 transition-transform" />
            </button>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-4 rounded-2xl transition-all shadow-glass border ${showFilters ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white/40 dark:bg-white/5 text-slate-400 hover:text-indigo-600 border-white/10'}`}
              title="Aqlli Filtrlar"
            >
              <Filter size={22} className={showFilters ? 'animate-pulse' : ''} />
            </button>
          </div>

          <button
            onClick={() => { setIsAdding(true); setForm({ id: Math.random().toString(36).substr(2, 9), createdAt: new Date().toISOString(), isActive: true }); }}
            className="flex-1 md:flex-none bg-indigo-600 text-white px-10 py-5 rounded-2xl font-black text-sm flex items-center justify-center gap-3 shadow-glass-lg shadow-indigo-500/30 hover:bg-indigo-500 hover:scale-105 transition-all active:scale-95 group/add"
          >
            <Plus size={24} className="group-hover:rotate-90 transition-transform duration-500" />
            <span className="inline">{t.addCompany}</span>
          </button>
        </div>
      </div>

      {/* Smart Filters Panel */}
      {showFilters && (
        <div className="liquid-glass-card p-10 rounded-[2.5rem] md:rounded-[3.5rem] shadow-glass-lg animate-scale-in border border-white/10 relative overflow-hidden bg-white/40 dark:bg-white/5">
          <div className="absolute -top-10 -left-10 w-48 h-48 bg-indigo-500/10 rounded-full blur-[80px]"></div>

          <div className="flex items-center gap-4 mb-10 relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shadow-glass border border-indigo-500/20">
              <Filter size={24} />
            </div>
            <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Aqlli Filtrlar</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative z-10">
            {[
              { label: 'Soliq Turi', value: filterTaxType, onChange: setFilterTaxType, options: [{ label: 'Hammasi', val: 'all' }, ...Object.values(TaxType).map(v => ({ label: v, val: v }))] },
              {
                label: 'Holati', value: filterStatus, onChange: setFilterStatus, options: [
                  { label: 'Hammasi', val: 'all' },
                  { label: '🟢 Faol', val: 'active' },
                  { label: '🟡 To\'xtatilgan', val: 'suspended' },
                  { label: '🔴 Qarzdor', val: 'debtor' },
                  { label: '🔴 Muammoli', val: 'problem' },
                  { label: '⚫ Bankrot', val: 'bankrupt' }
                ]
              },
              { label: 'Buxgalter', value: filterEmployee, onChange: setFilterEmployee, options: [{ label: 'Hammasi', val: 'all' }, ...staff.map(s => ({ label: s.name, val: s.id }))] },
              {
                label: 'Xavf Darajasi', value: filterRisk, onChange: setFilterRisk, options: [
                  { label: 'Hammasi', val: 'all' },
                  { label: '🟢 Past', val: 'low' },
                  { label: '🟡 O\'rta', val: 'medium' },
                  { label: '🔴 Yuqori', val: 'high' }
                ]
              },
              { label: '1C Server', value: filterServer, onChange: setFilterServer, options: [{ label: 'Hammasi', val: 'all' }, { label: 'CR1', val: 'CR1' }, { label: 'CR2', val: 'CR2' }, { label: 'CR3', val: 'CR3' }] },
              { label: 'IT Park', value: filterItPark, onChange: setFilterItPark, options: [{ label: 'Hammasi', val: 'all' }, { label: '✅ Rezident', val: 'yes' }, { label: '❌ Rezident emas', val: 'no' }] },
              { label: 'KPI Tizimi', value: filterKpi, onChange: setFilterKpi, options: [{ label: 'Hammasi', val: 'all' }, { label: '✅ Yoqilgan', val: 'yes' }, { label: '❌ O\'chirilgan', val: 'no' }] }
            ].map((f, idx) => (
              <div key={idx} className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block">{f.label}</label>
                <select
                  value={f.value}
                  onChange={(e) => { f.onChange(e.target.value); setCurrentPage(1); }}
                  className="w-full p-4.5 rounded-[1.2rem] bg-white dark:bg-apple-darkBg border border-slate-100 dark:border-white/5 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 font-bold text-[13px] text-slate-700 dark:text-slate-300 transition-all shadow-sm"
                >
                  {f.options.map((o, i) => <option key={i} value={o.val}>{o.label}</option>)}
                </select>
              </div>
            ))}
          </div>

          {/* Reset Filters */}
          <div className="flex justify-end mt-10 relative z-10">
            <button
              onClick={() => {
                setFilterTaxType('all'); setFilterStatus('all'); setFilterEmployee('all');
                setFilterRisk('all'); setFilterServer('all'); setFilterItPark('all');
                setFilterKpi('all'); setCurrentPage(1);
              }}
              className="px-8 py-3 rounded-xl bg-slate-100 dark:bg-white/5 text-[10px] font-black text-slate-400 hover:text-rose-500 transition-all uppercase tracking-[0.2em] border border-transparent hover:border-rose-500/20"
            >
              Filtrlarni Tozalash
            </button>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative group/search max-w-5xl mx-auto w-full">
        <div className="absolute inset-0 bg-indigo-500/5 blur-3xl rounded-full opacity-0 group-focus-within/search:opacity-100 transition-opacity"></div>
        <Search className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 group-focus-within/search:text-indigo-500 transition-colors pointer-events-none" size={24} />
        <input
          type="text"
          placeholder="INN, Firma nomi yoki Direktor ismi bo'yicha qidirish..."
          className="w-full pl-20 pr-10 py-7 md:py-8 bg-white/60 dark:bg-white/5 backdrop-blur-xl border border-white/20 dark:border-white/5 rounded-[2.5rem] text-lg md:text-xl font-bold text-slate-700 dark:text-white placeholder-slate-400 focus:ring-0 focus:border-indigo-500 outline-none transition-all shadow-glass group-focus-within/search:scale-[1.02]"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
        />
        <div className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/10 text-[10px] font-black text-slate-400 uppercase tracking-widest border border-white/10">⌘ K</span>
        </div>
      </div>

      <div className="space-y-8">
        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
            <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto scrollbar-hide">
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
                <div className="absolute inset-0 z-[110] flex items-center justify-center bg-white/50 dark:bg-black/50 rounded-[2.5rem]">
                  <div className="w-12 h-12 border-4 border-apple-accent border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </div>
          </div>
        )}

        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-10">
            {paginated.map(c => {
              const risk = getRiskIndicator(c);
              return (
                <div
                  key={c.id}
                  className="liquid-glass-card p-10 rounded-[3.5rem] flex flex-col justify-between group cursor-pointer relative overflow-hidden transition-all duration-500 hover:shadow-glass-lg hover:-translate-y-2 border border-white/10"
                  onClick={() => onCompanySelect(c)}
                >
                  <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl group-hover:bg-indigo-500/10 transition-colors"></div>

                  {/* Risk & Status Badge */}
                  <div className={`absolute top-6 right-8 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${risk.bg} ${risk.color} border border-current/10 backdrop-blur-md shadow-sm`}>
                    {risk.emoji} {c.companyStatus === 'active' || !c.companyStatus ? 'Faol' : c.companyStatus}
                  </div>

                  <div className="flex gap-6 mb-10">
                    <div className="h-20 w-20 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-[2rem] flex items-center justify-center text-3xl font-black text-white shadow-glass-lg transition-all duration-700 group-hover:rotate-6 group-hover:scale-110">
                      {c.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xl font-black text-slate-800 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors mb-1" title={c.name}>{c.name}</h4>
                      {c.brandName && <p className="text-xs text-slate-400 font-black uppercase tracking-widest opacity-70 mb-3">{c.brandName}</p>}
                      <div className="flex flex-wrap gap-2">
                        <span className="text-[9px] font-black px-3 py-1 bg-slate-100 dark:bg-white/10 text-slate-500 rounded-lg tabular-nums border border-white/5">INN: {c.inn}</span>
                        <span className="text-[9px] font-black px-3 py-1 bg-indigo-500/10 text-indigo-500 rounded-lg uppercase tracking-widest border border-indigo-500/10">{c.taxType}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-8">
                    {[
                      { label: t.accountant, val: c.accountantName, icon: <Users size={14} className="text-indigo-500" /> },
                      { label: 'Soliq Rejimi', val: c.taxRegime || 'Standard', icon: <Calculator size={14} className="text-emerald-500" /> }
                    ].map((stat, i) => (
                      <div key={i} className="p-4 bg-slate-50/50 dark:bg-white/5 rounded-[1.5rem] border border-white/5 group/stat hover:bg-white/80 dark:hover:bg-white/10 transition-colors">
                        <div className="flex items-center gap-2 mb-2 opacity-60">
                          {stat.icon}
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                        </div>
                        <p className="text-xs font-black text-slate-700 dark:text-slate-200 truncate">{stat.val || '—'}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-6 border-t border-white/10">
                    <div className="flex items-center gap-3">
                      {(c.login || c.password) ? (
                        <div className="flex items-center gap-2 group/creds" onClick={(e) => { e.stopPropagation(); togglePassword(c.id); }}>
                          <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 group-hover/creds:bg-indigo-500 group-hover/creds:text-white transition-all">
                            {showPasswords[c.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                          </div>
                          <p className="text-[10px] font-bold text-slate-400 font-mono tracking-tighter">
                            {showPasswords[c.id] ? `${c.login || '—'} / ${c.password || '—'}` : '•••• / ••••'}
                          </p>
                        </div>
                      ) : (
                        <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Ma'lumotlar yo'q</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button onClick={(e) => { e.stopPropagation(); startEdit(c); }} className="p-3.5 bg-indigo-600/10 text-indigo-600 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all transform hover:scale-110 active:scale-95 shadow-glass border border-indigo-600/10"><Edit3 size={18} /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id, c.name); }} className="p-3.5 bg-rose-500/10 text-rose-500 rounded-2xl hover:bg-rose-500 hover:text-white transition-all transform hover:scale-110 active:scale-95 shadow-glass border border-rose-500/10"><Trash2 size={18} /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="liquid-glass-card rounded-[3rem] shadow-glass-lg border border-white/10 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-[80px] -mr-32 -mt-32"></div>

            <div ref={bottomScrollRef} className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-left border-collapse min-w-[1500px] table-fixed">
                <thead>
                  <tr className="bg-slate-100/80 dark:bg-white/5 backdrop-blur-md text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-white/10">
                    <th className="px-6 py-8 w-[60px] text-center">№</th>
                    <th className="px-6 py-8 w-[60px] text-center">Xavf</th>
                    <th
                      className="px-4 md:px-8 py-8 w-[150px] md:w-[300px] sticky left-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl z-20 shadow-[10px_0_20px_-10px_rgba(0,0,0,0.1)] cursor-pointer hover:text-indigo-600 transition-colors"
                      onClick={() => { setSortField('name'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}
                    >
                      <div className="flex items-center gap-2">
                        <Building2 size={14} />
                        {t.companyName} {sortField === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </div>
                    </th>
                    <th
                      className="px-6 py-8 w-[120px] cursor-pointer hover:text-indigo-600 transition-colors"
                      onClick={() => { setSortField('inn'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}
                    >
                      {t.inn} {sortField === 'inn' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-6 py-8 w-[160px] text-indigo-500 flex items-center gap-2">
                      <DollarSign size={14} /> Shartnoma
                    </th>
                    <th className="px-6 py-8 w-[120px]">{t.regime}</th>
                    <th className="px-6 py-8 w-[180px]">Buxgalter</th>
                    <th className="px-6 py-8 w-[150px]">Nazoratchi</th>
                    <th className="px-6 py-8 w-[150px]">1C Server</th>
                    <th className="px-6 py-8 w-[150px]">Holat</th>
                    <th className="px-10 py-8 w-[180px] text-right">{t.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {paginated.map(c => {
                    const risk = getRiskIndicator(c);
                    const op = operations.find(o => o.companyId === c.id && periodsEqual(o.period, selectedPeriod));

                    const displayAmount = op?.contract_amount ?? c.contractAmount;
                    const displayAccountant = op?.assigned_accountant_name ?? c.accountantName;
                    const displaySupervisor = op?.assigned_supervisor_name ?? c.supervisorName;

                    return (
                      <tr key={c.id} className="hover:bg-white/60 dark:hover:bg-white/10 transition-all group/row">
                        <td className="px-6 py-6 text-center">
                          <span className="text-[11px] font-black text-slate-300 font-mono italic">{c.originalIndex || '-'}</span>
                        </td>
                        <td className="px-6 py-6 text-center">
                          <div className={`w-8 h-8 rounded-xl ${risk.bg} flex items-center justify-center text-lg border border-current/10 mx-auto transition-transform group-hover/row:scale-110`}>
                            {risk.emoji}
                          </div>
                        </td>
                        <td
                          className="px-4 md:px-8 py-6 sticky left-0 bg-white dark:bg-slate-900 group-hover/row:bg-slate-50 dark:group-hover/row:bg-indigo-600/10 z-20 shadow-[10px_0_20px_-10px_rgba(0,0,0,0.05)] transition-colors cursor-pointer"
                          onClick={() => onCompanySelect(c)}
                        >
                          <div className="font-black text-slate-800 dark:text-white text-[14px] tracking-tight group-hover/row:text-indigo-600 dark:group-hover/row:text-indigo-400 transition-colors truncate" title={c.name}>{c.name}</div>
                          {c.brandName && <div className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-1 opacity-60 truncate">{c.brandName}</div>}
                        </td>
                        <td className="px-6 py-6 font-mono text-[11px] font-black text-slate-500 dark:text-slate-400 tabular-nums">
                          {c.inn}
                        </td>
                        <td className="px-6 py-6">
                          <span className="font-black text-slate-800 dark:text-white tabular-nums text-sm">
                            {displayAmount?.toLocaleString() || '0'}
                          </span>
                          <span className="text-[9px] font-black ml-1 text-slate-400">UZS</span>
                        </td>
                        <td className="px-6 py-6">
                          <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${c.taxType?.includes('nds') ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/20'}`}>
                            {c.taxType === 'nds_profit' ? 'VAT' : (c.taxType === 'turnover' ? 'Aylanma' : (c.taxType || 'Fix'))}
                          </span>
                        </td>
                        <td className="px-6 py-6">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-black text-[10px] border border-indigo-500/20">
                              {displayAccountant?.[0] || '?'}
                            </div>
                            <p className="text-[12px] font-black text-slate-700 dark:text-slate-200 truncate">{displayAccountant || '—'}</p>
                          </div>
                        </td>
                        <td className="px-6 py-6">
                          <p className="text-[11px] font-bold text-slate-600 dark:text-slate-400 truncate">{displaySupervisor || '—'}</p>
                        </td>
                        <td className="px-6 py-6">
                          <div className="flex flex-col gap-1">
                            {c.serverInfo && <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">{c.serverInfo}</span>}
                            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate opacity-70" title={c.serverName}>{c.serverName || '—'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-6">
                          <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.15em] shadow-sm flex items-center gap-2 w-fit ${risk.bg} ${risk.color} border border-current/10`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
                            {c.companyStatus === 'active' || !c.companyStatus ? 'FAOL' : c.companyStatus === 'suspended' ? "TO'XTAT" : c.companyStatus === 'debtor' ? 'QARZDOR' : c.companyStatus === 'problem' ? 'MUAMMOLI' : 'BANKROT'}
                          </span>
                        </td>
                        <td className="px-10 py-6 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); onCompanySelect(c); }}
                              className="p-3 bg-slate-100 dark:bg-white/5 text-slate-500 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-glass transform hover:scale-110 active:scale-95"
                              title="Details"
                            >
                              <Eye size={16} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); startEdit(c); }}
                              className="p-3 bg-indigo-600/10 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-glass transform hover:scale-110 active:scale-95"
                              title="Edit"
                            >
                              <Edit3 size={16} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(c.id, c.name); }}
                              className="p-3 bg-rose-500/10 text-rose-500 rounded-xl hover:bg-rose-600 hover:text-white transition-all shadow-glass transform hover:scale-110 active:scale-95"
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {paginated.length === 0 && (
                <div className="py-40 flex flex-col items-center justify-center text-slate-300">
                  <div className="w-24 h-24 rounded-[3rem] bg-slate-50 dark:bg-white/5 flex items-center justify-center mb-6 shadow-inner">
                    <LayoutGrid size={48} className="opacity-20 translate-y-1" />
                  </div>
                  <p className="font-black uppercase tracking-[0.3em] text-sm opacity-40">{t.noData}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 pt-12 border-t border-white/10">
            <p className="text-sm font-black text-slate-400 uppercase tracking-widest">
              {t.page} <span className="text-indigo-500 tabular-nums">{currentPage}</span> {t.of} {totalPages}
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                disabled={currentPage === 1}
                className="flex items-center gap-3 bg-white/40 dark:bg-white/5 p-4 px-8 rounded-2xl disabled:opacity-20 font-black text-[11px] uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-glass border border-white/10 disabled:cursor-not-allowed group/prev"
              >
                <ChevronLeft size={18} className="group-hover:-translate-x-1 transition-transform" /> {t.prev}
              </button>
              <button
                onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                disabled={currentPage === totalPages}
                className="flex items-center gap-3 bg-white/40 dark:bg-white/5 p-4 px-8 rounded-2xl disabled:opacity-20 font-black text-[11px] uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-glass border border-white/10 disabled:cursor-not-allowed group/next"
              >
                {t.next} <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div >
  );
};

export default OrganizationModule;
