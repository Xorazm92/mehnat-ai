
import React from 'react';
import { Staff, Company, OperationEntry, Language } from '../types';
import { translations } from '../lib/translations';
import StatusBadge from './StatusBadge';
import { X, Building2, Phone, Briefcase, FileText } from 'lucide-react';

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
      <div className="fixed inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm z-[100] transition-opacity" onClick={onClose}></div>
      <div className="fixed right-0 top-0 h-full w-full max-w-4xl bg-white dark:bg-apple-darkBg shadow-2xl z-[101] animate-in overflow-y-auto" style={{animation: 'slideLeft 0.4s ease-out'}}>
        <div className="p-8 md:p-12">
          <div className="flex justify-between items-start mb-10">
            <div className="flex items-center gap-6">
              <div className="h-24 w-24 rounded-[2.5rem] flex items-center justify-center text-4xl text-white font-black shadow-2xl transition-transform hover:scale-110" style={{backgroundColor: staff.avatarColor}}>
                {staff.name.charAt(0)}
              </div>
              <div>
                <h2 className="text-4xl font-black text-slate-800 dark:text-white tracking-tight leading-tight">{staff.name}</h2>
                <div className="flex items-center gap-3 mt-3">
                  <span className="px-4 py-1.5 bg-apple-accent/10 rounded-xl text-xs font-black text-apple-accent uppercase tracking-widest">{staff.role}</span>
                  {staff.phone && (
                    <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-100 dark:bg-white/5 rounded-xl text-xs font-bold text-slate-500 font-mono tracking-tighter">
                      <Phone size={12} /> {staff.phone}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-4 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-[1.5rem] text-slate-400 transition-all active:scale-90">
              <X size={28} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
            <div className="p-8 bg-slate-50 dark:bg-white/5 rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder group hover:border-apple-accent transition-all">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">{t.activeCompanies}</p>
              <div className="flex items-center gap-4">
                <div className="p-3 bg-apple-accent/10 rounded-2xl text-apple-accent group-hover:bg-apple-accent group-hover:text-white transition-all">
                  <Briefcase size={24} />
                </div>
                <p className="font-black text-4xl text-slate-800 dark:text-white tracking-tighter">{companies.length}</p>
              </div>
            </div>
            <div className="p-8 bg-slate-50 dark:bg-white/5 rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder group hover:border-emerald-500 transition-all">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">{t.completedFirms}</p>
              <div className="flex items-center gap-4 text-emerald-500">
                <div className="p-3 bg-emerald-500/10 rounded-2xl group-hover:bg-emerald-500 group-hover:text-white transition-all">
                  <Building2 size={24} />
                </div>
                <p className="font-black text-4xl tracking-tighter">
                  {operations.filter(op => companies.some(c => c.id === op.companyId && op.profitTaxStatus === '+')).length}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mb-8">
            <h3 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-4">
              <div className="w-2 h-8 bg-apple-accent rounded-full"></div>
              {t.organizations}
            </h3>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-white/5 px-4 py-2 rounded-full">
              4 Bandlik Monitoring
            </div>
          </div>

          <div className="bg-white dark:bg-apple-darkCard rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-white/5 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 border-b dark:border-apple-darkBorder">
                    <th className="px-8 py-6">{t.companyName}</th>
                    <th className="px-6 py-6 text-center border-l dark:border-apple-darkBorder">{t.profitTax}</th>
                    <th className="px-6 py-6 text-center border-l dark:border-apple-darkBorder">{t.form1}</th>
                    <th className="px-6 py-6 text-center border-l dark:border-apple-darkBorder">{t.form2}</th>
                    <th className="px-6 py-6 text-center border-l dark:border-apple-darkBorder">{t.stats}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-apple-border dark:divide-apple-darkBorder">
                  {companies.map(c => {
                    const op = operations.find(o => o.companyId === c.id);
                    return (
                      <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-all group">
                        <td className="px-8 py-5">
                          <div className="font-black text-slate-800 dark:text-white text-sm group-hover:text-apple-accent transition-colors">{c.name}</div>
                          <div className="text-[10px] font-bold text-slate-400 mt-0.5">INN: {c.inn} • {c.taxRegime}</div>
                        </td>
                        <td className="px-6 py-5 text-center border-l dark:border-apple-darkBorder"><StatusBadge status={op?.profitTaxStatus || '-'} /></td>
                        <td className="px-6 py-5 text-center border-l dark:border-apple-darkBorder"><StatusBadge status={op?.form1Status || '-'} /></td>
                        <td className="px-6 py-5 text-center border-l dark:border-apple-darkBorder"><StatusBadge status={op?.form2Status || '-'} /></td>
                        <td className="px-6 py-5 text-center border-l dark:border-apple-darkBorder"><StatusBadge status={op?.statsStatus || '-'} /></td>
                      </tr>
                    );
                  })}
                  {companies.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-8 py-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">{t.noData}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes slideLeft {
          from { transform: translateX(100%); opacity: 0.5; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  );
};

export default StaffProfileDrawer;
