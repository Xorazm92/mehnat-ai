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
      <div className="fixed inset-0 bg-black/40 z-[100]" onClick={onClose}></div>
      <div className="fixed right-0 top-0 h-full w-full sm:max-w-[750px] bg-[#F8F9FA] dark:bg-[#111318] z-[101] overflow-y-auto animate-in slide-in-from-right duration-300 border-l border-[#DEE2E6] dark:border-[#3A3D44] flex flex-col shadow-xl">

        {/* HEADER SECTION */}
        <div className="bg-white dark:bg-[#1A1D23] border-b-2 border-b-[#3366CC] p-6 flex flex-col gap-6 shrink-0 z-10 transition-colors shadow-sm">
          <div className="flex justify-between items-start">
            <div className="flex gap-6 items-start">
              <div
                className="w-20 h-20 rounded-sm border-2 border-[#DEE2E6] dark:border-[#3A3D44] flex items-center justify-center text-3xl font-black shrink-0 relative transition-all shadow-inner bg-[#FAFBFC] dark:bg-[#111318]"
                style={{ color: staff.avatarColor }}
              >
                <span className="opacity-90">{staff.name.charAt(0)}</span>
                <div className={`absolute -bottom-2 -right-2 px-2 py-0.5 rounded-sm text-[9px] font-black uppercase border-2 shadow-sm ${staff.status === 'sick' ? 'bg-amber-400 text-white border-white dark:border-[#1A1D23]' :
                  staff.status === 'vacation' ? 'bg-rose-500 text-white border-white dark:border-[#1A1D23]' :
                    'bg-emerald-500 text-white border-white dark:border-[#1A1D23]'
                  }`}>
                  {staff.status === 'sick' ? 'Kasallik' : staff.status === 'vacation' ? "Ta'tilda" : 'Ishda'}
                </div>
              </div>

              <div className="pt-1">
                <h2 className="text-xl font-black text-gray-800 dark:text-white mb-1.5 uppercase tracking-tight leading-none">{staff.name}</h2>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-[#EBF3FF] dark:bg-[#1C2531] text-[#3366CC] border border-[#DEE2E6] dark:border-[#3A3D44] px-2 py-0.5 rounded-sm font-black uppercase tracking-widest">{staff.role}</span>
                  <span className="text-[9px] text-gray-400 font-black uppercase tracking-[0.2em] bg-[#F8F9FA] dark:bg-[#111318] px-2 py-0.5 border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm">ID: {staff.id.slice(0, 8)}</span>
                </div>

                <div className="flex items-center gap-3 mt-4">
                  <div className="flex items-center gap-2 bg-[#F8F9FA] dark:bg-[#111318] px-3 py-1.5 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] text-[10px] font-black text-gray-700 dark:text-gray-300 uppercase shadow-sm">
                    <Star className="text-[#FFC107] fill-[#FFC107]" size={12} />
                    <span>Reyting: {staff.rating || 4.8}</span>
                  </div>
                  {staff.phone && (
                    <div className="flex items-center gap-2 bg-[#F8F9FA] dark:bg-[#111318] px-3 py-1.5 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] text-[10px] font-black text-gray-700 dark:text-gray-300 uppercase shadow-sm">
                      <Phone size={12} className="text-[#3366CC]" /> 
                      <span className="font-black tabular-nums">{staff.phone}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-[#F8F9FA] dark:bg-[#111318] hover:bg-rose-50 dark:hover:bg-rose-900/10 hover:text-rose-500 rounded-sm text-gray-400 Transition-all border border-[#DEE2E6] dark:border-[#3A3D44] shadow-sm">
              <X size={20} />
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-2">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-3 px-4 flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-[0.15em] transition-all rounded-sm border-2 ${activeTab === tab.id
                  ? 'bg-[#3366CC] text-white border-[#3366CC] shadow-md'
                  : 'bg-[#F8F9FA] dark:bg-[#111318] border-[#DEE2E6] dark:border-[#3A3D44] text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:border-gray-400'
                  }`}
              >
                <tab.icon size={14} />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">

          {/* CONTENT: PORTFOLIO */}
          {activeTab === 'portfolio' && (
            <div className="space-y-6 animate-fade-in pb-10">
              {/* Stats Card */}
              <div className="bg-white dark:bg-[#1A1D23] p-6 rounded-sm border-2 border-[#DEE2E6] dark:border-[#3A3D44] shadow-sm flex flex-col sm:flex-row gap-6 justify-between items-start sm:items-center">
                <div className="flex flex-col">
                  <h4 className="font-black text-gray-400 uppercase text-[10px] mb-2 tracking-widest leading-none">{(t as any).performanceMetrics}</h4>
                  <div className="flex items-baseline gap-3 text-3xl font-black text-gray-800 dark:text-white tabular-nums leading-none">
                    {salarySummary.companyCount} <span className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em]">{(t as any).totalFirmsAssigned}</span>
                  </div>
                </div>

                <div className="bg-[#FAFBFC] dark:bg-[#111318] px-5 py-3 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] w-full sm:w-auto shadow-inner border-l-4 border-l-[#3366CC]">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 leading-none">{(t as any).totalContractVolume}</p>
                  <p className="text-lg font-black text-gray-800 dark:text-white tabular-nums leading-none">
                    {assignments?.reduce((acc, a) => {
                      const c = companies.find(comp => comp.id === a.clientId);
                      return acc + (c?.contractAmount || 0);
                    }, 0).toLocaleString()} <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">UZS</span>
                  </p>
                </div>
              </div>

              {/* Portfolio Sections */}
              <div className="space-y-6">
                {(() => {
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

                  const allAssignments = [...(assignments || [])];
                  directAssignments.forEach(da => {
                    if (!allAssignments.find(a => a.clientId === da.clientId)) {
                      allAssignments.push(da);
                    }
                  });

                  if (allAssignments.length === 0) {
                    return <div className="py-16 flex flex-col items-center justify-center bg-white dark:bg-[#1A1D23] border-2 border-[#DEE2E6] dark:border-[#3A3D44] border-dashed rounded-sm text-gray-300">
                      <Briefcase size={36} className="mb-4 opacity-20" />
                      <p className="font-black uppercase text-[10px] tracking-[0.3em] opacity-50">{(t as any).noAssignments}</p>
                    </div>;
                  }

                  const roleGroups = allAssignments.reduce((acc, a) => {
                    const role = a.role || 'other';
                    if (!acc[role]) acc[role] = [];
                    acc[role].push(a);
                    return acc;
                  }, {} as Record<string, ContractAssignment[]>);

                  return Object.entries(roleGroups).map(([role, asgns]: [string, ContractAssignment[]]) => {
                    const label = role === 'accountant' ? 'BUXGALTERIYA' :
                      role === 'supervisor' ? 'NAZORAT' :
                        role === 'bank_manager' ? 'BANK KLIENT' : role.replace('_', ' ').toUpperCase();

                    const iconColor = role === 'accountant' ? 'bg-[#3366CC]' :
                      role === 'supervisor' ? 'bg-[#FFC107]' : 'bg-emerald-500';

                    return (
                      <div key={role} className="bg-white dark:bg-[#1A1D23] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm shadow-sm overflow-hidden flex flex-col transition-colors border-t-4 border-t-gray-300">
                        <div className="bg-[#FAFBFC] dark:bg-[#111318] px-4 py-3 flex items-center justify-between border-b border-[#DEE2E6] dark:border-[#3A3D44]">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-4 rounded-sm ${iconColor}`}></div>
                            <h3 className="text-[11px] font-black text-gray-800 dark:text-white uppercase tracking-widest">{label}</h3>
                          </div>
                          <span className="px-3 py-1 bg-white dark:bg-black/20 border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm text-[9px] font-black text-[#3366CC] uppercase">{asgns.length} TA</span>
                        </div>
                        <div className="divide-y divide-[#F0F2F5] dark:divide-[#1e2025]">
                          {asgns.map(asgn => {
                            const c = companies.find(comp => comp.id === asgn.clientId);
                            if (!c) return null;
                            const op = operations.find(o => o.companyId === c.id);
                            return (
                              <div key={asgn.id} className="p-4 flex items-center justify-between hover:bg-[#F2F7FF] dark:hover:bg-[#1C2531] transition-colors group">
                                <div className="flex-1 min-w-0 pr-4">
                                  <div className="font-black text-gray-800 dark:text-white text-[12px] uppercase truncate tracking-tight group-hover:text-[#3366CC] transition-colors">{c.name}</div>
                                  <div className="text-[9px] font-black text-gray-400 uppercase mt-1 tracking-widest">STIR: {c.inn}</div>
                                </div>
                                <div className="flex items-center gap-4 shrink-0">
                                  <StatusBadge status={op?.profitTaxStatus || '-'} size="sm" />
                                  <div className="px-3 py-1 bg-[#F8F9FA] dark:bg-[#111318] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm text-[10px] font-black text-gray-600 dark:text-gray-400 tabular-nums uppercase tracking-widest shadow-inner">
                                    {asgn.salaryValue}{asgn.salaryType === 'percent' ? '%' : ""}
                                  </div>
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
            <div className="space-y-6 animate-fade-in pb-10">
              {/* Live Balance Card */}
              <div className="bg-white dark:bg-[#1A1D23] p-6 rounded-sm border-2 border-[#DEE2E6] dark:border-[#3A3D44] shadow-md flex flex-col transition-colors border-t-4 border-t-[#3366CC]">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">{(t as any).currentFiscalBalance} ({t.month.toUpperCase()})</p>
                <div className="text-4xl font-black text-gray-800 dark:text-white mb-6 tabular-nums pb-4 border-b border-[#F0F2F5] dark:border-[#1e2025] leading-none flex items-baseline gap-3">
                  {loadingSalary ? '...' : salarySummary?.totalSalary.toLocaleString() || '0'} <span className="text-[12px] text-gray-400 uppercase tracking-widest font-black">UZS</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-emerald-50 dark:bg-emerald-900/10 px-4 py-3 rounded-sm border border-emerald-100 dark:border-emerald-900/30 transition-colors">
                    <p className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1.5 leading-none">{(t as any).baseCompensation}</p>
                    <p className="text-lg font-black text-gray-800 dark:text-white tabular-nums leading-none">{loadingSalary ? '...' : (salarySummary?.baseSalary || 0).toLocaleString()}</p>
                  </div>
                  <div className="bg-rose-50 dark:bg-rose-900/10 px-4 py-3 rounded-sm border border-rose-100 dark:border-rose-900/30 transition-colors">
                    <p className="text-[9px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest mb-1.5 leading-none">{(t as any).deductions}</p>
                    <p className="text-lg font-black text-gray-800 dark:text-white tabular-nums leading-none">{loadingSalary ? '...' : (salarySummary?.kpiPenalty || 0).toLocaleString()}</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/10 px-4 py-3 rounded-sm border border-blue-100 dark:border-blue-900/30 transition-colors">
                    <p className="text-[9px] font-black text-[#3366CC] dark:text-[#5085EE] uppercase tracking-widest mb-1.5 leading-none">{(t as any).bonuses}</p>
                    <p className="text-lg font-black text-gray-800 dark:text-white tabular-nums leading-none">{loadingSalary ? '...' : (salarySummary?.kpiBonus || 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Transaction Log */}
              <div className="bg-white dark:bg-[#1A1D23] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm shadow-sm overflow-hidden flex flex-col transition-colors">
                <div className="bg-[#FAFBFC] dark:bg-[#111318] px-4 py-3 flex items-center justify-between border-b border-[#DEE2E6] dark:border-[#3A3D44]">
                  <h4 className="text-[11px] font-black text-gray-800 dark:text-white uppercase tracking-widest">{(t as any).intelligenceBreakdown}</h4>
                  <span className="px-3 py-1 bg-white dark:bg-black/20 border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm text-[9px] font-black text-gray-400 uppercase tracking-widest">{(t as any).monthlyAudit}</span>
                </div>

                {loadingSalary ? (
                  <div className="py-20 flex flex-col items-center justify-center">
                    <div className="w-8 h-8 border-3 border-[#3366CC] border-t-transparent rounded-sm animate-spin mb-4"></div>
                    <p className="font-black uppercase text-[10px] tracking-[0.2em] text-gray-400">Loading Data...</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#F0F2F5] dark:divide-[#1e2025]">
                    {salarySummary?.performanceDetails?.filter(p => p.calculatedScore !== 0).map(p => (
                      <div key={p.id} className="p-4 flex items-center justify-between hover:bg-[#F2F7FF] dark:hover:bg-[#1C2531] transition-colors group">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-sm shrink-0 flex items-center justify-center border transition-all ${p.calculatedScore > 0 
                            ? 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 border-emerald-100 dark:border-emerald-900/30' 
                            : 'bg-rose-50 dark:bg-rose-900/10 text-rose-600 border-rose-100 dark:border-rose-900/30'}`}>
                            {p.calculatedScore > 0 ? <TrendingUp size={18} /> : <AlertCircle size={18} />}
                          </div>
                          <div>
                            <p className="font-black text-gray-800 dark:text-white text-[12px] uppercase tracking-tight group-hover:text-[#3366CC] transition-colors">{p.ruleNameUz || p.ruleName}</p>
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">
                              {p.companyName}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`text-[14px] font-black tabular-nums tracking-tighter ${p.calculatedScore > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {p.calculatedScore > 0 ? '+' : ''}{p.calculatedScore.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    )) || (
                        <div className="py-20 text-center flex flex-col items-center">
                          <AlertCircle size={40} className="mb-4 text-gray-200 dark:text-gray-800 opacity-50" />
                          <p className="font-black uppercase tracking-[0.3em] text-[10px] text-gray-400">{(t as any).noTelemetry}</p>
                        </div>
                      )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CONTENT: DOCUMENTS */}
          {activeTab === 'docs' && (
            <div className="space-y-6 animate-fade-in pb-10">
              <div className="bg-white dark:bg-[#1A1D23] p-6 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] shadow-sm flex items-center justify-between transition-colors border-l-4 border-l-[#3366CC]">
                <div>
                    <h3 className="text-base font-black text-gray-800 dark:text-white uppercase tracking-tight">{(t as any).digitalHrVault}</h3>
                    <p className="text-[10px] font-black text-gray-400 mt-1.5 uppercase tracking-widest leading-relaxed">{(t as any).hrVaultDesc}</p>
                </div>
                <div className="w-14 h-14 rounded-sm bg-[#FAFBFC] dark:bg-[#111318] flex items-center justify-center text-[#3366CC] border border-[#DEE2E6] dark:border-[#3A3D44] shadow-inner">
                    <ShieldCheck size={28} />
                </div>
              </div>

              <div className="bg-white dark:bg-[#1A1D23] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm shadow-sm overflow-hidden divide-y divide-[#F0F2F5] dark:divide-[#1e2025] transition-colors">
                {documents.map((doc, i) => (
                  <div key={doc.id} className="p-4 flex items-center justify-between hover:bg-[#F2F7FF] dark:hover:bg-[#1C2531] transition-colors group">
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 bg-[#FAFBFC] dark:bg-[#111318] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm flex items-center justify-center text-gray-400 shadow-inner group-hover:text-[#3366CC] transition-colors">
                        <doc.icon size={22} />
                      </div>
                      <div>
                        <h4 className="font-black text-gray-800 dark:text-white text-[12px] tracking-tight uppercase group-hover:text-[#3366CC] transition-colors">{doc.name}</h4>
                        <div className="flex gap-3 text-[9px] font-black text-gray-400 uppercase mt-1.5 tracking-widest items-center">
                          <span className="bg-[#F0F2F5] dark:bg-[#111318] px-2 py-0.5 rounded-sm text-gray-600 dark:text-gray-300 border border-[#DEE2E6] dark:border-[#3A3D44]">{doc.type}</span>
                          <span className="flex items-center gap-1"><FolderOpen size={10} /> {doc.size}</span>
                          <span>• {doc.date}</span>
                        </div>
                      </div>
                    </div>
                    <button className="w-10 h-10 flex items-center justify-center bg-[#F8F9FA] dark:bg-[#111318] border border-[#DEE2E6] dark:border-[#3A3D44] text-gray-400 hover:text-[#3366CC] hover:border-[#3366CC] rounded-sm transition-all shadow-sm active:scale-95">
                      <Download size={18} />
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
