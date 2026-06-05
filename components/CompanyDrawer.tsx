import React, { useState, useEffect } from 'react';
import { Company, OperationEntry, Payment, PaymentStatus, Language, ClientCredential, ClientHistory, Staff, TaxType, CompanyStatus, RiskLevel, KPIRule } from '../types';
import { translations } from '../lib/translations';
import StatusBadge from './StatusBadge';
import { fetchDocuments, fetchCredentials, fetchClientHistory, logCredentialAccess, fetchKPIRules, fetchCompanyKPIRules, upsertCompanyKPIRule } from '../lib/supabaseData';
import { supabase } from '../lib/supabaseClient';
import { X, Shield, History, FileText, Lock, Globe, Building, Building2, Download, Eye, EyeOff, Users, DollarSign, AlertTriangle, MapPin, Briefcase, Database, Key, User, Send, Check, Calculator, Trash2, Plus, ChevronRight, ArrowRight, Pencil, Save, Loader2, Phone } from 'lucide-react';

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
  }, [company?.id, company?.login, company?.password]);

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
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] transition-opacity" onClick={onClose}></div>
      <div className="fixed right-0 top-0 h-full w-full max-w-[850px] z-[101] overflow-y-auto overflow-x-hidden animate-in slide-in-from-right duration-300 flex flex-col shadow-2xl" style={{ background: 'var(--surface-2)' }}>
        <div className="dashboard-card shrink-0 z-20 shadow-md !rounded-none !border-0 !border-b border-[var(--border)] relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'var(--primary)' }}></div>
          <div className="p-6 flex justify-between items-start">
            <div className="flex gap-5 items-start">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl text-white font-black shrink-0 shadow-md transition-transform hover:scale-105" style={{ background: `linear-gradient(135deg, var(--primary), var(--primary-dark))` }}>
                {company.name.charAt(0)}
              </div>
              <div className="flex flex-col gap-1.5 pt-1">
                <h2 className="text-2xl font-black uppercase tracking-tight leading-none" style={{ color: 'var(--text)' }}>{company.name}</h2>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="c1-badge" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>INN: {company.inn}</span>
                  <span className="c1-badge" style={{ background: 'var(--primary-ghost)', color: 'var(--primary)' }}>{company.taxType}</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl transition-all shadow-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }} onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'var(--danger-light)'; e.currentTarget.style.borderColor = 'var(--danger)'; }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
              <X size={20} />
            </button>
          </div>
          <div className="flex px-6 overflow-x-auto gap-2 pb-5">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 transition-all font-bold text-[11px] uppercase tracking-widest whitespace-nowrap rounded-lg border`}
                style={activeTab === tab.id ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' } : { background: 'var(--surface-2)', color: 'var(--text-2)', borderColor: 'var(--border)' }}
              >
                <div className="shrink-0">{React.cloneElement(tab.icon as React.ReactElement, { size: 14 })}</div>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 flex-1 space-y-6">
          {activeTab === 'pasport' && (
            <div className="space-y-6 animate-fade-in pb-10">
              <div className="dashboard-card p-6 border-l-4" style={{ borderLeftColor: 'var(--primary)' }}>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors shadow-sm" style={{ background: 'var(--primary-ghost)', color: 'var(--primary)' }}>
                    <User size={20} />
                  </div>
                  <h4 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>Direktor / Rahbar</h4>
                </div>
                <div className="pl-14">
                  <p className="text-xl font-black uppercase tracking-tight leading-none" style={{ color: 'var(--text)' }}>{company.directorName || '—'}</p>
                  <p className="text-[12px] font-bold uppercase mt-3 tracking-widest tabular-nums flex items-center gap-2" style={{ color: 'var(--primary)' }}>
                    <Phone size={14} /> {company.directorPhone || 'MALUMOT YOQ'}
                  </p>
                </div>
              </div>

              <div className="dashboard-card p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors shadow-sm" style={{ background: 'var(--warning-light)', color: 'var(--warning)' }}>
                    <MapPin size={20} />
                  </div>
                  <h4 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>Yuridik Manzil</h4>
                </div>
                <div className="pl-14">
                  <p className="text-[13px] font-bold uppercase tracking-tight leading-relaxed" style={{ color: 'var(--text)' }}>{company.legalAddress || 'Manzil ko\'rsatilmagan'}</p>
                </div>
              </div>

              <div className="dashboard-card overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-3">
                    <FileText size={18} style={{ color: 'var(--text-3)' }} />
                    <h4 className="text-[11px] font-bold uppercase tracking-widest leading-none" style={{ color: 'var(--text)' }}>Arxiv Hujjatlari</h4>
                  </div>
                  <span className="c1-badge" style={{ background: 'var(--primary-ghost)', color: 'var(--primary)' }}>{documents.length} FAYL</span>
                </div>
                {isLoadingDocs ? (
                  <div className="p-10 flex flex-col items-center justify-center">
                    <div className="animate-spin w-8 h-8 border-3 border-t-transparent rounded-full mb-4" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }}></div>
                    <p className="text-[11px] font-bold uppercase tracking-widest leading-none" style={{ color: 'var(--text-3)' }}>Yuklanmoqda...</p>
                  </div>
                ) : documents.length > 0 ? (
                  <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                    {documents.slice(0, 5).map((doc, i) => (
                      <div key={i} className="flex items-center justify-between p-5 transition-colors group hover:bg-[var(--primary-ghost)]">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors shadow-sm" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                                <FileText size={16} />
                            </div>
                            <span className="text-[13px] font-bold truncate pr-4 uppercase tracking-tight transition-colors" style={{ color: 'var(--text)' }}>{doc.file_name}</span>
                        </div>
                        <a href={doc.file_url} target="_blank" rel="noreferrer" className="w-10 h-10 flex items-center justify-center rounded-lg shrink-0 transition-all shadow-sm" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }} onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.background = 'var(--primary-ghost)'; }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.background = 'var(--surface-2)'; }}>
                          <Download size={18} />
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-16 text-center text-[12px] font-bold uppercase tracking-[0.3em]" style={{ color: 'var(--text-3)' }}>
                    Hujjatlar topilmadi
                  </div>
                )}
              </div>

              {/* Service Scope in Passport */}
              <div className="dashboard-card overflow-hidden">
                <div className="px-5 py-4 flex items-center gap-3" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  <Check size={18} style={{ color: 'var(--text-3)' }} />
                  <h4 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text)' }}>Xizmatlar & Operatsiyalar</h4>
                </div>
                <div className="p-6">
                  <div className="flex flex-wrap gap-2 mb-6">
                    {company.serviceScope?.length ? company.serviceScope.map(s => (
                      <span key={s} className="c1-badge" style={{ background: 'var(--success-light)', color: 'var(--success)' }}>{s}</span>
                    )) : company.activeServices?.length ? company.activeServices.slice(0, 8).map(s => (
                      <span key={s} className="c1-badge" style={{ background: 'var(--primary-ghost)', color: 'var(--primary)' }}>{s.replace('_', ' ')}</span>
                    )) : (
                      <p className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-50" style={{ color: 'var(--text-3)' }}>Xizmatlar tanlanmagan</p>
                    )}
                    {company.activeServices && company.activeServices.length > 8 && (
                      <span className="text-[10px] font-bold flex items-center px-1 uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>+{company.activeServices.length - 8} YANA</span>
                    )}
                  </div>
                  <button
                    onClick={() => setActiveTab('xizmatlar')}
                    className="w-full py-3 rounded-lg text-[11px] font-bold uppercase tracking-[0.2em] transition-all shadow-sm flex items-center justify-center gap-2"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'var(--primary-ghost)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface-2)'; }}
                  >
                    BARCHASINI KO'RISH
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'soliq' && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-2 gap-4">
                <div className="dashboard-card p-5">
                  <h4 className="text-[11px] font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--text-3)' }}>1C Server & Baza</h4>
                  <div className="space-y-3 text-[12px]">
                    <p className="font-bold uppercase tracking-tight" style={{ color: 'var(--text-2)' }}>Server ID: <span style={{ color: 'var(--primary)' }}>{company.serverInfo || '—'}</span></p>
                    {company.serverName && (
                      <p className="font-bold uppercase tracking-tight" style={{ color: 'var(--text-2)' }}>Server Nomi: <span style={{ color: 'var(--success)' }}>{company.serverName}</span></p>
                    )}
                    <p className="font-bold uppercase tracking-tight" style={{ color: 'var(--text-3)' }}>Baza: {company.baseName1c || '—'}</p>
                  </div>
                </div>
                <div className={`dashboard-card p-5 flex items-center gap-4 transition-colors`} style={{ background: company.itParkResident ? 'var(--primary-ghost)' : 'var(--surface)', borderColor: company.itParkResident ? 'var(--primary)' : 'var(--border)' }}>
                  <Shield size={24} className="shrink-0" style={{ color: company.itParkResident ? 'var(--primary)' : 'var(--text-3)' }} />
                  <span className="text-[13px] font-black uppercase tracking-widest" style={{ color: company.itParkResident ? 'var(--primary)' : 'var(--text-3)' }}>IT Park Rezidenti</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="dashboard-card p-5">
                  <h4 className="text-[11px] font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--text-3)' }}>Statistika Hisobotlari</h4>
                  <div className="flex flex-wrap gap-2">
                    {company.statReports?.length ? company.statReports.map(s => (
                      <span key={s} className="c1-badge" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>{s}</span>
                    )) : <p className="text-[11px] font-bold uppercase tracking-widest opacity-50" style={{ color: 'var(--text-3)' }}>belgilanmagan</p>}
                  </div>
                </div>

                <div className="dashboard-card p-5">
                  <h4 className="text-[11px] font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--text-3)' }}>Majburiy Hisobotlar</h4>
                  <div className="flex flex-wrap gap-2">
                    {company.requiredReports?.length ? company.requiredReports.map(r => (
                      <span key={r} className="c1-badge" style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>{r}</span>
                    )) : <p className="text-[11px] font-bold uppercase tracking-widest opacity-50" style={{ color: 'var(--text-3)' }}>belgilanmagan</p>}
                  </div>
                </div>

                <div className="dashboard-card p-5 col-span-1 md:col-span-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--text-3)' }}>Xizmatlar Ko'lami (Scope)</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {company.serviceScope?.length ? company.serviceScope.map(s => (
                      <div key={s} className="flex items-center gap-2 p-2 rounded-lg transition-colors" style={{ background: 'var(--primary-ghost)', color: 'var(--primary)' }}>
                        <Check size={14} className="shrink-0" />
                        <span className="text-[10px] font-bold uppercase truncate tracking-tight">{s}</span>
                      </div>
                    )) : (
                      <div className="col-span-full py-8 text-center rounded-lg border border-dashed transition-colors" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                        <p className="text-[11px] font-bold uppercase tracking-widest opacity-50" style={{ color: 'var(--text-3)' }}>Xizmatlar tanlanmagan</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="dashboard-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Database size={16} style={{ color: 'var(--text-3)' }} />
                  <h4 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>1C Holati</h4>
                </div>
                <div className="flex flex-wrap gap-3">
                  {['cloud', 'local', 'server', 'none'].map(status => (
                    <button key={status} className={`px-4 py-2 rounded-lg border font-bold text-[11px] uppercase transition-all tracking-widest shadow-sm`} style={company.oneCStatus === status ? { background: 'var(--primary)', borderColor: 'var(--primary)', color: '#fff' } : { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-2)' }}>
                      {status === 'cloud' ? '☁️ Cloud' : status === 'local' ? '💻 Local' : status === 'server' ? '🖥️ Server' : '❌ Yo\'q'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'loginlar' && (
            <div className="space-y-4 animate-fade-in">
              <div className="bg-white dark:bg-[#22252B] p-4 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] shadow-sm transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Globe size={12} className="text-gray-400" />
                    <h4 className="text-[10px] font-bold text-gray-800 dark:text-white uppercase tracking-widest">Soliq.uz (Asosiy)</h4>
                  </div>
                  {isEditingMainLogin ? (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => {
                          setIsEditingMainLogin(false);
                          setTempLogin(company.login || '');
                          setTempPassword(company.password || '');
                        }}
                        className="px-2.5 py-1 text-[8px] font-bold text-gray-400 uppercase rounded-sm border border-[#DEE2E6] hover:bg-[#F8F9FA] dark:hover:bg-[#1e2025] transition-all"
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
                        className="px-2.5 py-1 bg-[#28A745] hover:bg-[#218838] text-white text-[8px] font-bold uppercase rounded-sm border border-[#218838] transition-all shadow-sm"
                      >
                        Saqlash
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsEditingMainLogin(true)}
                      className="px-2.5 py-1 bg-[#F8F9FA] dark:bg-[#1e2025] hover:bg-[#F2F7FF] dark:hover:bg-[#2A2D33] text-[8px] font-bold text-gray-500 dark:text-gray-400 uppercase rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] transition-all hover:text-[#3366CC]"
                    >
                      Tahrirlash
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Login</p>
                    {isEditingMainLogin ? (
                      <input
                        type="text"
                        className="w-full bg-[#FAFAFA] dark:bg-[#111318] p-1.5 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] font-mono text-[11px] uppercase outline-none focus:border-[#3366CC] transition-colors"
                        value={tempLogin}
                        onChange={(e) => setTempLogin(e.target.value)}
                      />
                    ) : (
                      <p className="text-[11px] font-mono font-bold text-gray-800 dark:text-white uppercase bg-[#F8F9FA] dark:bg-[#1e2025] p-1.5 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] transition-colors">{company.login || '—'}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Parol</p>
                    <div className="relative">
                      {isEditingMainLogin ? (
                        <input
                          type="text"
                          className="w-full bg-[#FAFAFA] dark:bg-[#111318] p-1.5 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] font-mono text-[11px] outline-none focus:border-[#3366CC] transition-colors"
                          value={tempPassword}
                          onChange={(e) => setTempPassword(e.target.value)}
                        />
                      ) : (
                        <div className="flex items-center justify-between bg-[#F8F9FA] dark:bg-[#1e2025] p-1.5 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] transition-colors">
                          <p className="text-[11px] font-mono font-bold text-gray-800 dark:text-white tracking-widest leading-none">
                            {showPasswords['main'] ? company.password || '—' : '••••••••'}
                          </p>
                          <button onClick={() => setShowPasswords(prev => ({ ...prev, main: !prev.main }))} className="text-gray-400 hover:text-[#3366CC] transition-all">
                            {showPasswords['main'] ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-[#22252B] rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] shadow-sm overflow-hidden transition-colors">
                <div className="bg-[#F8F9FA] dark:bg-[#1e2025] px-3 py-2 flex items-center justify-between border-b border-[#DEE2E6] dark:border-[#3A3D44]">
                  <h4 className="text-[9px] font-bold text-gray-800 dark:text-white uppercase tracking-widest">Qo'shimcha Kirish Ma'lumotlari</h4>
                  <button
                    onClick={() => setIsAddingCredential(true)}
                    className="flex items-center gap-1 text-[8px] font-bold text-[#3366CC] uppercase py-1 px-2.5 bg-[#F2F7FF] dark:bg-[#1C2531] rounded-sm border border-[#DEE2E6] hover:bg-white transition-all shadow-sm"
                  >
                    <Plus size={10} /> Yangi Qo'shish
                  </button>
                </div>

                {isAddingCredential && (
                  <div className="p-3 border-b border-[#DEE2E6] dark:border-[#3A3D44] bg-[#F2F7FF]/50 dark:bg-[#1C2531]/30 transition-colors">
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="col-span-2">
                        <label className="text-[8px] font-bold text-gray-400 uppercase mb-1 block tracking-widest">Xizmat nomi (Didox, Bank...)</label>
                        <input
                          type="text"
                          className="w-full bg-white dark:bg-[#111318] p-1.5 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] text-[11px] font-bold outline-none focus:border-[#3366CC] transition-colors"
                          value={newCred.serviceName}
                          onChange={e => setNewCred({ ...newCred, serviceName: e.target.value })}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[8px] font-bold text-gray-400 uppercase block tracking-widest whitespace-nowrap">Login</label>
                        <input
                          type="text"
                          className="w-full bg-white dark:bg-[#111318] p-1.5 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] font-mono text-[11px] uppercase outline-none focus:border-[#3366CC] transition-colors"
                          value={newCred.loginId}
                          onChange={e => setNewCred({ ...newCred, loginId: e.target.value })}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[8px] font-bold text-gray-400 uppercase block tracking-widest whitespace-nowrap">Parol</label>
                        <input
                          type="text"
                          className="w-full bg-white dark:bg-[#111318] p-1.5 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] font-mono text-[11px] outline-none focus:border-[#3366CC] transition-colors"
                          value={newCred.password}
                          onChange={e => setNewCred({ ...newCred, password: e.target.value })}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[8px] font-bold text-gray-400 uppercase mb-1 block tracking-widest">Izoh</label>
                        <input
                          type="text"
                          className="w-full bg-white dark:bg-[#111318] p-1.5 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] text-[11px] font-bold outline-none focus:border-[#3366CC] transition-colors"
                          value={newCred.notes}
                          onChange={e => setNewCred({ ...newCred, notes: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 text-[8px] uppercase font-bold">
                      <button onClick={() => setIsAddingCredential(false)} className="px-2.5 py-1 text-gray-400 hover:text-gray-600 transition-colors uppercase tracking-widest">Bekor qilish</button>
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
                        className="px-2.5 py-1 bg-[#3366CC] text-white rounded-sm border border-[#3366CC] disabled:opacity-50 shadow-sm transition-all"
                      >
                        Qo'shish
                      </button>
                    </div>
                  </div>
                )}

                <div className="divide-y divide-[#DEE2E6] dark:divide-[#3A3D44]">
                  {credentials.map((cred) => (
                    <div key={cred.id} className="p-3 hover:bg-[#F2F7FF] dark:hover:bg-[#2A2D33] transition-colors relative group/cred">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <Key size={10} className="text-gray-400" />
                          <p className="text-[10px] font-bold text-gray-800 dark:text-white uppercase tracking-tight">{cred.serviceName}</p>
                        </div>
                        <button
                          onClick={() => {
                            if (confirm(`${cred.serviceName} o'chirilsinmi?`)) {
                              supabase.from('client_credentials').delete().eq('id', cred.id).then(() => {
                                setCredentials(prev => prev.filter(c => c.id !== cred.id));
                              });
                            }
                          }}
                          className="p-1 text-gray-400 hover:text-[#DC3545] hover:bg-[#FEEBF0] rounded-sm opacity-0 group-hover/cred:opacity-100 transition-all"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mt-1">
                        <div className="bg-[#F8F9FA] dark:bg-[#111318] p-1.5 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] transition-colors">
                          <p className="text-[8px] font-bold text-gray-400 uppercase mb-0.5 tracking-widest">Login</p>
                          <p className="font-mono text-[11px] font-bold text-gray-800 dark:text-gray-200 uppercase truncate leading-none mt-1">{cred.loginId || '—'}</p>
                        </div>
                        <div className="bg-[#F8F9FA] dark:bg-[#111318] p-1.5 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] flex justify-between items-center transition-colors">
                          <div className="flex-1 min-w-0 pr-2">
                            <p className="text-[8px] font-bold text-gray-400 uppercase mb-0.5 tracking-widest">Parol</p>
                            <p className="font-mono text-[11px] font-bold text-gray-800 dark:text-gray-200 tracking-widest leading-none mt-1">{showPasswords[cred.id] ? cred.encryptedPassword || '—' : '••••••••'}</p>
                          </div>
                          <button onClick={() => handleShowPassword(cred.id, company.id)} className="text-gray-400 hover:text-[#3366CC] transition-all shrink-0">
                            {showPasswords[cred.id] ? <EyeOff size={11} /> : <Eye size={11} />}
                          </button>
                        </div>
                      </div>
                      {cred.notes && <p className="text-[9px] font-bold text-gray-400 mt-2 uppercase tracking-tight italic opacity-70">Izoh: {cred.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'jamoa' && (
            <div className="space-y-4 animate-fade-in">
              <div className="bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm shadow-sm overflow-hidden transition-colors">
                <div className="bg-[#F8F9FA] dark:bg-[#1e2025] px-3 py-2 flex items-center justify-between border-b border-[#DEE2E6] dark:border-[#3A3D44]">
                  <h4 className="text-[9px] font-bold text-gray-800 dark:text-white uppercase tracking-widest">Amaldagi Jamoa</h4>
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
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-[#DEE2E6] bg-[#F8F9FA] dark:bg-[#1e2025] text-gray-500 dark:text-gray-400 text-[8px] font-bold uppercase transition-all hover:text-[#3366CC] hover:bg-[#F2F7FF]"
                    >
                      <Pencil size={10} /> Tahrirlash
                    </button>
                  )}
                  {isEditingJamoa && (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setIsEditingJamoa(false)}
                        className="px-2.5 py-1 rounded-sm border border-[#DEE2E6] bg-[#F8F9FA] dark:bg-[#1e2025] text-gray-400 text-[8px] font-bold uppercase transition-all"
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
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-[#218838] bg-[#28A745] hover:bg-[#218838] text-white text-[8px] font-bold uppercase transition-all shadow-sm disabled:opacity-50"
                      >
                        {isSavingJamoa ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />} Saqlash
                      </button>
                    </div>
                  )}
                </div>

                {assignmentsError && (
                  <div className="m-3 p-3 rounded-sm border border-[#FFEEBA] bg-[#FFF3CD] text-[#856404]">
                    <p className="text-[9px] font-bold uppercase tracking-widest leading-none">contract_assignments xatoligi</p>
                    <p className="text-[9px] uppercase mt-1 opacity-80">{assignmentsError}</p>
                  </div>
                )}

                {!isEditingJamoa ? (
                  <div className="divide-y divide-[#DEE2E6] dark:divide-[#3A3D44]">
                    {(() => {
                      const displayedAssignments = assignments.length > 0 ? assignments : teamFallbackAssignments();
                      return displayedAssignments.length > 0 ? displayedAssignments.map((asgn: any) => {
                        const member = staff.find(s => s.id === asgn.user_id);
                        return (
                          <div key={asgn.id} className="p-3 flex items-center justify-between hover:bg-[#F2F7FF] dark:hover:bg-[#2A2D33] transition-colors group">
                            <div className="flex gap-3 items-center">
                              <div className="w-8 h-8 rounded-sm bg-[#F8F9FA] dark:bg-[#1e2025] border border-[#DEE2E6] dark:border-[#3A3D44] flex items-center justify-center text-gray-400 text-[10px] font-bold shrink-0 transition-colors uppercase">
                                {member?.name?.charAt(0) || '?'}
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <p className="text-[11px] font-bold text-gray-800 dark:text-gray-200 uppercase tracking-tight">{member?.name || 'Mavjud emas'}</p>
                                <p className="text-[8px] font-bold text-[#3366CC] tracking-widest uppercase opacity-70">{asgn.role.replace(/_/g, ' ')}</p>
                              </div>
                            </div>
                            <div className="text-right flex flex-col gap-1">
                              <span className="px-2 py-0.5 bg-white dark:bg-black/20 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] text-[9px] font-bold text-gray-600 dark:text-gray-300 whitespace-nowrap shadow-sm">
                                {asgn.salary_type === 'percent' ? `${asgn.salary_value}%` : `${asgn.salary_value?.toLocaleString()} so'm`}
                              </span>
                              {asgn.start_date && <p className="text-[8px] text-gray-400 font-bold uppercase tracking-tight">Sana: {new Date(asgn.start_date).toLocaleDateString()}</p>}
                            </div>
                          </div>
                        );
                      }) : (
                        <div className="p-8 text-center bg-[#F8F9FA] dark:bg-[#111318] transition-colors">
                          <Users size={20} className="mx-auto mb-2 text-gray-300" />
                          <p className="text-[9px] font-bold uppercase text-gray-400 tracking-widest opacity-50">Jamoa a'zolari tayinlanmagan</p>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="p-3 bg-[#F2F7FF]/30 dark:bg-[#1C2531]/20 space-y-3 transition-colors">
                    {editAssignments.map((asgn, idx) => {
                      const roleLabels: Record<string, string> = {
                        accountant: 'Buxgalter', controller: 'Nazoratchi', bank_manager: 'Bank Menejer', chief_accountant: 'Bosh Buxgalter'
                      };
                      return (
                        <div key={asgn.role} className="p-3 bg-white dark:bg-[#22252B] rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] space-y-2.5 shadow-sm transition-colors">
                          <p className="text-[8px] font-bold text-[#3366CC] dark:text-[#4D80E6] uppercase tracking-widest">{roleLabels[asgn.role] || asgn.role.replace(/_/g, ' ')}</p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="sm:col-span-2">
                              <label className="text-[8px] font-bold text-gray-400 uppercase block mb-1 tracking-widest">Xodim</label>
                              <select
                                value={asgn.userId || ''}
                                onChange={e => setEditAssignments(prev => prev.map((a, i) => i === idx ? { ...a, userId: e.target.value } : a))}
                                className="w-full bg-[#FAFAFA] dark:bg-[#111318] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm px-2 py-1.5 text-[10px] font-bold uppercase outline-none focus:border-[#3366CC] transition-colors"
                              >
                                <option value="">— Tanlanmagan —</option>
                                {staff.map(s => <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>)}
                              </select>
                            </div>
                            <div className="flex flex-col">
                              <label className="text-[8px] font-bold text-gray-400 uppercase block mb-1 tracking-widest whitespace-nowrap">
                                {asgn.salaryType === 'percent' ? 'Foiz (%)' : 'Summa (so\'m)'}
                              </label>
                              <div className="flex border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm overflow-hidden shadow-sm transition-colors">
                                <input
                                  type="number"
                                  value={asgn.salaryValue}
                                  onChange={e => setEditAssignments(prev => prev.map((a, i) => i === idx ? { ...a, salaryValue: Number(e.target.value) } : a))}
                                  className="w-full bg-[#FAFAFA] dark:bg-[#111318] px-2 py-1.5 text-[10px] font-bold outline-none"
                                />
                                <button
                                  onClick={() => setEditAssignments(prev => prev.map((a, i) => i === idx ? { ...a, salaryType: a.salaryType === 'percent' ? 'fixed' : 'percent' } : a))}
                                  className="px-2 py-1.5 bg-[#F8F9FA] dark:bg-[#1e2025] text-[8px] font-bold uppercase text-gray-500 shrink-0 border-l border-[#DEE2E6] dark:border-[#3A3D44] hover:bg-[#F2F7FF] transition-all hover:text-[#3366CC]"
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
                <div className="bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm shadow-sm overflow-hidden transition-colors">
                  <div className="bg-[#F8F9FA] dark:bg-[#1e2025] px-3 py-2 border-b border-[#DEE2E6] dark:border-[#3A3D44]">
                    <h4 className="text-[9px] font-bold text-gray-800 dark:text-white uppercase tracking-widest">Tayinlovlar Tarixi</h4>
                  </div>
                  <div className="divide-y divide-[#DEE2E6] dark:divide-[#3A3D44] max-h-[250px] overflow-y-auto">
                    {clientHistory.filter(h => h.changeType === 'assign_role' || h.changeType === 'remove_role').map((h, i) => (
                      <div key={i} className="flex gap-2.5 p-2.5 hover:bg-[#F8F9FA] dark:hover:bg-[#2A2D33] transition-colors group">
                        <div className={`mt-0.5 w-6 h-6 rounded-sm shrink-0 flex items-center justify-center border transition-colors ${h.changeType === 'assign_role' ? 'bg-[#EBFBF0] text-[#28A745] border-[#DEE2E6]' : 'bg-[#FEEBF0] text-[#DC3545] border-[#DEE2E6]'}`}>
                          {h.changeType === 'assign_role' ? <Check size={10} /> : <X size={10} />}
                        </div>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <p className="text-[10px] font-bold text-gray-700 dark:text-gray-300 uppercase truncate pr-2 tracking-tight leading-tight">{h.notes || 'Rol o\'zgarishi'}</p>
                          <p className="text-[8px] text-gray-400 font-bold uppercase tracking-widest opacity-60 leading-none mt-0.5">{new Date(h.changedAt).toLocaleString()} • {h.changedByName || 'Tizim'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'shartnoma' && (
            <div className="space-y-6 animate-fade-in px-2">
              <div className="grid grid-cols-2 gap-4">
                {company.internalContractor && (
                  <div className="col-span-2 dashboard-card p-5 !shadow-sm flex items-center justify-between" style={{ background: 'var(--primary-ghost)' }}>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-widest mb-1.5 opacity-70" style={{ color: 'var(--primary)' }}>Ichki Pudratchi (Ijrochi)</p>
                      <div className="flex items-center gap-3">
                        <Building2 size={16} style={{ color: 'var(--primary)' }} />
                        <p className="text-[14px] font-black uppercase tracking-tight" style={{ color: 'var(--text)' }}>{company.internalContractor}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="dashboard-card p-5 !shadow-sm">
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-3)' }}>Shartnoma Raqami</p>
                  <p className="text-[13px] font-black uppercase tracking-tight" style={{ color: 'var(--text)' }}>{company.contractNumber || '—'}</p>
                </div>
                <div className="dashboard-card p-5 !shadow-sm">
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-3)' }}>Sana</p>
                  <p className="text-[13px] font-black uppercase tracking-tight" style={{ color: 'var(--text)' }}>{company.contractDate || '—'}</p>
                </div>
              </div>

              <div className="dashboard-card overflow-hidden !shadow-sm">
                <div className="p-5 text-center" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest mb-5" style={{ color: 'var(--text-3)' }}>Moliyaviy Holat</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>Xizmat Narxi</p>
                      <p className="text-[18px] font-black tabular-nums tracking-tight leading-none" style={{ color: 'var(--text)' }}>{company.contractAmount?.toLocaleString()} <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>so'm</span></p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>Joriy Balans</p>
                      <p className={`text-[18px] font-black tabular-nums tracking-tight leading-none uppercase`} style={{ color: (company.currentBalance || 0) < 0 ? '#ff6b6b' : '#34d058' }}>
                        {(company.currentBalance || 0).toLocaleString()} <span className="text-[9px] font-bold uppercase tracking-widest">so'm</span>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-5">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest mb-4 opacity-70" style={{ color: 'var(--text-3)' }}>Kaskadli Taqsimot (Oylik prognozi)</h4>
                  <div className="divide-y rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)', divideColor: 'var(--border)' }}>
                    {[
                      { label: 'Bosh Buxgalter', perc: company.chiefAccountantPerc || 0, sum: company.chiefAccountantSum, type: 'head' },
                      { label: 'Nazoratchi', perc: company.supervisorPerc || 0, type: 'sup' },
                      { label: 'Bank Klient', perc: company.bankClientPerc || 0, sum: company.bankClientSum, type: 'bank' },
                      { label: 'Buxgalter', perc: company.accountantPerc || 0, type: 'acc' }
                    ].map((item, i) => {
                      const amount = company.contractAmount || 0;
                      const val = item.sum || (amount * (item.perc / 100));
                      return (
                        <div key={i} className="flex items-center justify-between p-3.5 transition-colors group hover:bg-[var(--surface-2)]" style={{ background: 'var(--surface)' }}>
                          <span className="text-[11px] font-bold uppercase tracking-tight" style={{ color: 'var(--text)' }}>{item.label}</span>
                          <div className="text-right flex items-center gap-4">
                            <p className="text-[9px] font-bold px-2 py-1 rounded-md border uppercase tracking-tight" style={{ color: 'var(--text-3)', background: 'var(--surface-2)', borderColor: 'var(--border)' }}>{item.sum ? 'Fiks.' : `${item.perc}%`}</p>
                            <p className="text-[13px] font-black tabular-nums tracking-tight uppercase leading-none" style={{ color: 'var(--text)' }}>{val.toLocaleString()} <span className="text-[9px] font-bold opacity-70 uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>UZS</span></p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-4 flex items-center justify-between p-4 rounded-xl shadow-sm" style={{ background: 'rgba(52, 208, 88, 0.1)', border: '1px solid rgba(52, 208, 88, 0.2)' }}>
                    <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: '#34d058' }}>Kompaniya Qoldig'i</span>
                    <span className="text-[14px] font-black tabular-nums tracking-tight uppercase leading-none" style={{ color: '#34d058' }}>
                      {((company.contractAmount || 0) - (
                        (company.chiefAccountantSum || ((company.contractAmount || 0) * (company.chiefAccountantPerc || 0) / 100)) +
                        (company.supervisorPerc ? (company.contractAmount || 0) * company.supervisorPerc / 100 : 0) +
                        (company.bankClientSum || ((company.contractAmount || 0) * (company.bankClientPerc || 0) / 100)) +
                        ((company.contractAmount || 0) * (company.accountantPerc || 0) / 100)
                      )).toLocaleString()} <span className="text-[10px] font-bold">UZS</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'xizmatlar' && (
            <div className="space-y-6 animate-fade-in px-2">
              <div className="dashboard-card p-5 !shadow-sm">
                <div className="flex items-center justify-between mb-5 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-3">
                    <Check size={16} style={{ color: 'var(--text-3)' }} />
                    <h4 className="text-[11px] font-black uppercase tracking-widest leading-none mt-0.5" style={{ color: 'var(--text)' }}>Aktiv Xizmatlar</h4>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        if (onSave) {
                          const allKeys = ['didox', 'xatlar', 'avtokameral', 'my_mehnat', 'one_c', 'pul_oqimlari', 'chiqadigan_soliqlar', 'hisoblangan_oylik', 'debitor_kreditor', 'foyda_va_zarar', 'tovar_ostatka', 'yer_soligi', 'mol_mulk_soligi', 'suv_soligi', 'bonak', 'aksiz_soligi', 'nedro_soligi', 'norezident_foyda', 'norezident_nds', 'aylanma_qqs', 'daromad_soliq', 'inps', 'foyda_soliq', 'moliyaviy_natija', 'buxgalteriya_balansi', 'stat_12_invest', 'stat_12_moliya', 'stat_12_korxona', 'stat_12_narx', 'stat_4_invest', 'stat_4_mehnat', 'stat_4_korxona_miz', 'stat_4_kb_qur_sav_xiz', 'stat_4_kb_sanoat', 'stat_1_invest', 'stat_1_ih', 'stat_1_energiya', 'stat_1_korxona', 'stat_1_korxona_tif', 'stat_1_moliya', 'stat_1_akt', 'itpark_oylik', 'itpark_chorak', 'kom_suv', 'kom_gaz', 'kom_svet'];
                          onSave({ ...company, activeServices: allKeys });
                        }
                      }}
                      className="px-3 py-2 text-[9px] font-black rounded-lg transition-all uppercase tracking-widest shadow-sm"
                      style={{ color: '#34d058', background: 'rgba(52, 208, 88, 0.1)', border: '1px solid rgba(52, 208, 88, 0.2)' }}
                    >
                      Hammasini yoqish
                    </button>
                    <button
                      onClick={() => {
                        if (onSave) onSave({ ...company, activeServices: [] });
                      }}
                      className="px-3 py-2 text-[9px] font-black rounded-lg transition-all uppercase tracking-widest shadow-sm"
                      style={{ color: '#ff6b6b', background: 'rgba(255, 107, 107, 0.1)', border: '1px solid rgba(255, 107, 107, 0.2)' }}
                    >
                      Hammasini o'chirish
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-y-3 gap-x-6 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                  {[
                    { key: 'didox', label: 'Didox / E-Docs' },
                    { key: 'xatlar', label: 'E-Xat / Soliq Xat' },
                    { key: 'avtokameral', label: 'Avtokameral Oylik' },
                    { key: 'my_mehnat', label: 'My Mehnat / HR' },
                    { key: 'one_c', label: '1C Buxgalteriya' },
                    { key: 'pul_oqimlari', label: 'Pul oqimlari (DDS)' },
                    { key: 'chiqadigan_soliqlar', label: 'To\'lanadigan Soliqlar' },
                    { key: 'hisoblangan_oylik', label: 'Hisoblangan Ish Haqi' },
                    { key: 'debitor_kreditor', label: 'Debitor & Kreditor' },
                    { key: 'foyda_va_zarar', label: 'Foyda va Zarar (P&L)' },
                    { key: 'tovar_ostatka', label: 'Tovar Qoldiqlari' },
                    { key: 'aylanma_qqs', label: 'Aylanma / QQS (Monthly)' },
                    { key: 'daromad_soliq', label: 'Daromad Solig\'i / INPS' },
                    { key: 'foyda_soliq', label: 'Foyda Solig\'i (Quarterly)' },
                    { key: 'yer_soligi', label: 'Yer Solig\'i' },
                    { key: 'mol_mulk_soligi', label: 'Mol-Mulk Solig\'i' },
                    { key: 'stat_12_moliya', label: 'Stat 12-Moliya' },
                    { key: 'stat_12_korxona', label: 'Stat 12-Korxona' },
                    { key: 'stat_4_mehnat', label: 'Stat 4-Mehnat' },
                    { key: 'itpark_oylik', label: 'IT Park Oylik' },
                    { key: 'itpark_chorak', label: 'IT Park Chorak' }
                  ].map(service => {
                    const isActive = company.activeServices?.includes(service.key);
                    return (
                      <label key={service.key} className="flex items-center gap-3 group cursor-pointer transition-all hover:bg-[var(--surface-2)] p-2 rounded-xl border border-transparent" onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}>
                        <div className="relative flex items-center justify-center">
                          <input
                            type="checkbox"
                            className="peer appearance-none w-5 h-5 border rounded-md transition-all cursor-pointer shadow-sm"
                            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                            checked={isActive}
                            onChange={() => {
                              if (!onSave) return;
                              const current = company.activeServices || [];
                              const updated = isActive ? current.filter(k => k !== service.key) : [...current, service.key];
                              onSave({ ...company, activeServices: updated });
                            }}
                          />
                          <div className="absolute inset-0 rounded-md pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" style={{ background: 'var(--primary)' }}></div>
                          <Check size={12} className="absolute text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none z-10" />
                        </div>
                        <span className={`text-[10px] font-bold uppercase tracking-tight transition-colors`} style={{ color: isActive ? 'var(--text)' : 'var(--text-3)' }}>
                          {service.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'kpi' && (
            <div className="space-y-6 animate-fade-in px-2">
              {isLoadingKpi ? (
                <div className="dashboard-card p-10 flex flex-col items-center justify-center transition-colors">
                  <div className="animate-spin w-8 h-8 border-3 border-t-transparent rounded-full mb-4" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }}></div>
                  <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>KPI ma'lumotlari yuklanmoqda...</p>
                </div>
              ) : (
                <div className="dashboard-card p-5 !shadow-sm">
                  <div className="flex items-center gap-3 mb-5 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
                    <Calculator size={16} style={{ color: 'var(--text-3)' }} />
                    <h4 className="text-[11px] font-black uppercase tracking-widest mt-0.5 leading-none" style={{ color: 'var(--text)' }}>Mijoz KPI Soblamalari (Override)</h4>
                  </div>

                  <div className="space-y-4">
                    {kpiRules.map(rule => {
                      const compRule = companyKpiRules.find(cr => cr.ruleId === rule.id);
                      const isSaving = isSavingKpi === rule.id;
                      const currentReward = compRule?.rewardPercent ?? '';
                      const currentPenalty = compRule?.penaltyPercent ?? '';

                      return (
                        <div key={rule.id} className="p-4 rounded-xl border transition-all group hover:shadow-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                          <div className="flex justify-between items-start mb-4">
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-black uppercase tracking-tight" style={{ color: 'var(--text)' }}>{rule.nameUz}</p>
                              <div className="flex items-center gap-3 mt-1.5">
                                <span className="text-[9px] font-bold uppercase tracking-tight opacity-70" style={{ color: 'var(--text-3)' }}>{rule.role}</span>
                                <span className="px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest border" style={{
                                  background: rule.category === 'automation' ? 'rgba(77, 163, 255, 0.1)' : 'rgba(255, 215, 0, 0.1)',
                                  color: rule.category === 'automation' ? '#4da3ff' : '#ffd700',
                                  borderColor: rule.category === 'automation' ? 'rgba(77, 163, 255, 0.2)' : 'rgba(255, 215, 0, 0.2)'
                                }}>
                                  {rule.category}
                                </span>
                              </div>
                            </div>
                            <div className="ml-5 text-right">
                              <p className="text-[9px] font-bold uppercase tracking-tight" style={{ color: 'var(--text-3)' }}>Standart</p>
                              <p className="text-[10px] font-black tracking-tight mt-0.5" style={{ color: 'var(--primary)' }}>+{rule.rewardPercent}/-{rule.penaltyPercent}%</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 mt-4">
                            <div className="flex items-center gap-3 p-2 rounded-lg border transition-colors shadow-sm" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                              <label className="text-[9px] font-black uppercase tracking-widest whitespace-nowrap pl-2" style={{ color: '#34d058' }}>Bonus %:</label>
                              <input
                                type="number"
                                step="0.1"
                                disabled={isSaving}
                                placeholder="Standart"
                                className="flex-1 bg-transparent border-none outline-none text-[11px] font-black font-mono uppercase transition-colors disabled:opacity-50"
                                style={{ color: 'var(--text)' }}
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
                            <div className="flex items-center gap-3 p-2 rounded-lg border transition-colors shadow-sm" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                              <label className="text-[9px] font-black uppercase tracking-widest whitespace-nowrap pl-2" style={{ color: '#ff6b6b' }}>Jarima %:</label>
                              <input
                                type="number"
                                step="0.1"
                                disabled={isSaving}
                                placeholder="Standart"
                                className="flex-1 bg-transparent border-none outline-none text-[11px] font-black font-mono uppercase transition-colors disabled:opacity-50"
                                style={{ color: 'var(--text)' }}
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
                      )
                    })}

                    {kpiRules.length === 0 && (
                      <div className="p-10 text-center rounded-xl border border-dashed transition-colors" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                        <AlertTriangle size={24} className="mx-auto mb-3" style={{ color: 'var(--text-3)' }} />
                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-50" style={{ color: 'var(--text-3)' }}>Hech qanday KPI qoidasi topilmadi</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CompanyDrawer;
