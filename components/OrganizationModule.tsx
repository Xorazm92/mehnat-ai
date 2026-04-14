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
    <div className="w-full space-y-6 md:space-y-10 animate-fade-in pb-24 min-w-0">
      {companies.length === 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-[2rem] p-8 text-center">
          <p className="text-amber-700 dark:text-amber-300 font-black text-sm uppercase tracking-widest">
            ⚠️ Hech qanday firma yuklanmadi. Iltimos, sahifani yangilang yoki administratorga murojaat qiling.
          </p>
        </div>
      )}
      {/* Header Section */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center bg-white dark:bg-[#22252B] p-4 md:p-6 rounded-md shadow-sm border border-gray-200 dark:border-gray-700 gap-4 relative overflow-hidden group">
        <div className="flex-1 relative z-10 flex items-center gap-4">
          <div className="w-10 h-10 rounded bg-blue-600 flex items-center justify-center text-white shadow-sm">
            <Building2 size={24} />
          </div>
          <div>
            <h2 className="text-[18px] md:text-xl font-bold text-gray-800 dark:text-white mb-1.5">{t.organizations}</h2>
            <div className="flex items-center gap-3">
              <p className="text-[12px] font-semibold text-gray-500 dark:text-gray-400">
                {t.totalFirms}: <span className="text-blue-600 tabular-nums font-bold">{filtered.length}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto relative z-10">
          {/* Active/Archive Toggle */}
          <div className="flex bg-gray-100 dark:bg-gray-800 p-0.5 rounded border border-gray-200 dark:border-gray-700">
            {[
              { label: 'Faol', value: true },
              { label: 'Arxiv', value: false },
              { label: 'Hammasi', value: null }
            ].map((opt) => (
              <button
                key={String(opt.value)}
                onClick={() => setFilterActive(opt.value)}
                className={`px-4 py-1.5 rounded transition-all text-[12px] font-semibold ${filterActive === opt.value ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* View Mode Toggle */}
          <div className="flex bg-gray-100 dark:bg-gray-800 p-0.5 rounded border border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              title={t.gridView}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded transition-all ${viewMode === 'table' ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              title={t.tableView}
            >
              <List size={16} />
            </button>
          </div>

          <MonthPicker
            selectedPeriod={selectedPeriod}
            onChange={onPeriodChange}
            className="scale-90 origin-left"
          />

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExport}
              className="p-2 bg-white dark:bg-gray-800 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-all border border-gray-200 dark:border-gray-700"
              title="Excelga eksport"
            >
              <Download size={18} />
            </button>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded transition-all border ${showFilters ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 border-blue-200 dark:border-blue-800' : 'bg-white dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700 hover:text-blue-600'}`}
              title="Aqlli Filtrlar"
            >
              <Filter size={18} />
            </button>
          </div>

          <button
            onClick={() => { setIsAdding(true); setForm({ id: Math.random().toString(36).substr(2, 9), createdAt: new Date().toISOString(), isActive: true }); }}
            className="bg-blue-600 text-white px-4 py-2 rounded font-semibold text-[13px] hover:bg-blue-700 transition-colors active:bg-blue-800 flex items-center gap-2"
          >
            <Plus size={16} />
            <span>{t.addCompany}</span>
          </button>
        </div>
      </div>

      {/* Smart Filters Panel */}
      {showFilters && (
        <div className="bg-white dark:bg-[#22252B] p-5 rounded-md shadow-sm border border-gray-200 dark:border-gray-700 animate-fade-in relative z-10">
          <div className="flex items-center gap-2 mb-4 border-b border-gray-100 dark:border-gray-700 pb-3">
            <div className="w-8 h-8 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 flex items-center justify-center">
              <Filter size={18} />
            </div>
            <h3 className="text-[14px] font-bold text-gray-800 dark:text-white">Aqlli Filtrlar</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <div key={idx} className="space-y-1.5">
                <label className="text-[11px] font-semibold text-gray-500 uppercase">{f.label}</label>
                <select
                  value={f.value}
                  onChange={(e) => { f.onChange(e.target.value); setCurrentPage(1); }}
                  className="w-full px-3 py-2 rounded bg-white dark:bg-[#1A1D23] border border-gray-300 dark:border-gray-600 outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500 text-[13px] text-gray-700 dark:text-gray-300 transition-all shadow-sm"
                >
                  {f.options.map((o, i) => <option key={i} value={o.val}>{o.label}</option>)}
                </select>
              </div>
            ))}
          </div>

          {/* Reset Filters */}
          <div className="flex justify-end mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <button
              onClick={() => {
                setFilterTaxType('all'); setFilterStatus('all'); setFilterEmployee('all');
                setFilterRisk('all'); setFilterServer('all'); setFilterItPark('all');
                setFilterKpi('all'); setCurrentPage(1);
              }}
              className="px-4 py-1.5 rounded text-[12px] font-semibold text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all border border-transparent hover:border-red-200"
            >
              Filtrlarni Tozalash
            </button>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative w-full max-w-2xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input
          type="text"
          placeholder="INN, Firma nomi yoki Direktor ismi bo'yicha qidirish..."
          className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#22252B] border border-gray-300 dark:border-gray-600 rounded-md text-[14px] text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:border-blue-500 focus:ring-blue-500/30 transition-all shadow-sm"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginated.map(c => {
              const risk = getRiskIndicator(c);
              return (
                <div
                  key={c.id}
                  className={`bg-white dark:bg-[#22252B] p-4 rounded-md border-l-4 ${risk.color.replace('text-', 'border-l-')} border-t border-r border-b border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col`}
                  onClick={() => onCompanySelect(c)}
                >
                  <div className="flex gap-4 mb-4">
                    <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded flex items-center justify-center text-xl font-bold text-blue-600 shrink-0 border border-blue-100 dark:border-blue-800">
                      {c.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-[14px] font-bold text-gray-800 dark:text-white truncate mb-0.5" title={c.name}>{c.name}</h4>
                      {c.brandName && <p className="text-[11px] text-gray-500 font-semibold mb-2">{c.brandName}</p>}
                      <div className="flex gap-2">
                        <span className="text-[10px] font-mono px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded border border-gray-200 dark:border-gray-700">INN: {c.inn}</span>
                        <span className="text-[10px] px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded border border-blue-100 dark:border-blue-800">{c.taxType}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-4 mt-auto">
                    {[
                      { label: t.accountant, val: c.accountantName, icon: <Users size={12} className="text-blue-500" /> },
                      { label: 'Soliq', val: c.taxRegime || 'Standard', icon: <Calculator size={12} className="text-green-500" /> }
                    ].map((stat, i) => (
                      <div key={i} className="p-2 bg-gray-50 dark:bg-[#1A1D23] rounded border border-gray-100 dark:border-gray-800">
                        <div className="flex items-center gap-1.5 mb-1 text-gray-400">
                          {stat.icon}
                          <p className="text-[10px] font-semibold">{stat.label}</p>
                        </div>
                        <p className="text-[11px] font-bold text-gray-700 dark:text-gray-200 truncate">{stat.val || '—'}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800 mt-auto">
                    <div className="flex flex-col gap-1">
                      {(c.login || c.password) ? (
                        <div className="flex items-center gap-1.5" onClick={(e) => { e.stopPropagation(); togglePassword(c.id); }}>
                          <button className="text-gray-400 hover:text-blue-600 transition-colors p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
                            {showPasswords[c.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          <p className="text-[11px] font-bold text-gray-500 font-mono">
                            {showPasswords[c.id] ? `${c.login || '—'} / ${c.password || '—'}` : '•••• / ••••'}
                          </p>
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-400 font-medium">Ma'lumotlar yo'q</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); startEdit(c); }} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors" title="Edit"><Edit3 size={16} /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id, c.name); }} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors" title="Delete"><Trash2 size={16} /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="w-full bg-white dark:bg-[#22252B] rounded-md shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden relative">
            <div ref={bottomScrollRef} className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[960px] c1-table">
                <thead>
                  <tr>
                    <th className="w-[40px] text-center">№</th>
                    <th
                      className="w-[220px] sticky left-0 z-20 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      onClick={() => { setSortField('name'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}
                    >
                      <div className="flex items-center gap-1.5">
                        <Building2 size={14} className="text-gray-400 shrink-0" />
                        <span>{t.companyName} {sortField === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}</span>
                      </div>
                    </th>
                    <th
                      className="w-[100px] cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      onClick={() => { setSortField('inn'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}
                    >
                      {t.inn} {sortField === 'inn' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="w-[120px] text-blue-600">
                      <div className="flex items-center gap-1"><DollarSign size={12} /> SHARTNOMA</div>
                    </th>
                    <th className="w-[100px]">REJIM</th>
                    <th className="w-[150px]">BUXGALTER</th>
                    <th className="w-[140px]">NAZORATCHI</th>
                    <th className="w-[120px]">1C SERVER</th>
                    <th className="w-[100px] text-center">{t.actions}</th>
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
                        className={(i % 2 === 0 ? 'bg-white dark:bg-[#22252B]' : 'bg-[#FAFAFA] dark:bg-[#1A1D23]') + ' hover:bg-blue-50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors group'}
                      >
                        <td className="text-center font-mono text-gray-500">
                          {c.originalIndex || (i + 1)}
                        </td>
                        <td className={`sticky left-0 bg-inherit z-10 font-medium text-gray-800 dark:text-gray-200 border-l-2 ${risk.color.replace('text-', 'border-l-')}`}>
                          <div className="truncate max-w-[200px]" title={c.name}>{c.name}</div>
                          {c.brandName && <div className="text-[10px] text-gray-500 truncate mt-0.5">{c.brandName}</div>}
                        </td>
                        <td className="font-mono text-gray-600 dark:text-gray-400">
                          {c.inn}
                        </td>
                        <td className="font-semibold text-right">
                          {displayAmount?.toLocaleString() || '0'} <span className="text-[10px] font-normal text-gray-400">UZS</span>
                        </td>
                        <td className="text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${c.taxType?.includes('nds') ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                            {c.taxType === 'nds_profit' ? 'VAT' : (c.taxType === 'turnover' ? 'Aylanma' : (c.taxType || 'Fix'))}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5 truncate">
                            <Users size={12} className="text-gray-400 shrink-0" />
                            <span className="truncate text-gray-700 dark:text-gray-300">{displayAccountant || '—'}</span>
                          </div>
                        </td>
                        <td>
                          <span className="truncate block text-gray-700 dark:text-gray-300">{displaySupervisor || '—'}</span>
                        </td>
                        <td>
                          <div className="flex flex-col">
                            {c.serverInfo && <span className="text-[10px] font-semibold text-green-600">{c.serverInfo}</span>}
                            <span className="text-[10px] text-gray-500 truncate" title={c.serverName}>{c.serverName || '—'}</span>
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={(e) => { e.stopPropagation(); onCompanySelect(c); }} className="text-gray-400 hover:text-blue-600 p-1" title="Details"><Eye size={14} /></button>
                            <button onClick={(e) => { e.stopPropagation(); startEdit(c); }} className="text-gray-400 hover:text-blue-600 p-1" title="Edit"><Edit3 size={14} /></button>
                            <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id, c.name); }} className="text-gray-400 hover:text-red-600 p-1" title="Delete"><Trash2 size={14} /></button>
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
          <div className="flex items-center justify-between mt-4 bg-white dark:bg-[#22252B] p-3 rounded-md border border-gray-200 dark:border-gray-700 shadow-sm">
            <p className="text-[12px] font-semibold text-gray-500 dark:text-gray-400">
              {t.page} <span className="text-blue-600">{currentPage}</span> {t.of} {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                disabled={currentPage === 1}
                className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded disabled:opacity-50 text-[12px] font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} /> {t.prev}
              </button>
              <button
                onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                disabled={currentPage === totalPages}
                className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded disabled:opacity-50 text-[12px] font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:cursor-not-allowed"
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
