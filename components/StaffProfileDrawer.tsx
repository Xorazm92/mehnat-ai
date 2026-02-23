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
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] transition-opacity duration-700 animate-in fade-in" onClick={onClose}></div>
      <div className="fixed right-0 top-0 h-full w-full sm:max-w-4xl bg-white/90 dark:bg-slate-950/90 backdrop-blur-3xl shadow-[-20px_0_80px_rgba(0,0,0,0.3)] z-[101] overflow-y-auto animate-in slide-in-from-right duration-700 border-l border-white/10">

        {/* HEADER SECTION */}
        <div className="relative bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 text-white p-10 md:p-16 pb-28 md:pb-36 overflow-hidden border-b border-white/5">
          {/* Background decorative elements */}
          <div className="absolute -top-20 -right-20 w-80 h-80 bg-indigo-500/20 rounded-full blur-[100px] animate-pulse"></div>
          <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-blue-600/10 rounded-full blur-[100px]"></div>
          <div className="absolute top-0 right-0 p-16 opacity-[0.03] pointer-events-none rotate-12 scale-150">
            <Briefcase size={400} />
          </div>

          <div className="relative z-10 flex justify-between items-start">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-10">
              <div className="relative group">
                <div
                  className="h-32 w-32 md:h-40 md:w-40 rounded-[3.5rem] flex items-center justify-center text-5xl font-black shadow-2xl ring-1 ring-white/20 group-hover:scale-105 group-hover:rotate-3 transition-all duration-700 relative overflow-hidden"
                  style={{ backgroundColor: staff.avatarColor }}
                >
                  <div className="glass-reflection"></div>
                  <span className="relative z-10">{staff.name.charAt(0)}</span>
                </div>
                {/* Status Indicator */}
                <div className={`absolute -bottom-2 -right-2 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/20 shadow-glass-lg backdrop-blur-xl ${staff.status === 'sick' ? 'bg-amber-400 text-amber-950' :
                  staff.status === 'vacation' ? 'bg-rose-500 text-white' :
                    'bg-emerald-500 text-white'
                  }`}>
                  {staff.status === 'sick' ? 'Kasallik' : staff.status === 'vacation' ? "Ta'tilda" : 'Ishda'}
                </div>
              </div>

              <div className="text-center md:text-left pt-2">
                <div className="mb-2">
                  <h2 className="text-4xl md:text-6xl font-black tracking-tighter leading-tight premium-text-gradient drop-shadow-lg">{staff.name}</h2>
                </div>
                <p className="text-xl text-white/40 font-black uppercase tracking-[0.3em] mb-8">{staff.role}</p>

                <div className="flex flex-wrap items-center gap-4 justify-center md:justify-start">
                  {/* Rating */}
                  <div className="flex items-center gap-3 bg-white/5 px-6 py-3 rounded-2xl backdrop-blur-xl border border-white/10 shadow-glass-inset">
                    <Star className="text-amber-400 fill-amber-400" size={18} />
                    <span className="font-black text-lg">{staff.rating || 4.8}</span>
                  </div>

                  {/* Phone */}
                  {staff.phone && (
                    <div className="flex items-center gap-3 bg-white/5 px-6 py-3 rounded-2xl backdrop-blur-xl border border-white/10 shadow-glass-inset text-sm font-black tracking-widest text-white/70">
                      <Phone size={16} className="text-indigo-400" /> {staff.phone}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button onClick={onClose} className="p-4 bg-white/5 hover:bg-white/15 rounded-[1.8rem] text-white/50 hover:text-white transition-all backdrop-blur-md border border-white/10 group shadow-glass">
              <X size={28} className="group-hover:rotate-90 transition-transform duration-700" />
            </button>
          </div>
        </div>

        <div className="px-6 md:px-16 -mt-16 md:-mt-20 relative z-20 pb-24">
          {/* Tab Navigation */}
          <div className="liquid-glass-card rounded-[3rem] p-2 flex gap-3 mb-16 shadow-glass-lg border border-white/10 backdrop-blur-3xl bg-white/5 mx-auto max-w-2xl relative">
            <div className="glass-reflection"></div>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-5 rounded-[2.5rem] flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-[0.2em] transition-all duration-700 relative z-10 ${activeTab === tab.id
                  ? 'bg-slate-950 dark:bg-white text-white dark:text-slate-900 shadow-glass-lg scale-[1.02]'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-white/10'
                  }`}
              >
                <tab.icon size={18} className={activeTab === tab.id ? 'animate-pulse' : ''} />
                <span className="hidden md:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* CONTENT: PORTFOLIO */}
          {activeTab === 'portfolio' && (
            <div className="space-y-12 animate-fade-in relative">
              <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none"></div>

              {/* Stats Card */}
              <div className="p-8 md:p-12 bg-white/5 dark:bg-slate-900/40 rounded-[3rem] border border-white/10 relative overflow-hidden group shadow-glass-lg backdrop-blur-xl">
                <div className="glass-reflection"></div>
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:scale-110 group-hover:rotate-12 transition-transform duration-1000">
                  <TrendingUp size={120} />
                </div>

                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-10">
                  <div>
                    <h4 className="font-black text-indigo-500 uppercase text-[9px] tracking-[0.4em] mb-6">{(t as any).performanceMetrics}</h4>
                    <div className="flex items-end gap-3">
                      <span className="text-5xl font-black premium-text-gradient-indigo tabular-nums tracking-tighter leading-none">{salarySummary.companyCount}</span>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2">{(t as any).totalFirmsAssigned}</span>
                    </div>
                  </div>

                  <div className="flex-1 max-w-sm w-full space-y-4">
                    <div className="flex justify-between items-center px-2">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{(t as any).growthCapacity}</span>
                      <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">75% {(t as any).optimized}</span>
                    </div>
                    <div className="h-3 w-full bg-slate-100 dark:bg-white/5 rounded-full p-0.5 overflow-hidden shadow-glass-inset">
                      <div className="h-full bg-gradient-to-r from-indigo-500 via-blue-500 to-emerald-400 w-3/4 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.3)] relative">
                        <div className="absolute inset-0 bg-white/10 animate-shimmer"></div>
                      </div>
                    </div>
                  </div>

                  <div className="px-6 py-4 bg-white/10 dark:bg-white/5 rounded-2xl border border-white/10 shadow-glass-inset backdrop-blur-md">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{(t as any).totalContractVolume}</p>
                    <p className="text-xl font-black text-slate-800 dark:text-white tabular-nums">
                      {assignments?.reduce((acc, a) => {
                        const c = companies.find(comp => comp.id === a.clientId);
                        return acc + (c?.contractAmount || 0);
                      }, 0).toLocaleString()} <span className="text-[10px] opacity-40">UZS</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Portfolio Sections */}
              <div className="grid grid-cols-1 gap-10">
                {(() => {
                  // Resolve all assignments: from props + direct links in companies
                  const sNameLower = staff.name.trim().toLowerCase();
                  const directAssignments: ContractAssignment[] = companies
                    .filter(c =>
                      c.accountantId === staff.id ||
                      c.bankClientId === staff.id ||
                      c.supervisorId === staff.id ||
                      (!c.bankClientId && c.bankClientName && c.bankClientName.trim().toLowerCase() === sNameLower) ||
                      (!c.supervisorId && c.supervisorName && c.supervisorName.trim().toLowerCase() === sNameLower)
                    )
                    .map(c => ({
                      id: `direct-${c.id}`,
                      clientId: c.id,
                      userId: staff.id,
                      role: c.accountantId === staff.id ? 'accountant' :
                        (c.supervisorId === staff.id ? 'supervisor' :
                          (c.bankClientId === staff.id ? 'bank_manager' : 'other')),
                      salaryType: 'fixed',
                      salaryValue: 0,
                      status: 'active',
                      startDate: new Date().toISOString(),
                      period: new Date().toISOString().slice(0, 7)
                    } as unknown as ContractAssignment));

                  // Merge and de-duplicate by company ID
                  const allAssignments = [...(assignments || [])];
                  directAssignments.forEach(da => {
                    if (!allAssignments.find(a => a.clientId === da.clientId)) {
                      allAssignments.push(da);
                    }
                  });

                  if (allAssignments.length === 0) {
                    return <div className="py-24 flex flex-col items-center justify-center liquid-glass-card rounded-[3rem] border border-dashed border-white/20 text-slate-400/40">
                      <Briefcase size={48} className="mb-4 opacity-20" />
                      <p className="font-black uppercase tracking-[0.4em] text-[10px]">{(t as any).noAssignments}</p>
                    </div>;
                  }

                  const roleGroups = allAssignments.reduce((acc, a) => {
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
                        <div className="flex items-center gap-4 px-6">
                          <div className={`w-1.5 h-1.5 rounded-full ${iconColor.replace('text-', 'bg-')}`}></div>
                          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">{label}</h3>
                          <div className="h-px flex-1 bg-white/5"></div>
                          <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-[9px] font-black text-slate-500">{asgns.length}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {asgns.map(asgn => {
                            const c = companies.find(comp => comp.id === asgn.clientId);
                            if (!c) return null;
                            const op = operations.find(o => o.companyId === c.id);
                            return (
                              <div
                                key={asgn.id}
                                className="p-6 bg-white/40 dark:bg-white/5 rounded-[2.5rem] border border-white/10 hover:border-indigo-500/30 transition-all duration-500 group/card shadow-sm hover:shadow-glass relative overflow-hidden flex flex-col justify-between"
                              >
                                <div className="glass-reflection"></div>
                                <div className="flex justify-between items-start mb-6">
                                  <div className="min-w-0 pr-4">
                                    <div className="font-black text-slate-800 dark:text-white text-base truncate group-hover/card:text-indigo-500 transition-colors uppercase tracking-tight">{c.name}</div>
                                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1 opacity-60">STIR: {c.inn}</div>
                                  </div>
                                  <StatusBadge status={op?.profitTaxStatus || '-'} size="sm" />
                                </div>
                                <div className="flex items-center justify-between pt-4 border-t border-white/5">
                                  <div className="flex items-center gap-2">
                                    <Wallet size={12} className="text-slate-400" />
                                    <span className="text-[10px] font-black text-slate-500">
                                      {asgn.salaryValue}{asgn.salaryType === 'percent' ? '%' : " UZS"}
                                    </span>
                                  </div>
                                  <button className="p-2 rounded-xl bg-indigo-500/5 text-indigo-500 hover:bg-indigo-500 hover:text-white transition-all">
                                    <ExternalLink size={14} />
                                  </button>
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
            <div className="space-y-12 animate-fade-in">
              {/* Live Balance Card */}
              <div className="bg-white/5 dark:bg-slate-900/40 p-8 md:p-12 rounded-[3.5rem] text-slate-800 dark:text-white shadow-glass-lg relative overflow-hidden group border border-white/10 backdrop-blur-xl">
                <div className="glass-reflection"></div>
                <div className="absolute -right-20 -top-20 w-80 h-80 bg-emerald-500/5 rounded-full blur-[100px] animate-pulse"></div>
                <div className="absolute top-0 right-0 p-12 opacity-[0.02] group-hover:scale-110 group-hover:-rotate-12 transition-transform duration-1000">
                  <Wallet size={180} />
                </div>

                <div className="relative z-10">
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 dark:text-white/40 mb-6">{(t as any).currentFiscalBalance} ({t.month})</p>
                  <h3 className="text-5xl md:text-6xl font-black tabular-nums tracking-tighter mb-10 flex items-baseline gap-3">
                    {loadingSalary ? '...' : salarySummary?.totalSalary.toLocaleString() || '0'}
                    <span className="text-xl font-black text-slate-400 dark:text-white/20">UZS</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="bg-white/10 dark:bg-white/5 px-6 py-5 rounded-[2rem] border border-white/10 shadow-glass-inset backdrop-blur-md group/item">
                      <p className="text-[8px] font-black text-emerald-500 uppercase tracking-[0.3em] mb-2">{(t as any).baseCompensation}</p>
                      <p className="text-xl font-black group-hover:scale-105 transition-transform">{loadingSalary ? '...' : (salarySummary?.baseSalary || 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-white/10 dark:bg-white/5 px-6 py-5 rounded-[2rem] border border-white/10 shadow-glass-inset backdrop-blur-md group/item">
                      <p className="text-[8px] font-black text-rose-500 uppercase tracking-[0.3em] mb-2">{(t as any).deductions}</p>
                      <p className="text-xl font-black group-hover:scale-105 transition-transform">{loadingSalary ? '...' : (salarySummary?.kpiPenalty || 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-white/10 dark:bg-white/5 px-6 py-5 rounded-[2rem] border border-white/10 shadow-glass-inset backdrop-blur-md group/item">
                      <p className="text-[8px] font-black text-blue-500 uppercase tracking-[0.3em] mb-2">{(t as any).bonuses}</p>
                      <p className="text-xl font-black group-hover:scale-105 transition-transform">{loadingSalary ? '...' : (salarySummary?.kpiBonus || 0).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Transaction Log */}
              <div className="space-y-6">
                <div className="flex items-center justify-between px-6">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] flex items-center gap-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                    {(t as any).intelligenceBreakdown}
                  </h4>
                  <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-[9px] font-black text-slate-500 uppercase tracking-widest">{(t as any).monthlyAudit}</span>
                </div>

                {loadingSalary ? (
                  <div className="py-24 flex flex-col items-center justify-center liquid-glass-card rounded-[3rem] border border-white/10">
                    <div className="w-10 h-10 rounded-full border-4 border-slate-200 border-t-indigo-500 animate-spin mb-4"></div>
                    <p className="font-black uppercase tracking-[0.4em] text-[10px] text-slate-400">Loading...</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {salarySummary?.performanceDetails?.filter(p => p.calculatedScore !== 0).map(p => (
                      <div key={p.id} className="group flex items-center justify-between p-6 bg-white/40 dark:bg-white/5 rounded-[2.5rem] border border-white/10 hover:border-indigo-500/20 transition-all duration-500 shadow-sm relative overflow-hidden">
                        <div className="flex items-center gap-6 relative z-10">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${p.calculatedScore > 0 ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'}`}>
                            {p.calculatedScore > 0 ? <TrendingUp size={20} /> : <AlertCircle size={20} />}
                          </div>
                          <div>
                            <p className="font-black text-slate-800 dark:text-white text-sm uppercase mb-1">{p.ruleNameUz || p.ruleName}</p>
                            <p className="text-[9px] font-black uppercase text-slate-400 opacity-60 flex items-center gap-2">
                              <Building2 size={10} /> {p.companyName}
                            </p>
                          </div>
                        </div>
                        <div className="text-right relative z-10">
                          <span className={`text-2xl font-black tabular-nums tracking-tighter ${p.calculatedScore > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {p.calculatedScore > 0 ? '+' : ''}{p.calculatedScore.toFixed(1)}%
                          </span>
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">{(t as any).fiscalImpact}</p>
                        </div>
                      </div>
                    )) || (
                        <div className="py-24 text-center liquid-glass-card rounded-[3rem] border border-white/10 flex flex-col items-center">
                          <AlertCircle size={32} className="mb-4 opacity-10" />
                          <p className="font-black uppercase tracking-[0.4em] text-[10px] text-slate-400">{(t as any).noTelemetry}</p>
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
                <h3 className="text-3xl font-black relative z-10 tracking-tight">{(t as any).digitalHrVault}</h3>
                <p className="text-white/80 font-bold relative z-10 max-w-sm mt-4 leading-relaxed uppercase text-[10px] tracking-[0.2em]">{(t as any).hrVaultDesc}</p>
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
