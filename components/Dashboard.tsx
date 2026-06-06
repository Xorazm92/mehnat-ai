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
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 p-2 rounded shadow-md">
          <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">{payload[0].payload.name}</p>
          <p className="text-[13px] font-bold text-gray-800 dark:text-white">
            {payload[0].value.toLocaleString()}
            <span className="text-[10px] text-gray-400 ml-1">uzs</span>
          </p>
        </div>
      );
    }
    return null;
  };

  const CARD_ACCENTS = ['#6366F1','#10B981','#EF4444','#3B82F6','#8B5CF6','#F59E0B'];
  const CARD_ICONS_BG = [
    'rgba(99,102,241,0.1)','rgba(16,185,129,0.1)','rgba(239,68,68,0.1)',
    'rgba(59,130,246,0.1)','rgba(139,92,246,0.1)','rgba(245,158,11,0.1)'
  ];

  return (
    <div className="animate-fade-in pb-10 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{t.dashboard}</h2>
          <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-2)' }}>Tizim holati va tahlili</p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all"
          style={{ background: 'var(--primary)', color: '#fff' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-dark)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--primary)')}
        >
          <Download size={14} />
          {t.excelExport}
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.headerMetrics.map((stat, i) => {
          const color = CARD_ACCENTS[i];
          const bgHover = CARD_ICONS_BG[i];
          return (
            <div key={i} className="stat-card group" style={{ '--accent': color } as React.CSSProperties}>
              <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="p-2.5 rounded-xl transition-all duration-300"
                  style={{ background: bgHover, color: color }}>
                  {stat.icon}
                </div>
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide"
                  style={{
                    background: stat.isUp ? 'var(--success-light)' : 'var(--danger-light)',
                    color: stat.isUp ? 'var(--success)' : 'var(--danger)',
                  }}>
                  {stat.isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {stat.trend}
                </div>
              </div>

              <div className="relative z-10">
                <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>
                  {stat.label}
                </p>
                <div className="flex items-baseline gap-1">
                  <h3 className="text-2xl font-black tracking-tight tabular-nums" style={{ color: 'var(--text)' }}>
                    {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
                    {i === 5 && '%'}
                  </h3>
                  {i < 3 && <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>uzs</span>}
                </div>
              </div>

              {/* Sparkline */}
              <div className="absolute bottom-0 left-0 right-0 h-16 opacity-40 group-hover:opacity-100 transition-opacity duration-300">
                {mounted && (
                  <ResponsiveContainer width="100%" height={64}>
                    <AreaChart data={stat.data}>
                      <defs>
                        <linearGradient id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke={color}
                        strokeWidth={2}
                        fill={`url(#grad-${i})`}
                        isAnimationActive={true}
                        animationDuration={1500}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Analytics Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Report Status Bar Chart */}
        <div className="xl:col-span-2 dashboard-card flex flex-col">
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-6 rounded-full bg-indigo-500"></div>
              <h3 className="text-[13px] font-bold uppercase tracking-wide" style={{ color: 'var(--text)' }}>Hisobotlar holati</h3>
            </div>
            <Info size={16} style={{ color: 'var(--text-3)' }} />
          </div>
          <div className="p-5 h-[340px] w-full">
            {mounted && (
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={stats.reportStatusData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-2)', fontSize: 11, fontWeight: 600 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-3)', fontSize: 11, fontWeight: 600 }} />
                  <Tooltip
                    cursor={{ fill: 'var(--primary-ghost)' }}
                    contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', fontWeight: 600, boxShadow: 'var(--shadow-md)' }}
                  />
                  <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '20px', fontSize: '11px', fontWeight: 600 }} />
                  <Bar dataKey={t.completedStatus} stackId="a" fill="var(--success)" radius={[0, 0, 4, 4]} barSize={32} />
                  <Bar dataKey={t.rejectedStatus} stackId="a" fill="var(--danger)" barSize={32} />
                  <Bar dataKey={t.problemStatus} stackId="a" fill="var(--warning)" barSize={32} />
                  <Bar dataKey={t.pendingStatus} stackId="a" fill="var(--border-2)" radius={[4, 4, 0, 0]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Soliq Tahlili */}
        <div className="dashboard-card flex flex-col">
          <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="w-1.5 h-6 rounded-full bg-rose-500"></div>
            <h3 className="text-[13px] font-bold uppercase tracking-wide" style={{ color: 'var(--text)' }}>Soliq Tahlili</h3>
          </div>
          <div className="flex-1 w-full min-h-[340px] p-5">
            {mounted && (
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={stats.taxStatusData} margin={{ top: 0, right: 10, left: -10, bottom: 0 }} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-2)', fontSize: 10, fontWeight: 600 }} width={90} />
                  <Tooltip
                    cursor={{ fill: 'var(--primary-ghost)' }}
                    contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', fontWeight: 600, boxShadow: 'var(--shadow-sm)' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '15px', fontSize: '11px', fontWeight: 600 }} />
                  <Bar dataKey={t.completedStatus} stackId="a" fill="var(--success)" radius={[4, 0, 0, 4]} barSize={14} />
                  <Bar dataKey={t.pendingStatus} stackId="a" fill="var(--border-2)" radius={[0, 4, 4, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Tax Regime Pie */}
        <div className="dashboard-card flex flex-col">
          <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="w-1.5 h-6 rounded-full bg-emerald-500"></div>
            <h3 className="text-[13px] font-bold uppercase tracking-wide" style={{ color: 'var(--text)' }}>Soliq rejimi</h3>
          </div>
          <div className="flex-1 flex items-center justify-center min-h-[340px] p-5">
            {mounted && (
              <ResponsiveContainer width="100%" height={340}>
                <PieChart>
                  <Pie
                    data={stats.taxRegimeData}
                    innerRadius={70}
                    outerRadius={95}
                    paddingAngle={6}
                    dataKey="value"
                    stroke="var(--surface)"
                    strokeWidth={3}
                  >
                    {stats.taxRegimeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', fontWeight: 600, boxShadow: 'var(--shadow-sm)' }}
                  />
                  <Legend verticalAlign="bottom" height={40} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 600, paddingTop: '20px' }} />
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
