
import React from 'react';
import { AccountantKPI, Language, Staff } from '../types';
import { translations } from '../lib/translations';

interface Props {
  kpis: AccountantKPI[];
  staff: Staff[];
  lang: Language;
  onStaffSelect: (s: Staff) => void;
}

const StaffKPIReport: React.FC<Props> = ({ kpis, staff, lang, onStaffSelect }) => {
  const t = translations[lang];
  const totals = kpis.reduce((acc, k) => ({
    firms: acc.firms + k.totalCompanies,
    annual: acc.annual + k.annualCompleted,
    stats: acc.stats + k.statsCompleted
  }), { firms: 0, annual: 0, stats: 0 });

  const totalAnnualProgress = totals.firms > 0 ? Math.round((totals.annual / totals.firms) * 100) : 0;
  const totalStatsProgress = totals.firms > 0 ? Math.round((totals.stats / totals.firms) * 100) : 0;

  const handleStaffClick = (staffName: string) => {
    const foundStaff = staff.find(s => s.name === staffName);
    if (foundStaff) {
      onStaffSelect(foundStaff);
    }
  };

  return (
    <div className="bg-white dark:bg-apple-darkCard rounded-3xl border border-apple-border dark:border-apple-darkBorder shadow-sm overflow-hidden mb-12 animate-macos">
      <div className="p-6 border-b border-apple-border dark:border-apple-darkBorder flex justify-between items-center bg-slate-50/30 dark:bg-white/5">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-slate-800 dark:text-white">{t.kpiReport}</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Global monitoring center</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.annualProgress}</p>
            <p className="text-sm font-black text-apple-accent">{totalAnnualProgress}%</p>
          </div>
          <div className="h-2 w-32 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-apple-accent transition-all duration-1000" style={{ width: `${totalAnnualProgress}%` }}></div>
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50 dark:bg-white/5 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-apple-border dark:border-apple-darkBorder">
              <th className="px-8 py-5 border-r dark:border-apple-darkBorder">{t.accountant}</th>
              <th className="px-6 py-5 text-center border-r dark:border-apple-darkBorder">{t.firmCount}</th>
              <th className="px-6 py-5 text-center border-r dark:border-apple-darkBorder">{t.annualCompleted}</th>
              <th className="px-6 py-5 text-center border-r dark:border-apple-darkBorder">{t.statsCompleted}</th>
              <th className="px-6 py-5 text-center border-r dark:border-apple-darkBorder text-apple-accent">Yillik/Год %</th>
              <th className="px-6 py-5 text-center text-[#34C759]">Stat/Стат %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-apple-border dark:divide-apple-darkBorder">
            {kpis.map((k, idx) => (
              <tr 
                key={k.name} 
                className="hover:bg-apple-accent/[0.03] dark:hover:bg-apple-accent/[0.05] transition-colors group cursor-pointer"
                onClick={() => handleStaffClick(k.name)}
              >
                <td className="px-8 py-4 border-r dark:border-apple-darkBorder">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-apple-accent/10 flex items-center justify-center text-[10px] font-black text-apple-accent group-hover:bg-apple-accent group-hover:text-white transition-all">
                      {k.name.charAt(0)}
                    </div>
                    <span className="font-bold text-sm text-slate-700 dark:text-slate-200 group-hover:text-apple-accent transition-colors underline decoration-apple-accent/20 underline-offset-4">
                      {k.name}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 text-center text-slate-500 dark:text-slate-400 border-r dark:border-apple-darkBorder font-mono font-bold text-xs">{k.totalCompanies}</td>
                <td className="px-6 py-4 text-center text-slate-500 dark:text-slate-400 border-r dark:border-apple-darkBorder font-mono font-bold text-xs">{k.annualCompleted}</td>
                <td className="px-6 py-4 text-center text-slate-500 dark:text-slate-400 border-r dark:border-apple-darkBorder font-mono font-bold text-xs">{k.statsCompleted}</td>
                <td className="px-6 py-4 text-center font-black text-sm border-r dark:border-apple-darkBorder text-apple-accent">{k.annualProgress}%</td>
                <td className="px-6 py-4 text-center font-black text-sm text-[#34C759]">{k.statsProgress}%</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-900 text-white dark:bg-black">
            <tr className="font-black text-[10px] uppercase tracking-widest">
              <td className="px-8 py-5">{t.total} (Всего)</td>
              <td className="px-6 py-5 text-center border-l border-white/10">{totals.firms}</td>
              <td className="px-6 py-5 text-center border-l border-white/10">{totals.annual}</td>
              <td className="px-6 py-5 text-center border-l border-white/10">{totals.stats}</td>
              <td className="px-6 py-5 text-center border-l border-white/10 text-apple-accent">{totalAnnualProgress}%</td>
              <td className="px-6 py-5 text-center border-l border-white/10 text-[#32D74B]">{totalStatsProgress}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default StaffKPIReport;
