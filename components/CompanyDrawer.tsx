
import React from 'react';
import { Company, OperationEntry } from '../types';
import StatusBadge from './StatusBadge';

interface DrawerProps {
  company: Company | null;
  operation: OperationEntry | null;
  onClose: () => void;
}

const CompanyDrawer: React.FC<DrawerProps> = ({ company, operation, onClose }) => {
  if (!company || !operation) return null;

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] transition-opacity" onClick={onClose}></div>
      <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl z-[101] animate-in overflow-y-auto" style={{animation: 'slideLeft 0.4s ease-out'}}>
        <div className="p-10">
          <div className="flex justify-between items-start mb-10">
            <div className="flex items-center gap-6">
              <div className="h-20 w-20 bg-indigo-600 rounded-[2rem] flex items-center justify-center text-3xl text-white font-black shadow-2xl shadow-indigo-200">
                {company.name.charAt(0)}
              </div>
              <div>
                <h2 className="text-3xl font-black text-slate-800 tracking-tight leading-tight">{company.name}</h2>
                <div className="flex items-center gap-3 mt-2">
                  <span className="px-3 py-1 bg-slate-100 rounded-lg text-xs font-black text-slate-500 font-mono tracking-tighter">INN: {company.inn}</span>
                  <span className="px-3 py-1 bg-indigo-50 rounded-lg text-xs font-black text-indigo-600 uppercase tracking-widest">{company.taxRegime}</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-3 bg-slate-50 hover:bg-slate-100 rounded-2xl text-slate-400 transition-all active:scale-90">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-12">
            <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Mas'ul Buxgalter</p>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 font-black">
                  {company.accountantId.charAt(0)}
                </div>
                <p className="font-bold text-slate-800">{company.accountantId}</p>
              </div>
            </div>
            <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Sohasi / Bo'lim</p>
              <p className="font-bold text-slate-800 flex items-center gap-2">
                🏢 {company.department}
              </p>
            </div>
          </div>

          <div className="mb-12">
            <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
              <span className="h-6 w-1 bg-indigo-600 rounded-full"></span>
              Hisobotlar Statusi
            </h3>
            <div className="space-y-4">
              {[
                { label: '💰 Foyda Solig\'i', status: operation.profitTaxStatus },
                { label: '🏢 Buxgalteriya Balansi (F1)', status: operation.form1Status },
                { label: '📊 Moliyaviy Natija (F2)', status: operation.form2Status },
                { label: '📈 Statistika Atchoti', status: operation.statsStatus },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between p-5 bg-white border border-slate-100 rounded-2xl hover:border-indigo-100 transition-all group">
                  <span className="font-bold text-slate-700 group-hover:text-indigo-600">{item.label}</span>
                  <StatusBadge status={item.status} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
              <span className="h-6 w-1 bg-indigo-600 rounded-full"></span>
              Audit Tarixi (Audit Log)
            </h3>
            <div className="space-y-6 relative before:absolute before:left-5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
              {operation.history.map((log, i) => (
                <div key={i} className="relative pl-12">
                  <div className="absolute left-3 top-2 h-4 w-4 rounded-full border-4 border-white bg-indigo-600 shadow-sm z-10"></div>
                  <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-black text-indigo-600 uppercase">{log.action}</span>
                      <span className="text-[10px] font-bold text-slate-400">{log.date}</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-800 mb-1">{log.comment}</p>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">— {log.user}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes slideLeft {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
};

export default CompanyDrawer;
