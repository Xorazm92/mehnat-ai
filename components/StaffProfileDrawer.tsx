import React, { useState, useEffect } from 'react';
import { Staff, Company, OperationEntry, Language, EmployeeSalarySummary } from '../types';
import { translations } from '../lib/translations';
import StatusBadge from './StatusBadge';
import { calculateEmployeeSalary } from '../lib/supabaseData';
import {
  X,
  Building2,
  Phone,
  Briefcase,
  Wallet,
  FolderOpen,
  Star,
  Download,
  FileText,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
  ExternalLink
} from 'lucide-react';

interface Props {
  staff: Staff;
  companies: Company[];
  operations: OperationEntry[];
  lang: Language;
  onClose: () => void;
}

const StaffProfileDrawer: React.FC<Props> = ({ staff, companies, operations, lang, onClose }) => {
  const t = translations[lang];
  const [activeTab, setActiveTab] = useState<'portfolio' | 'finance' | 'docs'>('portfolio');
  const [salarySummary, setSalarySummary] = useState<EmployeeSalarySummary | null>(null);
  const [loadingSalary, setLoadingSalary] = useState(false);
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  // Fetch salary data when tab changes to finance or initially
  useEffect(() => {
    const loadSalary = async () => {
      setLoadingSalary(true);
      const data = await calculateEmployeeSalary(staff.id, `${currentMonth}-01`);
      setSalarySummary(data);
      setLoadingSalary(false);
    };

    if (activeTab === 'finance' && !salarySummary) {
      loadSalary();
    }
  }, [activeTab, staff.id]);

  const tabs = [
    { id: 'portfolio', label: 'Portfolio', icon: Briefcase },
    { id: 'finance', label: 'Moliya va KPI', icon: Wallet },
    { id: 'docs', label: 'Hujjatlar', icon: FolderOpen },
  ] as const;

  // Mock document data
  const documents = [
    { id: 1, name: 'Pasport Nusxasi', type: 'PDF', size: '2.4 MB', date: '12.01.2025', icon: FileText },
    { id: 2, name: 'Mehnat Shartnomasi', type: 'PDF', size: '4.1 MB', date: '12.01.2025', icon: FileText },
    { id: 3, name: 'NDA (Maxfiylik kelishuvi)', type: 'PDF', size: '1.2 MB', date: '15.01.2025', icon: ShieldCheck },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] transition-opacity" onClick={onClose}></div>
      <div className="fixed right-0 top-0 h-full w-full sm:max-w-4xl bg-white dark:bg-apple-darkBg shadow-2xl z-[101] animate-in overflow-y-auto" style={{ animation: 'slideLeft 0.4s ease-out' }}>

        {/* HEADER SECTION */}
        <div className="relative bg-slate-900 dark:bg-apple-darkCard text-white p-8 md:p-12 pb-24 overflow-hidden">
          {/* Background decorative elements */}
          <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
            <Briefcase size={300} />
          </div>

          <div className="relative z-10 flex justify-between items-start">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
              <div className="relative">
                <div className="h-28 w-28 md:h-32 md:w-32 rounded-[2rem] flex items-center justify-center text-4xl font-black shadow-2xl ring-4 ring-white/10" style={{ backgroundColor: staff.avatarColor }}>
                  {staff.name.charAt(0)}
                </div>
                {/* Status Indicator */}
                <div className={`absolute -bottom-2 -right-2 px-3 py-1 rounded-full text-[10px] font-black uppercase border-2 border-slate-900 ${staff.status === 'sick' ? 'bg-yellow-400 text-yellow-900' :
                  staff.status === 'vacation' ? 'bg-rose-500 text-white' :
                    'bg-emerald-500 text-white'
                  }`}>
                  {staff.status === 'sick' ? 'Kasallik' : staff.status === 'vacation' ? "Ta'tilda" : 'Ishda'}
                </div>
              </div>

              <div className="text-center md:text-left">
                <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-none mb-2">{staff.name}</h2>
                <p className="text-lg text-white/60 font-medium mb-4">{staff.role}</p>

                <div className="flex items-center gap-4 justify-center md:justify-start">
                  {/* Rating */}
                  <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl backdrop-blur-md">
                    <Star className="text-yellow-400 fill-yellow-400" size={16} />
                    <span className="font-bold">{staff.rating || 4.8}/5</span>
                  </div>

                  {/* Phone */}
                  {staff.phone && (
                    <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl backdrop-blur-md text-sm font-mono text-white/80">
                      <Phone size={14} /> {staff.phone}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button onClick={onClose} className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl text-white transition-all">
              <X size={24} />
            </button>
          </div>
        </div>

        {/* TABS & CONTENT */}
        <div className="px-6 md:px-12 -mt-12 relative z-20 pb-20">
          {/* Tab Navigation */}
          <div className="bg-white dark:bg-apple-darkCard rounded-[2rem] p-2 shadow-xl border border-apple-border dark:border-apple-darkBorder flex mb-8">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-4 rounded-xl flex items-center justify-center gap-2 font-black text-sm transition-all ${activeTab === tab.id
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-lg'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                  }`}
              >
                <tab.icon size={18} /> {tab.label}
              </button>
            ))}
          </div>

          {/* CONTENT: PORTFOLIO */}
          {activeTab === 'portfolio' && (
            <div className="space-y-6 animate-fade-in">
              {/* Stats Card */}
              <div className="p-8 bg-indigo-50 dark:bg-indigo-500/10 rounded-[2.5rem] border border-indigo-100 dark:border-indigo-500/20">
                <h4 className="font-black text-indigo-900 dark:text-indigo-200 uppercase text-xs tracking-widest mb-4">Jami Yuklama</h4>
                <div className="flex items-end gap-2">
                  <span className="text-5xl font-black text-indigo-600 dark:text-indigo-400 tabular-nums">{companies.length}</span>
                  <span className="text-lg font-bold text-indigo-400 mb-2">ta kompaniya biriktirilgan</span>
                </div>
                <div className="h-2 w-full bg-indigo-200 dark:bg-indigo-500/30 rounded-full mt-4 overflow-hidden">
                  <div className="h-full bg-indigo-500 w-3/4 rounded-full"></div>
                </div>
                <p className="mt-4 text-sm font-bold text-indigo-500">
                  Jami shartnoma summasi: {companies.reduce((acc, c) => acc + (c.contractAmount || 0), 0).toLocaleString()} UZS
                </p>
              </div>

              {/* Companies List */}
              <div className="bg-white dark:bg-apple-darkCard rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder overflow-hidden shadow-sm">
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-white/5 text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 border-b dark:border-apple-darkBorder">
                        <th className="px-6 py-6">{t.companyName}</th>
                        <th className="px-4 py-6 text-center border-l dark:border-apple-darkBorder">Status</th>
                        <th className="px-4 py-6 text-center border-l dark:border-apple-darkBorder">Oylik Statusi</th>
                        <th className="px-4 py-6 text-right border-l dark:border-apple-darkBorder"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-apple-border dark:divide-apple-darkBorder">
                      {companies.map(c => {
                        const op = operations.find(o => o.companyId === c.id);
                        return (
                          <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-all group">
                            <td className="px-6 py-4">
                              <div className="font-black text-slate-800 dark:text-white text-sm">{c.name}</div>
                              <div className="text-[10px] font-bold text-slate-400 mt-0.5">INN: {c.inn}</div>
                            </td>
                            <td className="px-4 py-4 text-center border-l dark:border-apple-darkBorder">
                              <StatusBadge status={op?.profitTaxStatus || '-'} />
                            </td>
                            <td className="px-4 py-4 text-center border-l dark:border-apple-darkBorder">
                              <span className="text-xs font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded-md">Hisoblangan</span>
                            </td>
                            <td className="px-4 py-4 text-right border-l dark:border-apple-darkBorder">
                              <button className="p-2 bg-slate-100 dark:bg-white/10 text-slate-400 hover:text-apple-accent rounded-lg transition-colors group-hover:scale-105">
                                <ExternalLink size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* CONTENT: FINANCE */}
          {activeTab === 'finance' && (
            <div className="space-y-6 animate-fade-in">
              {/* Live Balance Card */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-apple-darkCard dark:to-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden">
                <Wallet size={150} className="absolute -right-8 -top-8 opacity-10" />
                <p className="text-xs font-black uppercase tracking-widest text-white/50 mb-2">Joriy Balans ({t.month})</p>
                <h3 className="text-4xl md:text-5xl font-black tabular-nums tracking-tight">
                  {loadingSalary ? '...' : salarySummary?.totalSalary.toLocaleString() || '0'} <span className="text-lg text-white/50">UZS</span>
                </h3>
                <div className="mt-8 flex gap-8">
                  <div>
                    <p className="text-[10px] font-bold text-emerald-400 uppercase">Prognoz</p>
                    <p className="text-xl font-black">{loadingSalary ? '...' : (salarySummary?.baseSalary || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-rose-400 uppercase">Jarima</p>
                    <p className="text-xl font-black">{loadingSalary ? '...' : (salarySummary?.kpiPenalty || 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Transaction Log (Mock for now, can be real later) */}
              <div className="bg-white dark:bg-apple-darkCard p-8 rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder">
                <h4 className="font-bold text-slate-800 dark:text-white mb-6">Jarima va Mukofotlar Tarixi</h4>
                {loadingSalary ? (
                  <p className="text-center text-slate-400">Yuklanmoqda...</p>
                ) : (
                  <div className="space-y-4">
                    {salarySummary?.performanceDetails?.filter(p => p.calculatedScore !== 0).map(p => (
                      <div key={p.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-2xl">
                        <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-xl ${p.calculatedScore > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                            {p.calculatedScore > 0 ? <TrendingUp size={20} /> : <AlertCircle size={20} />}
                          </div>
                          <div>
                            <p className="font-bold text-sm text-slate-800 dark:text-white">{p.ruleNameUz || p.ruleName}</p>
                            <p className="text-[10px] font-black uppercase text-slate-400">{p.companyName}</p>
                          </div>
                        </div>
                        <span className={`font-black ${p.calculatedScore > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {p.calculatedScore > 0 ? '+' : ''}{p.calculatedScore}%
                        </span>
                      </div>
                    )) || <p className="text-center text-slate-400 py-4">Hozircha o'zgarishlar yo'q</p>}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CONTENT: DOCUMENTS */}
          {activeTab === 'docs' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-orange-500 p-8 rounded-[2.5rem] text-white shadow-xl shadow-orange-500/20 relative overflow-hidden">
                <ShieldCheck size={120} className="absolute -right-4 -top-4 opacity-20" />
                <h3 className="text-2xl font-black relative z-10">Digital HR</h3>
                <p className="text-white/80 font-medium relative z-10 max-w-sm mt-2">Barcha muhim hujjatlar xavfsiz saqlanadi. Faqat Admin va Xodim o'zi ko'ra oladi.</p>
              </div>

              <div className="bg-white dark:bg-apple-darkCard rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder overflow-hidden">
                {documents.map((doc, i) => (
                  <div key={doc.id} className={`p-6 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-white/5 transition-colors ${i !== documents.length - 1 ? 'border-b border-slate-100 dark:border-apple-darkBorder' : ''}`}>
                    <div className="flex items-center gap-4">
                      <div className="h-14 w-14 bg-slate-100 dark:bg-white/10 rounded-2xl flex items-center justify-center text-slate-500">
                        <doc.icon size={24} />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 dark:text-white">{doc.name}</h4>
                        <div className="flex gap-3 text-xs font-medium text-slate-400 mt-1">
                          <span className="uppercase font-black bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded">{doc.type}</span>
                          <span>{doc.size}</span>
                          <span>• {doc.date}</span>
                        </div>
                      </div>
                    </div>
                    <button className="p-3 bg-slate-50 dark:bg-white/5 text-slate-400 hover:text-apple-accent hover:bg-apple-accent/10 rounded-xl transition-all">
                      <Download size={20} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default StaffProfileDrawer;
