import React, { useState, useEffect } from 'react';
import { Company, OperationEntry } from '../types';
import StatusBadge from './StatusBadge';
import { fetchDocuments } from '../lib/supabaseData';
import { X, Shield, History, FileText, Lock, Globe, Building, Download, Eye, EyeOff } from 'lucide-react';

interface DrawerProps {
  company: Company | null;
  operation: OperationEntry | null;
  onClose: () => void;
}

const CompanyDrawer: React.FC<DrawerProps> = ({ company, operation, onClose }) => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    if (company) {
      setIsLoadingDocs(true);
      fetchDocuments(company.id).then(docs => {
        setDocuments(docs);
        setIsLoadingDocs(false);
      });
    }
  }, [company]);

  if (!company || !operation) return null;

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] transition-opacity animate-fade-in" onClick={onClose}></div>
      <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-slate-50 dark:bg-apple-darkBg shadow-[-20px_0_50px_rgba(0,0,0,0.2)] z-[101] overflow-y-auto scrollbar-thin overflow-x-hidden" style={{ animation: 'slideLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}>

        <div className="bg-white dark:bg-apple-darkCard border-b border-apple-border dark:border-apple-darkBorder sticky top-0 z-10">
          <div className="p-8 md:p-10 flex justify-between items-center">
            <div className="flex items-center gap-6">
              <div className="h-20 w-20 bg-apple-accent rounded-[2rem] flex items-center justify-center text-3xl text-white font-black shadow-2xl shadow-blue-500/20">
                {company.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight leading-none mb-2 truncate">{company.name}</h2>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="px-3 py-1 bg-slate-100 dark:bg-white/5 rounded-lg text-xs font-black text-slate-500 dark:text-slate-400 font-mono tracking-tighter">INN: {company.inn}</span>
                  <span className="px-3 py-1 bg-apple-accent/10 rounded-lg text-xs font-black text-apple-accent uppercase tracking-widest border border-apple-accent/10">{company.taxRegime}</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-4 bg-slate-50 dark:bg-white/5 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-500 rounded-2xl text-slate-400 transition-all active:scale-90">
              <X size={24} strokeWidth={3} />
            </button>
          </div>
        </div>

        <div className="p-8 md:p-10 space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-white dark:bg-apple-darkCard rounded-[2rem] border border-apple-border dark:border-apple-darkBorder shadow-sm">
              <div className="flex items-center gap-3 mb-4 text-slate-400">
                <Shield size={16} />
                <p className="text-[10px] font-black uppercase tracking-widest">Mas'ul Shaxs</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-apple-accent/10 flex items-center justify-center text-apple-accent font-black text-lg">
                  {company.accountantName.charAt(0)}
                </div>
                <div>
                  <p className="font-black text-slate-800 dark:text-white text-lg leading-tight">{company.accountantName}</p>
                  <p className="text-xs font-bold text-slate-400">Mas'ul Buxgalter</p>
                </div>
              </div>
            </div>

            <div className="p-6 bg-white dark:bg-apple-darkCard rounded-[2rem] border border-apple-border dark:border-apple-darkBorder shadow-sm">
              <div className="flex items-center gap-3 mb-4 text-slate-400">
                <Lock size={16} />
                <p className="text-[10px] font-black uppercase tracking-widest">Kirish Ma'lumotlari</p>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center px-4 py-2 bg-slate-50 dark:bg-white/5 rounded-xl border border-apple-border dark:border-apple-darkBorder">
                  <span className="text-[10px] font-black text-slate-400">LOGIN</span>
                  <span className="text-sm font-mono font-bold text-slate-700 dark:text-slate-300">{company.login || '—'}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-2 bg-slate-50 dark:bg-white/5 rounded-xl border border-apple-border dark:border-apple-darkBorder relative">
                  <span className="text-[10px] font-black text-slate-400">PAROL</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono font-bold text-slate-700 dark:text-slate-300">
                      {showPass ? company.password || '—' : '••••••••'}
                    </span>
                    <button onClick={() => setShowPass(!showPass)} className="text-slate-300 hover:text-apple-accent transition-colors">
                      {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <section>
            <div className="flex items-center gap-4 mb-6">
              <div className="h-1 bg-apple-accent rounded-full w-8"></div>
              <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Hisobotlar Statusi</h3>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {[
                { label: '💰 Foyda Solig\'i', status: operation.profitTaxStatus, field: 'profitTaxStatus' },
                { label: '🏢 Balans (F1)', status: operation.form1Status, field: 'form1Status' },
                { label: '📊 Moliya Natija (F2)', status: operation.form2Status, field: 'form2Status' },
                { label: '📈 Statistika', status: operation.statsStatus, field: 'statsStatus' },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between p-6 bg-white dark:bg-apple-darkCard border border-apple-border dark:border-apple-darkBorder rounded-[1.5rem] hover:ring-2 hover:ring-apple-accent/20 transition-all group">
                  <div>
                    <span className="font-black text-slate-700 dark:text-slate-200 group-hover:text-apple-accent transition-colors">{item.label}</span>
                    <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">2024 Yillik Hisobot</p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="h-1 bg-apple-accent rounded-full w-8"></div>
                <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Hujjatlar</h3>
              </div>
              <span className="px-3 py-1 bg-slate-100 dark:bg-white/5 rounded-full text-[10px] font-black text-slate-400">{documents.length} fayl</span>
            </div>

            <div className="bg-white dark:bg-apple-darkCard rounded-[2rem] border border-apple-border dark:border-apple-darkBorder p-6 space-y-4">
              {isLoadingDocs ? (
                <div className="py-10 text-center animate-pulse text-slate-300 font-bold uppercase text-[10px] tracking-widest">Hujjatlar yuklanmoqda...</div>
              ) : documents.length > 0 ? (
                documents.map((doc, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-transparent hover:border-apple-accent/20 hover:bg-white dark:hover:bg-apple-darkBg transition-all group">
                    <div className="flex items-center gap-4 overflow-hidden">
                      <div className="h-10 w-10 rounded-xl bg-apple-accent/10 flex items-center justify-center text-apple-accent">
                        <FileText size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-700 dark:text-slate-200 truncate">{doc.file_name}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">{doc.file_type || 'PDF'} • {new Date(doc.uploaded_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <a href={doc.file_url} target="_blank" rel="noreferrer" className="p-3 bg-white dark:bg-apple-darkCard text-slate-400 hover:text-apple-accent rounded-xl shadow-sm border border-apple-border dark:border-apple-darkBorder transition-all hover:scale-110">
                      <Download size={16} />
                    </a>
                  </div>
                ))
              ) : (
                <div className="py-20 flex flex-col items-center justify-center text-slate-300 gap-4 opacity-50">
                  <div className="h-16 w-16 rounded-[2rem] border-4 border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-center">
                    <FileText size={24} />
                  </div>
                  <p className="text-xs font-black uppercase tracking-widest">Hujjatlar mavjud emas</p>
                </div>
              )}
            </div>
          </section>

          <section className="pb-20">
            <div className="flex items-center gap-4 mb-8">
              <div className="h-1 bg-apple-accent rounded-full w-8"></div>
              <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-3">
                <History size={20} className="text-apple-accent" />
                Audit Tarixi
              </h3>
            </div>
            <div className="space-y-8 relative before:absolute before:left-5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100 dark:before:bg-white/5">
              {(operation.history || []).length > 0 ? operation.history.map((log, i) => (
                <div key={i} className="relative pl-12 group">
                  <div className="absolute left-3 top-2 h-4 w-4 rounded-full border-4 border-slate-50 dark:border-apple-darkBg bg-apple-accent shadow-sm z-10 group-hover:scale-125 transition-transform"></div>
                  <div className="p-6 bg-white dark:bg-apple-darkCard rounded-[2rem] border border-apple-border dark:border-apple-darkBorder shadow-sm group-hover:shadow-md transition-all">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-[10px] font-black text-apple-accent uppercase tracking-widest bg-apple-accent/5 px-2 py-0.5 rounded">{log.action || 'UPDATE'}</span>
                      <span className="text-[10px] font-bold text-slate-400">{log.date || new Date().toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 leading-relaxed">{log.comment || 'Hech qanday izoh yo\'q'}</p>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">— {log.user || 'Tizim'}</p>
                  </div>
                </div>
              )) : (
                <div className="pl-12 py-4">
                  <p className="text-sm font-bold text-slate-400 italic">Hozircha o'zgarishlar tarixi mavjud emas.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
      <style>{`
        @keyframes slideLeft {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  );
};

export default CompanyDrawer;
