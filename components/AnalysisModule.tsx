
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Company, OperationEntry, Language } from '../types';
import { translations } from '../lib/translations';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, Sector
} from 'recharts';
import { Download, Calendar as CalendarIcon, TrendingUp, AlertCircle, CheckCircle2, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { MONTHS_UZ, periodsEqual } from '../lib/periods';

interface Props {
  companies: Company[];
  operations: OperationEntry[];
  selectedPeriod: string;
  onPeriodChange: (p: string) => void;
  lang: Language;
  onFilterApply: (filterStr: string) => void;
  staff: any[];
}

const AnalysisModule: React.FC<Props> = ({
  companies,
  operations,
  selectedPeriod,
  onPeriodChange,
  lang,
  onFilterApply
}) => {
  const t = translations[lang];
  const [activeSegment, setActiveSegment] = useState<string | null>(null);

  // --- 1. Data Processing ---
  const currentOps = useMemo(() => {
    return operations.filter(op => periodsEqual(op.period, selectedPeriod));
  }, [operations, selectedPeriod]);

  // KPI Calculations
  const metrics = useMemo(() => {
    const total = companies.length;
    let completed = 0;
    let issues = 0;
    let pending = 0;

    currentOps.forEach(op => {
      const statuses = [
        op.profitTaxStatus,
        op.form1Status,
        op.form2Status,
        op.statsStatus
      ];

      const hasBlock = statuses.some(s => s === 'kartoteka' || s === 'error' || s === 'OSHIBKA');
      const hasPending = statuses.some(s => s === 'not_submitted' || s === '-' || s === 'rejected');
      const isAllDone = statuses.every(s => s === 'accepted' || s === '+' || s === 'not_required' || s === '0');

      if (hasBlock) issues++;
      else if (hasPending) pending++;
      else if (isAllDone) completed++;
    });

    const opsCount = currentOps.length;
    pending += (total - opsCount);

    return { total, completed, issues, pending };
  }, [companies.length, currentOps]);

  const completionRate = metrics.total > 0 ? Math.round((metrics.completed / metrics.total) * 100) : 0;

  const handleExport = async () => {
    try {
      const { utils, writeFile } = await import('xlsx');

      const statsHeaders = [
        '12-Invest', '12-Moliya', '12-Korxona', '4-Mehnat', '4-KB Sanoat', '1-Invest'
      ];
      const statsKeys = [
        'stat_12_invest', 'stat_12_moliya', 'stat_12_korxona', 'stat_4_mehnat', 'stat_4_kb_sanoat', 'stat_1_invest'
      ];

      const headers = [
        'Firma Nomi', 'INN', 'Soliq Rejimi', 'Foyda Solig\'i', 'Aylanma/QQS', 'Statistika Status',
        ...statsHeaders
      ];

      const rows = companies.map(c => {
        const op = currentOps.find(o => o.companyId === c.id);
        const statsValues = statsKeys.map(k => op ? (op as any)[k] || '-' : '-');

        return [
          c.name,
          c.inn,
          c.taxType,
          op?.profitTaxStatus || '-',
          op?.aylanma_qqs || '-',
          op?.statsStatus || '-',
          ...statsValues
        ];
      });

      const ws = utils.aoa_to_sheet([headers, ...rows]);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Tahlil 2026");
      writeFile(wb, `tahlil_hisobot_${selectedPeriod}.xlsx`);
    } catch (error) {
      console.error('Export error:', error);
    }
  };

  // --- 2. Charts Data ---
  const reportStatusData = useMemo(() => {
    const keys = [
      { key: 'profitTaxStatus', label: t.profitTax },
      { key: 'aylanma_qqs', label: 'Aylanma / QQS' },
      { key: 'statsStatus', label: t.stats }
    ];

    return keys.map(k => {
      let accepted = 0;
      let rejected = 0;
      let pending = 0;
      let blocked = 0;

      currentOps.forEach(op => {
        const val = (op as any)[k.key];
        if (val === 'accepted' || val === '+' || val === '0' || val === 'not_required') accepted++;
        else if (val === 'rejected' || val === 'rad etildi') rejected++;
        else if (val === 'blocked' || val === 'kartoteka' || val === 'error') blocked++;
        else pending++;
      });
      pending += (companies.length - currentOps.length);

      return {
        name: k.label,
        Bajarildi: accepted,
        "Rad etildi": rejected,
        "Muammo": blocked,
        "Kutilmoqda": pending
      };
    });
  }, [currentOps, companies.length, t]);

  const stats2026Data = useMemo(() => {
    const statKeys = [
      'stat_12_invest', 'stat_12_moliya', 'stat_12_korxona',
      'stat_4_mehnat', 'stat_4_kb_sanoat', 'stat_1_invest'
    ];

    return statKeys.map(key => {
      let count = 0;
      currentOps.forEach(op => {
        const val = (op as any)[key];
        if (val === '+' || val === 'accepted') count++;
      });
      return {
        name: key.replace('stat_', '').replace(/_/g, ' ').toUpperCase(),
        value: count,
        fullMark: companies.length
      };
    }).sort((a, b) => b.value - a.value);
  }, [currentOps, companies.length]);

  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setHasMounted(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-8 animate-fade-in pb-20">

      {/* --- Header & Period Selector --- */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 liquid-glass-card p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] shadow-glass border border-white/10">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-slate-800 dark:text-white tracking-tighter leading-tight premium-text-gradient">{t.analysis}</h2>
          <p className="text-[10px] md:text-sm text-slate-500 dark:text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">{t.analyticalCenterSub}</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
          <MonthPicker selectedPeriod={selectedPeriod} onChange={onPeriodChange} />

          <button
            onClick={handleExport}
            className="w-full sm:w-auto justify-center flex items-center gap-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-8 py-4 rounded-xl md:rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-[0.2em] hover:opacity-90 transition-all active:scale-95 shadow-glass-lg border border-transparent dark:border-white/20"
          >
            <Download size={18} />
            <span>{t.excelExport}</span>
          </button>
        </div>
      </div>

      {/* --- KPI Cards --- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
        <KPICard
          title={t.totalFirmsShort}
          value={metrics.total}
          icon={<BriefcaseIcon className="text-blue-500" />}
          trend="+2"
          color="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
        />
        <KPICard
          title={t.completionRate}
          value={`${completionRate}%`}
          icon={<TrendingUp className="text-emerald-500" />}
          subtitle={`${metrics.completed} ta firma yopildi`}
          color="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
        />
        <KPICard
          title={t.problematic}
          value={metrics.issues}
          icon={<AlertCircle className="text-rose-500" />}
          subtitle="Kartoteka / Xatolik"
          color="bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400"
        />
        <KPICard
          title={t.pending}
          value={metrics.pending}
          icon={<Clock className="text-amber-500" />}
          subtitle="Topshirilmagan"
          color="bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400"
        />
      </div>

      {/* --- Charts Section --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 liquid-glass-card p-6 md:p-10 rounded-[2.5rem] md:rounded-[3.5rem] shadow-glass border border-white/10">
          <h3 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white mb-8 flex items-center gap-3">
            <div className="w-1.5 h-6 md:h-8 bg-indigo-500 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.5)]"></div>
            {t.reportStatus}
          </h3>
          <div className="h-[350px] min-h-[350px] w-full relative overflow-hidden flex items-center justify-center">
            {hasMounted ? (
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={reportStatusData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.5} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12, fontWeight: 600 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: '#F1F5F9', opacity: 0.4 }}
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px -5px rgba(0,0,0,0.1)' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                  <Bar dataKey="Bajarildi" stackId="a" fill="#10B981" radius={[0, 0, 4, 4]} barSize={40} />
                  <Bar dataKey="Rad etildi" stackId="a" fill="#EF4444" radius={[0, 0, 0, 0]} barSize={40} />
                  <Bar dataKey="Muammo" stackId="a" fill="#F59E0B" radius={[0, 0, 0, 0]} barSize={40} />
                  <Bar dataKey="Kutilmoqda" stackId="a" fill="#CBD5E1" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-12 h-12 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin"></div>
            )}
          </div>
        </div>

        <div className="liquid-glass-card p-6 md:p-10 rounded-[2.5rem] md:rounded-[3.5rem] flex flex-col shadow-glass border border-white/10">
          <h3 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white mb-2 flex items-center gap-3">
            <div className="w-1.5 h-6 md:h-8 bg-pink-500 rounded-full shadow-[0_0_15px_rgba(236,72,153,0.5)]"></div>
            Top 6 Statistika
          </h3>
          <p className="text-[10px] md:text-xs text-slate-400 font-black uppercase tracking-widest mb-8 pl-4 opacity-60">Eng ko'p topshirilganlar</p>
          <div className="flex-1 w-full min-h-[300px] flex items-center justify-center">
            {hasMounted ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart layout="vertical" data={stats2026Data} margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 10, fill: '#64748B', fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '12px' }} />
                  <Bar dataKey="value" fill="#EC4899" radius={[0, 8, 8, 0]} barSize={20} background={{ fill: '#F1F5F9', radius: [0, 8, 8, 0] }} />
                </BarChart>
              </ResponsiveContainer>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="liquid-glass-card p-6 md:p-10 rounded-[2.5rem] md:rounded-[3.5rem] shadow-glass border border-white/10">
          <h3 className="text-lg md:text-xl font-black text-slate-800 dark:text-white mb-8 uppercase tracking-tight">{t.taxRegime}</h3>
          <div className="h-64 flex items-center justify-center relative overflow-hidden">
            {hasMounted ? (
              <ResponsiveContainer width="100%" height={256}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'QQS', value: companies.filter(c => c.taxType === 'nds_profit' || c.taxType === 'vat').length, color: '#6366F1' },
                      { name: 'Aylanma', value: companies.filter(c => c.taxType === 'turnover').length, color: '#10B981' },
                      { name: 'Qat\'iy', value: companies.filter(c => c.taxType === 'fixed').length, color: '#F59E0B' }
                    ]}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    <Cell fill="#6366F1" />
                    <Cell fill="#10B981" />
                    <Cell fill="#F59E0B" />
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-10 h-10 border-4 border-slate-100 border-t-indigo-500 rounded-full animate-spin"></div>
            )}
          </div>
        </div>

        <div className="liquid-glass-card p-8 rounded-[2.5rem] flex flex-col justify-center items-center text-center">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-indigo-500/30">
            <CheckCircle2 className="text-white w-10 h-10" />
          </div>
          <h3 className="text-2xl font-black text-slate-800 dark:text-white mb-2">Hammasi Nazoratda</h3>
          <p className="text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
            Sizning buxgalteriya hisobotlaringiz 2026-yilgi standartlar asosida to'liq tahlil qilinmoqda.
          </p>
        </div>
      </div>
    </div>
  );
};

// --- Custom Month Picker ---
const MonthPicker: React.FC<{ selectedPeriod: string; onChange: (p: string) => void }> = ({ selectedPeriod, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => {
    const y = parseInt(selectedPeriod.split(' ')[0]);
    return isNaN(y) ? 2026 : y;
  });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [ref]);

  const handleMonthSelect = (month: string) => {
    onChange(`${viewYear} ${month}`);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 w-full sm:w-auto bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-[1.2rem] md:rounded-2xl px-6 md:px-8 py-4 md:py-4.5 font-black text-slate-800 dark:text-white hover:bg-slate-50 dark:hover:bg-white/10 transition-all shadow-sm active:scale-95 min-w-[200px] justify-center"
      >
        <span className="text-base md:text-lg">{selectedPeriod}</span>
        <CalendarIcon size={18} className="text-slate-400 md:w-5 md:h-5" />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 left-0 z-50 bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-slate-100 dark:border-gray-700 p-6 w-[320px] animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setViewYear(y => y - 1)}
              className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-xl font-black text-slate-800 dark:text-white">{viewYear}</span>
            <button
              onClick={() => setViewYear(y => y + 1)}
              className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {MONTHS_UZ.map((month) => {
              const isSelected = selectedPeriod === `${viewYear} ${month}`;
              return (
                <button
                  key={month}
                  onClick={() => handleMonthSelect(month)}
                  className={`py-3 rounded-xl text-sm font-bold transition-all ${isSelected
                    ? 'bg-slate-900 text-white shadow-lg scale-105'
                    : 'bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
                    }`}
                >
                  {month}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const KPICard = ({ title, value, icon, trend, subtitle, color }: any) => (
  <div className="liquid-glass-card p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] group shadow-glass border border-white/10 hover:shadow-glass-lg transition-all duration-500 hover:-translate-y-1">
    <div className="flex justify-between items-start mb-6">
      <div className={`p-4 rounded-2xl ${color} transition-colors shadow-sm`}>
        {React.cloneElement(icon, { size: 24, className: icon.props.className + " md:w-7 md:h-7" })}
      </div>
      {trend && (
        <span className="px-3 py-1 bg-emerald-500/10 text-emerald-600 text-[10px] font-black rounded-lg uppercase tracking-widest border border-emerald-500/10">
          {trend} <span className="opacity-60 text-[8px] ml-0.5">⬆</span>
        </span>
      )}
    </div>
    <p className="text-slate-400 text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] mb-2">{title}</p>
    <h3 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white mb-2 tracking-tighter">{value}</h3>
    {subtitle && <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest opacity-60 leading-relaxed">{subtitle}</p>}
  </div>
);

const BriefcaseIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-6 h-6 ${className}`}>
    <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </svg>
);

export default AnalysisModule;
