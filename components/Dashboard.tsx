import React, { useMemo } from 'react';
import { Company, OperationEntry, ReportStatus, Language, Staff, Payment, Expense } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, AreaChart, Area } from 'recharts';
import { translations } from '../lib/translations';
import { ROLES } from '../lib/permissions';
import AccountantDashboard from './AccountantDashboard';
import NazoratchiChecklist from './NazoratchiChecklist';

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
  activeFilter = 'all',
  onFilterChange = (_: string) => { },
  selectedPeriod,
  onPeriodChange,
  lang,
  userRole,
  userId
}) => {
  const t = translations[lang];

  // Role-Based Routing
  if (userRole === ROLES.ACCOUNTANT) {
    const myCompanies = userId ? companies.filter(c => c.accountantId === userId) : [];
    return <AccountantDashboard companies={myCompanies} operations={operations} selectedPeriod={selectedPeriod} lang={lang} />;
  }

  if (userRole === ROLES.SUPERVISOR) {
    return <NazoratchiChecklist companies={companies} staff={staff} lang={lang} currentUserRole={userRole} currentUserId={userId} />;
  }

  if (userRole === ROLES.BANK_MANAGER) {
    // Placeholder for Bank Manager
    // Effectively an Accountant view but for Bank Clients?
    // For now, return Admin View or Accountant View
    // Let's use Accountant Dashboard logic but for Bank Clients
    const myCompanies = userId ? companies.filter(c => c.bankClientId === userId) : [];
    return <AccountantDashboard companies={myCompanies} operations={operations} selectedPeriod={selectedPeriod} lang={lang} />;
  }

  // --- PREMIUM ADMIN DASHBOARD ---
  const stats = useMemo(() => {
    // 1. AGE DISTRIBUTION
    const ageGroups = { young: 0, middle: 0, old: 0, unknown: 0 };
    const now = new Date();

    // 2. EDUCATION
    const eduGroups: Record<string, number> = { oliy: 0, orta: 0, magistratura: 0, unknown: 0 };

    // 3. BIRTHDAYS
    const upcomingBirthdays: any[] = [];
    const todayStr = now.toISOString().slice(5, 10); // MM-DD

    // 4. ROLE COUNT
    const counts = { total: staff.length, men: 0, women: 0, pension: 0, vacant: 0 };

    staff.forEach(s => {
      // Age calculation
      if (s.birthDate) {
        const birth = new Date(s.birthDate);
        let age = now.getFullYear() - birth.getFullYear();
        if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;

        if (age <= 30) ageGroups.young++;
        else if (age <= 45) ageGroups.middle++;
        else ageGroups.old++;

        if (age >= 60 && s.gender === 'erkak') counts.pension++;
        if (age >= 55 && s.gender === 'ayol') counts.pension++;

        // Birthdays check (within next 7 days)
        const bMMDD = s.birthDate.slice(5, 10);
        if (bMMDD >= todayStr) {
          upcomingBirthdays.push({
            name: s.name,
            role: s.role,
            date: bMMDD === todayStr ? 'Bugun' : bMMDD,
            img: `https://ui-avatars.com/api/?name=${encodeURIComponent(s.name)}&background=random`,
            rawDate: bMMDD
          });
        }
      } else {
        ageGroups.unknown++;
      }

      // Education mapping
      const edu = s.education?.toLowerCase();
      if (edu?.includes('oliy')) eduGroups.oliy++;
      else if (edu?.includes('orta')) eduGroups.orta++;
      else if (edu?.includes('magistr')) eduGroups.magistratura++;
      else eduGroups.unknown++;

      // Gender mapping
      const gen = s.gender?.toLowerCase();
      if (gen === 'erkak' || gen === 'male') counts.men++;
      else if (gen === 'ayol' || gen === 'female') counts.women++;
    });

    // 5. FINANCIALS & TRENDS (Last 6 Months)
    const financialHistory: any[] = [];
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      return d.toISOString().slice(0, 7);
    });

    months.forEach(m => {
      const income = payments.filter(p => p.paymentDate?.startsWith(m)).reduce((acc, p) => acc + (p.amount || 0), 0);
      const expense = expenses.filter(e => e.date?.startsWith(m)).reduce((acc, e) => acc + (e.amount || 0), 0);
      financialHistory.push({ month: m, income, expense, profit: income - expense });
    });

    const totalIncome = payments.reduce((acc, p) => acc + (p.amount || 0), 0);
    const totalExpenses = expenses.reduce((acc, e) => acc + (e.amount || 0), 0);
    const netProfit = totalIncome - totalExpenses;

    // 6. REPORT PROGRESS (Global)
    const REPORT_FIELDS = [
      'didox', 'xatlar', 'avtokameral', 'my_mehnat', 'one_c',
      'pul_oqimlari', 'chiqadigan_soliqlar', 'hisoblangan_oylik', 'debitor_kreditor', 'foyda_va_zarar', 'tovar_ostatka',
      'aylanma_qqs', 'daromad_soliq', 'inps', 'foyda_soliq',
      'moliyaviy_natija', 'buxgalteriya_balansi', 'statistika',
      'bonak', 'yer_soligi', 'mol_mulk_soligi', 'suv_soligi'
    ] as const;

    const statsTotal = companies.length * REPORT_FIELDS.length || 1;
    const reportStats = { done: 0, pending: 0, blocked: 0, total: statsTotal, itParkCount: 0 };

    companies.forEach(c => {
      const op = operations.find(o => o.companyId === c.id && o.period === selectedPeriod);
      // Count IT Park residents
      if (c.itParkResident) reportStats.itParkCount = (reportStats.itParkCount || 0) + 1;

      if (!op) {
        reportStats.pending += REPORT_FIELDS.length;
      } else {
        REPORT_FIELDS.forEach(field => {
          // @ts-ignore - Index access
          const val = String(op[field] || '').trim().toLowerCase();
          if (val === '+' || val.startsWith('+')) reportStats.done++;
          else if (val === 'kartoteka') reportStats.blocked++;
          else if (!val || val === '0' || val === '-') reportStats.pending++; // Treat '-' as pending/not done
          // Custom text logic can be refined if needed
          else reportStats.done++; // Assume text means done/info
        });
      }
    });

    const completionRate = (reportStats.done / statsTotal) * 100;

    return {
      ageDistribution: [
        { name: '30 yoshgacha', value: ageGroups.young, color: '#6366F1' },
        { name: '31 - 45 yosh', value: ageGroups.middle, color: '#4F46E5' },
        { name: '45+ yosh', value: ageGroups.old, color: '#4338CA' },
      ].filter(d => d.value > 0),
      educationData: [
        { name: 'Oliy ma\'lumotli', value: eduGroups.oliy, color: '#3B82F6', total: staff.length },
        { name: 'O\'rta maxsus', value: eduGroups.orta, color: '#F43F5E', total: staff.length },
        { name: 'Magistratura', value: eduGroups.magistratura, color: '#8B5CF6', total: staff.length },
      ].filter(d => d.value > 0),
      financialTrends: financialHistory,
      birthdays: upcomingBirthdays.sort((a, b) => a.rawDate.localeCompare(b.rawDate)).slice(0, 5),
      reportDonut: [
        { name: 'Bajarildi', value: reportStats.done, color: '#10B981' },
        { name: 'Kutilmoqda', value: reportStats.pending, color: '#F59E0B' },
        { name: 'Kartoteka', value: reportStats.blocked, color: '#F43F5E' },
      ].filter(d => d.value > 0),
      headerMetrics: [
        { label: 'JAMI TUSHUM', value: totalIncome, sub: 'Loyihalar bo\'yicha', color: 'bg-emerald-500', icon: '💰' },
        { label: 'SOF FOYDA', value: netProfit, sub: 'Operatsion foyda', color: 'bg-indigo-600', icon: '📈' },
        { label: 'PROGRESS %', value: completionRate.toFixed(1), sub: 'Hisobotlar unumdorligi', color: 'bg-amber-500', icon: '🎯' },
        { label: 'XODIMLAR', value: counts.total, sub: 'Faol jamoa a\'zolari', color: 'bg-slate-800', icon: '👥' },
        { label: 'IT PARK', value: reportStats.itParkCount, sub: 'Rezident Firmalar', color: 'bg-indigo-500', icon: '🚀' },
      ]
    };
  }, [staff, companies, payments, expenses, operations, selectedPeriod]);

  return (
    <div className="space-y-8 animate-macos pb-10 max-w-[1400px] mx-auto">
      {/* 🚀 ELITE HEADER STATS */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-2">
        <div>
          <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight premium-text-gradient">{t.dashboard}</h2>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">{selectedPeriod}</p>
        </div>
        <div className="flex bg-white dark:bg-apple-darkCard p-2 rounded-2xl border border-apple-border dark:border-apple-darkBorder shadow-sm">
          <select
            value={selectedPeriod}
            onChange={(e) => onPeriodChange(e.target.value)}
            className="bg-transparent border-none text-xs font-black text-slate-700 dark:text-white outline-none px-4 py-2 cursor-pointer appearance-none"
          >
            {['2024 Yillik', '2024 Q1', '2024 Q2', '2024 Q3', '2024 Q4', '2025 Yillik', '2025 Q1', '2026 Yillik'].map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {stats.headerMetrics.map((stat, i) => (
          <div key={i} className="relative dashboard-card p-6 overflow-hidden group hover:-translate-y-1 transition-all duration-300">
            <div className={`absolute top-0 left-0 w-1.5 h-full ${stat.color}`}></div>
            <div className="flex justify-between items-start mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{stat.label}</p>
              <span className="text-xl">{stat.icon}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tighter premium-text-gradient">
                {typeof stat.value === 'number' && i !== 2 ? stat.value.toLocaleString() : stat.value}
                {i === 2 && '%'}
              </h3>
              {i < 2 && <span className="text-[10px] font-bold text-slate-400">uzs</span>}
              {i === 3 && <span className="text-[10px] font-bold text-slate-400">kishi</span>}
              {i === 4 && <span className="text-[10px] font-bold text-slate-400">ta</span>}
            </div>
            <p className="text-[10px] font-bold text-slate-400 mt-2 flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-slate-300"></span> {stat.sub}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 📊 FINANCIAL FLOW (WORLD-CLASS CHART) */}
        <div className="dashboard-card p-8 lg:col-span-2">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h4 className="text-sm font-black text-slate-800 dark:text-white tracking-tight">Moliya Dinamikasi & Trendlar</h4>
              <p className="text-[10px] font-bold text-slate-400 italic">Oxirgi 6 oylik kirim va chiqim tahlili</p>
            </div>
            <div className="flex gap-4 text-[10px] font-black">
              <span className="flex items-center gap-1.5 text-emerald-500"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> KIRIM</span>
              <span className="flex items-center gap-1.5 text-rose-500"><div className="w-2 h-2 rounded-full bg-rose-500"></div> CHIQIM</span>
            </div>
          </div>

          <div className="h-[300px] min-h-[300px] w-full relative overflow-hidden">
            <ResponsiveContainer width="100%" height="100%" aspect={2} debounce={100} minWidth={0} minHeight={300}>
              <AreaChart data={stats.financialTrends}>

                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#F43F5E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94A3B8', fontWeight: 700 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94A3B8', fontWeight: 700 }} tickFormatter={(v) => `${(v / 1000000).toFixed(0)}M`} />
                <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }} />
                <Area type="monotone" dataKey="income" stroke="#10B981" strokeWidth={3} fillOpacity={1} fill="url(#colorIncome)" />
                <Area type="monotone" dataKey="expense" stroke="#F43F5E" strokeWidth={3} fillOpacity={1} fill="url(#colorExpense)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 📉 PERFORMANCE SCORECARD */}
        <div className="dashboard-card p-8 lg:col-span-1 bg-slate-900 text-white overflow-hidden relative">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl"></div>
          <h4 className="text-xs font-black uppercase tracking-widest text-indigo-400 mb-8">Hisobotlar Progressi</h4>
          <div className="h-48 min-h-[192px] w-full relative overflow-hidden">
            <ResponsiveContainer width="100%" height="100%" aspect={1} debounce={100} minWidth={0} minHeight={192}>
              <PieChart>

                <Pie data={stats.reportDonut} innerRadius={60} outerRadius={80} paddingAngle={8} dataKey="value" stroke="none">
                  {stats.reportDonut.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-black">{((stats.reportDonut.find(p => p.name === 'Bajarildi')?.value || 0) / (stats.reportDonut.reduce((a, b) => a + b.value, 0) || 1) * 100).toFixed(0)}%</span>
              <span className="text-[10px] text-indigo-400 font-bold tracking-widest">SAMARADORLIK</span>
            </div>
          </div>
          <div className="mt-8 space-y-4">
            {stats.reportDonut.map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.name}</span>
                </div>
                <span className="text-xs font-black">{item.value} ta</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* 🎂 UPCOMING CELEBRATIONS (Only if exists) */}
        {stats.birthdays.length > 0 && (
          <div className="dashboard-card p-6 lg:col-span-1">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">Taqvim & Tadbirlar</h4>
            <div className="space-y-5">
              {stats.birthdays.map((user, i) => (
                <div key={i} className="flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <img src={user.img} className="h-9 w-9 rounded-full grayscale group-hover:grayscale-0 transition-all border border-slate-100" alt="" />
                    <div>
                      <p className="text-xs font-black text-slate-800 dark:text-white line-clamp-1">{user.name}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">{user.role}</p>
                    </div>
                  </div>
                  <div className={`px-2 py-0.5 rounded-full text-[9px] font-black ${user.date === 'Bugun' ? 'bg-rose-500 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500'}`}>
                    {user.date}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 🎓 QUALITY OF HUMAN CAPITAL */}
        {stats.educationData.length > 0 && (
          <div className="dashboard-card p-6 lg:col-span-1">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">Inson Kapitali Sifati</h4>
            <div className="space-y-4">
              {stats.educationData.map((item, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] font-bold text-slate-500">{item.name}</span>
                    <span className="text-xs font-black text-slate-800 dark:text-white">{((item.value / staff.length) * 100).toFixed(0)}%</span>
                  </div>
                  <div className="h-1 w-full bg-slate-50 dark:bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(item.value / staff.length) * 100}%`, backgroundColor: item.color }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 🎂 AGE LOGISTICS */}
        {stats.ageDistribution.length > 0 && (
          <div className="dashboard-card p-6 lg:col-span-2">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">Jamoa Yoshi Tarkibi</h4>
            <div className="flex items-center gap-10">
              <div className="h-32 w-32 shrink-0">
                <ResponsiveContainer width="100%" height="100%" minHeight={128}>
                  <PieChart>
                    <Pie data={stats.ageDistribution} innerRadius={40} outerRadius={55} paddingAngle={4} dataKey="value" stroke="none">
                      {stats.ageDistribution.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-1 gap-4 w-full">
                {stats.ageDistribution.map((item, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-slate-50 dark:border-white/5 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.color }}></div>
                      <span className="text-[11px] font-bold text-slate-500">{item.name}</span>
                    </div>
                    <span className="text-xs font-black text-slate-800 dark:text-white">{item.value} kishi</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
