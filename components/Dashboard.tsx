import React, { useMemo, useState, useEffect } from 'react';
import { Company, OperationEntry, Language, Staff, Payment, Expense } from '../types';
import {
  LayoutDashboard,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  Briefcase,
  Percent,
  DollarSign,
  Wallet,
  TrendingUp,
  Info,
  Download
} from 'lucide-react';
import {
  AreaChart, Area, ResponsiveContainer, YAxis, Tooltip, XAxis,
  BarChart, Bar, CartesianGrid, Legend, PieChart, Pie, Cell
} from 'recharts';
import { translations } from '../lib/translations';
import { toYearMonthKey, getHistoricalPeriods, getPreviousPeriodKey, periodsEqual } from '../lib/periods';

interface DashboardProps {
  companies: Company[];
  operations: OperationEntry[];
  staff?: Staff[];
  payments: Payment[];
  expenses: Expense[];
  activeFilter?: string;
  onFilterChange?: (filter: string) => void;
  selectedPeriod: string;
  onPeriodChange: (p: string) => void;
  lang: Language;
  userRole?: string;
  userId?: string;
}

const Dashboard: React.FC<DashboardProps> = ({
  companies,
  operations,
  staff = [],
  payments = [],
  expenses = [],
  selectedPeriod,
  lang,
}) => {
  const t = translations[lang];

  const currentOps = useMemo(() => {
    return operations.filter(op => periodsEqual(op.period, selectedPeriod));
  }, [operations, selectedPeriod]);

  const handleExport = async () => {
    try {
      const { utils, writeFile } = await import('xlsx');
      const statsHeaders = ['12-Invest', '12-Moliya', '12-Korxona', '4-Mehnat', '4-KB Sanoat', '1-Invest'];
      const statsKeys = ['stat_12_invest', 'stat_12_moliya', 'stat_12_korxona', 'stat_4_mehnat', 'stat_4_kb_sanoat', 'stat_1_invest'];
      const headers = ['Firma Nomi', 'INN', 'Soliq Rejimi', 'Foyda Solig\'i', 'Aylanma/QQS', 'Statistika Status', ...statsHeaders];

      const rows = companies.map(c => {
        const op = currentOps.find(o => o.companyId === c.id);
        const statsValues = statsKeys.map(k => op ? (op as any)[k] || '-' : '-');
        return [c.name, c.inn, c.taxType, op?.profitTaxStatus || '-', op?.aylanma_qqs || '-', op?.statsStatus || '-', ...statsValues];
      });

      const ws = utils.aoa_to_sheet([headers, ...rows]);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Hisobot");
      writeFile(wb, `asos_hisobot_${selectedPeriod}.xlsx`);
    } catch (error) {
      console.error('Export error:', error);
    }
  };

  const stats = useMemo(() => {
    const currentKey = toYearMonthKey(selectedPeriod);
    const historyKeys = getHistoricalPeriods(currentKey, 6);
    const prevKey = getPreviousPeriodKey(currentKey);

    const REPORT_FIELDS = [
      'didox', 'xatlar', 'avtokameral', 'my_mehnat', 'one_c',
      'pul_oqimlari', 'chiqadigan_soliqlar', 'hisoblangan_oylik', 'debitor_kreditor', 'foyda_va_zarar', 'tovar_ostatka',
      'aylanma_qqs', 'daromad_soliq', 'inps', 'foyda_soliq',
      'moliyaviy_natija', 'buxgalteriya_balansi', 'statistika',
      'bonak', 'yer_soligi', 'mol_mulk_soligi', 'suv_soligi'
    ] as const;

    const getMetricsForPeriod = (key: string) => {
      const pPayments = payments.filter(p => toYearMonthKey(p.period) === key);
      const pExpenses = expenses.filter(e => (e.date ? e.date.slice(0, 7) : '') === key);

      const income = pPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
      const expense = pExpenses.reduce((acc, e) => acc + (e.amount || 0), 0);
      const profit = income - expense;

      const ops = operations.filter(o => toYearMonthKey(o.period) === key);
      const statsTotal = (ops.length * REPORT_FIELDS.length) || 1;
      let done = 0;

      ops.forEach(op => {
        REPORT_FIELDS.forEach(field => {
          const val = String((op as any)[field] || '').trim().toLowerCase();
          if (val === '+' || val.startsWith('+')) done++;
          else if (val && val !== '0' && val !== '-' && val !== 'kartoteka') done++;
        });
      });

      return {
        income,
        expense,
        profit,
        rate: parseFloat(((done / statsTotal) * 100).toFixed(1)),
        fullKey: key
      };
    };

    const current = getMetricsForPeriod(currentKey);
    const previous = getMetricsForPeriod(prevKey);
    const historyData = historyKeys.map(key => getMetricsForPeriod(key));

    const calculateTrend = (cur: number, prev: number) => {
      if (prev === 0) {
        if (cur === 0) return '0%';
        return t.newStatus;
      }
      if (cur === prev) return '0%';
      const diff = ((cur - prev) / prev) * 100;
      if (Math.abs(diff) < 0.1) return '0%';
      return `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`;
    };

    // Premium Sparkline Logic: Ensure it always looks lush/dynamic
    const getLushData = (realValues: number[], baseline: number) => {
      const allZero = realValues.every(v => v === 0);
      if (allZero) {
        return Array.from({ length: 6 }, (_, i) => ({ value: 10 + Math.sin(i) * 2 }));
      }
      return realValues.map((v, i) => ({
        value: v === 0 ? (baseline > 0 ? baseline * 0.1 : 5) : v
      }));
    };

    const reportStatusData = [
      { key: 'profitTaxStatus', label: t.profitTax },
      { key: 'aylanma_qqs', label: `Aylanm / ${t.ndsTax}` },
      { key: 'statsStatus', label: t.statsShort }
    ].map(k => {
      let accepted = 0, rejected = 0, pending = 0, blocked = 0;
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
        [t.completedStatus]: accepted,
        [t.rejectedStatus]: rejected,
        [t.problemStatus]: blocked,
        [t.pendingStatus]: pending
      };
    });

    const taxRegimeData = [
      { name: t.ndsTax, value: companies.filter(c => c.taxType === 'nds_profit').length, color: '#6366F1' },
      { name: t.turnoverTax, value: companies.filter(c => c.taxType === 'turnover').length, color: '#10B981' },
      { name: t.fixedTax, value: companies.filter(c => c.taxType === 'fixed').length, color: '#F59E0B' }
    ];

    const taxStatusData = [
      { key: 'daromad_soliq', label: t.incomeLabel },
      { key: 'inps', label: 'INPS' },
      { key: 'foyda_soliq', label: t.profitTaxLabel },
      { key: 'yer_soligi', label: t.landTaxLabel },
      { key: 'mol_mulk_soligi', label: t.propertyTaxLabel },
      { key: 'suv_soligi', label: t.waterTaxLabel }
    ].map(k => {
      let accepted = 0, rejected = 0, pending = 0;
      currentOps.forEach(op => {
        const val = (op as any)[k.key];
        if (val === 'accepted' || val === '+') accepted++;
        else if (val === 'rejected' || val === 'rad etildi') rejected++;
        else pending++;
      });
      pending += (companies.length - currentOps.length);
      return {
        name: k.label,
        [t.completedStatus]: accepted,
        [t.rejectedStatus]: rejected,
        [t.pendingStatus]: pending
      };
    });

    return {
      reportStatusData,
      taxRegimeData,
      taxStatusData,
      headerMetrics: [
        {
          label: t.totalRevenue,
          value: current.income,
          sub: t.revenueSub,
          color: 'text-emerald-500',
          icon: <DollarSign size={20} />,
          trend: calculateTrend(current.income, previous.income),
          isUp: current.income >= previous.income,
          data: getLushData(historyData.map(d => d.income), current.income)
        },
        {
          label: t.netProfit,
          value: current.profit,
          sub: t.profitSub,
          color: 'text-indigo-500',
          icon: <TrendingUp size={20} />,
          trend: calculateTrend(current.profit, previous.profit),
          isUp: current.profit >= previous.profit,
          data: getLushData(historyData.map(d => d.profit), current.profit)
        },
        {
          label: t.totalExpenses,
          value: current.expense,
          sub: t.expenseSub,
          color: 'text-rose-500',
          icon: <Wallet size={20} />,
          trend: calculateTrend(current.expense, previous.expense),
          isUp: current.expense <= previous.expense,
          data: getLushData(historyData.map(d => d.expense), current.expense)
        },
        {
          label: t.totalStaffMember,
          value: staff.length,
          sub: t.staffSub,
          color: 'text-blue-500',
          icon: <Users size={20} />,
          trend: t.stable,
          isUp: true,
          data: Array(6).fill(null).map((_, i) => ({ value: staff.length + Math.sin(i) * 0.5 }))
        },
        {
          label: t.totalCompanies,
          value: companies.length,
          sub: t.companySub,
          color: 'text-purple-500',
          icon: <Briefcase size={20} />,
          trend: t.stable,
          isUp: true,
          data: Array(6).fill(null).map((_, i) => ({ value: companies.length + Math.cos(i) * 0.5 }))
        },
        {
          label: t.progressEx,
          value: current.rate.toFixed(1),
          sub: t.progressSub,
          color: 'text-amber-500',
          icon: <Percent size={20} />,
          trend: calculateTrend(current.rate, previous.rate),
          isUp: current.rate >= previous.rate,
          data: getLushData(historyData.map(d => d.rate), current.rate)
        },
      ]
    };
  }, [payments, expenses, operations, selectedPeriod, staff, companies]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-white/20 p-3 rounded-2xl shadow-2xl backdrop-blur-2xl">
          <p className="text-xs font-black text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-widest">{payload[0].payload.name}</p>
          <p className="text-sm font-black text-slate-900 dark:text-white flex items-baseline gap-1">
            {payload[0].value.toLocaleString()}
            <span className="text-[10px] font-black opacity-50 uppercase tracking-tighter">uzs</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="premium-container animate-macos pb-16">
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Header Actions */}
      <div className="flex justify-between items-center mb-0 mt-4 px-2">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight uppercase opacity-90 flex items-center gap-4">
            <LayoutDashboard className="text-indigo-500" size={28} />
            {t.dashboard}
          </h2>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:opacity-90 transition-all active:scale-95 shadow-xl border border-transparent dark:border-white/10 group"
        >
          <Download size={18} className="group-hover:translate-y-0.5 transition-transform" />
          <span>{t.excelExport}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-6 sm:gap-8 mb-12 sm:mb-16 mt-8 sm:mt-10">
        {stats.headerMetrics.map((stat, i) => (
          <div key={i} className="liquid-glass-card p-6 group relative border border-white/10 hover:border-indigo-500/30 transition-all flex flex-col justify-between min-h-[180px] overflow-hidden">
            <div className="glass-reflection"></div>

            {/* Header Area */}
            <div className="flex justify-between items-start relative z-10">
              <div className={`p-2.5 rounded-xl bg-white/5 border border-white/10 ${stat.color} shadow-lg shadow-black/20`}>
                {stat.icon}
              </div>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black tracking-wider ${stat.isUp ? 'text-emerald-500 bg-emerald-500/10' : 'text-rose-500 bg-rose-500/10'} border border-current/20 shadow-sm`}>
                {stat.isUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {stat.trend}
              </div>
            </div>

            {/* Value Area */}
            <div className="relative z-10 mt-8 translate-y-2 group-hover:translate-y-0 transition-transform duration-500">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-600 dark:text-slate-400 mb-2.5">{stat.label}</p>
              <div className="flex items-baseline gap-2">
                <h3 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter tabular-nums leading-none">
                  {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
                  {i === 5 && '%'}
                </h3>
                {i < 3 && <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest opacity-60">uzs</span>}
              </div>
              <p className="text-xs font-bold text-slate-600 dark:text-slate-500 mt-4 opacity-70 group-hover:opacity-100 transition-opacity duration-300 flex items-center gap-2.5">
                <Info size={14} className="text-indigo-500/80" />
                {stat.sub}
              </p>
            </div>

            {/* Sparkline - Full Width Absolute Bottom */}
            <div className="absolute bottom-0 left-0 right-0 h-24 opacity-40 group-hover:opacity-70 transition-all duration-700 pointer-events-none min-h-[100px]">
              {mounted && (
                <ResponsiveContainer width="100%" height="100%" minHeight={100} minWidth={0}>
                  <AreaChart data={stat.data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id={`grad-lush-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={stat.isUp ? '#10B981' : '#F43F5E'} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={stat.isUp ? '#10B981' : '#F43F5E'} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={stat.isUp ? '#10B981' : '#F43F5E'}
                      strokeWidth={2.5}
                      fill={`url(#grad-lush-${i})`}
                      isAnimationActive={true}
                      animationDuration={1500}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Detailed Analytics Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-8 mt-12">
        {/* Report Status Bar Chart */}
        <div className="xl:col-span-2 liquid-glass-card p-6 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border border-white/10 relative overflow-hidden">
          <div className="flex justify-between items-center mb-8 relative z-10">
            <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-3">
              <div className="w-1.5 h-6 bg-indigo-500 rounded-full"></div>
              Hisobotlar holati
            </h3>
          </div>
          <div className="h-[350px] w-full relative z-10 min-h-[350px]">
            {mounted && (
              <ResponsiveContainer width="100%" height="100%" minHeight={350} minWidth={0}>
                <BarChart data={stats.reportStatusData} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#64748B" opacity={0.15} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 11, fontWeight: 900 }} dy={15} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11, fontWeight: 700 }} />
                  <Tooltip
                    cursor={{ fill: 'rgba(99, 102, 241, 0.05)' }}
                    contentStyle={{ backgroundColor: '#0F172A', border: 'none', borderRadius: '16px', fontSize: '11px', color: '#fff', fontWeight: 800, padding: '12px' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '30px', fontSize: '11px', textTransform: 'uppercase', fontWeight: 900, opacity: 0.8 }} />
                  <Bar dataKey="Bajarildi" stackId="a" fill="#10B981" radius={[0, 0, 6, 6]} barSize={45} />
                  <Bar dataKey="Rad etildi" stackId="a" fill="#EF4444" barSize={45} />
                  <Bar dataKey="Muammo" stackId="a" fill="#F59E0B" barSize={45} />
                  <Bar dataKey="Kutilmoqda" stackId="a" fill="rgba(148, 163, 184, 0.3)" radius={[6, 6, 0, 0]} barSize={45} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Soliq Tahlili Bar Chart */}
        <div className="liquid-glass-card p-6 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border border-white/10 relative overflow-hidden flex flex-col">
          <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight mb-2 flex items-center gap-3 relative z-10">
            <div className="w-1.5 h-6 bg-pink-500 rounded-full"></div>
            Soliq Tahlili
          </h3>
          <p className="text-xs text-slate-400 font-black uppercase tracking-widest mb-6 sm:mb-8 pl-4 opacity-70 relative z-10">Turlari bo'yicha</p>
          <div className="flex-1 w-full min-h-[300px] flex items-center justify-center relative z-10">
            {mounted && (
              <ResponsiveContainer width="100%" height="100%" minHeight={300} minWidth={0}>
                <BarChart data={stats.taxStatusData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 10, fontWeight: 900 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 10, fontWeight: 700 }} />
                  <Tooltip
                    cursor={{ fill: 'rgba(99, 102, 241, 0.05)' }}
                    contentStyle={{ backgroundColor: '#0F172A', border: 'none', borderRadius: '16px', fontSize: '11px', color: '#fff', fontWeight: 800, padding: '12px' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px', textTransform: 'uppercase', fontWeight: 900, opacity: 0.8 }} />
                  <Bar dataKey="Bajarildi" stackId="a" fill="#10B981" barSize={25} radius={[0, 0, 4, 4]} />
                  <Bar dataKey="Kutilmoqda" stackId="a" fill="rgba(148, 163, 184, 0.2)" barSize={25} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Tax Regime Pie Chart */}
        <div className="liquid-glass-card p-6 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border border-white/10 relative overflow-hidden flex flex-col">
          <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight mb-8 flex items-center gap-3">
            <div className="w-1.5 h-6 bg-emerald-500 rounded-full"></div>
            Soliq rejimi
          </h3>
          <div className="flex-1 flex items-center justify-center min-h-[250px] relative z-10">
            {mounted && (
              <ResponsiveContainer width="100%" height="100%" minHeight={250} minWidth={0}>
                <PieChart>
                  <Pie
                    data={stats.taxRegimeData}
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={8}
                    dataKey="value"
                    stroke="none"
                  >
                    {stats.taxRegimeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0F172A', border: 'none', borderRadius: '16px', fontSize: '11px', padding: '12px' }}
                  />
                  <Legend verticalAlign="bottom" height={40} wrapperStyle={{ fontSize: '11px', fontWeight: 900, opacity: 0.8, paddingTop: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
