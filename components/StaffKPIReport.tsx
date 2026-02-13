
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
}

const StaffKPIReport: React.FC<Props> = ({ kpis, staff, lang, onStaffSelect, selectedOperation, onOperationChange }) => {
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

  const totals = kpis.reduce((acc, k) => ({
    firms: acc.firms + k.totalCompanies,
    annual: acc.annual + k.annualCompleted,
    pending: acc.pending + k.annualPending,
    blocked: acc.blocked + k.annualBlocked,
    stats: acc.stats + k.statsCompleted
  }), { firms: 0, annual: 0, pending: 0, blocked: 0, stats: 0 });

  const totalAnnualProgress = totals.firms > 0 ? Math.round((totals.annual / totals.firms) * 100) : 0;

  const handleStaffClick = (staffName: string) => {
    const foundStaff = staff.find(s => s.name === staffName);
    if (foundStaff) {
      onStaffSelect(foundStaff);
    }
  };

  return (
    <div className="bg-[#1C1C1E] dark:bg-[#1C1C1E] rounded-[2.5rem] border border-[#2C2C2E] shadow-2xl overflow-hidden mb-12 md:mb-20 animate-macos">
      <div className="p-8 md:p-12 border-b border-[#2C2C2E] flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8 bg-[#2C2C2E]/30">
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <div className="h-5 w-1.5 bg-[#007AFF] rounded-full"></div>
            <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white uppercase">{t.kpiReport}</h2>
          </div>
          <p className="text-xs md:text-sm font-black text-[#8E8E93] uppercase tracking-[0.2em] ml-6">{t.analyticalCenter}</p>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-6 w-full xl:w-auto">
          <div className="flex bg-[#1C1C1E] p-2 rounded-2xl border border-[#2C2C2E] shadow-inner w-full md:w-auto">
            <select
              value={selectedOperation}
              onChange={(e) => onOperationChange(e.target.value)}
              className="bg-transparent border-none text-xs font-black text-[#007AFF] outline-none px-4 py-2 cursor-pointer appearance-none uppercase tracking-widest w-full"
            >
              <option value="all">{lang === 'uz' ? 'Barcha Operatsiyalar' : 'Все операции'}</option>
              {REPORT_COLUMNS.map(col => (
                <option key={col.key} value={col.key}>{col.short} - {col.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-10 bg-[#2C2C2E]/50 p-6 rounded-3xl border border-white/5 w-full md:w-auto">
            <div className="text-right">
              <p className="text-tiny font-black text-[#8E8E93] uppercase tracking-widest mb-1">{t.annualProgress}</p>
              <p className="text-2xl md:text-4xl font-black text-[#007AFF] tabular-nums">{totalAnnualProgress}%</p>
            </div>
            <div className="h-4 w-48 bg-white/5 rounded-full overflow-hidden border border-white/5">
              <div
                className={`h-full transition-all duration-1000 ${totalAnnualProgress >= 90 ? 'bg-[#34C759]' : totalAnnualProgress >= 60 ? 'bg-[#FF9500]' : 'bg-[#FF3B30]'}`}
                style={{ width: `${totalAnnualProgress}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-left border-collapse min-w-[1100px]">
          <thead>
            <tr className="bg-[#2C2C2E]/20 text-xs md:text-sm font-black uppercase tracking-widest text-[#8E8E93] border-b border-[#2C2C2E]">
              <th className="px-10 py-10 border-r border-[#2C2C2E]">{t.accountant}</th>
              <th className="px-6 py-10 text-center border-r border-[#2C2C2E]">{t.total}</th>
              <th className="px-6 py-10 text-center text-[#34C759] border-r border-[#2C2C2E] cursor-pointer" onClick={() => onOperationChange('all')}>+</th>
              <th className="px-6 py-10 text-center text-[#FF375F] border-r border-[#2C2C2E]">-</th>
              <th className="px-6 py-10 text-center text-[#FF9F0A] border-r border-[#2C2C2E]">{t.blocked}</th>
              <th className="px-10 py-10 text-center border-r border-[#2C2C2E]">{t.annualProgress}</th>
              <th className="px-10 py-10 text-center text-[#30D158]">{t.statShort}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2C2C2E]">
            {kpis.map((k) => (
              <tr
                key={k.name}
                className="hover:bg-white/[0.03] transition-all group cursor-pointer"
                onClick={() => handleStaffClick(k.name)}
              >
                <td className="px-10 py-8 border-r border-[#2C2C2E]">
                  <div className="flex items-center gap-6">
                    <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-[#007AFF]/10 flex items-center justify-center text-xl md:text-2xl font-black text-[#007AFF] shadow-lg group-hover:scale-110 transition-transform duration-300">
                      {k.name.charAt(0)}
                    </div>
                    <div>
                      <span className="font-black text-lg md:text-2xl text-white block tracking-tight group-hover:text-[#007AFF] transition-colors">
                        {k.name}
                      </span>
                      <span className="text-tiny md:text-xs font-bold text-[#8E8E93] uppercase tracking-widest mt-1">{(k as any).role || t.leadAccountant}</span>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-8 text-center text-[#8E8E93] border-r border-[#2C2C2E] font-bold text-xl md:text-2xl tabular-nums">
                  {k.totalCompanies}
                </td>
                <td className="px-6 py-8 text-center border-r border-[#2C2C2E] tabular-nums font-black text-[#34C759] text-xl md:text-2xl">
                  {k.annualCompleted}
                </td>
                <td className="px-6 py-8 text-center border-r border-[#2C2C2E] tabular-nums font-black text-[#FF375F] text-xl md:text-2xl">
                  {k.annualPending}
                </td>
                <td className="px-6 py-8 text-center border-r border-[#2C2C2E] tabular-nums font-black text-[#FF9F0A] text-xl md:text-2xl">
                  {k.annualBlocked}
                </td>
                <td className="px-10 py-8 border-r border-[#2C2C2E]">
                  <div className="flex items-center gap-6">
                    <span className={`text-xl md:text-2xl font-black tabular-nums w-16 text-right ${k.annualProgress >= 90 ? 'text-[#34C759]' : k.annualProgress >= 60 ? 'text-[#FF9F0A]' : 'text-[#FF375F]'}`}>
                      {k.annualProgress}%
                    </span>
                    <div className="h-3 flex-1 bg-white/5 rounded-full overflow-hidden min-w-[120px]">
                      <div
                        className={`h-full transition-all duration-1000 ${k.annualProgress >= 90 ? 'bg-[#34C759]' : k.annualProgress >= 60 ? 'bg-[#FF9F0A]' : 'bg-[#FF375F]'}`}
                        style={{ width: `${k.annualProgress}%` }}
                      ></div>
                    </div>
                  </div>
                </td>
                <td className="px-10 py-8 text-center font-black text-xl md:text-2xl text-[#30D158] tabular-nums">
                  {k.statsProgress}%
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-[#2C2C2E]/40 font-black">
            <tr className="text-white text-base md:text-lg border-t border-[#2C2C2E]">
              <td className="px-10 py-10 uppercase tracking-[0.2em] text-[#8E8E93] font-black">{t.total}</td>
              <td className="px-6 py-10 text-center tabular-nums">{totals.firms}</td>
              <td className="px-6 py-10 text-center text-[#34C759] tabular-nums">{totals.annual}</td>
              <td className="px-6 py-10 text-center text-[#FF375F] tabular-nums">{totals.pending}</td>
              <td className="px-6 py-10 text-center text-[#FF9F0A] tabular-nums">{totals.blocked}</td>
              <td className="px-10 py-10 text-center text-[#007AFF] tabular-nums text-2xl md:text-4xl">{totalAnnualProgress}%</td>
              <td className="px-10 py-10 text-center text-[#30D158] tabular-nums text-2xl md:text-4xl">{Math.round((totals.stats / totals.firms) * 100)}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default StaffKPIReport;
