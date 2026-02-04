
import React from 'react';
import { Staff, Company, OperationEntry, Language } from '../types';
import { translations } from '../lib/translations';
import StatusBadge from './StatusBadge';
import { X, Building2, Phone, Briefcase } from 'lucide-react';

interface Props {
  staff: Staff;
  companies: Company[];
  operations: OperationEntry[];
  lang: Language;
  onClose: () => void;
}

const StaffProfileDrawer: React.FC<Props> = ({ staff, companies, operations, lang, onClose }) => {
  const t = translations[lang];

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] transition-opacity" onClick={onClose}></div>
      <div className="fixed right-0 top-0 h-full w-full sm:max-w-4xl bg-white dark:bg-apple-darkBg shadow-2xl z-[101] animate-in overflow-y-auto" style={{animation: 'slideLeft 0.4s ease-out'}}>
        <div className="p-6 md:p-12">
          <div className="flex justify-between items-start mb-8 md:mb-10">
            <div className="flex items-center gap-4 md:gap-6">
              <div className="h-16 w-16 md:h-24 md:w-24 rounded-[1.5rem] md:rounded-[2.5rem] flex items-center justify-center text-2xl md:text-4xl text-white font-black shadow-2xl" style={{backgroundColor: staff.avatarColor}}>
                {staff.name.charAt(0)}
              </div>
              <div>
                <h2 className="text-xl md:text-4xl font-black text-slate-800 dark:text-white tracking-tight leading-tight">{staff.name}</h2>
                <div className="flex flex-wrap items-center gap-2 mt-2 md:mt-3">
                  <span className="px-2.5 py-1 md:px-4 md:py-1.5 bg-apple-accent/10 rounded-lg md:rounded-xl text-[10px] md:text-xs font-black text-apple-accent uppercase tracking-widest">{staff.role}</span>
                  {staff.phone && (
                    <div className="flex items-center gap-2 px-2.5 py-1 md:px-4 md:py-1.5 bg-slate-100 dark:bg-white/5 rounded-lg md:rounded-xl text-[10px] md:text-xs font-bold text-slate-500 font-mono">
                      <Phone size={10} /> {staff.phone}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-2 md:p-4 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl md:rounded-[1.5rem] text-slate-400 transition-all">
              <X size={24} />
            </button>
          </div>

          <div className="grid grid-cols-1 xs:grid-cols-2 gap-4 md:gap-6 mb-8 md:mb-12">
            <div className="p-6 md:p-8 bg-slate-50 dark:bg-white/5 rounded-[1.5rem] md:rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder">
              <p className="text-[10px] md:text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 md:mb-4">{t.activeCompanies}</p>
              <div className="flex items-center gap-3 md:gap-4">
                <div className="p-2 md:p-3 bg-apple-accent/10 rounded-xl md:rounded-2xl text-apple-accent">
                  <Briefcase size={20} />
                </div>
                <p className="font-black text-2xl md:text-4xl text-slate-800 dark:text-white tracking-tighter">{companies.length}</p>
              </div>
            </div>
            <div className="p-6 md:p-8 bg-slate-50 dark:bg-white/5 rounded-[1.5rem] md:rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder">
              <p className="text-[10px] md:text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 md:mb-4">{t.completedFirms}</p>
              <div className="flex items-center gap-3 md:gap-4 text-emerald-500">
                <div className="p-2 md:p-3 bg-emerald-500/10 rounded-xl md:rounded-2xl">
                  <Building2 size={20} />
                </div>
                <p className="font-black text-2xl md:text-4xl tracking-tighter">
                  {operations.filter(op => companies.some(c => c.id === op.companyId && op.profitTaxStatus === '+')).length}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mb-6 md:mb-8">
            <h3 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white flex items-center gap-3">
              <div className="w-1.5 h-6 md:h-8 bg-apple-accent rounded-full"></div>
              {t.organizations}
            </h3>
          </div>

          <div className="bg-white dark:bg-apple-darkCard rounded-[1.5rem] md:rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder overflow-hidden shadow-sm">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="bg-slate-50 dark:bg-white/5 text-[9px] md:text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 border-b dark:border-apple-darkBorder">
                    <th className="px-6 py-4 md:py-6">{t.companyName}</th>
                    <th className="px-4 py-4 md:py-6 text-center border-l dark:border-apple-darkBorder">{t.profitTax}</th>
                    <th className="px-4 py-4 md:py-6 text-center border-l dark:border-apple-darkBorder">{t.form1}</th>
                    <th className="px-4 py-4 md:py-6 text-center border-l dark:border-apple-darkBorder">{t.form2}</th>
                    <th className="px-4 py-4 md:py-6 text-center border-l dark:border-apple-darkBorder">{t.stats}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-apple-border dark:divide-apple-darkBorder">
                  {companies.map(c => {
                    const op = operations.find(o => o.companyId === c.id);
                    return (
                      <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
                        <td className="px-6 py-4">
                          <div className="font-black text-slate-800 dark:text-white text-xs md:text-sm">{c.name}</div>
                          <div className="text-[9px] md:text-[10px] font-bold text-slate-400 mt-0.5">INN: {c.inn}</div>
                        </td>
                        <td className="px-4 py-4 text-center border-l dark:border-apple-darkBorder"><StatusBadge status={op?.profitTaxStatus || '-'} /></td>
                        <td className="px-4 py-4 text-center border-l dark:border-apple-darkBorder"><StatusBadge status={op?.form1Status || '-'} /></td>
                        <td className="px-4 py-4 text-center border-l dark:border-apple-darkBorder"><StatusBadge status={op?.form2Status || '-'} /></td>
                        <td className="px-4 py-4 text-center border-l dark:border-apple-darkBorder"><StatusBadge status={op?.statsStatus || '-'} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default StaffProfileDrawer;
