
import React, { useState, useMemo } from 'react';
import { Company, OperationEntry, ReportStatus, TaxType, Language } from '../types';
import StatusBadge from './StatusBadge';
import { translations } from '../lib/translations';

interface MatrixProps {
  companies: Company[];
  operations: OperationEntry[];
  activeFilter: string;
  onCompanySelect: (company: Company) => void;
  lang: Language;
}

const CompanyMatrix: React.FC<MatrixProps> = ({ companies, operations, activeFilter, onCompanySelect, lang }) => {
  const t = translations[lang as keyof typeof translations];
  const [search, setSearch] = useState('');

  const filteredData = useMemo(() => {
    return companies.filter(c => {
      const op = operations.find(o => o.companyId === c.id);
      if (!op) return false;

      const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.inn.includes(search);

      let matchesActiveFilter = true;
      if (activeFilter === 'delayed') {
        matchesActiveFilter = op.profitTaxStatus === ReportStatus.NOT_SUBMITTED || op.form1Status === ReportStatus.NOT_SUBMITTED || op.statsStatus === ReportStatus.NOT_SUBMITTED;
      } else if (activeFilter === 'rejected') {
        matchesActiveFilter = op.profitTaxStatus === ReportStatus.REJECTED || op.form1Status === ReportStatus.REJECTED;
      } else if (activeFilter === 'progress') {
        matchesActiveFilter = op.form1Status === ReportStatus.ACCEPTED;
      }

      return matchesSearch && matchesActiveFilter;
    });
  }, [companies, operations, search, activeFilter]);

  return (
    <div className="liquid-glass-card rounded-[3.5rem] border border-white/20 shadow-glass-lg overflow-hidden mb-20 animate-fade-in relative group">
      {/* Background accents */}
      <div className="absolute -top-40 -left-40 w-80 h-80 bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="p-6 md:p-12 border-b border-white/10 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 md:gap-10 bg-white/5 relative z-10">
        <div>
          <h2 className="text-2xl md:text-4xl font-black tracking-tighter premium-text-gradient uppercase leading-tight mb-2">
            {t.monitoringMatrix}
          </h2>
          <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] md:tracking-[0.4em]">
            {t.matrixSub}
          </p>
        </div>

        <div className="relative group w-full max-w-lg">
          <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors z-10">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </div>
          <input
            type="text"
            placeholder={t.searchMatrix}
            className="w-full pl-16 pr-8 py-5 bg-white/10 dark:bg-white/5 border border-white/20 rounded-[1.8rem] text-sm font-black text-slate-800 dark:text-white outline-none focus:bg-white/20 dark:focus:bg-white/10 focus:border-indigo-500/40 transition-all shadow-inner placeholder:text-slate-400 dark:placeholder:text-slate-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-x-auto scrollbar-none relative z-10">
        <table className="w-full text-left border-collapse min-w-[1200px]">
          <thead>
            <tr className="bg-white/5 dark:bg-white/5 text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-slate-400 border-b border-white/10">
              <th className="px-6 md:px-12 py-6 md:py-10 backdrop-blur-md">{t.firmAndResponsible}</th>
              <th className="px-4 md:px-6 py-6 md:py-10 text-center backdrop-blur-md">{t.profitTax}</th>
              <th className="px-4 md:px-6 py-6 md:py-10 text-center backdrop-blur-md">{t.form1}</th>
              <th className="px-4 md:px-6 py-6 md:py-10 text-center backdrop-blur-md">{t.form2}</th>
              <th className="px-4 md:px-6 py-6 md:py-10 text-center backdrop-blur-md">{t.reports}</th>
              <th className="px-6 md:px-12 py-6 md:py-10 text-right backdrop-blur-md">{t.actions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredData.map(c => {
              const op = operations.find(o => o.companyId === c.id)!;
              return (
                <tr key={c.id} className="hover:bg-white/10 dark:hover:bg-white/5 transition-all duration-500 group cursor-pointer" onClick={() => onCompanySelect(c)}>
                  <td className="px-6 md:px-12 py-6 md:py-10">
                    <div className="flex items-center gap-4 md:gap-6">
                      <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-[1.5rem] bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center font-black text-xl md:text-2xl text-white shadow-glass-indigo group-hover:rotate-6 group-hover:scale-110 transition-all duration-500 border border-white/20">
                        {c.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-black text-lg md:text-xl text-slate-800 dark:text-white tracking-tight group-hover:text-indigo-500 transition-colors mb-2">{c.name}</div>
                        <div className="flex items-center gap-2 md:gap-3">
                          <span className="text-[8px] md:text-[9px] font-black text-slate-400 dark:text-slate-500 px-2 md:px-3 py-1 md:py-1.5 bg-white/5 border border-white/10 rounded-lg md:rounded-xl uppercase tracking-widest text-center truncate max-w-[80px] md:max-w-none">INN: {c.inn}</span>
                          <span className="text-[8px] md:text-[9px] font-black text-indigo-500 bg-indigo-500/10 px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl uppercase tracking-widest">{c.accountantId}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-10 text-center">
                    <StatusBadge status={c.taxType === TaxType.TURNOVER ? ReportStatus.NOT_REQUIRED : op.profitTaxStatus} />
                  </td>
                  <td className="px-6 py-10 text-center"><StatusBadge status={op.form1Status} /></td>
                  <td className="px-6 py-10 text-center"><StatusBadge status={op.form2Status} /></td>
                  <td className="px-6 py-10 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <StatusBadge status={op.statsStatus} />
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">[{c.statsType}]</span>
                    </div>
                  </td>
                  <td className="px-12 py-10 text-right">
                    <button className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 text-slate-400 hover:text-indigo-500 hover:bg-indigo-500/10 hover:border-indigo-500/20 hover:scale-110 transition-all active:scale-95 flex items-center justify-center shadow-sm group/btn">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover/btn:rotate-12 transition-transform"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CompanyMatrix;
