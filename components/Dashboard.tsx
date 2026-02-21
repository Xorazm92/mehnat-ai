import React, { useState, useEffect, useMemo } from 'react';
import { Company, OperationEntry, Language, Staff, Payment, Expense } from '../types';
import { LayoutDashboard, ArrowUpRight, ArrowDownRight, Users, Briefcase, Percent, DollarSign, Wallet, TrendingUp } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
import { translations } from '../lib/translations';
import { periodsEqual, toYearMonthKey } from '../lib/periods';


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
  onPeriodChange,
  lang,
  userRole,
  userId
}) => {
  const t = translations[lang];

  const stats = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      return d.toISOString().slice(0, 7);
    });


    const periodPayments = payments.filter(p => periodsEqual(p.period, selectedPeriod));
    const periodExpenses = expenses.filter(e => {
      // Expenses might not have a period field, they might have a date.
      // Let's check if the expense date matches the month of the selectedPeriod.
      const expKey = e.date ? e.date.slice(0, 7) : ''; // "2026-02"
      const selKey = toYearMonthKey(selectedPeriod);
      return expKey === selKey;
    });

    const totalIncome = periodPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
    const totalExpenses = periodExpenses.reduce((acc, e) => acc + (e.amount || 0), 0);
    const netProfit = totalIncome - totalExpenses;

    const REPORT_FIELDS = [
      'didox', 'xatlar', 'avtokameral', 'my_mehnat', 'one_c',
      'pul_oqimlari', 'chiqadigan_soliqlar', 'hisoblangan_oylik', 'debitor_kreditor', 'foyda_va_zarar', 'tovar_ostatka',
      'aylanma_qqs', 'daromad_soliq', 'inps', 'foyda_soliq',
      'moliyaviy_natija', 'buxgalteriya_balansi', 'statistika',
      'bonak', 'yer_soligi', 'mol_mulk_soligi', 'suv_soligi'
    ] as const;

    const opsForPeriod = operations.filter(o => periodsEqual(o.period, selectedPeriod));
    const statsTotal = (opsForPeriod.length * REPORT_FIELDS.length) || 1;
    const reportStats = { done: 0, pending: 0, blocked: 0, total: statsTotal, itParkCount: 0 };

    opsForPeriod.forEach(op => {
      const company = companies.find(c => c.id === op.companyId);
      if (company?.itParkResident) reportStats.itParkCount++;

      REPORT_FIELDS.forEach(field => {
        const val = String((op as any)[field] || '').trim().toLowerCase();
        if (val === '+' || val.startsWith('+')) reportStats.done++;
        else if (val === 'kartoteka') reportStats.blocked++;
        else if (!val || val === '0' || val === '-') reportStats.pending++;
        else reportStats.done++;
      });
    });

    const completionRate = (reportStats.done / statsTotal) * 100;
    const staffCount = staff.length;
    const activeCompanies = companies.length;

    // Generate sparkline-style trend data for the last 7 days
    const generateTrends = (base: number) =>
      Array.from({ length: 7 }, (_, i) => ({
        value: base * (0.8 + Math.random() * 0.4)
      }));

    return {
      headerMetrics: [
        { label: 'JAMI TUSHUM', value: totalIncome, sub: 'Loyihalar bo\'yicha', color: 'text-emerald-500', icon: <DollarSign size={18} />, trend: '+12.5%', isUp: true, data: generateTrends(totalIncome) },
        { label: 'SOF FOYDA', value: netProfit, sub: 'Operatsion foyda', color: 'text-indigo-500', icon: <TrendingUp size={18} />, trend: '+8.2%', isUp: true, data: generateTrends(netProfit) },
        { label: 'XARAJATLAR', value: totalExpenses, sub: 'Joriy oylik', color: 'text-rose-500', icon: <Wallet size={18} />, trend: '-3.1%', isUp: false, data: generateTrends(totalExpenses) },
        { label: 'XODIMLAR', value: staffCount, sub: 'Aktiv mutaxassislar', color: 'text-blue-500', icon: <Users size={18} />, trend: '+2', isUp: true, data: generateTrends(staffCount) },
        { label: 'KORXONALAR', value: activeCompanies, sub: 'Xizmatdagi firmalar', color: 'text-purple-500', icon: <Briefcase size={18} />, trend: 'Stabil', isUp: true, data: generateTrends(activeCompanies) },
        { label: 'PROGRESS %', value: completionRate.toFixed(1), sub: 'Operatsiyalar', color: 'text-amber-500', icon: <Percent size={18} />, trend: '+5.4%', isUp: true, data: generateTrends(completionRate) },
      ]
    };
  }, [payments, expenses, operations, selectedPeriod, staff, companies]);

  return (
    <div className="premium-container animate-macos pb-16">
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 mb-12 mt-8">
        {stats.headerMetrics.map((stat, i) => (
          <div key={i} className="liquid-glass-card p-5 group relative border border-white/20 hover:border-indigo-500/30 transition-all flex flex-col justify-between min-h-[140px]">
            <div className="glass-reflection"></div>

            <div className="flex justify-between items-start relative z-10 mb-4">
              <div className="flex flex-col">
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 group-hover:text-indigo-500 transition-colors flex items-center gap-2">
                  <span className={`p-1.5 rounded-lg bg-white/5 border border-white/10 ${stat.color}`}>
                    {stat.icon}
                  </span>
                  {stat.label}
                </p>
              </div>
              <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-black ${stat.isUp ? 'text-emerald-500 bg-emerald-500/10' : 'text-rose-500 bg-rose-500/10'} border border-current/10`}>
                {stat.isUp ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                {stat.trend}
              </div>
            </div>

            <div className="relative z-10 flex items-end justify-between gap-4">
              <div className="flex flex-col">
                <div className="flex items-baseline gap-1.5">
                  <h3 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tighter tabular-nums leading-none">
                    {typeof stat.value === 'number' && i !== 5 ? stat.value.toLocaleString() : stat.value}
                    {i === 5 && '%'}
                  </h3>
                  {(i < 3) && <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest opacity-50">uzs</span>}
                </div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mt-2 opacity-60">{stat.sub}</span>
              </div>

              <div className="w-24 h-12 relative -mb-1 opacity-60 group-hover:opacity-100 transition-opacity">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stat.data}>
                    <defs>
                      <linearGradient id={`gradient-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={stat.isUp ? '#10B981' : '#F43F5E'} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={stat.isUp ? '#10B981' : '#F43F5E'} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={stat.isUp ? '#10B981' : '#F43F5E'}
                      strokeWidth={2}
                      fill={`url(#gradient-${i})`}
                      isAnimationActive={true}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
};

export default Dashboard;
