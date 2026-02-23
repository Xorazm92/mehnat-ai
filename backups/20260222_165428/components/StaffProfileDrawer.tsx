import React, { useState, useEffect, useMemo } from 'react';
import { Staff, Company, OperationEntry, Language, EmployeeSalarySummary, ContractAssignment, MonthlyPerformance } from '../types';
import { translations } from '../lib/translations';
import StatusBadge from './StatusBadge';
import { fetchMonthlyPerformance } from '../lib/supabaseData';
import { calculateCompanySalaries } from '../lib/kpiLogic';
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
  assignments?: ContractAssignment[];
  operations: OperationEntry[];
  lang: Language;
  onClose: () => void;
}

const StaffProfileDrawer: React.FC<Props> = ({ staff, companies, assignments, operations, lang, onClose }) => {
  const t = translations[lang];
  const [activeTab, setActiveTab] = useState<'portfolio' | 'finance' | 'docs'>('portfolio');
  const [performances, setPerformances] = useState<MonthlyPerformance[]>([]);
  const [loadingSalary, setLoadingSalary] = useState(false);
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  const salarySummary = useMemo(() => {
    const checkMonth = currentMonth;
    let totalBase = 0;
    let totalKpiBonus = 0;
    let totalKpiPenalty = 0;

    const sNameLower = staff.name.trim().toLowerCase();

    const myCompanies = companies.filter(c =>
      c.accountantId === staff.id ||
      c.bankClientId === staff.id ||
      c.supervisorId === staff.id ||
      (!c.bankClientId && c.bankClientName && c.bankClientName.trim().toLowerCase() === sNameLower) ||
      (!c.supervisorId && c.supervisorName && c.supervisorName.trim().toLowerCase() === sNameLower)
    );

    myCompanies.forEach(c => {
      const op = operations.find(o => o.companyId === c.id && o.period === checkMonth);
      const results = calculateCompanySalaries(c, op, performances);

      results.filter(r =>
        r.staffId === staff.id ||
        (r.staffName && r.staffName.trim().toLowerCase() === sNameLower)
      ).forEach(res => {
        totalBase += res.baseAmount;
        if (res.finalAmount < res.baseAmount) {
          totalKpiPenalty += (res.baseAmount - res.finalAmount);
        } else if (res.finalAmount > res.baseAmount) {
          totalKpiBonus += (res.finalAmount - res.baseAmount);
        }
      });
    });

    return {
      employeeId: staff.id,
      employeeName: staff.name,
      employeeRole: staff.role,
      month: currentMonth,
      companyCount: myCompanies.length,
      baseSalary: totalBase,
      kpiBonus: totalKpiBonus,
      kpiPenalty: -totalKpiPenalty,
      adjustments: 0,
      totalSalary: totalBase - totalKpiPenalty + totalKpiBonus,
      performanceDetails: performances
    } as EmployeeSalarySummary;
  }, [staff.id, companies, operations, currentMonth, performances]);

  // Fetch performance data when tab changes to finance or initially
  useEffect(() => {
    const loadPerf = async () => {
      setLoadingSalary(true);
      try {
        const data = await fetchMonthlyPerformance(`${currentMonth}-01`, undefined, staff.id);
        setPerformances(data);
      } catch (e) {
        console.error(e);
      }
      setLoadingSalary(false);
    };

    if (activeTab === 'finance' && performances.length === 0) {
      loadPerf();
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
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[100] transition-opacity duration-500 animate-in fade-in" onClick={onClose}></div>
      <div className="fixed right-0 top-0 h-full w-full sm:max-w-4xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl shadow-[-20px_0_50px_rgba(0,0,0,0.2)] z-[101] overflow-y-auto animate-in slide-in-from-right duration-500 border-l border-white/20">

        {/* HEADER SECTION */}
        <div className="relative bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-10 md:p-16 pb-28 md:pb-36 overflow-hidden">
          {/* Background decorative elements */}
          <div className="absolute -top-20 -right-20 w-80 h-80 bg-indigo-500/20 rounded-full blur-[100px] animate-pulse"></div>
          <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-blue-500/10 rounded-full blur-[80px]"></div>
          <div className="absolute top-0 right-0 p-16 opacity-[0.03] pointer-events-none rotate-12 scale-150">
            <Briefcase size={400} />
          </div>

          <div className="relative z-10 flex justify-between items-start">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-10">
              <div className="relative group">
                <div className="h-32 w-32 md:h-40 md:w-40 rounded-[3rem] flex items-center justify-center text-5xl font-black shadow-glass-lg ring-1 ring-white/20 group-hover:scale-105 transition-transform duration-700" style={{ backgroundColor: staff.avatarColor }}>
                  {staff.name.charAt(0)}
                </div>
                {/* Status Indicator */}
                <div className={`absolute -bottom-2 -right-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/20 shadow-lg backdrop-blur-xl ${staff.status === 'sick' ? 'bg-amber-400 text-amber-900' :
                  staff.status === 'vacation' ? 'bg-rose-500 text-white' :
                    'bg-emerald-500 text-white'
                  }`}>
                  {staff.status === 'sick' ? 'Kasallik' : staff.status === 'vacation' ? "Ta'tilda" : 'Ishda'}
                </div>
              </div>

              <div className="text-center md:text-left pt-2">
                <h2 className="text-4xl md:text-6xl font-black tracking-tighter leading-tight mb-3 premium-text-gradient">{staff.name}</h2>
                <p className="text-xl text-white/50 font-black uppercase tracking-[0.2em] mb-6">{staff.role}</p>

                <div className="flex flex-wrap items-center gap-4 justify-center md:justify-start">
                  {/* Rating */}
                  <div className="flex items-center gap-3 bg-white/10 px-5 py-2.5 rounded-2xl backdrop-blur-xl border border-white/10 shadow-glass">
                    <Star className="text-amber-400 fill-amber-400" size={18} />
                    <span className="font-black text-lg">{staff.rating || 4.8}</span>
                  </div>

                  {/* Phone */}
                  {staff.phone && (
                    <div className="flex items-center gap-3 bg-white/10 px-5 py-2.5 rounded-2xl backdrop-blur-xl border border-white/10 shadow-glass text-sm font-black tracking-widest text-white/80">
                      <Phone size={16} className="text-indigo-400" /> {staff.phone}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button onClick={onClose} className="p-4 bg-white/5 hover:bg-white/15 rounded-[1.5rem] text-white/50 hover:text-white transition-all backdrop-blur-md border border-white/10 group">
              <X size={28} className="group-hover:rotate-90 transition-transform duration-500" />
            </button>
          </div>
        </div>

        <div className="px-6 md:px-16 -mt-16 md:-mt-20 relative z-20 pb-24">
          {/* Tab Navigation */}
          <div className="liquid-glass-card rounded-[2.5rem] p-2 flex gap-2 mb-12 shadow-glass-lg border border-white/20 backdrop-blur-3xl">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-5 rounded-[1.8rem] flex items-center justify-center gap-3 font-black text-[11px] uppercase tracking-widest transition-all duration-500 ${activeTab === tab.id
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-glass-lg scale-[1.02]'
                  : 'text-slate-400 hover:bg-white/50 dark:hover:bg-white/5'
                  }`}
              >
                <tab.icon size={20} /> {tab.label}
              </button>
            ))}
          </div>

          {/* CONTENT: PORTFOLIO */}
          {activeTab === 'portfolio' && (
            <div className="space-y-10 animate-fade-in">
              {/* Stats Card */}
              <div className="p-10 bg-gradient-to-br from-indigo-500/10 to-blue-500/5 dark:from-indigo-500/20 dark:to-transparent rounded-[3.5rem] border border-indigo-500/20 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-10 opacity-[0.05] group-hover:scale-110 group-hover:rotate-12 transition-transform duration-700">
                  <TrendingUp size={120} />
                </div>
                <h4 className="font-black text-indigo-900/40 dark:text-indigo-200/40 uppercase text-[10px] tracking-[0.3em] mb-6">Ish Yuklamasi</h4>
                <div className="flex items-end gap-3 mb-8">
                  <span className="text-7xl font-black text-indigo-600 dark:text-indigo-400 tabular-nums tracking-tighter">{companies.length}</span>
                  <span className="text-sm font-black text-indigo-400/60 uppercase tracking-widest mb-4">Biriktirilgan korxonalar</span>
                </div>
                <div className="h-4 w-full bg-slate-100 dark:bg-white/5 rounded-full p-1 overflow-hidden">
                  <div className="h-full bg-indigo-500 w-3/4 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.5)]"></div>
                </div>
                <div className="mt-10 flex flex-wrap gap-4">
                  <div className="px-6 py-4 bg-white/40 dark:bg-white/5 rounded-2xl border border-white/20">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 text-center">Jami Contract</p>
                    <p className="text-sm font-black text-slate-700 dark:text-white text-center">
                      {assignments?.reduce((acc, a) => {
                        const c = companies.find(comp => comp.id === a.clientId);
                        return acc + (c?.contractAmount || 0);
                      }, 0).toLocaleString()} <span className="text-[10px] opacity-40">UZS</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Portfolio Sections */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {(() => {
                  if (!assignments || assignments.length === 0) {
                    return <div className="col-span-2 py-20 flex flex-col items-center justify-center bg-white/40 dark:bg-white/5 rounded-[3.5rem] border border-white/20 text-slate-300">
                      <Briefcase size={48} className="mb-4 opacity-20" />
                      <p className="font-black uppercase tracking-[0.3em] text-[10px] opacity-40">Hech qanday biriktirilgan firma topilmadi</p>
                    </div>;
                  }

                  const roleGroups = assignments.reduce((acc, a) => {
                    const role = a.role || 'other';
                    if (!acc[role]) acc[role] = [];
                    acc[role].push(a);
                    return acc;
                  }, {} as Record<string, ContractAssignment[]>);

                  return Object.entries(roleGroups).map(([role, asgns]: [string, ContractAssignment[]]) => {
                    const label = role === 'accountant' ? 'Buxgalteriya' :
                      role === 'supervisor' ? 'Nazorat' :
                        role === 'bank_manager' ? 'Bank Klient' : role.replace('_', ' ').toUpperCase();
                    const iconColor = role === 'accountant' ? 'text-indigo-500' :
                      role === 'supervisor' ? 'text-amber-500' : 'text-emerald-500';

                    return (
                      <div key={role} className="space-y-6">
                        <div className="flex items-center justify-between px-6">
                          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">{label}</h3>
                          <span className="px-3 py-1 bg-slate-100 dark:bg-white/10 rounded-lg text-[9px] font-black text-slate-400">{asgns.length}</span>
                        </div>
                        <div className="liquid-glass-card rounded-[3rem] shadow-glass border border-white/10 overflow-hidden divide-y divide-white/10">
                          {asgns.map(asgn => {
                            const c = companies.find(comp => comp.id === asgn.clientId);
                            if (!c) return null;
                            const op = operations.find(o => o.companyId === c.id);
                            return (
                              <div key={asgn.id} className="p-6 flex items-center justify-between hover:bg-white transition-all group/row">
                                <div className="min-w-0 flex-1 pr-6">
                                  <div className="font-black text-slate-800 dark:text-white text-base truncate group-hover/row:text-indigo-600 transition-colors uppercase tracking-tight">{c.name}</div>
                                  <div className="flex items-center gap-2 mt-2">
                                    <span className="text-[10px] font-black text-slate-400 font-mono tracking-tighter opacity-60">INN: {c.inn}</span>
                                    <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                                    <span className={`text-[10px] font-black ${iconColor}`}>{asgn.salaryValue}{asgn.salaryType === 'percent' ? '%' : ""}</span>
                                  </div>
                                </div>
                                <div className="transform group-hover/row:scale-110 transition-transform">
                                  <StatusBadge status={op?.profitTaxStatus || '-'} size="sm" />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* CONTENT: FINANCE */}
          {activeTab === 'finance' && (
            <div className="space-y-10 animate-fade-in">
              {/* Live Balance Card */}
              <div className="bg-gradient-to-br from-slate-900 to-indigo-950 p-12 rounded-[3.5rem] text-white shadow-glass-lg relative overflow-hidden group">
                <div className="absolute -right-20 -top-20 w-80 h-80 bg-emerald-500/10 rounded-full blur-[100px]"></div>
                <div className="absolute top-0 right-0 p-12 opacity-[0.05] group-hover:scale-110 group-hover:-rotate-12 transition-transform duration-700">
                  <Wallet size={200} />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 mb-4">Joriy Balans ({t.month})</p>
                <h3 className="text-6xl md:text-7xl font-black tabular-nums tracking-tighter mb-10">
                  {loadingSalary ? '...' : salarySummary?.totalSalary.toLocaleString() || '0'} <span className="text-2xl font-black opacity-30">UZS</span>
                </h3>
                <div className="flex flex-wrap gap-8">
                  <div className="bg-white/10 px-8 py-5 rounded-3xl border border-white/10 backdrop-blur-md">
                    <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-2">Asosiy Oylik</p>
                    <p className="text-2xl font-black">{loadingSalary ? '...' : (salarySummary?.baseSalary || 0).toLocaleString()}</p>
                  </div>
                  <div className="bg-white/10 px-8 py-5 rounded-3xl border border-white/10 backdrop-blur-md">
                    <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-2">Jarimalar</p>
                    <p className="text-2xl font-black">{loadingSalary ? '...' : (salarySummary?.kpiPenalty || 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Transaction Log */}
              <div className="liquid-glass-card p-12 rounded-[3.5rem] shadow-glass border border-white/10">
                <div className="flex items-center justify-between mb-10">
                  <h4 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center border border-indigo-500/20">
                      <TrendingUp size={24} />
                    </div>
                    KPI va Jarimalar
                  </h4>
                </div>
                {loadingSalary ? (
                  <div className="py-20 flex flex-col items-center justify-center opacity-40">
                    <div className="w-10 h-10 rounded-full border-4 border-slate-200 border-t-indigo-500 animate-spin mb-4"></div>
                    <p className="font-black uppercase tracking-widest text-xs">Yuklanmoqda...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {salarySummary?.performanceDetails?.filter(p => p.calculatedScore !== 0).map(p => (
                      <div key={p.id} className="group flex items-center justify-between p-8 bg-white/40 dark:bg-white/5 rounded-[2.5rem] border border-white/20 hover:bg-white/60 transition-all duration-300">
                        <div className="flex items-center gap-6">
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-glass border transition-transform group-hover:scale-110 ${p.calculatedScore > 0 ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'}`}>
                            {p.calculatedScore > 0 ? <TrendingUp size={24} /> : <AlertCircle size={24} />}
                          </div>
                          <div>
                            <p className="font-black text-slate-800 dark:text-white text-lg leading-tight mb-1">{p.ruleNameUz || p.ruleName}</p>
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">{p.companyName}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`text-2xl font-black tabular-nums ${p.calculatedScore > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {p.calculatedScore > 0 ? '+' : ''}{p.calculatedScore.toFixed(0)}%
                          </span>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Oylikka ta'sir</p>
                        </div>
                      </div>
                    )) || (
                        <div className="py-20 text-center opacity-30">
                          <p className="font-black uppercase tracking-[0.3em] text-sm">Hozircha o'zgarishlar yo'q</p>
                        </div>
                      )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CONTENT: DOCUMENTS */}
          {activeTab === 'docs' && (
            <div className="space-y-8 animate-fade-in">
              <div className="bg-gradient-to-r from-orange-500 to-rose-600 p-12 rounded-[3.5rem] text-white shadow-glass-lg relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-12 opacity-[0.1] group-hover:scale-110 group-hover:rotate-6 transition-transform duration-700">
                  <ShieldCheck size={180} />
                </div>
                <h3 className="text-3xl font-black relative z-10 tracking-tight">Digital HR Vault</h3>
                <p className="text-white/80 font-bold relative z-10 max-w-sm mt-4 leading-relaxed uppercase text-[10px] tracking-[0.2em]">Barcha muhim hujjatlar xavfsiz saqlanadi. Faqat Admin va Xodim o'zi ko'ra oladi.</p>
              </div>

              <div className="liquid-glass-card rounded-[3rem] shadow-glass border border-white/10 overflow-hidden divide-y divide-white/10">
                {documents.map((doc, i) => (
                  <div key={doc.id} className="p-8 flex items-center justify-between hover:bg-white transition-all group/doc">
                    <div className="flex items-center gap-6">
                      <div className="h-16 w-16 bg-slate-100 dark:bg-white/5 rounded-2xl flex items-center justify-center text-slate-400 shadow-inner group-hover/doc:bg-indigo-500 group-hover/doc:text-white transition-all duration-500">
                        <doc.icon size={28} />
                      </div>
                      <div>
                        <h4 className="font-black text-slate-800 dark:text-white text-lg group-hover/doc:text-indigo-600 transition-colors">{doc.name}</h4>
                        <div className="flex flex-wrap gap-4 text-[10px] font-black uppercase tracking-widest text-slate-400 mt-2 opacity-60">
                          <span className="bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded-lg text-slate-500">{doc.type}</span>
                          <span>{doc.size}</span>
                          <span>• {doc.date}</span>
                        </div>
                      </div>
                    </div>
                    <button className="p-4 bg-slate-100 dark:bg-white/5 text-slate-400 hover:bg-emerald-500 hover:text-white rounded-[1.5rem] transition-all transform hover:scale-110 shadow-glass border border-white/10">
                      <Download size={22} />
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
