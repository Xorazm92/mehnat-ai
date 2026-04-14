
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
    <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 rounded shadow-sm overflow-hidden mb-6 relative">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50 dark:bg-[#1A1D23]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center border border-indigo-100 dark:border-indigo-800 shrink-0">
            <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 uppercase mb-0.5">
              {selectedOpLabel}
            </h2>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
              {monthFormatted} — {translations[lang].performanceIntel}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
          <select
            value={selectedOperation}
            onChange={(e) => onOperationChange(e.target.value)}
            className="w-full sm:w-64 bg-white dark:bg-[#1e2025] border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-xs font-bold text-gray-800 dark:text-gray-200 outline-none focus:border-indigo-500 transition-colors uppercase shadow-sm"
          >
            <option value="all">{lang === 'uz' ? 'Barcha Operatsiyalar' : 'Все операции'}</option>
            {REPORT_COLUMNS.map(col => (
              <option key={col.key} value={col.key}>{col.short} - {col.label}</option>
            ))}
          </select>

          <div className="flex items-center gap-4 bg-white dark:bg-[#1e2025] border border-gray-300 dark:border-gray-600 p-2 px-4 rounded shadow-sm shrink-0">
            <div className="text-right">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">{t.total}</p>
              <p className="text-xl font-bold tabular-nums text-gray-800 dark:text-gray-100 leading-none">{totalAnnualProgressDisplay}%</p>
            </div>
            <div className="flex flex-col gap-1 w-32 border-l border-gray-200 dark:border-gray-700 pl-4 ml-2">
              <div className="h-2 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${Number(totalAnnualProgressDisplay) >= 90 ? 'bg-emerald-500' : Number(totalAnnualProgressDisplay) >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`}
                  style={{ width: `${totalAnnualProgressDisplay}%` }}
                ></div>
              </div>
              <div className="flex justify-between w-full">
                <span className="text-[8px] font-bold text-gray-400 uppercase">Eff.</span>
                <span className="text-[8px] font-bold text-indigo-500 uppercase">{totalAnnualProgressDisplay}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-800 text-[10px] font-bold uppercase text-gray-500 border-b border-gray-200 dark:border-gray-700">
              <th className="px-4 py-3 border-r border-gray-200 dark:border-gray-700">{t.accountant}</th>
              <th className="px-4 py-3 text-center border-r border-gray-200 dark:border-gray-700">{t.total}</th>
              <th className="px-4 py-3 text-center border-r border-gray-200 dark:border-gray-700 text-emerald-600 dark:text-emerald-500 cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-900/10" onClick={() => onOperationChange('all')}>
                Success
              </th>
              <th className="px-4 py-3 text-center border-r border-gray-200 dark:border-gray-700 text-rose-600 dark:text-rose-500">
                Pending
              </th>
              <th className="px-4 py-3 text-center border-r border-gray-200 dark:border-gray-700 text-amber-600 dark:text-amber-500">
                Blocked
              </th>
              <th className="px-4 py-3 text-center border-r border-gray-200 dark:border-gray-700">{selectedOpLabel} (%)</th>
              <th className="px-4 py-3 text-center text-indigo-600 dark:text-indigo-500">{t.statShort}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {kpis.map((k, idx) => (
              <tr
                key={staffKey(k, idx)}
                className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer group"
                onClick={() => handleStaffClick(k.name)}
              >
                <td className="px-4 py-3 border-r border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded shrink-0 bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-sm font-bold text-indigo-600 dark:text-indigo-400 group-hover:text-white group-hover:bg-indigo-500 transition-colors">
                      {k.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-gray-800 dark:text-gray-200 block group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {k.name}
                      </div>
                      <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{(k as any).role || t.leadAccountant}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-center border-r border-gray-200 dark:border-gray-700 font-bold text-gray-800 dark:text-gray-200">
                  {k.totalCompanies}
                </td>
                <td className="px-4 py-3 text-center border-r border-gray-200 dark:border-gray-700 font-bold text-emerald-600 dark:text-emerald-500">
                  {k.annualCompleted}
                </td>
                <td className="px-4 py-3 text-center border-r border-gray-200 dark:border-gray-700 font-bold text-rose-600 dark:text-rose-500">
                  {k.annualPending}
                </td>
                <td className="px-4 py-3 text-center border-r border-gray-200 dark:border-gray-700 font-bold text-amber-600 dark:text-amber-500">
                  {k.annualBlocked}
                </td>
                <td className="px-4 py-3 border-r border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3">
                    <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${k.annualProgress >= 90 ? 'bg-emerald-500' : k.annualProgress >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`}
                        style={{ width: `${k.annualProgress}%` }}
                      ></div>
                    </div>
                    <span className={`text-xs font-bold w-10 text-right ${k.annualProgress >= 90 ? 'text-emerald-600 dark:text-emerald-500' : k.annualProgress >= 60 ? 'text-amber-600 dark:text-amber-500' : 'text-rose-600 dark:text-rose-500'}`}>
                      {k.annualProgress}%
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 border-r border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3">
                     <span className="text-xs font-bold w-10 text-right text-indigo-500">{k.statsProgress}%</span>
                    <div className="w-full h-1.5 bg-indigo-500/20 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500" style={{ width: `${k.statsProgress}%` }}></div>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-100 dark:bg-[#1A1D23] font-bold">
            <tr className="border-t-2 border-gray-200 dark:border-gray-700">
              <td className="px-4 py-4 uppercase text-gray-600 dark:text-gray-400 text-[10px] font-bold tracking-widest">Umumiy hisobot statistika</td>
              <td className="px-4 py-4 text-center text-gray-800 dark:text-white text-sm">{totals.firms}</td>
              <td className="px-4 py-4 text-center text-emerald-600 text-sm">{totals.annual}</td>
              <td className="px-4 py-4 text-center text-rose-600 text-sm">{totals.pending}</td>
              <td className="px-4 py-4 text-center text-amber-600 text-sm">{totals.blocked}</td>
              <td className="px-4 py-4 text-center text-gray-800 dark:text-white text-sm">{totalAnnualProgressDisplay}%</td>
              <td className="px-4 py-4 text-center text-gray-800 dark:text-white text-sm">{Math.round((totals.stats / totals.firms) * 100)}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default StaffKPIReport;
