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
      <div className="fixed inset-0 bg-slate-900/60 z-[100] transition-opacity duration-300 animate-in fade-in" onClick={onClose}></div>
      <div className="fixed right-0 top-0 h-full w-full sm:max-w-[700px] bg-gray-50 dark:bg-[#1A1D23] z-[101] overflow-y-auto animate-in slide-in-from-right duration-300 border-l border-gray-200 dark:border-gray-700 flex flex-col">

        {/* HEADER SECTION */}
        <div className="bg-white dark:bg-[#22252B] border-b border-gray-200 dark:border-gray-700 p-6 flex flex-col gap-6 shrink-0 z-10">
          <div className="flex justify-between items-start">
            <div className="flex gap-4 items-start">
              <div
                className="w-16 h-16 rounded border border-gray-200 dark:border-gray-700 flex items-center justify-center text-xl font-bold shrink-0 relative"
                style={{ backgroundColor: `${staff.avatarColor}20`, color: staff.avatarColor }}
              >
                <span>{staff.name.charAt(0)}</span>
                <div className={`absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border ${staff.status === 'sick' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                  staff.status === 'vacation' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                    'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                  {staff.status === 'sick' ? 'Kasallik' : staff.status === 'vacation' ? "Ta'tilda" : 'Ishda'}
                </div>
              </div>

              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1 uppercase leading-tight">{staff.name}</h2>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{staff.role}</p>

                <div className="flex items-center gap-3 mt-3">
                  <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-[#1e2025] px-2 py-1 rounded border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-700 dark:text-gray-300">
                    <Star className="text-amber-500 fill-amber-500" size={12} />
                    <span>{staff.rating || 4.8}</span>
                  </div>
                  {staff.phone && (
                    <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-[#1e2025] px-2 py-1 rounded border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-700 dark:text-gray-300">
                      <Phone size={12} className="text-indigo-500" /> 
                      <span className="font-mono">{staff.phone}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button onClick={onClose} className="p-2 bg-gray-100 dark:bg-[#1e2025] hover:bg-gray-200 dark:hover:bg-gray-800 rounded text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors border border-gray-200 dark:border-gray-700">
              <X size={18} />
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-2 border-b-2 border-gray-200 dark:border-gray-700">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-2 px-4 flex items-center justify-center gap-2 font-bold text-[10px] uppercase tracking-widest transition-colors mb-[-2px] border-b-2 ${activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'
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
            <div className="space-y-6">
              {/* Stats Card */}
              <div className="bg-white dark:bg-[#22252B] p-6 rounded border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col sm:flex-row gap-6 justify-between items-start sm:items-center">
                <div>
                  <h4 className="font-bold text-gray-500 uppercase text-[10px] mb-2">{(t as any).performanceMetrics}</h4>
                  <div className="flex items-baseline gap-2 text-3xl font-bold text-gray-900 dark:text-white tabular-nums">
                    {salarySummary.companyCount} <span className="text-[10px] text-gray-400 uppercase">{(t as any).totalFirmsAssigned}</span>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-[#1e2025] px-4 py-3 rounded border border-gray-200 dark:border-gray-700 w-full sm:w-auto">
                  <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">{(t as any).totalContractVolume}</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">
                    {assignments?.reduce((acc, a) => {
                      const c = companies.find(comp => comp.id === a.clientId);
                      return acc + (c?.contractAmount || 0);
                    }, 0).toLocaleString()} <span className="text-xs uppercase text-gray-400">UZS</span>
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
                    return <div className="py-12 flex flex-col items-center justify-center bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 border-dashed rounded text-gray-400">
                      <Briefcase size={32} className="mb-2" />
                      <p className="font-bold uppercase text-[10px]">{(t as any).noAssignments}</p>
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

                    const iconColor = role === 'accountant' ? 'bg-indigo-600' :
                      role === 'supervisor' ? 'bg-amber-500' : 'bg-emerald-600';

                    return (
                      <div key={role} className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 rounded shadow-sm overflow-hidden">
                        <div className="bg-gray-50 dark:bg-[#1e2025] px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${iconColor}`}></div>
                            <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-widest">{label}</h3>
                          </div>
                          <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[9px] font-bold text-gray-600 dark:text-gray-300">{asgns.length}</span>
                        </div>
                        <div className="divide-y divide-gray-200 dark:divide-gray-700">
                          {asgns.map(asgn => {
                            const c = companies.find(comp => comp.id === asgn.clientId);
                            if (!c) return null;
                            const op = operations.find(o => o.companyId === c.id);
                            return (
                              <div key={asgn.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-[#1e2025] transition-colors">
                                <div className="flex-1 min-w-0 pr-4">
                                  <div className="font-bold text-gray-900 dark:text-white text-sm uppercase truncate">{c.name}</div>
                                  <div className="text-[10px] font-mono text-gray-500 uppercase mt-0.5">STIR: {c.inn}</div>
                                </div>
                                <div className="flex items-center gap-4 shrink-0">
                                  <StatusBadge status={op?.profitTaxStatus || '-'} size="sm" />
                                  <div className="px-2 py-1 bg-gray-100 dark:bg-[#1e2025] border border-gray-200 dark:border-gray-700 rounded text-[10px] font-bold text-gray-600 dark:text-gray-300 tabular-nums">
                                    {asgn.salaryValue}{asgn.salaryType === 'percent' ? '%' : " UZS"}
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
            <div className="space-y-6 animate-fade-in">
              {/* Live Balance Card */}
              <div className="bg-white dark:bg-[#22252B] p-6 rounded border border-gray-200 dark:border-gray-700 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">{(t as any).currentFiscalBalance} ({t.month})</p>
                <div className="text-4xl font-bold text-gray-900 dark:text-white mb-6 tabular-nums">
                  {loadingSalary ? '...' : salarySummary?.totalSalary.toLocaleString() || '0'} <span className="text-sm text-gray-400 uppercase">UZS</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-gray-50 dark:bg-[#1e2025] px-4 py-3 rounded border border-gray-200 dark:border-gray-700">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase mb-1">{(t as any).baseCompensation}</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{loadingSalary ? '...' : (salarySummary?.baseSalary || 0).toLocaleString()}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-[#1e2025] px-4 py-3 rounded border border-gray-200 dark:border-gray-700">
                    <p className="text-[10px] font-bold text-rose-600 uppercase mb-1">{(t as any).deductions}</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{loadingSalary ? '...' : (salarySummary?.kpiPenalty || 0).toLocaleString()}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-[#1e2025] px-4 py-3 rounded border border-gray-200 dark:border-gray-700">
                    <p className="text-[10px] font-bold text-blue-600 uppercase mb-1">{(t as any).bonuses}</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{loadingSalary ? '...' : (salarySummary?.kpiBonus || 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Transaction Log */}
              <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 rounded shadow-sm overflow-hidden">
                <div className="bg-gray-50 dark:bg-[#1e2025] px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
                  <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase">{(t as any).intelligenceBreakdown}</h4>
                  <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[9px] font-bold text-gray-600 dark:text-gray-300 uppercase">{(t as any).monthlyAudit}</span>
                </div>

                {loadingSalary ? (
                  <div className="py-12 flex flex-col items-center justify-center">
                    <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mb-2"></div>
                    <p className="font-bold uppercase text-[10px] text-gray-400">Loading...</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {salarySummary?.performanceDetails?.filter(p => p.calculatedScore !== 0).map(p => (
                      <div key={p.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-[#1e2025] transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded shrink-0 flex items-center justify-center border ${p.calculatedScore > 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 border-emerald-100 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 border-rose-100 dark:border-rose-800'}`}>
                            {p.calculatedScore > 0 ? <TrendingUp size={16} /> : <AlertCircle size={16} />}
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 dark:text-white text-xs uppercase">{p.ruleNameUz || p.ruleName}</p>
                            <p className="text-[10px] font-mono text-gray-500 mt-0.5">
                              {p.companyName}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`text-sm font-bold tabular-nums ${p.calculatedScore > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {p.calculatedScore > 0 ? '+' : ''}{p.calculatedScore.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    )) || (
                        <div className="py-12 text-center flex flex-col items-center">
                          <AlertCircle size={24} className="mb-2 text-gray-300 dark:text-gray-600" />
                          <p className="font-bold uppercase tracking-widest text-[10px] text-gray-400">{(t as any).noTelemetry}</p>
                        </div>
                      )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CONTENT: DOCUMENTS */}
          {activeTab === 'docs' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-[#22252B] p-6 rounded border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white uppercase">{(t as any).digitalHrVault}</h3>
                    <p className="text-xs font-bold text-gray-500 mt-1 uppercase tracking-widest">{(t as any).hrVaultDesc}</p>
                </div>
                <div className="w-12 h-12 rounded bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 border border-indigo-100 dark:border-indigo-800">
                    <ShieldCheck size={24} />
                </div>
              </div>

              <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 rounded shadow-sm overflow-hidden divide-y divide-gray-200 dark:divide-gray-700">
                {documents.map((doc, i) => (
                  <div key={doc.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-[#1e2025] transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gray-100 dark:bg-[#1e2025] border border-gray-200 dark:border-gray-700 rounded flex items-center justify-center text-gray-500">
                        <doc.icon size={20} />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 dark:text-white text-sm tracking-tight">{doc.name}</h4>
                        <div className="flex gap-2 text-[10px] font-bold text-gray-500 uppercase mt-0.5">
                          <span className="bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300">{doc.type}</span>
                          <span>{doc.size}</span>
                          <span>• {doc.date}</span>
                        </div>
                      </div>
                    </div>
                    <button className="p-2 bg-gray-100 dark:bg-[#1e2025] border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-indigo-600 hover:border-indigo-200 rounded transition-colors">
                      <Download size={16} />
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
