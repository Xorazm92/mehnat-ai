
import React, { useState, useMemo } from 'react';
import { Company, OperationEntry, ReportStatus, TaxRegime, Language } from '../types';
import { translations } from '../lib/translations';
import StatusBadge from './StatusBadge';
import { Search, Download, Filter, ArrowLeft } from 'lucide-react';

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

      // Murakkab filtrlarni tekshirish (masalan: profitTaxStatus:-)
      if (activeFilter.includes(':')) {
        const [field, status] = activeFilter.split(':');
        return (op as any)[field] === status;
      }

      // Standart Dashboard filtrlari
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
    <div className="space-y-8 animate-fade-in">
      <div className="bg-white dark:bg-apple-darkCard p-8 rounded-[2.5rem] shadow-sm border border-apple-border dark:border-apple-darkBorder flex flex-col xl:flex-row justify-between items-center gap-8">
        <div className="flex-1 w-full">
          <div className="flex items-center gap-4 mb-2">
             <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">{t.reports}</h2>
             {activeFilter !== 'all' && (
               <div className="px-4 py-1.5 bg-apple-accent text-white text-[10px] font-black uppercase rounded-xl flex items-center gap-2 animate-pulse">
                  <Filter size={12} /> {filterLabel}
               </div>
             )}
          </div>
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold text-slate-400">
               {filtered.length} {t.firmCount}
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto">
          <div className="relative flex-1 xl:w-96 group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder={t.search} 
              className="w-full pl-14 pr-6 py-4 bg-slate-50 dark:bg-white/5 border border-apple-border dark:border-apple-darkBorder rounded-2xl outline-none focus:bg-white dark:focus:bg-apple-darkBg transition-all font-bold text-sm"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button className="p-4 bg-apple-accent text-white rounded-2xl hover:bg-blue-600 transition-all shadow-xl shadow-blue-500/20 active:scale-95">
            <Download size={20} />
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-apple-darkCard rounded-[3rem] border border-apple-border dark:border-apple-darkBorder overflow-hidden shadow-sm">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1300px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-white/5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b dark:border-apple-darkBorder">
                <th className="px-10 py-8 sticky left-0 bg-white dark:bg-apple-darkCard z-20 w-80">{t.organizations}</th>
                <th className="px-6 py-8 text-center">{t.profitTax}</th>
                <th className="px-6 py-8 text-center">{t.form1}</th>
                <th className="px-6 py-8 text-center">{t.form2}</th>
                <th className="px-6 py-8 text-center">{t.stats}</th>
                <th className="px-10 py-8">{t.comment}</th>
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
                    <td className="px-10 py-6 sticky left-0 bg-white dark:bg-apple-darkCard group-hover:bg-slate-50 dark:group-hover:bg-apple-darkBg/80 z-20 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)] transition-colors">
                      <div className="font-black text-slate-800 dark:text-white text-sm truncate w-64">{c.name}</div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[10px] font-bold text-slate-400 font-mono tracking-tighter">INN: {c.inn}</span>
                        <span className="px-2 py-0.5 bg-apple-accent/5 text-[9px] font-black text-apple-accent uppercase rounded">{c.accountantName}</span>
                      </div>
                    </td>
                    {[
                      { field: 'profitTaxStatus' },
                      { field: 'form1Status' },
                      { field: 'form2Status' },
                      { field: 'statsStatus' }
                    ].map((item) => (
                      <td key={item.field} className="px-6 py-6 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <select 
                            className="bg-transparent border-none text-[10px] font-black text-slate-400 hover:text-apple-accent outline-none cursor-pointer appearance-none text-center"
                            value={(op as any)[item.field]}
                            onChange={e => handleStatusChange(op as any, item.field as any, e.target.value)}
                          >
                            {Object.values(ReportStatus).map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <StatusBadge status={(op as any)[item.field]} />
                        </div>
                      </td>
                    ))}
                    <td className="px-10 py-6">
                      <div className="flex items-center gap-3 group/input">
                        <textarea 
                          rows={1}
                          className="w-full bg-slate-50 dark:bg-white/5 border border-apple-border dark:border-apple-darkBorder rounded-2xl p-4 text-[13px] font-bold outline-none focus:bg-white dark:focus:bg-apple-darkBg focus:ring-4 focus:ring-apple-accent/5 focus:border-apple-accent transition-all resize-none"
                          placeholder={t.comment + "..."}
                          value={op.comment}
                          onChange={e => onUpdate({...op as any, comment: e.target.value})}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-32 flex flex-col items-center justify-center text-slate-400">
              <div className="w-20 h-20 bg-slate-50 dark:bg-white/5 rounded-[2rem] flex items-center justify-center mb-6">
                 <Filter size={32} />
              </div>
              <p className="font-black uppercase tracking-[0.2em] text-sm">{t.noData}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OperationModule;
