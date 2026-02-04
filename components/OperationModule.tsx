
import React, { useState, useMemo } from 'react';
import { Company, OperationEntry, ReportStatus, TaxRegime, Language } from '../types';
import { translations } from '../lib/translations';
import StatusBadge from './StatusBadge';
import { Search, Download, Filter } from 'lucide-react';

interface Props {
  companies: Company[];
  operations: OperationEntry[];
  activeFilter?: string;
  lang: Language;
  onUpdate: (op: OperationEntry) => void;
}

const OperationModule: React.FC<Props> = ({ companies, operations, activeFilter = 'all', lang, onUpdate }) => {
  const t = translations[lang];
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState('2024 Yillik');

  const filtered = useMemo(() => {
    return companies.filter(c => {
      const op = operations.find(o => o.companyId === c.id);
      const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.inn.includes(search);
      
      if (!matchesSearch) return false;
      if (activeFilter === 'all' || activeFilter === 'none') return true;
      
      if (!op) return false;

      if (activeFilter.includes(':')) {
        const [field, status] = activeFilter.split(':');
        return (op as any)[field] === status;
      }

      if (activeFilter === 'delayed') {
        return op.profitTaxStatus === ReportStatus.NOT_SUBMITTED || 
               op.form1Status === ReportStatus.NOT_SUBMITTED || 
               op.statsStatus === ReportStatus.NOT_SUBMITTED ||
               op.profitTaxStatus === ReportStatus.REJECTED;
      }
      if (activeFilter === 'blocked') {
        return op.form1Status === ReportStatus.BLOCKED || 
               op.profitTaxStatus === ReportStatus.BLOCKED ||
               op.form2Status === ReportStatus.BLOCKED;
      }
      if (activeFilter === 'progress') {
        return op.profitTaxStatus === ReportStatus.ACCEPTED && op.form1Status === ReportStatus.ACCEPTED;
      }
      
      return true;
    });
  }, [companies, operations, search, activeFilter]);

  const filterLabel = useMemo(() => {
    if (activeFilter === 'all' || activeFilter === 'none') return t.total;
    if (activeFilter === 'delayed') return t.debtors;
    if (activeFilter === 'blocked') return t.blocked;
    if (activeFilter === 'progress') return t.completedFirms;
    if (activeFilter.includes(':')) {
      const [field, status] = activeFilter.split(':');
      const fieldName = field.replace('Status', '').toUpperCase();
      return `${fieldName} | ${status}`;
    }
    return activeFilter;
  }, [activeFilter, t]);

  const handleStatusChange = (op: OperationEntry, field: keyof OperationEntry, val: string) => {
    onUpdate({ ...op, [field]: val as ReportStatus, updatedAt: new Date().toISOString() });
  };

  return (
    <div className="space-y-8 md:space-y-10 animate-fade-in">
      <div className="bg-white dark:bg-apple-darkCard p-7 md:p-10 rounded-[2rem] md:rounded-[3rem] shadow-sm border border-apple-border dark:border-apple-darkBorder flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 md:gap-10">
        <div className="flex-1 w-full">
          <div className="flex flex-wrap items-center gap-4 md:gap-6 mb-3">
             <h2 className="text-3xl md:text-4xl font-extrabold text-slate-800 dark:text-white tracking-tight">{t.reports}</h2>
             {activeFilter !== 'all' && (
               <div className="px-4 py-2 bg-apple-accent text-white text-tiny md:text-xs font-black uppercase rounded-xl flex items-center gap-3">
                  <Filter size={12} /> {filterLabel}
               </div>
             )}
          </div>
          <p className="text-sm md:text-base font-semibold text-slate-400">
             <span className="tabular-nums">{filtered.length}</span> {t.firmCount}
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto">
          <div className="relative flex-1 xl:w-[450px] group min-w-0">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder={t.search} 
              className="w-full pl-14 pr-6 py-4 md:py-5 bg-slate-50 dark:bg-white/5 border border-apple-border dark:border-apple-darkBorder rounded-2xl outline-none focus:bg-white dark:focus:bg-apple-darkBg focus:ring-4 focus:ring-apple-accent/5 transition-all font-bold text-sm md:text-base"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button className="p-4 md:p-5 bg-apple-accent text-white rounded-2xl md:rounded-[1.5rem] hover:bg-blue-600 transition-all shadow-2xl shadow-blue-500/30 active:scale-95">
            <Download size={20} />
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-apple-darkCard rounded-[2rem] md:rounded-[3.5rem] border border-apple-border dark:border-apple-darkBorder overflow-hidden shadow-xl">
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-apple-accent">
          <table className="w-full text-left border-collapse min-w-[1100px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-white/5 text-xs md:text-sm font-black uppercase tracking-widest text-slate-400 border-b dark:border-apple-darkBorder">
                <th className="px-8 md:px-12 py-7 md:py-10 sticky left-0 bg-slate-50 dark:bg-apple-darkCard z-20 w-80 md:w-96">{t.organizations}</th>
                <th className="px-6 py-7 text-center">{t.profitTax}</th>
                <th className="px-6 py-7 text-center">{t.form1}</th>
                <th className="px-6 py-7 text-center">{t.form2}</th>
                <th className="px-6 py-7 text-center">{t.stats}</th>
                <th className="px-8 py-10">{t.comment}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-apple-border dark:divide-apple-darkBorder">
              {filtered.map(c => {
                const op = operations.find(o => o.companyId === c.id) || {
                  id: Math.random().toString(), companyId: c.id, period,
                  profitTaxStatus: ReportStatus.NOT_SUBMITTED, form1Status: ReportStatus.NOT_SUBMITTED,
                  form2Status: ReportStatus.NOT_SUBMITTED, statsStatus: ReportStatus.NOT_SUBMITTED,
                  comment: '', updatedAt: '', history: []
                };

                return (
                  <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-all group">
                    <td className="px-8 md:px-12 py-6 md:py-8 sticky left-0 bg-white dark:bg-apple-darkCard group-hover:bg-slate-50 dark:group-hover:bg-apple-darkBg/80 z-20 shadow-[2px_0_15px_-5px_rgba(0,0,0,0.1)] transition-colors">
                      <div className="font-extrabold text-slate-800 dark:text-white text-sm md:text-base-plus truncate w-64 md:w-80 tracking-tight">{c.name}</div>
                      <div className="flex flex-wrap items-center gap-3 mt-2">
                        <span className="text-xs font-bold text-slate-400 font-mono tracking-tighter tabular-nums bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded">INN: {c.inn}</span>
                        <span className="px-2 py-1 bg-apple-accent/10 text-tiny font-black text-apple-accent uppercase rounded-md tracking-wider">{c.accountantName}</span>
                      </div>
                    </td>
                    {[
                      { field: 'profitTaxStatus' },
                      { field: 'form1Status' },
                      { field: 'form2Status' },
                      { field: 'statsStatus' }
                    ].map((item) => (
                      <td key={item.field} className="px-4 py-6 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <select 
                            className="bg-transparent border-none text-xs font-black text-slate-400 hover:text-apple-accent outline-none cursor-pointer appearance-none text-center"
                            value={(op as any)[item.field]}
                            onChange={e => handleStatusChange(op as any, item.field as any, e.target.value)}
                          >
                            {Object.values(ReportStatus).map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <StatusBadge status={(op as any)[item.field]} />
                        </div>
                      </td>
                    ))}
                    <td className="px-8 py-6">
                      <textarea 
                        rows={1}
                        className="w-full min-w-[250px] bg-slate-50 dark:bg-white/5 border border-apple-border dark:border-apple-darkBorder rounded-2xl p-4 text-sm font-bold outline-none focus:bg-white dark:focus:bg-apple-darkBg transition-all resize-none shadow-sm"
                        placeholder={t.comment + "..."}
                        value={op.comment}
                        onChange={e => onUpdate({...op as any, comment: e.target.value})}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-32 flex flex-col items-center justify-center text-slate-400">
               <p className="font-black uppercase tracking-widest text-sm md:text-base">{t.noData}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OperationModule;
