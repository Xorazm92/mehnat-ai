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

    return (
        <div className="animate-fade-in pb-8 space-y-6">
            {/* Header Actions */}
            <div className="flex justify-between items-center mb-6 bg-white dark:bg-[#1A1D23] p-4 border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-sm bg-[#3366CC] flex items-center justify-center text-white shadow-sm">
                        <LayoutDashboard size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-gray-800 dark:text-white uppercase tracking-tight">{t.dashboard}</h2>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Tizim holati va tahlili</p>
                    </div>
                </div>
                <button
                    onClick={handleExport}
                    className="flex items-center gap-2 bg-[#F8F9FA] dark:bg-[#111318] text-gray-700 dark:text-gray-300 px-5 py-2.5 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] font-black text-[11px] uppercase tracking-wider hover:bg-[#EBF3FF] hover:border-[#3366CC] hover:text-[#3366CC] transition-all shadow-sm active:scale-95"
                >
                    <Download size={14} />
                    {t.excelExport}
                </button>
            </div>

            {/* Metric Cards — 1C Style */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-6 gap-4">
                {stats.headerMetrics.map((stat, i) => {
                    const borderColors = ['border-t-emerald-500', 'border-t-[#3366CC]', 'border-t-rose-500', 'border-t-blue-400', 'border-t-purple-500', 'border-t-amber-500'];
                    return (
                        <div key={i} className={`bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm p-4 ${borderColors[i]} border-t-4 shadow-sm hover:shadow-md transition-shadow group`}>
                            {/* Header */}
                            <div className="flex justify-between items-start mb-4">
                                <div className={`p-2 rounded-sm bg-[#F8F9FA] dark:bg-[#111318] border border-[#DEE2E6] dark:border-[#3A3D44] ${stat.color} group-hover:border-[#3366CC] transition-colors`}>
                                    {stat.icon}
                                </div>
                                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-sm text-[9px] font-black border uppercase tracking-widest ${stat.isUp ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/10 border-emerald-100' : 'text-rose-500 bg-rose-50 dark:bg-rose-900/10 border-rose-100'}`}>
                                    {stat.isUp ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                                    {stat.trend}
                                </div>
                            </div>

                            {/* Value */}
                            <div className="space-y-1">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{stat.label}</p>
                                <h3 className="text-xl font-black text-gray-800 dark:text-white tabular-nums leading-none tracking-tight">
                                    {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
                                    {i === 5 && '%'}
                                </h3>
                                {i < 3 && <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">uzs</span>}
                            </div>

                            {/* Sparkline */}
                            <div className="mt-4 h-12 opacity-80 border-t border-[#F0F2F5] dark:border-[#1A1D23] pt-2">
                                {mounted && (
                                    <ResponsiveContainer width="100%" height="100%" minHeight={48} minWidth={0}>
                                        <AreaChart data={stat.data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id={`grad-1c-${i}`} x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor={stat.isUp ? '#10B981' : '#EF4444'} stopOpacity={0.2} />
                                                    <stop offset="100%" stopColor={stat.isUp ? '#10B981' : '#EF4444'} stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <Area
                                                type="monotone"
                                                dataKey="value"
                                                stroke={stat.isUp ? '#10B981' : '#EF4444'}
                                                strokeWidth={2}
                                                fill={`url(#grad-1c-${i})`}
                                                isAnimationActive={true}
                                                animationDuration={1000}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Analytics Grid — 1C Style */}
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 mt-6">
                {/* Report Status Bar Chart */}
                <div className="xl:col-span-2 bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm shadow-sm overflow-hidden">
                    <div className="bg-[#FAFBFC] dark:bg-[#111318] px-4 py-3 border-b border-[#DEE2E6] dark:border-[#3A3D44] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-1 h-5 bg-[#3366CC] rounded-sm"></div>
                            <h3 className="text-[11px] font-black text-gray-800 dark:text-white uppercase tracking-widest">Hisobotlar holati</h3>
                        </div>
                        <Info size={14} className="text-gray-300" />
                    </div>
                    <div className="p-6 h-[340px] w-full">
                        {mounted && (
                            <ResponsiveContainer width="100%" height="100%" minHeight={300} minWidth={0}>
                                <BarChart data={stats.reportStatusData} margin={{ top: 15, right: 20, left: 5, bottom: 10 }}>
                                    <CartesianGrid strokeDasharray="0" vertical={false} stroke="#F0F2F5" opacity={1} />
                                    <XAxis dataKey="name" axisLine={{ stroke: '#DEE2E6' }} tickLine={false} tick={{ fill: '#6B7280', fontSize: 10, fontWeight: 700 }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 700 }} />
                                    <Tooltip
                                        cursor={{ fill: '#F8F9FA' }}
                                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #DEE2E6', borderRadius: '2px', fontSize: '11px', fontWeight: 800, padding: '10px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Legend verticalAlign="top" align="right" iconType="rect" wrapperStyle={{ paddingBottom: '20px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }} />
                                    <Bar dataKey="Bajarildi" stackId="a" fill="#339933" barSize={40} />
                                    <Bar dataKey="Rad etildi" stackId="a" fill="#CC3333" barSize={40} />
                                    <Bar dataKey="Muammo" stackId="a" fill="#FFB800" barSize={40} />
                                    <Bar dataKey="Kutilmoqda" stackId="a" fill="#E5E7EB" barSize={40} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Soliq Tahlili */}
                <div className="bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm shadow-sm overflow-hidden flex flex-col">
                    <div className="bg-[#FAFBFC] dark:bg-[#111318] px-4 py-3 border-b border-[#DEE2E6] dark:border-[#3A3D44] flex items-center gap-2">
                        <div className="w-1 h-5 bg-rose-500 rounded-sm"></div>
                        <h3 className="text-[11px] font-black text-gray-800 dark:text-white uppercase tracking-widest">Soliq Tahlili</h3>
                    </div>
                    <div className="flex-1 w-full min-h-[280px] p-6">
                        {mounted && (
                            <ResponsiveContainer width="100%" height="100%" minHeight={280} minWidth={0}>
                                <BarChart data={stats.taxStatusData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }} layout="vertical">
                                    <CartesianGrid strokeDasharray="0" horizontal={false} stroke="#F0F2F5" />
                                    <XAxis type="number" hide />
                                    <YAxis type="category" dataKey="name" axisLine={{ stroke: '#DEE2E6' }} tickLine={false} tick={{ fill: '#6B7280', fontSize: 9, fontWeight: 700 }} width={80} />
                                    <Tooltip
                                        cursor={{ fill: '#F8F9FA' }}
                                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #DEE2E6', borderRadius: '2px', fontSize: '10px', fontWeight: 800 }}
                                    />
                                    <Legend iconType="rect" wrapperStyle={{ paddingTop: '15px', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' }} />
                                    <Bar dataKey="Bajarildi" stackId="a" fill="#339933" barSize={12} />
                                    <Bar dataKey="Kutilmoqda" stackId="a" fill="#E5E7EB" barSize={12} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Tax Regime Pie */}
                <div className="bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm shadow-sm overflow-hidden flex flex-col">
                    <div className="bg-[#FAFBFC] dark:bg-[#111318] px-4 py-3 border-b border-[#DEE2E6] dark:border-[#3A3D44] flex items-center gap-2">
                        <div className="w-1 h-5 bg-emerald-600 rounded-sm"></div>
                        <h3 className="text-[11px] font-black text-gray-800 dark:text-white uppercase tracking-widest">Soliq rejimi</h3>
                    </div>
                    <div className="flex-1 flex items-center justify-center min-h-[280px] p-6">
                        {mounted && (
                            <ResponsiveContainer width="100%" height="100%" minHeight={280} minWidth={0}>
                                <PieChart>
                                    <Pie
                                        data={stats.taxRegimeData}
                                        innerRadius={65}
                                        outerRadius={85}
                                        paddingAngle={5}
                                        dataKey="value"
                                        stroke="#fff"
                                        strokeWidth={4}
                                    >
                                        {stats.taxRegimeData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #DEE2E6', borderRadius: '2px', fontSize: '11px', fontWeight: 800 }}
                                    />
                                    <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '10px', fontWeight: 700, paddingTop: '15px', textTransform: 'uppercase' }} />
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
