import React, { useState, useEffect } from 'react';
import { Company, OperationEntry, Payment, PaymentStatus, Language, ClientCredential, ClientHistory, Staff, TaxType, CompanyStatus, RiskLevel, KPIRule } from '../types';
import { translations } from '../lib/translations';
import StatusBadge from './StatusBadge';
import { fetchDocuments, fetchCredentials, fetchClientHistory, logCredentialAccess, fetchKPIRules, fetchCompanyKPIRules, upsertCompanyKPIRule } from '../lib/supabaseData';
import { supabase } from '../lib/supabaseClient';
import { X, Shield, History, FileText, Lock, Globe, Building, Building2, Download, Eye, EyeOff, Users, DollarSign, AlertTriangle, MapPin, Briefcase, Database, Key, User, Send, Check, Calculator, Trash2, Plus, ChevronRight, ArrowRight, Pencil, Save, Loader2 } from 'lucide-react';

interface DrawerProps {
  company: Company | null;
  operation: OperationEntry | null;
  payments: Payment[];
  staff?: Staff[];
  lang: Language;
  userId?: string;
  onClose: () => void;
  onSave?: (company: Company, assignments?: any[]) => void;
}

type TabId = 'pasport' | 'soliq' | 'loginlar' | 'jamoa' | 'shartnoma' | 'xizmatlar' | 'kpi';

const CompanyDrawer: React.FC<DrawerProps> = ({ company, operation, payments, staff = [], lang, userId, onClose, onSave }) => {
  const t = translations[lang];
  const [documents, setDocuments] = useState<any[]>([]);
  const [credentials, setCredentials] = useState<ClientCredential[]>([]);
  const [clientHistory, setClientHistory] = useState<ClientHistory[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<TabId>('pasport');
  const [isEditingMainLogin, setIsEditingMainLogin] = useState(false);
  const [isAddingCredential, setIsAddingCredential] = useState(false);
  const [newCred, setNewCred] = useState({ serviceName: '', loginId: '', password: '', notes: '' });
  const [tempLogin, setTempLogin] = useState(company?.login || '');
  const [tempPassword, setTempPassword] = useState(company?.password || '');
  const [kpiRules, setKpiRules] = useState<KPIRule[]>([]);
  const [companyKpiRules, setCompanyKpiRules] = useState<any[]>([]);
  const [isSavingKpi, setIsSavingKpi] = useState<string | null>(null); // ruleId of saving item
  const [isLoadingKpi, setIsLoadingKpi] = useState(false);
  const [isEditingJamoa, setIsEditingJamoa] = useState(false);
  const [editAssignments, setEditAssignments] = useState<any[]>([]);
  const [isSavingJamoa, setIsSavingJamoa] = useState(false);


  useEffect(() => {
    if (company) {
      setTempLogin(company.login || '');
      setTempPassword(company.password || '');
      setIsLoadingDocs(true);
      setAssignmentsError(null);
      (async () => {
        try {
          const [docsRes, credsRes, historyRes, assRes] = await Promise.allSettled([
            fetchDocuments(company.id),
            fetchCredentials(company.id),
            fetchClientHistory(company.id),
            supabase.from('contract_assignments').select('*').eq('client_id', company.id)
          ]);

          if (docsRes.status === 'fulfilled') setDocuments(docsRes.value);
          else console.warn('[CompanyDrawer] fetchDocuments failed:', docsRes.reason);

          if (credsRes.status === 'fulfilled') setCredentials(credsRes.value);
          else console.warn('[CompanyDrawer] fetchCredentials failed:', credsRes.reason);

          if (historyRes.status === 'fulfilled') setClientHistory(historyRes.value);
          else console.warn('[CompanyDrawer] fetchClientHistory failed:', historyRes.reason);

          if (assRes.status === 'fulfilled') {
            const resp = assRes.value as any;
            if (resp?.error) {
              setAssignmentsError(resp.error.message || 'contract_assignments o‘qishda xatolik');
              setAssignments([]);
            } else {
              setAssignments(resp?.data || []);
            }
          } else {
            console.warn('[CompanyDrawer] fetch contract_assignments failed:', assRes.reason);
            setAssignmentsError(String((assRes as any)?.reason?.message || assRes.reason || 'contract_assignments o‘qishda xatolik'));
            setAssignments([]);
          }
        } finally {
          setIsLoadingDocs(false);
        }
      })();

      // Fetch KPI Data
      setIsLoadingKpi(true);
      (async () => {
        try {
          const [rulesRes, compRulesRes] = await Promise.allSettled([
            fetchKPIRules(),
            fetchCompanyKPIRules(company.id)
          ]);

          if (rulesRes.status === 'fulfilled') setKpiRules(rulesRes.value);
          else console.warn('[CompanyDrawer] fetchKPIRules failed:', rulesRes.reason);

          if (compRulesRes.status === 'fulfilled') setCompanyKpiRules(compRulesRes.value);
          else console.warn('[CompanyDrawer] fetchCompanyKPIRules failed:', compRulesRes.reason);
        } finally {
          setIsLoadingKpi(false);
        }
      })();

    }
  }, [company]);

  const teamFallbackAssignments = () => {
    const res: any[] = [];
    if (!company) return res;

    const push = (role: string, userIdValue?: string, salary_type?: string, salary_value?: any) => {
      if (!userIdValue) return;
      res.push({
        id: `fallback-${role}-${userIdValue}`,
        role,
        user_id: userIdValue,
        salary_type,
        salary_value
      });
    };

    push('accountant', company.accountantId, 'percent', company.accountantPerc);
    push('controller', company.supervisorId, 'percent', company.supervisorPerc);
    push('bank_manager', company.bankClientId, 'fixed', company.bankClientSum);
    push('chief_accountant', company.chiefAccountantId, 'fixed', company.chiefAccountantSum);
    return res;
  };

  if (!company) return null;

  const companyPayments = payments.filter(p => p.companyId === company.id);
  const totalPaid = companyPayments.filter(p => p.status === PaymentStatus.PAID).reduce((sum, p) => sum + p.amount, 0);
  const totalPending = companyPayments.filter(p => p.status !== PaymentStatus.PAID).reduce((sum, p) => sum + p.amount, 0);

  const getRiskBadge = () => {
    const risk = company.riskLevel || 'low';
    if (risk === 'high' || company.companyStatus === 'problem' || company.companyStatus === 'debtor') {
      return { emoji: '🔴', text: 'Yuqori Xavf', color: 'bg-rose-500/10 text-rose-500 border-rose-500/20' };
    }
    if (risk === 'medium' || company.companyStatus === 'suspended') {
      return { emoji: '🟡', text: "O'rta Xavf", color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' };
    }
    return { emoji: '🟢', text: 'Past Xavf', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' };
  };

  const riskBadge = getRiskBadge();

  const handleShowPassword = async (credId: string, companyId: string) => {
    if (!showPasswords[credId]) {
      if (userId) {
        await logCredentialAccess(credId, companyId, userId, 'view');
      }
    }
    setShowPasswords(prev => ({ ...prev, [credId]: !prev[credId] }));
  };

  const contractAmount = company.contractAmount || 0;
  const firmaShare = (company.firmaSharePercent || 50) / 100 * contractAmount;
  const buxgalterShare = (company.accountantPerc || 20) / 100 * contractAmount;
  const bankShare = (company.bankClientSum || 0);
  const nazoratchiShare = (company.supervisorPerc || 2.5) / 100 * contractAmount;

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'pasport', label: 'Pasport', icon: <FileText size={14} /> },
    { id: 'soliq', label: 'Soliq', icon: <Briefcase size={14} /> },
    { id: 'loginlar', label: 'Loginlar', icon: <Lock size={14} /> },
    { id: 'jamoa', label: 'Jamoa', icon: <Users size={14} /> },
    { id: 'shartnoma', label: 'Shartnoma', icon: <DollarSign size={14} /> },
    { id: 'xizmatlar', label: 'Xizmatlar', icon: <Check size={14} /> },
    { id: 'kpi', label: 'KPI', icon: <Calculator size={14} /> },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/60 z-[100] transition-opacity duration-300 animate-in fade-in" onClick={onClose}></div>
      <div className="fixed right-0 top-0 h-full w-full max-w-[800px] bg-gray-50 dark:bg-[#1A1D23] z-[101] overflow-y-auto overflow-x-hidden border-l border-gray-200 dark:border-gray-700 animate-in slide-in-from-right duration-300 flex flex-col">
        <div className="bg-white dark:bg-[#22252B] border-b border-gray-200 dark:border-gray-700 shrink-0 z-20">
          <div className="p-6 flex justify-between items-start">
            <div className="flex gap-4 items-start">
              <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800 flex items-center justify-center text-2xl text-blue-600 dark:text-blue-400 font-bold shrink-0">
                {company.name.charAt(0)}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2 uppercase leading-tight">{company.name}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 bg-gray-100 dark:bg-[#1e2025] border border-gray-200 dark:border-gray-700 rounded text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase shrink-0">INN: {company.inn}</span>
                  <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded text-[10px] font-bold text-indigo-600 uppercase shrink-0">{company.taxType}</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-2 bg-gray-100 dark:bg-[#1e2025] border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-800 rounded text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>
          <div className="flex px-6 overflow-x-auto border-t border-gray-200 dark:border-gray-700">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors font-bold text-[10px] uppercase tracking-widest whitespace-nowrap mb-[-2px] ${activeTab === tab.id ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
              >
                <span className={activeTab === tab.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 flex-1 space-y-6">
          {activeTab === 'pasport' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 rounded p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 flex items-center justify-center text-blue-600 p-1.5">
                    <User size={16} />
                  </div>
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Direktor</h4>
                </div>
                <div className="pl-11">
                  <p className="text-sm font-bold text-gray-900 dark:text-white uppercase">{company.directorName || '—'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{company.directorPhone || 'Telefon ko\'rsatilmagan'}</p>
                </div>
              </div>

              <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 rounded p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 flex items-center justify-center text-amber-600 p-1.5">
                    <MapPin size={16} />
                  </div>
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Yuridik Manzil</h4>
                </div>
                <div className="pl-11">
                  <p className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase">{company.legalAddress || 'Manzil ko\'rsatilmagan'}</p>
                </div>
              </div>

              <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 rounded shadow-sm overflow-hidden">
                <div className="bg-gray-50 dark:bg-[#1e2025] px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3">
                    <FileText size={14} className="text-gray-500" />
                    <h4 className="text-[10px] font-bold text-gray-700 dark:text-gray-300 uppercase">Hujjatlar</h4>
                  </div>
                  <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[9px] font-bold text-gray-600 dark:text-gray-300">{documents.length} fayl</span>
                </div>
                {isLoadingDocs ? (
                  <div className="p-6 flex flex-col items-center justify-center">
                    <div className="animate-spin w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full mb-2"></div>
                    <p className="text-[10px] font-bold uppercase text-gray-400">Yuklanmoqda...</p>
                  </div>
                ) : documents.length > 0 ? (
                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {documents.slice(0, 5).map((doc, i) => (
                      <div key={i} className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-[#1e2025] transition-colors">
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300 truncate pr-4">{doc.file_name}</span>
                        <a href={doc.file_url} target="_blank" rel="noreferrer" className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded shrink-0 transition-colors">
                          <Download size={14} />
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-[10px] font-bold uppercase text-gray-400 tracking-widest">
                    Hujjatlar topilmadi
                  </div>
                )}
              </div>

              {/* Service Scope in Passport */}
              <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 rounded shadow-sm overflow-hidden">
                <div className="bg-gray-50 dark:bg-[#1e2025] px-4 py-3 flex items-center gap-3 border-b border-gray-200 dark:border-gray-700">
                  <Check size={14} className="text-gray-500" />
                  <h4 className="text-[10px] font-bold text-gray-700 dark:text-gray-300 uppercase">Xizmatlar & Operatsiyalar</h4>
                </div>
                <div className="p-5">
                  <div className="flex flex-wrap gap-2 mb-4">
                    {company.serviceScope?.length ? company.serviceScope.map(s => (
                      <span key={s} className="px-2 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 border border-emerald-200 dark:border-emerald-800 text-[9px] font-bold rounded uppercase truncate">{s}</span>
                    )) : company.activeServices?.length ? company.activeServices.slice(0, 8).map(s => (
                      <span key={s} className="px-2 py-1 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 border border-indigo-200 dark:border-indigo-800 text-[9px] font-bold rounded uppercase truncate">{s.replace('_', ' ')}</span>
                    )) : (
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Xizmatlar tanlanmagan</p>
                    )}
                    {company.activeServices && company.activeServices.length > 8 && (
                      <span className="text-[9px] font-bold text-gray-400 flex items-center px-1">+{company.activeServices.length - 8} yana</span>
                    )}
                  </div>
                  <button
                    onClick={() => setActiveTab('xizmatlar')}
                    className="w-full py-2 bg-gray-100 dark:bg-[#1e2025] border border-gray-200 dark:border-gray-700 rounded text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-widest hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                  >
                    Barchasini ko'rish
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'soliq' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white dark:bg-[#22252B] p-5 rounded border border-gray-200 dark:border-gray-700 shadow-sm">
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">1C Server & Baza</h4>
                  <div className="space-y-2 text-xs">
                    <p className="font-bold text-gray-600 dark:text-gray-300 uppercase">Server ID: <span className="text-indigo-600 dark:text-indigo-400">{company.serverInfo || '—'}</span></p>
                    {company.serverName && (
                      <p className="font-bold text-gray-600 dark:text-gray-300 uppercase">Server Nomi: <span className="text-emerald-600">{company.serverName}</span></p>
                    )}
                    <p className="font-bold text-gray-500 uppercase">Baza: {company.baseName1c || '—'}</p>
                  </div>
                </div>
                <div className={`p-5 rounded border flex items-center gap-3 ${company.itParkResident ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 text-indigo-700' : 'bg-gray-50 dark:bg-[#1e2025] border-gray-200 dark:border-gray-700 text-gray-500'}`}>
                  <Shield size={20} />
                  <span className="text-xs font-bold uppercase">IT Park Rezidenti</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-[#22252B] p-5 rounded border border-gray-200 dark:border-gray-700 shadow-sm">
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Statistika Hisobotlari</h4>
                  <div className="flex flex-wrap gap-2">
                    {company.statReports?.length ? company.statReports.map(s => (
                      <span key={s} className="px-2 py-1 bg-gray-100 dark:bg-[#1e2025] border border-gray-200 dark:border-gray-700 text-[9px] font-bold rounded text-gray-600 dark:text-gray-300 uppercase">{s}</span>
                    )) : <p className="text-[10px] font-bold text-gray-400 uppercase">belgilanmagan</p>}
                  </div>
                </div>

                <div className="bg-white dark:bg-[#22252B] p-5 rounded border border-gray-200 dark:border-gray-700 shadow-sm">
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Majburiy Hisobotlar</h4>
                  <div className="flex flex-wrap gap-2">
                    {company.requiredReports?.length ? company.requiredReports.map(r => (
                      <span key={r} className="px-2 py-1 bg-rose-50 border border-rose-200 text-[9px] font-bold rounded text-rose-700 uppercase">{r}</span>
                    )) : <p className="text-[10px] font-bold text-gray-400 uppercase">belgilanmagan</p>}
                  </div>
                </div>

                <div className="bg-white dark:bg-[#22252B] p-5 rounded border border-gray-200 dark:border-gray-700 shadow-sm col-span-1 md:col-span-2">
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Xizmatlar Ko'lami (Scope)</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {company.serviceScope?.length ? company.serviceScope.map(s => (
                      <div key={s} className="flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 text-indigo-700 rounded">
                        <Check size={12} className="shrink-0" />
                        <span className="text-[9px] font-bold uppercase truncate">{s}</span>
                      </div>
                    )) : (
                      <div className="col-span-full py-4 text-center border border-dashed border-gray-300 dark:border-gray-700 rounded bg-gray-50 dark:bg-[#1e2025]">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Xizmatlar tanlanmagan</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-[#22252B] p-5 rounded border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <Database size={14} className="text-gray-500" />
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">1C Holati</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {['cloud', 'local', 'server', 'none'].map(status => (
                    <div key={status} className={`px-3 py-1.5 rounded border font-bold text-[9px] uppercase transition-colors ${company.oneCStatus === status ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-gray-50 dark:bg-[#1e2025] border-gray-200 dark:border-gray-700 text-gray-500'}`}>
                      {status === 'cloud' ? '☁️ Cloud' : status === 'local' ? '💻 Local' : status === 'server' ? '🖥️ Server' : '❌ Yo\'q'}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'loginlar' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-[#22252B] p-5 rounded border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Globe size={14} className="text-gray-500" />
                    <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase">Soliq.uz (Asosiy)</h4>
                  </div>
                  {isEditingMainLogin ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setIsEditingMainLogin(false);
                          setTempLogin(company.login || '');
                          setTempPassword(company.password || '');
                        }}
                        className="px-3 py-1.5 text-[9px] font-bold text-gray-500 uppercase rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border border-transparent"
                      >
                        Bekor qilish
                      </button>
                      <button
                        onClick={async () => {
                          if (onSave) {
                            await onSave({ ...company, login: tempLogin, password: tempPassword });
                          }
                          setIsEditingMainLogin(false);
                        }}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-bold uppercase rounded border border-indigo-700 transition-colors"
                      >
                        Saqlash
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsEditingMainLogin(true)}
                      className="px-3 py-1.5 bg-gray-100 dark:bg-[#1e2025] hover:bg-gray-200 dark:hover:bg-gray-800 text-[9px] font-bold text-gray-600 dark:text-gray-300 uppercase rounded border border-gray-200 dark:border-gray-700 transition-colors"
                    >
                      Tahrirlash
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Login</p>
                    {isEditingMainLogin ? (
                      <input
                        type="text"
                        className="w-full bg-white dark:bg-[#1A1D23] p-2 rounded border border-gray-300 dark:border-gray-600 font-mono text-sm uppercase outline-none focus:border-indigo-500"
                        value={tempLogin}
                        onChange={(e) => setTempLogin(e.target.value)}
                      />
                    ) : (
                      <p className="text-sm font-mono font-bold text-gray-900 dark:text-white uppercase bg-gray-50 dark:bg-[#1e2025] p-2 rounded border border-gray-200 dark:border-gray-700">{company.login || '—'}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Parol</p>
                    <div className="relative">
                      {isEditingMainLogin ? (
                        <input
                          type="text"
                          className="w-full bg-white dark:bg-[#1A1D23] p-2 rounded border border-gray-300 dark:border-gray-600 font-mono text-sm outline-none focus:border-indigo-500"
                          value={tempPassword}
                          onChange={(e) => setTempPassword(e.target.value)}
                        />
                      ) : (
                        <div className="flex items-center justify-between bg-gray-50 dark:bg-[#1e2025] p-2 rounded border border-gray-200 dark:border-gray-700">
                          <p className="text-sm font-mono font-bold text-gray-900 dark:text-white tracking-widest">
                            {showPasswords['main'] ? company.password || '—' : '••••••••'}
                          </p>
                          <button onClick={() => setShowPasswords(prev => ({ ...prev, main: !prev.main }))} className="text-gray-400 hover:text-indigo-600 transition-colors">
                            {showPasswords['main'] ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-[#22252B] rounded border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="bg-gray-50 dark:bg-[#1e2025] px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
                  <h4 className="text-[10px] font-bold text-gray-700 dark:text-gray-300 uppercase">Qo'shimcha Kirish Ma'lumotlari</h4>
                  <button
                    onClick={() => setIsAddingCredential(true)}
                    className="flex items-center gap-1 text-[9px] font-bold text-indigo-600 uppercase py-1 px-2.5 bg-indigo-50 dark:bg-indigo-900/20 rounded border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
                  >
                    <Plus size={10} /> Yangi Qo'shish
                  </button>
                </div>

                {isAddingCredential && (
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-indigo-50/50 dark:bg-indigo-900/10">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="col-span-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Xizmat nomi (Masalan: Didox, Bank)</label>
                        <input
                          type="text"
                          className="w-full bg-white dark:bg-[#1e2025] p-2 rounded border border-gray-300 dark:border-gray-600 text-sm outline-none focus:border-indigo-500"
                          value={newCred.serviceName}
                          onChange={e => setNewCred({ ...newCred, serviceName: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Login</label>
                        <input
                          type="text"
                          className="w-full bg-white dark:bg-[#1e2025] p-2 rounded border border-gray-300 dark:border-gray-600 font-mono text-sm uppercase outline-none focus:border-indigo-500"
                          value={newCred.loginId}
                          onChange={e => setNewCred({ ...newCred, loginId: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Parol</label>
                        <input
                          type="text"
                          className="w-full bg-white dark:bg-[#1e2025] p-2 rounded border border-gray-300 dark:border-gray-600 font-mono text-sm outline-none focus:border-indigo-500"
                          value={newCred.password}
                          onChange={e => setNewCred({ ...newCred, password: e.target.value })}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Izoh</label>
                        <input
                          type="text"
                          className="w-full bg-white dark:bg-[#1e2025] p-2 rounded border border-gray-300 dark:border-gray-600 text-sm outline-none focus:border-indigo-500"
                          value={newCred.notes}
                          onChange={e => setNewCred({ ...newCred, notes: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 text-[9px] uppercase font-bold">
                      <button onClick={() => setIsAddingCredential(false)} className="px-3 py-1.5 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800 rounded">Bekor qilish</button>
                      <button
                        disabled={!newCred.serviceName || !newCred.loginId}
                        onClick={async () => {
                          const { data } = await supabase.from('client_credentials').insert({
                            company_id: company.id,
                            service_name: newCred.serviceName,
                            login_id: newCred.loginId,
                            encrypted_password: newCred.password,
                            notes: newCred.notes,
                            updated_by: (await supabase.auth.getUser()).data.user?.id
                          }).select();
                          if (data) {
                            setCredentials(prev => [...prev, ...data.map(d => ({
                              id: d.id, companyId: d.company_id, serviceName: d.service_name,
                              loginId: d.login_id, encryptedPassword: d.encrypted_password, notes: d.notes
                            }))]);
                            setIsAddingCredential(false);
                            setNewCred({ serviceName: '', loginId: '', password: '', notes: '' });
                          }
                        }}
                        className="px-3 py-1.5 bg-indigo-600 text-white rounded border border-indigo-700 disabled:opacity-50"
                      >
                        Qo'shish
                      </button>
                    </div>
                  </div>
                )}

                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {credentials.map((cred) => (
                    <div key={cred.id} className="p-4 hover:bg-gray-50 dark:hover:bg-[#1e2025] transition-colors relative group/cred">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <Key size={12} className="text-gray-400" />
                          <p className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-tight">{cred.serviceName}</p>
                        </div>
                        <button
                          onClick={() => {
                            if (confirm(`${cred.serviceName} o'chirilsinmi?`)) {
                              supabase.from('client_credentials').delete().eq('id', cred.id).then(() => {
                                setCredentials(prev => prev.filter(c => c.id !== cred.id));
                              });
                            }
                          }}
                          className="p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded opacity-0 group-hover/cred:opacity-100 transition-all"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm mt-3">
                        <div className="bg-gray-50 dark:bg-[#1A1D23] p-2 rounded border border-gray-200 dark:border-gray-700">
                          <p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">Login</p>
                          <p className="font-mono text-gray-800 dark:text-gray-200 uppercase">{cred.loginId || '—'}</p>
                        </div>
                        <div className="bg-gray-50 dark:bg-[#1A1D23] p-2 rounded border border-gray-200 dark:border-gray-700 flex justify-between items-center">
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">Parol</p>
                            <p className="font-mono text-gray-800 dark:text-gray-200 tracking-widest">{showPasswords[cred.id] ? cred.encryptedPassword || '—' : '••••••••'}</p>
                          </div>
                          <button onClick={() => handleShowPassword(cred.id, company.id)} className="text-gray-400 hover:text-indigo-600">
                            {showPasswords[cred.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </div>
                      {cred.notes && <p className="text-[10px] mt-2 text-gray-500">Izoh: {cred.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'jamoa' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 rounded shadow-sm overflow-hidden">
                <div className="bg-gray-50 dark:bg-[#1e2025] px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
                  <h4 className="text-[10px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-widest">Amaldagi Jamoa</h4>
                  {onSave && !isEditingJamoa && (
                    <button
                      onClick={() => {
                        const source = assignments.length > 0 ? assignments : teamFallbackAssignments();
                        setEditAssignments(source.map((a: any) => ({
                          role: a.role,
                          userId: a.user_id,
                          salaryType: a.salary_type || 'percent',
                          salaryValue: a.salary_value ?? 0
                        })));
                        setIsEditingJamoa(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 text-[9px] font-bold uppercase transition-colors"
                    >
                      <Pencil size={10} /> Tahrirlash
                    </button>
                  )}
                  {isEditingJamoa && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setIsEditingJamoa(false)}
                        className="px-3 py-1.5 rounded border border-gray-200 bg-gray-100 text-gray-600 text-[9px] font-bold uppercase transition-colors"
                      >
                        Bekor
                      </button>
                      <button
                        disabled={isSavingJamoa}
                        onClick={async () => {
                          if (!company || !onSave) return;
                          setIsSavingJamoa(true);
                          try {
                            await onSave(company, editAssignments);
                            setAssignments(editAssignments.map((a, i) => ({
                              id: `edited-${i}`, role: a.role, user_id: a.userId, salary_type: a.salaryType, salary_value: a.salaryValue
                            })));
                            setIsEditingJamoa(false);
                          } catch (e: any) {
                            console.error('Jamoa saqlashda xatolik:', e);
                          } finally {
                            setIsSavingJamoa(false);
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-emerald-700 bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-bold uppercase transition-colors disabled:opacity-50"
                      >
                        {isSavingJamoa ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />} Saqlash
                      </button>
                    </div>
                  )}
                </div>

                {assignmentsError && (
                  <div className="m-4 p-3 rounded border border-amber-200 bg-amber-50 text-amber-700">
                    <p className="text-[10px] font-bold uppercase tracking-widest">contract_assignments xatoligi</p>
                    <p className="text-[10px] uppercase mt-1">{assignmentsError}</p>
                  </div>
                )}

                {!isEditingJamoa ? (
                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {(() => {
                      const displayedAssignments = assignments.length > 0 ? assignments : teamFallbackAssignments();
                      return displayedAssignments.length > 0 ? displayedAssignments.map((asgn: any) => {
                        const member = staff.find(s => s.id === asgn.user_id);
                        return (
                          <div key={asgn.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-[#1e2025] transition-colors">
                            <div className="flex gap-4 items-center">
                              <div className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 text-xs font-bold shrink-0">
                                {member?.name?.charAt(0) || '?'}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-gray-900 dark:text-white uppercase">{member?.name || 'Mavjud emas'}</p>
                                <p className="text-[9px] font-bold text-gray-400 tracking-widest uppercase">{asgn.role.replace(/_/g, ' ')}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 text-[10px] font-bold text-gray-600 dark:text-gray-300 whitespace-nowrap">
                                {asgn.salary_type === 'percent' ? `${asgn.salary_value}%` : `${asgn.salary_value?.toLocaleString()} so'm`}
                              </span>
                              {asgn.start_date && <p className="text-[9px] text-gray-400 mt-1 uppercase">Sana: {new Date(asgn.start_date).toLocaleDateString()}</p>}
                            </div>
                          </div>
                        );
                      }) : (
                        <div className="p-8 text-center bg-gray-50 dark:bg-[#1e2025]">
                          <Users size={24} className="mx-auto mb-2 text-gray-400" />
                          <p className="text-[10px] font-bold uppercase text-gray-500 tracking-widest">Jamoa a'zolari tayinlanmagan</p>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="p-4 bg-gray-50 dark:bg-[#1A1D23] space-y-4">
                    {editAssignments.map((asgn, idx) => {
                      const roleLabels: Record<string, string> = {
                        accountant: 'Buxgalter', controller: 'Nazoratchi', bank_manager: 'Bank Menejer', chief_accountant: 'Bosh Buxgalter'
                      };
                      return (
                        <div key={asgn.role} className="p-4 bg-white dark:bg-[#22252B] rounded border border-gray-200 dark:border-gray-700 space-y-3">
                          <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">{roleLabels[asgn.role] || asgn.role.replace(/_/g, ' ')}</p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="sm:col-span-2">
                              <label className="text-[9px] font-bold text-gray-500 uppercase block mb-1">Xodim</label>
                              <select
                                value={asgn.userId || ''}
                                onChange={e => setEditAssignments(prev => prev.map((a, i) => i === idx ? { ...a, userId: e.target.value } : a))}
                                className="w-full bg-white dark:bg-[#1e2025] border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-xs uppercase outline-none focus:border-indigo-500"
                              >
                                <option value="">— Tanlanmagan —</option>
                                {staff.map(s => <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-gray-500 uppercase block mb-1">
                                {asgn.salaryType === 'percent' ? 'Foiz (%)' : 'Summa (so\'m)'}
                              </label>
                              <div className="flex border border-gray-300 dark:border-gray-600 rounded overflow-hidden">
                                <input
                                  type="number"
                                  value={asgn.salaryValue}
                                  onChange={e => setEditAssignments(prev => prev.map((a, i) => i === idx ? { ...a, salaryValue: Number(e.target.value) } : a))}
                                  className="w-full bg-white dark:bg-[#1e2025] px-2 py-1.5 text-xs outline-none"
                                />
                                <button
                                  onClick={() => setEditAssignments(prev => prev.map((a, i) => i === idx ? { ...a, salaryType: a.salaryType === 'percent' ? 'fixed' : 'percent' } : a))}
                                  className="px-2 py-1.5 bg-gray-100 dark:bg-gray-800 text-[9px] font-bold uppercase text-gray-600 shrink-0 border-l border-gray-300 dark:border-gray-600 hover:bg-gray-200 transition-colors"
                                >
                                  {asgn.salaryType === 'percent' ? '%' : 'UZS'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {clientHistory.length > 0 && (
                <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 rounded shadow-sm overflow-hidden">
                  <div className="bg-gray-50 dark:bg-[#1e2025] px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <h4 className="text-[10px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-widest">Tayinlovlar Tarixi</h4>
                  </div>
                  <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-[300px] overflow-y-auto">
                    {clientHistory.filter(h => h.changeType === 'assign_role' || h.changeType === 'remove_role').map((h, i) => (
                      <div key={i} className="flex gap-3 p-3">
                        <div className={`mt-0.5 w-6 h-6 rounded shrink-0 flex items-center justify-center border ${h.changeType === 'assign_role' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200'}`}>
                          {h.changeType === 'assign_role' ? <Check size={12} /> : <X size={12} />}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-900 dark:text-white uppercase">{h.notes || 'Rol o\'zgarishi'}</p>
                          <p className="text-[9px] text-gray-500 uppercase mt-0.5">{new Date(h.changedAt).toLocaleString()} • {h.changedByName || 'Tizim'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'shartnoma' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                {company.internalContractor && (
                  <div className="col-span-2 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800 rounded p-5">
                    <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mb-1.5">Ichki Pudratchi (Ijrochi)</p>
                    <div className="flex items-center gap-2">
                      <Building2 size={16} className="text-indigo-600" />
                      <p className="text-lg font-bold text-indigo-700 dark:text-indigo-400 uppercase">{company.internalContractor}</p>
                    </div>
                  </div>
                )}

                <div className="bg-white dark:bg-[#22252B] p-4 rounded border border-gray-200 dark:border-gray-700 shadow-sm">
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">Shartnoma Raqami</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white uppercase">{company.contractNumber || '—'}</p>
                </div>
                <div className="bg-white dark:bg-[#22252B] p-4 rounded border border-gray-200 dark:border-gray-700 shadow-sm">
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">Sana</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white font-mono">{company.contractDate || '—'}</p>
                </div>
              </div>

              <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 rounded shadow-sm overflow-hidden">
                <div className="bg-gray-50 dark:bg-[#1e2025] px-5 py-4 border-b border-gray-200 dark:border-gray-700 text-center">
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Moliyaviy Holat</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[9px] font-bold text-gray-500 uppercase mb-1">Xizmat Narxi</p>
                      <p className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">{company.contractAmount?.toLocaleString()} <span className="text-[10px] text-gray-400 uppercase">so'm</span></p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-gray-500 uppercase mb-1">Joriy Balans</p>
                      <p className={`text-xl font-bold tabular-nums ${(company.currentBalance || 0) < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {(company.currentBalance || 0).toLocaleString()} <span className="text-[10px] uppercase">so'm</span>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-5">
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Kaskadli Taqsimot (Oylik prognozi)</h4>
                  <div className="divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
                    {[
                      { label: 'Bosh Buxgalter', perc: company.chiefAccountantPerc || 0, sum: company.chiefAccountantSum, type: 'head' },
                      { label: 'Nazoratchi', perc: company.supervisorPerc || 0, type: 'sup' },
                      { label: 'Bank Klient', perc: company.bankClientPerc || 0, sum: company.bankClientSum, type: 'bank' },
                      { label: 'Buxgalter', perc: company.accountantPerc || 0, type: 'acc' }
                    ].map((item, i) => {
                      const amount = company.contractAmount || 0;
                      const val = item.sum || (amount * (item.perc / 100));
                      return (
                        <div key={i} className="flex items-center justify-between p-3 bg-white dark:bg-[#22252B] hover:bg-gray-50 dark:hover:bg-[#1e2025] transition-colors">
                          <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">{item.label}</span>
                          <div className="text-right flex items-center gap-4">
                            <p className="text-[10px] font-bold text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{item.sum ? 'Fiks.' : `${item.perc}%`}</p>
                            <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{val.toLocaleString()} <span className="text-[9px] text-gray-500">UZS</span></p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-3 flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded">
                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase">Kompaniya Qoldig'i</span>
                    <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {((company.contractAmount || 0) - (
                        (company.chiefAccountantSum || ((company.contractAmount || 0) * (company.chiefAccountantPerc || 0) / 100)) +
                        (company.supervisorPerc ? (company.contractAmount || 0) * company.supervisorPerc / 100 : 0) +
                        (company.bankClientSum || ((company.contractAmount || 0) * (company.bankClientPerc || 0) / 100)) +
                        ((company.contractAmount || 0) * (company.accountantPerc || 0) / 100)
                      )).toLocaleString()} <span className="text-[9px]">UZS</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'xizmatlar' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-[#22252B] p-5 rounded border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Check size={14} className="text-gray-500" />
                    <h4 className="text-[10px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-widest">Aktiv Xizmatlar</h4>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (onSave) {
                          const allKeys = ['didox', 'xatlar', 'avtokameral', 'my_mehnat', 'one_c', 'pul_oqimlari', 'chiqadigan_soliqlar', 'hisoblangan_oylik', 'debitor_kreditor', 'foyda_va_zarar', 'tovar_ostatka', 'yer_soligi', 'mol_mulk_soligi', 'suv_soligi', 'bonak', 'aksiz_soligi', 'nedro_soligi', 'norezident_foyda', 'norezident_nds', 'aylanma_qqs', 'daromad_soliq', 'inps', 'foyda_soliq', 'moliyaviy_natija', 'buxgalteriya_balansi', 'stat_12_invest', 'stat_12_moliya', 'stat_12_korxona', 'stat_12_narx', 'stat_4_invest', 'stat_4_mehnat', 'stat_4_korxona_miz', 'stat_4_kb_qur_sav_xiz', 'stat_4_kb_sanoat', 'stat_1_invest', 'stat_1_ih', 'stat_1_energiya', 'stat_1_korxona', 'stat_1_korxona_tif', 'stat_1_moliya', 'stat_1_akt', 'itpark_oylik', 'itpark_chorak', 'kom_suv', 'kom_gaz', 'kom_svet'];
                          onSave({ ...company, activeServices: allKeys });
                        }
                      }}
                      className="px-3 py-1.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 rounded border border-emerald-200 hover:bg-emerald-100 transition-colors uppercase"
                    >
                      Hammasini yoqish
                    </button>
                    <button
                      onClick={() => {
                        if (onSave) onSave({ ...company, activeServices: [] });
                      }}
                      className="px-3 py-1.5 text-[9px] font-bold text-rose-700 bg-rose-50 rounded border border-rose-200 hover:bg-rose-100 transition-colors uppercase"
                    >
                      Hammasini o'chirish
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 mb-6 uppercase tracking-widest">Yoqilmagan xizmatlar Operatsiyalar jadvalida kulrang (bloklangan) bo'lib ko'rsatiladi. Bo'sh ro'yxat = hammasi yoqilgan.</p>
                <div className="space-y-6">
                  {[
                    { group: 'Oylik', keys: ['didox', 'xatlar', 'avtokameral', 'my_mehnat', 'one_c', 'pul_oqimlari', 'chiqadigan_soliqlar', 'hisoblangan_oylik', 'debitor_kreditor', 'foyda_va_zarar', 'tovar_ostatka'], color: 'indigo' },
                    { group: 'Soliqlar', keys: ['yer_soligi', 'mol_mulk_soligi', 'suv_soligi', 'bonak', 'aksiz_soligi', 'nedro_soligi', 'norezident_foyda', 'norezident_nds'], color: 'amber' },
                    { group: 'Soliq H/T', keys: ['aylanma_qqs', 'daromad_soliq', 'inps', 'foyda_soliq'], color: 'purple' },
                    { group: 'Yillik', keys: ['moliyaviy_natija', 'buxgalteriya_balansi'], color: 'emerald' },
                    { group: 'Statistika', keys: ['stat_12_invest', 'stat_12_moliya', 'stat_12_korxona', 'stat_12_narx', 'stat_4_invest', 'stat_4_mehnat', 'stat_4_korxona_miz', 'stat_4_kb_qur_sav_xiz', 'stat_4_kb_sanoat', 'stat_1_invest', 'stat_1_ih', 'stat_1_energiya', 'stat_1_korxona', 'stat_1_korxona_tif', 'stat_1_moliya', 'stat_1_akt'], color: 'blue' },
                    { group: 'IT Park', keys: ['itpark_oylik', 'itpark_chorak'], color: 'fuchsia' },
                    { group: 'Komunalka', keys: ['kom_suv', 'kom_gaz', 'kom_svet'], color: 'rose' },
                  ].map(section => (
                    <div key={section.group} className="border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
                      <div className={`bg-gray-50 dark:bg-[#1e2025] px-4 py-2 border-b border-gray-200 dark:border-gray-700`}>
                        <h5 className={`text-[10px] font-bold uppercase tracking-widest text-${section.color}-600 dark:text-${section.color}-400`}>{section.group}</h5>
                      </div>
                      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 bg-white dark:bg-[#22252B]">
                        {section.keys.map(key => {
                          const labels: Record<string, string> = {
                            didox: 'Didox', xatlar: 'Xatlar', avtokameral: 'Avtokameral', my_mehnat: 'My Mehnat', one_c: '1C',
                            pul_oqimlari: 'Pul Oqimlari', chiqadigan_soliqlar: 'Chiq. Soliqlar', hisoblangan_oylik: 'His. Oylik',
                            debitor_kreditor: 'Deb/Kred', foyda_va_zarar: 'Foyda/Zarar', tovar_ostatka: 'Tovar Ost.',
                            yer_soligi: "Yer Solig'i", mol_mulk_soligi: "Mol-mulk Sol.", suv_soligi: "Suv Solig'i",
                            bonak: "Bo'nak", aksiz_soligi: 'AKSIZ', nedro_soligi: 'NEDRO', norezident_foyda: 'Nor. Foyda',
                            norezident_nds: 'Nor. NDS', aylanma_qqs: 'Aylanma/QQS', daromad_soliq: 'Daromad Soliq',
                            inps: 'INPS', foyda_soliq: 'Foyda Soliq', moliyaviy_natija: 'Mol. Natija',
                            buxgalteriya_balansi: 'Bux. Balansi',
                            stat_12_invest: '12-invest', stat_12_moliya: '12-moliya', stat_12_korxona: '12-korxona', stat_12_narx: '12-narx',
                            stat_4_invest: '4-invest', stat_4_mehnat: '4-mehnat', stat_4_korxona_miz: '4-korxona(miz)', stat_4_kb_qur_sav_xiz: '4-kb (q/s/x)', stat_4_kb_sanoat: '4-kb sanoat',
                            stat_1_invest: '1-invest', stat_1_ih: '1-ih', stat_1_energiya: '1-energiya', stat_1_korxona: '1-korxona', stat_1_korxona_tif: '1-korxona(tif)', stat_1_moliya: '1-moliya', stat_1_akt: '1-akt',
                            itpark_oylik: 'IT Park Oylik',
                            itpark_chorak: 'IT Park Chorak', kom_suv: 'Suv 💧', kom_gaz: 'Gaz 🔥', kom_svet: 'Svet ⚡'
                          };
                          const currentServices = company.activeServices || [];
                          const isChecked = currentServices.length === 0 || currentServices.includes(key);
                          return (
                            <label key={key} className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors border ${isChecked ? `bg-${section.color}-50 dark:bg-${section.color}-900/10 border-${section.color}-200 dark:border-${section.color}-800` : 'bg-gray-50 dark:bg-[#1e2025] border-gray-200 dark:border-gray-700 opacity-60'}`}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  if (!onSave) return;
                                  let newServices = [...(currentServices.length === 0 ? ['didox', 'xatlar', 'avtokameral', 'my_mehnat', 'one_c', 'pul_oqimlari', 'chiqadigan_soliqlar', 'hisoblangan_oylik', 'debitor_kreditor', 'foyda_va_zarar', 'tovar_ostatka', 'yer_soligi', 'mol_mulk_soligi', 'suv_soligi', 'bonak', 'aksiz_soligi', 'nedro_soligi', 'norezident_foyda', 'norezident_nds', 'aylanma_qqs', 'daromad_soliq', 'inps', 'foyda_soliq', 'moliyaviy_natija', 'buxgalteriya_balansi', 'stat_12_invest', 'stat_12_moliya', 'stat_12_korxona', 'stat_12_narx', 'stat_4_invest', 'stat_4_mehnat', 'stat_4_korxona_miz', 'stat_4_kb_qur_sav_xiz', 'stat_4_kb_sanoat', 'stat_1_invest', 'stat_1_ih', 'stat_1_energiya', 'stat_1_korxona', 'stat_1_korxona_tif', 'stat_1_moliya', 'stat_1_akt', 'itpark_oylik', 'itpark_chorak', 'kom_suv', 'kom_gaz', 'kom_svet'] : currentServices)];
                                  if (isChecked) {
                                    newServices = newServices.filter(k => k !== key);
                                  } else {
                                    newServices.push(key);
                                  }
                                  onSave({ ...company, activeServices: newServices });
                                }}
                                className="rounded text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className="text-[9px] font-bold text-gray-700 dark:text-gray-300 uppercase truncate">{labels[key] || key}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}


          {activeTab === 'kpi' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-[#22252B] p-5 rounded border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <Calculator size={14} className="text-gray-500" />
                  <h4 className="text-[10px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-widest">KPI Sozlamalari (Kompaniya uchun maxsus)</h4>
                </div>

                <div className="space-y-4">
                  {isLoadingKpi ? (
                    <div className="flex flex-col items-center justify-center py-10">
                      <Loader2 className="w-6 h-6 text-indigo-600 animate-spin mb-2" />
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Yuklanmoqda...</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {['automation', 'manual'].map(category => (
                        <div key={category} className="space-y-3">
                          <div className="bg-gray-50 dark:bg-[#1e2025] px-3 py-2 rounded flex items-center border border-gray-200 dark:border-gray-700">
                            <h5 className="text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-widest">
                              {category === 'automation' ? "Operatsiyalar (Avtomatik)" : "Nazoratchi Vazifalari (Qo'lda)"}
                            </h5>
                          </div>
                          <div className="divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
                            {kpiRules.filter(r => r.category === category).map(rule => {
                              const compRule = companyKpiRules.find(r => r.ruleId === rule.id);
                              const currentReward = compRule?.rewardPercent ?? '';
                              const currentPenalty = compRule?.penaltyPercent ?? '';
                              const hasOverride = compRule && (compRule.rewardPercent !== null || compRule.penaltyPercent !== null);

                              return (
                                <div key={rule.id} className={`p-4 transition-colors ${hasOverride ? 'bg-indigo-50/30 dark:bg-indigo-900/10' : 'bg-white dark:bg-[#22252B]'}`}>
                                  <div className="flex items-start justify-between mb-3">
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <p className="text-xs font-bold text-gray-900 dark:text-white uppercase">{rule.nameUz}</p>
                                        {isSavingKpi === rule.id && <Loader2 size={10} className="text-indigo-600 animate-spin" />}
                                      </div>
                                      <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mt-0.5">{rule.role}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <div className="text-right">
                                        <p className="text-[9px] text-gray-400 font-bold uppercase">Standart</p>
                                        <div className="flex gap-1.5 justify-end">
                                          <span className="text-[10px] font-bold text-emerald-600">+{rule.rewardPercent}%</span>
                                          <span className="text-[10px] font-bold text-rose-600">{rule.penaltyPercent}%</span>
                                        </div>
                                      </div>
                                      {hasOverride && (
                                        <button
                                          onClick={async () => {
                                            if (!window.confirm("Haqiqatan ham ushbu qoidani standart qiymatga qaytarmoqchimisiz?")) return;
                                            setIsSavingKpi(rule.id);
                                            try {
                                              await upsertCompanyKPIRule({
                                                id: compRule.id,
                                                companyId: company.id,
                                                ruleId: rule.id,
                                                rewardPercent: null,
                                                penaltyPercent: null,
                                                isActive: true
                                              });
                                              setCompanyKpiRules(prev => prev.filter(r => r.ruleId !== rule.id));
                                            } finally {
                                              setIsSavingKpi(null);
                                            }
                                          }}
                                          className="p-1.5 text-rose-500 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded transition-colors"
                                          title="Standartga qaytarish"
                                        >
                                          <History size={12} />
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex gap-4">
                                    <div className="flex-1">
                                      <label className="text-[9px] font-bold text-emerald-700 uppercase mb-1 block">Bonus (%)</label>
                                      <input
                                        type="number"
                                        step="0.1"
                                        placeholder={`St: ${rule.rewardPercent}`}
                                        className="w-full bg-white dark:bg-[#1A1D23] p-1.5 rounded border border-gray-300 dark:border-gray-600 font-mono text-xs outline-none focus:border-indigo-500"
                                        value={currentReward}
                                        onBlur={async (e) => {
                                          const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                          if (val === currentReward) return;

                                          setIsSavingKpi(rule.id);
                                          try {
                                            await upsertCompanyKPIRule({
                                              id: compRule?.id,
                                              companyId: company.id,
                                              ruleId: rule.id,
                                              rewardPercent: val,
                                              penaltyPercent: compRule?.penaltyPercent ?? null,
                                              isActive: true
                                            });
                                            const freshRules = await fetchCompanyKPIRules(company.id);
                                            setCompanyKpiRules(freshRules);
                                          } finally {
                                            setIsSavingKpi(null);
                                          }
                                        }}
                                        onChange={(e) => {
                                          const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                          setCompanyKpiRules(prev => {
                                            const copy = [...prev];
                                            const idx = copy.findIndex(r => r.ruleId === rule.id);
                                            if (idx >= 0) copy[idx] = { ...copy[idx], rewardPercent: val };
                                            else copy.push({ companyId: company.id, ruleId: rule.id, rewardPercent: val });
                                            return copy;
                                          });
                                        }}
                                      />
                                    </div>
                                    <div className="flex-1">
                                      <label className="text-[9px] font-bold text-rose-700 uppercase mb-1 block">Jarima (%)</label>
                                      <input
                                        type="number"
                                        step="0.1"
                                        placeholder={`St: ${rule.penaltyPercent}`}
                                        className="w-full bg-white dark:bg-[#1A1D23] p-1.5 rounded border border-gray-300 dark:border-gray-600 font-mono text-xs outline-none focus:border-indigo-500"
                                        value={currentPenalty}
                                        onBlur={async (e) => {
                                          const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                          if (val === currentPenalty) return;

                                          setIsSavingKpi(rule.id);
                                          try {
                                            await upsertCompanyKPIRule({
                                              id: compRule?.id,
                                              companyId: company.id,
                                              ruleId: rule.id,
                                              rewardPercent: compRule?.rewardPercent ?? null,
                                              penaltyPercent: val,
                                              isActive: true
                                            });
                                            const freshRules = await fetchCompanyKPIRules(company.id);
                                            setCompanyKpiRules(freshRules);
                                          } finally {
                                            setIsSavingKpi(null);
                                          }
                                        }}
                                        onChange={(e) => {
                                          const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                          setCompanyKpiRules(prev => {
                                            const copy = [...prev];
                                            const idx = copy.findIndex(r => r.ruleId === rule.id);
                                            if (idx >= 0) copy[idx] = { ...copy[idx], penaltyPercent: val };
                                            else copy.push({ companyId: company.id, ruleId: rule.id, penaltyPercent: val });
                                            return copy;
                                          });
                                        }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CompanyDrawer;
