import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Company, Staff, TaxType, StatsType, Language, CompanyStatus, RiskLevel, OperationEntry } from '../types';
import { supabase } from '../lib/supabaseClient';
import { translations } from '../lib/translations';
import { Plus, Search, Edit3, Trash2, X, Check, LayoutGrid, List, Eye, EyeOff, ChevronLeft, ChevronRight, Download, Filter, AlertTriangle, Building2, Server, Calculator, Users } from 'lucide-react';
import { toast } from 'sonner';
import OnboardingWizard from './OnboardingWizard';
import { MonthPicker } from './ui/MonthPicker';

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

        // Employee filter (accountant)
        const matchesEmployee = filterEmployee === 'all' || c.accountantId === filterEmployee;

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
  }, [companies, search, sortField, sortOrder, filterActive, filterTaxType, filterStatus, filterEmployee, filterRisk]);

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
    setForm(c);
    setEditingId(c.id);

    // Fetch current assignments for this company to pass to the wizard
    const { data: assRes } = await supabase.from('contract_assignments').select('*').eq('client_id', c.id);
    const existingAssignments = (assRes || []).map(a => ({
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
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`${name} firmasini o'chirishni tasdiqlaysizmi?`)) {
      onDelete(id);
    }
  };

  const handleSave = () => {
    if (form.name && form.inn) {
      onSave(form as Company);
      setEditingId(null);
      setIsAdding(false);
      setForm({});
    }
  };

  const togglePassword = (id: string) => {
    setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-4 md:space-y-8 animate-fade-in pb-20">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center bg-white dark:bg-apple-darkCard p-5 md:p-8 rounded-2xl md:rounded-[2.5rem] shadow-sm border border-apple-border dark:border-apple-darkBorder gap-6">
        <div className="flex-1">
          <h2 className="text-3xl md:text-4xl font-black text-slate-800 dark:text-white tracking-tight leading-tight mb-2 premium-text-gradient">{t.organizations}</h2>
          <p className="text-sm md:text-base font-semibold text-slate-400">
            {t.totalFirms}: <span className="text-apple-accent tabular-nums">{filtered.length}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto">
          <div className="flex bg-slate-100 dark:bg-white/5 p-1.5 rounded-2xl border border-apple-border dark:border-apple-darkBorder shadow-inner">
            <button
              onClick={() => setFilterActive(true)}
              className={`px-4 py-2 rounded-xl transition-all text-xs font-black ${filterActive === true ? 'bg-white dark:bg-apple-darkBg text-apple-accent shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Faol
            </button>
            <button
              onClick={() => setFilterActive(false)}
              className={`px-4 py-2 rounded-xl transition-all text-xs font-black ${filterActive === false ? 'bg-white dark:bg-apple-darkBg text-apple-accent shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Arxiv
            </button>
            <button
              onClick={() => setFilterActive(null)}
              className={`px-4 py-2 rounded-xl transition-all text-xs font-black ${filterActive === null ? 'bg-white dark:bg-apple-darkBg text-apple-accent shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Hammasi
            </button>
          </div>

          <div className="flex bg-slate-100 dark:bg-white/5 p-1.5 rounded-2xl border border-apple-border dark:border-apple-darkBorder shadow-inner">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-3 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-apple-darkBg text-apple-accent shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
              title={t.gridView}
            >
              <LayoutGrid size={20} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-3 rounded-xl transition-all ${viewMode === 'table' ? 'bg-white dark:bg-apple-darkBg text-apple-accent shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
              title={t.tableView}
            >
              <List size={20} />
            </button>
          </div>

          <MonthPicker
            selectedPeriod={selectedPeriod}
            onChange={onPeriodChange}
          />

          <button
            onClick={handleExport}
            className="p-3.5 bg-white dark:bg-apple-darkCard text-slate-400 hover:text-apple-accent border border-apple-border dark:border-apple-darkBorder rounded-2xl transition-all shadow-sm"
            title="Excelga eksport"
          >
            <Download size={20} />
          </button>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-3.5 border rounded-2xl transition-all shadow-sm ${showFilters ? 'bg-apple-accent text-white border-apple-accent' : 'bg-white dark:bg-apple-darkCard text-slate-400 hover:text-apple-accent border-apple-border dark:border-apple-darkBorder'}`}
            title="Aqlli Filtrlar"
          >
            <Filter size={20} />
          </button>

          <button
            onClick={() => { setIsAdding(true); setForm({ id: Math.random().toString(36).substr(2, 9), createdAt: new Date().toISOString(), isActive: true }); }}
            className="flex-1 md:flex-none grow bg-apple-accent text-white px-5 sm:px-8 py-3.5 sm:py-4.5 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 sm:gap-3 shadow-xl shadow-blue-500/20 hover:bg-blue-600 transition-all active:scale-95"
          >
            <Plus size={20} /> <span className="inline">{t.addCompany}</span>
          </button>
        </div>
      </div>

      {/* Smart Filters Panel */}
      {showFilters && (
        <div className="bg-white dark:bg-apple-darkCard p-6 rounded-[2rem] border border-apple-border dark:border-apple-darkBorder shadow-lg animate-fade-in">
          <div className="flex items-center gap-3 mb-6">
            <Filter size={18} className="text-apple-accent" />
            <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">Aqlli Filtrlar</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Tax Type Filter */}
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Soliq Turi</label>
              <select
                value={filterTaxType}
                onChange={(e) => { setFilterTaxType(e.target.value); setCurrentPage(1); }}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-2 focus:ring-apple-accent/20 font-bold text-sm"
              >
                <option value="all">Hammasi</option>
                {Object.values(TaxType).map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Holati</label>
              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-2 focus:ring-apple-accent/20 font-bold text-sm"
              >
                <option value="all">Hammasi</option>
                <option value="active">🟢 Faol</option>
                <option value="suspended">🟡 To'xtatilgan</option>
                <option value="debtor">🔴 Qarzdor</option>
                <option value="problem">🔴 Muammoli</option>
                <option value="bankrupt">⚫ Bankrot</option>
              </select>
            </div>

            {/* Employee Filter */}
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Xodim (Buxgalter)</label>
              <select
                value={filterEmployee}
                onChange={(e) => { setFilterEmployee(e.target.value); setCurrentPage(1); }}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-2 focus:ring-apple-accent/20 font-bold text-sm"
              >
                <option value="all">Hammasi</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {/* Risk Filter */}
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Xavf Darajasi</label>
              <select
                value={filterRisk}
                onChange={(e) => { setFilterRisk(e.target.value); setCurrentPage(1); }}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-2 focus:ring-apple-accent/20 font-bold text-sm"
              >
                <option value="all">Hammasi</option>
                <option value="low">🟢 Past</option>
                <option value="medium">🟡 O'rta</option>
                <option value="high">🔴 Yuqori</option>
              </select>
            </div>

            {/* Server Filter */}
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">1C Server</label>
              <select
                value={filterServer}
                onChange={(e) => { setFilterServer(e.target.value); setCurrentPage(1); }}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-2 focus:ring-apple-accent/20 font-bold text-sm"
              >
                <option value="all">Hammasi</option>
                <option value="CR1">CR1</option>
                <option value="CR2">CR2</option>
                <option value="CR3">CR3</option>
              </select>
            </div>

            {/* IT Park Filter */}
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">IT Park</label>
              <select
                value={filterItPark}
                onChange={(e) => { setFilterItPark(e.target.value); setCurrentPage(1); }}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-2 focus:ring-apple-accent/20 font-bold text-sm"
              >
                <option value="all">Hammasi</option>
                <option value="yes">✅ Rezident</option>
                <option value="no">❌ Rezident emas</option>
              </select>
            </div>

            {/* KPI Filter */}
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">KPI Tizimi</label>
              <select
                value={filterKpi}
                onChange={(e) => { setFilterKpi(e.target.value); setCurrentPage(1); }}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-2 focus:ring-apple-accent/20 font-bold text-sm"
              >
                <option value="all">Hammasi</option>
                <option value="yes">✅ Yoqilgan</option>
                <option value="no">❌ O'chirilgan</option>
              </select>
            </div>
          </div>

          {/* Reset Filters */}
          <div className="flex justify-end mt-4">
            <button
              onClick={() => { setFilterTaxType('all'); setFilterStatus('all'); setFilterEmployee('all'); setFilterRisk('all'); setCurrentPage(1); }}
              className="text-xs font-black text-slate-400 hover:text-apple-accent transition-colors uppercase tracking-widest"
            >
              Filtrlarni Tozalash
            </button>
          </div>
        </div>
      )}

      <div className="relative group">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 group-focus-within:text-apple-accent transition-colors" size={20} />
        <input
          type="text"
          placeholder="INN, Firma nomi yoki Direktor ismi bo'yicha qidirish..."
          className="w-full pl-16 pr-8 py-5 md:py-6 bg-white dark:bg-apple-darkCard border border-apple-border dark:border-apple-darkBorder rounded-[1.5rem] md:rounded-[2rem] text-sm md:text-base font-bold focus:ring-4 focus:ring-apple-accent/10 outline-none transition-all shadow-sm"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
        />
      </div>

      <div className="space-y-8">
        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
            <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto scrollbar-hide">
              <OnboardingWizard
                staff={staff}
                initialData={form}
                initialAssignments={editingAssignments}
                onSave={(data, assignments) => {
                  onSave({ ...data, id: editingId || data.id }, assignments);
                  setIsAdding(false);
                  setEditingId(null);
                  setForm({});
                  setEditingAssignments(undefined);
                }}
                onCancel={() => {
                  setIsAdding(false);
                  setEditingId(null);
                  setForm({});
                  setEditingAssignments(undefined);
                }}
              />
            </div>
          </div>
        )}

        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {paginated.map(c => {
              const risk = getRiskIndicator(c);
              return (
                <div
                  key={c.id}
                  className="bg-white dark:bg-apple-darkCard p-6 rounded-[2rem] border border-apple-border dark:border-apple-darkBorder flex flex-col justify-between group hover:shadow-2xl transition-all hover:-translate-y-1 cursor-pointer relative"
                  onClick={() => onCompanySelect(c)}
                >
                  {/* Risk indicator badge */}
                  <div className={`absolute top-4 right-4 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${risk.bg} ${risk.color} border`}>
                    {risk.emoji} {c.companyStatus === 'active' || !c.companyStatus ? 'Faol' : c.companyStatus}
                  </div>

                  <div className="flex gap-5 mb-5">
                    <div className="h-16 w-16 bg-apple-accent/10 rounded-2xl flex items-center justify-center text-2xl font-black text-apple-accent group-hover:bg-apple-accent group-hover:text-white transition-all shadow-sm">
                      {c.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-lg font-black text-slate-800 dark:text-white truncate group-hover:text-apple-accent transition-colors" title={c.name}>{c.name}</h4>
                      {c.brandName && <p className="text-xs text-slate-400 font-medium">{c.brandName}</p>}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className="text-[10px] font-black px-2 py-0.5 bg-slate-100 dark:bg-white/5 text-slate-500 rounded-lg tabular-nums">INN: {c.inn}</span>
                        <span className="text-[10px] font-black px-2 py-0.5 bg-apple-accent/10 text-apple-accent rounded-lg uppercase">{c.taxType}</span>
                        {c.itParkResident && <span className="text-[10px] font-black px-2 py-0.5 bg-indigo-500/10 text-indigo-500 rounded-lg uppercase">IT Park</span>}
                        {c.serverInfo && <span className="text-[10px] font-black px-2 py-0.5 bg-amber-500/10 text-amber-600 rounded-lg uppercase">{c.serverInfo}</span>}
                        {c.ownerName && <span className="text-[10px] font-black px-3 py-1 bg-emerald-500/10 text-emerald-600 rounded-lg">{c.ownerName}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 self-start opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={(e) => { e.stopPropagation(); startEdit(c); }} className="p-3 bg-slate-50 dark:bg-white/5 text-slate-400 rounded-xl hover:text-apple-accent transition-all"><Edit3 size={18} /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id, c.name); }} className="p-3 bg-slate-50 dark:bg-white/5 text-slate-400 rounded-xl hover:text-rose-500 transition-all"><Trash2 size={18} /></button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-auto">
                    <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{t.accountant}</p>
                      <p className="text-sm font-black text-slate-800 dark:text-white truncate">{c.accountantName}</p>
                    </div>
                    {(c.login || c.password) ? (
                      <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl group/pass relative">
                        <button
                          onClick={() => togglePassword(c.id)}
                          className="absolute right-3 top-3 text-slate-400 hover:text-apple-accent transition-colors"
                        >
                          {showPasswords[c.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{t.login} / {t.password}</p>
                        <p className="text-xs font-bold text-slate-800 dark:text-white font-mono">
                          {showPasswords[c.id] ? `${c.login || '—'} / ${c.password || '—'}` : '•••••••• / ••••••••'}
                        </p>
                      </div>
                    ) : (
                      <div className="p-4 bg-slate-50/50 dark:bg-white/5 rounded-2xl flex items-center justify-center border-2 border-dashed border-apple-border dark:border-apple-darkBorder">
                        <span className="text-[10px] font-bold text-slate-300">No Credentials</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white dark:bg-apple-darkCard rounded-[2rem] border border-apple-border dark:border-apple-darkBorder overflow-hidden shadow-xl">
            {/* Top Scrollbar */}
            <div ref={topScrollRef} className="overflow-x-auto scrollbar-thin border-b dark:border-apple-darkBorder bg-slate-50/50 dark:bg-white/5">
              <div style={{ width: '1300px', height: '1px' }}></div>
            </div>

            <div ref={bottomScrollRef} className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-left border-collapse min-w-[1300px] table-fixed">
                <thead>
                  <tr className="bg-slate-50 dark:bg-white/10 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b dark:border-apple-darkBorder">
                    <th className="px-3 py-6 w-[45px] text-center">№</th>
                    <th className="px-3 py-6 w-[45px] text-center">Xavf</th>
                    <th
                      className="px-4 py-6 w-[240px] sticky left-0 bg-slate-50 dark:bg-apple-darkCard z-20 shadow-sm cursor-pointer hover:text-apple-accent transition-colors"
                      onClick={() => { setSortField('name'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}
                    >
                      {t.companyName} {sortField === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="px-3 py-6 w-[100px] cursor-pointer hover:text-apple-accent transition-colors"
                      onClick={() => { setSortField('inn'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}
                    >
                      {t.inn} {sortField === 'inn' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-3 py-6 w-[130px] text-apple-accent">Shartnoma</th>
                    <th className="px-3 py-6 w-[90px]">{t.regime}</th>
                    <th className="px-3 py-6 w-[130px]">Buxgalter</th>
                    <th className="px-3 py-6 w-[110px]">Nazoratchi</th>
                    <th className="px-3 py-6 w-[130px]">Server</th>
                    <th className="px-3 py-6 w-[100px]">Bank K.</th>
                    <th className="px-3 py-6 w-[120px]">Holat</th>
                    <th className="px-5 py-6 w-[130px] text-right">{t.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-apple-border dark:divide-apple-darkBorder">
                  {paginated.map(c => {
                    const risk = getRiskIndicator(c);
                    const op = operations.find(o => o.companyId === c.id && o.period === selectedPeriod);

                    // Historical fallbacks
                    const displayAmount = op?.contract_amount ?? c.contractAmount;
                    const displayAccountant = op?.assigned_accountant_name ?? c.accountantName;
                    const displaySupervisor = op?.assigned_supervisor_name ?? c.supervisorName;
                    const displayBankManager = op?.assigned_bank_manager_name ?? c.bankClientName;

                    return (
                      <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-all group">
                        <td className="px-3 py-5 text-center">
                          <span className="text-[10px] font-bold text-slate-300 font-mono">{c.originalIndex || '-'}</span>
                        </td>
                        <td className="px-3 py-5 text-center">
                          <span className={`text-lg ${risk.color}`} title={c.riskLevel || 'low'}>{risk.emoji}</span>
                        </td>
                        <td
                          className="px-4 py-5 sticky left-0 bg-white dark:bg-apple-darkCard group-hover:bg-slate-50 dark:group-hover:bg-apple-darkBg/90 z-20 shadow-sm transition-colors cursor-pointer overflow-hidden"
                          onClick={() => onCompanySelect(c)}
                        >
                          <div className="font-extrabold text-slate-800 dark:text-white text-[13px] tracking-tight hover:text-apple-accent transition-colors premium-text-gradient truncate w-full" title={c.name}>{c.name}</div>
                          {c.brandName && <div className="text-[9px] text-slate-400 font-medium truncate">{c.brandName}</div>}
                        </td>
                        <td className="px-3 py-5">
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 font-mono tabular-nums">{c.inn}</span>
                        </td>
                        <td className="px-3 py-5 font-black text-slate-800 dark:text-white tabular-nums text-[10px]">
                          {displayAmount?.toLocaleString() || '-'}
                        </td>
                        <td className="px-3 py-5">
                          <span className={`px-2 py-0.5 ${c.taxType?.includes('nds') ? 'bg-rose-500/10 text-rose-500' : 'bg-apple-accent/10 text-apple-accent'} text-[9px] font-black uppercase rounded-md`}>
                            {c.taxType === 'nds_profit' ? 'VAT' : (c.taxType === 'turnover' ? 'Aylanma' : (c.taxType || 'Fix'))}
                          </span>
                        </td>
                        <td className="px-3 py-5">
                          <p className="text-[11px] font-black text-slate-700 dark:text-slate-200 truncate">{displayAccountant || '—'}</p>
                          {c.accountantPerc ? <span className="text-[9px] font-bold text-slate-400">{c.accountantPerc}%</span> : null}
                        </td>
                        <td className="px-3 py-5">
                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate">{displaySupervisor || '—'}</span>
                        </td>
                        <td className="px-3 py-5">
                          <div className="flex flex-col gap-0.5 overflow-hidden">
                            {c.serverInfo && <span className="text-[8px] font-black text-apple-accent uppercase">{c.serverInfo}</span>}
                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate w-full" title={c.serverName}>{c.serverName || '—'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-5">
                          <div className="flex flex-col truncate">
                            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate">{displayBankManager || '—'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-5">
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase inline-block truncate max-w-full ${risk.bg} ${risk.color}`}>
                            {c.companyStatus === 'active' || !c.companyStatus ? 'FAOL' : c.companyStatus === 'suspended' ? "TO'XTAT" : c.companyStatus === 'debtor' ? 'QARZDOR' : c.companyStatus === 'problem' ? 'MUAMMOLI' : 'BANKROT'}
                          </span>
                        </td>
                        <td className="px-5 py-5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); onCompanySelect(c); }}
                              className="p-2 bg-slate-100 dark:bg-white/5 text-slate-500 rounded-lg hover:bg-apple-accent hover:text-white transition-all shadow-sm"
                              title="Details"
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); startEdit(c); }}
                              className="p-2 bg-apple-accent/10 text-apple-accent rounded-lg hover:bg-apple-accent hover:text-white transition-all shadow-sm"
                              title="Edit"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(c.id, c.name); }}
                              className="p-2 bg-rose-500/10 text-rose-500 rounded-lg hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {paginated.length === 0 && (
                <div className="p-32 flex flex-col items-center justify-center text-slate-300">
                  <LayoutGrid size={64} className="mb-4 opacity-20" />
                  <p className="font-black uppercase tracking-widest text-base">{t.noData}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t dark:border-apple-darkBorder pt-8">
            <p className="text-sm font-bold text-slate-400">
              {t.page} <span className="text-slate-700 dark:text-slate-200">{currentPage}</span> {t.of} {totalPages}
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="flex items-center gap-2 bg-white dark:bg-apple-darkCard border border-apple-border dark:border-apple-darkBorder p-3 rounded-xl disabled:opacity-30 font-black text-xs hover:border-apple-accent transition-colors shadow-sm"
              >
                <ChevronLeft size={16} /> {t.prev}
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="flex items-center gap-2 bg-white dark:bg-apple-darkCard border border-apple-border dark:border-apple-darkBorder p-3 rounded-xl disabled:opacity-30 font-black text-xs hover:border-apple-accent transition-colors shadow-sm"
              >
                {t.next} <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div >
  );
};

export default OrganizationModule;
