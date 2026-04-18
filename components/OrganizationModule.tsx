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
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center bg-white dark:bg-[#22252B] p-4 rounded-sm shadow-sm border border-[#DEE2E6] dark:border-[#3A3D44] gap-4 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-sm bg-[#3366CC] flex items-center justify-center text-white shadow-sm shrink-0">
            <Building2 size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="text-[14px] font-bold text-gray-800 dark:text-white mb-0.5 uppercase tracking-wider truncate">{t.organizations}</h2>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              {t.totalFirms}: <span className="text-[#3366CC] tabular-nums">{filtered.length}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto">
          <div className="flex bg-[#F8F9FA] dark:bg-[#1A1D23] p-1 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] transition-colors">
            {[
              { label: 'Faol', value: true },
              { label: 'Arxiv', value: false },
              { label: 'Barchasi', value: null }
            ].map((opt) => (
              <button
                key={String(opt.value)}
                onClick={() => setFilterActive(opt.value)}
                className={`px-3 py-1 rounded-sm transition-all text-[9px] font-bold uppercase tracking-widest ${filterActive === opt.value ? 'bg-white dark:bg-[#333] text-[#3366CC] shadow-sm border border-[#DEE2E6] dark:border-[#444]' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 border border-transparent'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex bg-[#F8F9FA] dark:bg-[#1A1D23] p-1 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] transition-colors">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1 rounded-sm transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-[#333] text-[#3366CC] shadow-sm border border-[#DEE2E6] dark:border-[#444]' : 'text-gray-400 hover:text-gray-600 border border-transparent'}`}
              title={t.gridView}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1 rounded-sm transition-all ${viewMode === 'table' ? 'bg-white dark:bg-[#333] text-[#3366CC] shadow-sm border border-[#DEE2E6] dark:border-[#444]' : 'text-gray-400 hover:text-gray-600 border border-transparent'}`}
              title={t.tableView}
            >
              <List size={14} />
            </button>
          </div>

          <div className="h-6 w-px bg-[#DEE2E6] dark:bg-[#3A3D44] mx-1 hidden sm:block" />

          <MonthPicker
            selectedPeriod={selectedPeriod}
            onChange={onPeriodChange}
            className="scale-90 origin-right transition-transform hover:scale-100"
          />

          <div className="flex items-center gap-1">
            <button
              onClick={handleExport}
              className="p-1.5 bg-white dark:bg-[#22252B] text-gray-500 hover:text-[#3366CC] rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] hover:bg-[#F8F9FA] transition-all"
              title="Excelga eksport"
            >
              <Download size={15} />
            </button>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-1.5 rounded-sm border transition-all ${showFilters ? 'bg-[#EBF3FF] dark:bg-[#1C2531] text-[#3366CC] border-[#3366CC]/30' : 'bg-white dark:bg-[#22252B] text-gray-500 border-[#DEE2E6] dark:border-[#3A3D44] hover:bg-[#F8F9FA]'}`}
              title="Filtrlar"
            >
              <Filter size={15} />
            </button>
          </div>

          <button
            onClick={() => { setIsAdding(true); setForm({ id: Math.random().toString(36).substr(2, 9), createdAt: new Date().toISOString(), isActive: true }); }}
            className="bg-[#3366CC] text-white px-3 py-1.5 rounded-sm font-bold text-[10px] hover:bg-[#2A52A3] transition-all active:transform active:scale-95 flex items-center gap-1.5 uppercase tracking-widest shadow-sm"
          >
            <Plus size={14} />
            <span>{t.addCompany}</span>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {paginated.map(c => {
              const risk = getRiskIndicator(c);
              return (
                <div
                  key={c.id}
                  className={`bg-white dark:bg-[#22252B] p-3 rounded-sm border-l-4 ${risk.color.replace('text-', 'border-l-')} border-t border-r border-b border-[#DEE2E6] dark:border-[#3A3D44] shadow-sm hover:border-[#3366CC]/50 transition-all cursor-pointer flex flex-col group`}
                  onClick={() => onCompanySelect(c)}
                >
                  <div className="flex gap-3 mb-3">
                    <div className="w-10 h-10 bg-[#F8F9FA] dark:bg-[#1A1D23] rounded-sm flex items-center justify-center text-[16px] font-bold text-[#3366CC] shrink-0 border border-[#DEE2E6] dark:border-[#3A3D44] group-hover:bg-[#EBF3FF] transition-colors">
                      {c.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-[12px] font-bold text-gray-800 dark:text-white truncate mb-0.5 uppercase tracking-tight" title={c.name}>{c.name}</h4>
                      {c.brandName && <p className="text-[9px] text-gray-400 font-bold uppercase truncate leading-none mb-1.5">{c.brandName}</p>}
                      <div className="flex gap-1.5">
                        <span className="text-[8px] font-bold px-1.5 py-0.5 bg-[#F0F2F5] dark:bg-[#111318] text-gray-500 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] uppercase tracking-widest">INN: {c.inn}</span>
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-sm border uppercase tracking-widest ${c.taxType === 'nds_profit' ? 'bg-[#FEEBF0] text-rose-600 border-[#F5C6CB]' : 'bg-[#EBF3FF] text-[#3366CC] border-[#DEE2E6]'}`}>{c.taxType}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3 mt-auto">
                    {[
                      { label: t.accountant, val: c.accountantName, icon: <Users size={10} className="text-gray-400" /> },
                      { label: 'Soliq Rejimi', val: c.taxRegime || 'Standard', icon: <Calculator size={10} className="text-gray-400" /> }
                    ].map((stat, i) => (
                      <div key={i} className="p-1.5 bg-[#F8F9FA] dark:bg-[#1A1D23] rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44]">
                        <div className="flex items-center gap-1 mb-0.5">
                          {stat.icon}
                          <p className="text-[7px] font-bold text-gray-400 uppercase tracking-widest">{stat.label}</p>
                        </div>
                        <p className="text-[9px] font-bold text-gray-700 dark:text-gray-300 truncate tracking-tight">{stat.val || '—'}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-2.5 border-t border-[#F0F2F5] dark:border-[#1e2025] mt-auto">
                    <div className="min-w-0 flex-1">
                      {(c.login || c.password) ? (
                        <div className="flex items-center gap-1.5 cursor-help" onClick={(e) => { e.stopPropagation(); togglePassword(c.id); }}>
                          <div className="text-gray-400 p-0.5">
                            {showPasswords[c.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                          </div>
                          <p className="text-[9px] font-bold text-[#3366CC] font-mono whitespace-nowrap overflow-hidden text-ellipsis">
                            {showPasswords[c.id] ? `${c.login || '—'} / ${c.password || '—'}` : '•••• / ••••'}
                          </p>
                        </div>
                      ) : (
                        <span className="text-[8px] text-gray-400 font-bold uppercase tracking-widest">Login yo'q</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 ml-2">
                      <button onClick={(e) => { e.stopPropagation(); startEdit(c); }} className="p-1 text-[#3366CC] hover:bg-[#EBF3FF] dark:hover:bg-[#1C2531] rounded-sm border border-transparent hover:border-[#3366CC]/30 transition-all"><Edit3 size={14} /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id, c.name); }} className="p-1 text-rose-500 hover:bg-[#FEEBF0] dark:hover:bg-[#2D1B1E] rounded-sm border border-transparent hover:border-rose-300 transition-all"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="w-full bg-white dark:bg-[#22252B] rounded-sm shadow-sm border border-[#DEE2E6] dark:border-[#3A3D44] overflow-hidden relative transition-colors">
            <div ref={bottomScrollRef} className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1000px] c1-table">
                <thead>
                  <tr>
                    <th className="w-[40px] text-center uppercase tracking-widest text-gray-400">№</th>
                    <th
                      className="w-[240px] sticky left-0 z-20 cursor-pointer hover:bg-[#F8F9FA] dark:hover:bg-[#1e2025] transition-colors"
                      onClick={() => { setSortField('name'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}
                    >
                      <div className="flex items-center gap-1.5">
                        <Building2 size={12} className="text-gray-400 shrink-0" />
                        <span>{t.companyName} {sortField === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}</span>
                      </div>
                    </th>
                    <th
                      className="w-[100px] cursor-pointer hover:bg-[#F8F9FA] dark:hover:bg-[#1e2025] transition-colors"
                      onClick={() => { setSortField('inn'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}
                    >
                      {t.inn} {sortField === 'inn' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="w-[130px] text-[#3366CC] font-bold">
                      <div className="flex items-center justify-end gap-1 uppercase tracking-tight"><DollarSign size={10} /> SHARTNOMA</div>
                    </th>
                    <th className="w-[110px] text-center uppercase tracking-tight">REJIM</th>
                    <th className="w-[160px] uppercase tracking-tight">BUXGALTER</th>
                    <th className="w-[150px] uppercase tracking-tight">NAZORATCHI</th>
                    <th className="w-[130px] uppercase tracking-tight">1C SERVER</th>
                    <th className="w-[90px] text-center uppercase tracking-tight">{t.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F2F5] dark:divide-[#1e2025]">
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
                        className={(i % 2 === 0 ? 'bg-white dark:bg-[#22252B]' : 'bg-[#FAFAFA] dark:bg-[#202328]') + ' hover:bg-[#EBF3FF] dark:hover:bg-[#1C2531] cursor-pointer transition-colors group'}
                      >
                        <td className="text-center font-mono text-[10px] text-gray-400 font-bold">
                          {c.originalIndex || (i + 1)}
                        </td>
                        <td className={`sticky left-0 bg-inherit z-10 font-bold text-gray-800 dark:text-white border-l-4 ${risk.color.replace('text-', 'border-l-')}`}>
                          <div className="truncate max-w-[210px] uppercase tracking-tight" title={c.name}>{c.name}</div>
                          {c.brandName && <div className="text-[8px] text-gray-400 font-bold truncate mt-0.5 uppercase tracking-widest">{c.brandName}</div>}
                        </td>
                        <td className="font-mono text-[10px] text-gray-500 font-bold">
                          {c.inn}
                        </td>
                        <td className="font-bold text-right text-[11px] tabular-nums">
                          {displayAmount?.toLocaleString() || '0'} <span className="text-[8px] font-bold text-gray-400 uppercase ml-0.5">sum</span>
                        </td>
                        <td className="text-center">
                          <span className={`px-2 py-0.5 rounded-sm text-[8px] font-black uppercase tracking-widest border transition-colors ${c.taxType?.includes('nds') ? 'bg-[#FEEBF0] text-rose-600 border-[#F5C6CB]' : 'bg-[#EBF3FF] text-[#3366CC] border-[#DEE2E6]'}`}>
                            {c.taxType === 'nds_profit' ? 'VAT' : (c.taxType === 'turnover' ? 'AYLANMA' : (c.taxType?.toUpperCase() || 'FIX'))}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5 truncate">
                            <Users size={10} className="text-gray-400 shrink-0" />
                            <span className="truncate text-gray-700 dark:text-gray-300 text-[10px] font-bold uppercase tracking-tight">{displayAccountant || '—'}</span>
                          </div>
                        </td>
                        <td>
                          <span className="truncate block text-gray-600 dark:text-gray-400 text-[10px] font-bold uppercase tracking-tight">{displaySupervisor || '—'}</span>
                        </td>
                        <td>
                          <div className="flex flex-col">
                            {c.serverInfo && <span className="text-[9px] font-black text-[#28A745] uppercase tracking-widest leading-none mb-0.5">{c.serverInfo}</span>}
                            <span className="text-[8px] text-gray-400 font-bold truncate uppercase tracking-tight" title={c.serverName}>{c.serverName || '—'}</span>
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center justify-center gap-1 opacity-20 group-hover:opacity-100 transition-opacity">
                            <button onClick={(e) => { e.stopPropagation(); onCompanySelect(c); }} className="text-gray-400 hover:text-[#3366CC] p-1 transition-colors" title="Batafsil"><Eye size={14} /></button>
                            <button onClick={(e) => { e.stopPropagation(); startEdit(c); }} className="text-gray-400 hover:text-[#3366CC] p-1 transition-colors" title="Edit"><Edit3 size={14} /></button>
                            <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id, c.name); }} className="text-gray-400 hover:text-rose-500 p-1 transition-colors" title="Delete"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {paginated.length === 0 && (
                <div className="py-32 flex flex-col items-center justify-center text-gray-300">
                  <LayoutGrid size={40} className="opacity-20 mb-4" />
                  <p className="font-bold uppercase tracking-[0.2em] text-[10px] opacity-40">{t.noData}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 bg-white dark:bg-[#22252B] p-2.5 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] shadow-sm transition-colors">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              {t.page} <span className="text-[#3366CC]">{currentPage}</span> / {totalPages}
            </p>
            <div className="flex gap-1.5">
              <button
                onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                disabled={currentPage === 1}
                className="flex items-center gap-1 bg-[#F8F9FA] dark:bg-[#1A1D23] px-3 py-1 rounded-sm disabled:opacity-30 text-[9px] font-bold text-gray-600 dark:text-gray-300 border border-[#DEE2E6] dark:border-[#3A3D44] hover:bg-[#EBF3FF] transition-all disabled:cursor-not-allowed uppercase tracking-widest"
              >
                <ChevronLeft size={12} /> {t.prev}
              </button>
              <button
                onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                disabled={currentPage === totalPages}
                className="flex items-center gap-1 bg-[#F8F9FA] dark:bg-[#1A1D23] px-3 py-1 rounded-sm disabled:opacity-30 text-[9px] font-bold text-gray-600 dark:text-gray-300 border border-[#DEE2E6] dark:border-[#3A3D44] hover:bg-[#EBF3FF] transition-all disabled:cursor-not-allowed uppercase tracking-widest"
              >
                {t.next} <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div >
  );
};

export default OrganizationModule;
