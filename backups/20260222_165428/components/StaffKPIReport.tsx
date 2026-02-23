
import React from 'react';
import { AccountantKPI, Language, Staff } from '../types';
import { translations } from '../lib/translations';

interface Props {
  kpis: AccountantKPI[];
  staff: Staff[];
  lang: Language;
  onStaffSelect: (s: Staff) => void;
  selectedOperation: string;
  onOperationChange: (opKey: string) => void;
  selectedPeriod: string;
}

const StaffKPIReport: React.FC<Props> = ({ kpis, staff, lang, onStaffSelect, selectedOperation, onOperationChange, selectedPeriod }) => {
  const t = translations[lang];

  const REPORT_COLUMNS = [
    { key: 'didox', short: 'DD', label: 'Didox' },
    { key: 'xatlar', short: 'XT', label: 'Xatlar' },
    { key: 'avtokameral', short: 'AK', label: 'Avtokameral' },
    { key: 'my_mehnat', short: 'MM', label: 'My Mehnat' },
    { key: 'one_c', short: '1C', label: '1C' },
    { key: 'pul_oqimlari', short: 'PO', label: 'Pul Oqimlari' },
    { key: 'chiqadigan_soliqlar', short: 'CS', label: 'Chiqadigan soliqlar' },
    { key: 'hisoblangan_oylik', short: 'HO', label: 'Hisoblangan oylik' },
    { key: 'debitor_kreditor', short: 'DK', label: 'Debitor kreditor' },
    { key: 'foyda_va_zarar', short: 'FZ', label: 'Foyda va zarar' },
    { key: 'tovar_ostatka', short: 'TO', label: 'Tovar ostatka' },
    { key: 'aylanma_qqs', short: 'AQ', label: 'Aylanma/QQS' },
    { key: 'daromad_soliq', short: 'DS', label: 'Daromad soliq' },
    { key: 'inps', short: 'IN', label: 'INPS' },
    { key: 'foyda_soliq', short: 'FS', label: 'Foyda soliq' },
    { key: 'moliyaviy_natija', short: 'MN', label: 'Moliyaviy natija' },
    { key: 'buxgalteriya_balansi', short: 'BB', label: 'Buxgalteriya balansi' },
    { key: 'statistika', short: 'ST', label: 'Statistika' },
    { key: 'bonak', short: 'BN', label: "Bo'nak" },
    { key: 'yer_soligi', short: 'YS', label: "Yer solig'i" },
    { key: 'mol_mulk_soligi', short: 'MS', label: "Mol mulk solig'i" },
    { key: 'suv_soligi', short: 'SS', label: "Suv solig'i" },
  ];

  const selectedOpLabel = selectedOperation === 'all'
    ? (lang === 'uz' ? 'Umumiy Progress' : 'Общий прогресс')
    : REPORT_COLUMNS.find(c => c.key === selectedOperation)?.label || t.annualProgress;

  const monthFormatted = selectedPeriod; // E.g., "2026-02"

  const totals = kpis.reduce((acc, k) => ({
    firms: acc.firms + k.totalCompanies,
    annual: acc.annual + k.annualCompleted,
    pending: acc.pending + k.annualPending,
    blocked: acc.blocked + k.annualBlocked,
    stats: acc.stats + k.statsCompleted
  }), { firms: 0, annual: 0, pending: 0, blocked: 0, stats: 0 });

  const pointsPerCompany = selectedOperation === 'all' ? 22 : 1;
  const totalPossiblePoints = totals.firms * pointsPerCompany;
  const globalProgressRaw = totalPossiblePoints > 0 ? (totals.annual / totalPossiblePoints) * 100 : 0;

  const totalAnnualProgressDisplay = globalProgressRaw > 0 && globalProgressRaw < 10
    ? globalProgressRaw.toFixed(1)
    : Math.round(globalProgressRaw);

  const handleStaffClick = (staffName: string) => {
    const foundStaff = staff.find(s => s.name === staffName);
    if (foundStaff) {
      onStaffSelect(foundStaff);
    }
  };

  const staffKey = (k: AccountantKPI, index: number) => {
    const found = staff.find(s => s.name === k.name);
    // Make key stable and unique even if staff has duplicate names or kpis contains duplicates
    return [found?.id || 'no-id', k.name || 'no-name', String(index)].join('::');
  };

  return (
    <div className="liquid-glass-card rounded-[3.5rem] border border-white/20 shadow-glass-lg overflow-hidden mb-20 animate-fade-in relative group">
      {/* Background accents */}
      <div className="absolute -top-40 -left-40 w-80 h-80 bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="p-12 border-b border-white/10 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-10 bg-white/5 relative z-10">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 backdrop-blur-md flex items-center justify-center border border-indigo-500/20 shadow-glass">
            <div className="animate-pulse-subtle">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <div>
            <h2 className="text-3xl md:text-4xl font-black tracking-tighter premium-text-gradient uppercase leading-none mb-2">
              {selectedOpLabel}
            </h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">
              {monthFormatted} — Performance Intel
            </p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-8 w-full xl:w-auto">
          <div className="relative w-full md:w-80 group/select">
            <select
              value={selectedOperation}
              onChange={(e) => onOperationChange(e.target.value)}
              className="w-full bg-white/10 dark:bg-white/5 border border-white/20 rounded-[1.8rem] px-8 py-5 text-xs font-black text-slate-800 dark:text-white outline-none focus:bg-white/20 dark:focus:bg-white/10 focus:border-indigo-500/40 transition-all appearance-none cursor-pointer uppercase tracking-widest shadow-inner relative z-10"
            >
              <option value="all" className="bg-slate-900 text-white">{lang === 'uz' ? 'Barcha Operatsiyalar' : 'Все операции'}</option>
              {REPORT_COLUMNS.map(col => (
                <option key={col.key} value={col.key} className="bg-slate-900 text-white">{col.short} - {col.label}</option>
              ))}
            </select>
            <div className="absolute right-6 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center pointer-events-none border border-white/10">
              <svg className="w-4 h-4 text-slate-400 group-hover/select:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>

          <div className="flex items-center gap-10 bg-indigo-500/5 p-8 rounded-[2.5rem] border border-indigo-500/10 w-full md:w-auto hover:bg-indigo-500/10 transition-all duration-500 group/prog">
            <div className="text-right">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2">{t.total}</p>
              <p className="text-4xl font-black tabular-nums premium-text-gradient">{totalAnnualProgressDisplay}%</p>
            </div>
            <div className="flex flex-col gap-3">
              <div className="h-4 w-48 bg-white/10 dark:bg-white/5 rounded-full overflow-hidden border border-white/10 shadow-inner group-hover/prog:w-56 transition-all duration-700">
                <div
                  className={`h-full transition-all duration-1000 shadow-[0_0_15px_rgba(79,70,229,0.3)] ${Number(totalAnnualProgressDisplay) >= 90 ? 'bg-emerald-500' : Number(totalAnnualProgressDisplay) >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`}
                  style={{ width: `${totalAnnualProgressDisplay}%` }}
                ></div>
              </div>
              <div className="flex justify-between w-full">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Efficiency</span>
                <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest">Optimized</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto scrollbar-none relative z-10">
        <table className="w-full text-left border-collapse min-w-[1240px]">
          <thead>
            <tr className="bg-white/5 dark:bg-white/5 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 border-b border-white/10">
              <th className="px-10 py-10 border-r border-white/5 backdrop-blur-md">{t.accountant}</th>
              <th className="px-6 py-10 text-center border-r border-white/5 backdrop-blur-md">{t.total}</th>
              <th className="px-6 py-10 text-center border-r border-white/5 text-emerald-500 backdrop-blur-md cursor-pointer hover:bg-emerald-500/5 transition-colors" onClick={() => onOperationChange('all')}>
                <div className="flex items-center justify-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Success
                </div>
              </th>
              <th className="px-6 py-10 text-center border-r border-white/5 text-rose-500 backdrop-blur-md">
                <div className="flex items-center justify-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  Pending
                </div>
              </th>
              <th className="px-6 py-10 text-center border-r border-white/5 text-amber-500 backdrop-blur-md">
                <div className="flex items-center justify-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  Blocked
                </div>
              </th>
              <th className="px-10 py-10 text-center border-r border-white/5 backdrop-blur-md">{selectedOpLabel} (%)</th>
              <th className="px-10 py-10 text-center text-indigo-500 backdrop-blur-md">{t.statShort}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {kpis.map((k, idx) => (
              <tr
                key={staffKey(k, idx)}
                className="hover:bg-white/10 dark:hover:bg-white/5 transition-all duration-500 group cursor-pointer"
                onClick={() => handleStaffClick(k.name)}
              >
                <td className="px-10 py-10 border-r border-white/5">
                  <div className="flex items-center gap-6">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-emerald-500/10 flex items-center justify-center text-2xl font-black text-indigo-500 shadow-glass border border-white/10 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                      {k.name.charAt(0)}
                    </div>
                    <div>
                      <span className="font-black text-xl text-slate-800 dark:text-white block tracking-tight group-hover:text-indigo-500 transition-colors mb-1">
                        {k.name}
                      </span>
                      <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">{(k as any).role || t.leadAccountant}</span>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-10 text-center border-r border-white/5 font-black text-xl tabular-nums text-slate-600 dark:text-slate-400">
                  {k.totalCompanies}
                </td>
                <td className="px-6 py-10 text-center border-r border-white/5 tabular-nums font-black text-emerald-500 text-2xl">
                  {k.annualCompleted}
                </td>
                <td className="px-6 py-10 text-center border-r border-white/5 tabular-nums font-black text-rose-500 text-2xl">
                  {k.annualPending}
                </td>
                <td className="px-6 py-10 text-center border-r border-white/5 tabular-nums font-black text-amber-500 text-2xl">
                  {k.annualBlocked}
                </td>
                <td className="px-10 py-10 border-r border-white/5">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className={`text-xl font-black tabular-nums ${k.annualProgress >= 90 ? 'text-emerald-500' : k.annualProgress >= 60 ? 'text-amber-500' : 'text-rose-500'}`}>
                        {k.annualProgress}%
                      </span>
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Efficiency</span>
                    </div>
                    <div className="h-2.5 w-full bg-white/10 dark:bg-white/5 rounded-full overflow-hidden border border-white/10 shadow-inner group-hover:scale-x-[1.02] transition-transform duration-500 origin-left">
                      <div
                        className={`h-full transition-all duration-1000 ${k.annualProgress >= 90 ? 'bg-emerald-500' : k.annualProgress >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`}
                        style={{ width: `${k.annualProgress}%` }}
                      ></div>
                    </div>
                  </div>
                </td>
                <td className="px-10 py-10 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-2xl font-black text-indigo-500 tabular-nums">{k.statsProgress}%</span>
                    <div className="w-12 h-1 bg-indigo-500/20 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${k.statsProgress}%` }}></div>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-900 dark:bg-white/5 font-black">
            <tr className="text-white dark:text-white border-t border-white/10">
              <td className="px-10 py-12 uppercase tracking-[0.4em] text-slate-400 text-xs font-black">Global Analytics Totals</td>
              <td className="px-6 py-12 text-center tabular-nums text-2xl text-slate-300">{totals.firms}</td>
              <td className="px-6 py-12 text-center text-emerald-500 tabular-nums text-2xl">{totals.annual}</td>
              <td className="px-6 py-12 text-center text-rose-500 tabular-nums text-2xl">{totals.pending}</td>
              <td className="px-6 py-12 text-center text-amber-500 tabular-nums text-2xl">{totals.blocked}</td>
              <td className="px-10 py-12 text-center">
                <div className="flex flex-col items-center">
                  <span className="text-4xl font-black tabular-nums premium-text-gradient">{totalAnnualProgressDisplay}%</span>
                  <span className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-500 mt-2">Avg. Annual Success</span>
                </div>
              </td>
              <td className="px-10 py-12 text-center">
                <div className="flex flex-col items-center">
                  <span className="text-4xl font-black tabular-nums text-indigo-500">{Math.round((totals.stats / totals.firms) * 100)}%</span>
                  <span className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-500 mt-2">Avg. Stats Ready</span>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default StaffKPIReport;
