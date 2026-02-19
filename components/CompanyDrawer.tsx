import React, { useState, useEffect } from 'react';
import { Company, OperationEntry, Payment, PaymentStatus, Language, ClientCredential, ClientHistory, Staff, TaxType, CompanyStatus, RiskLevel, KPIRule } from '../types';
import { translations } from '../lib/translations';
import StatusBadge from './StatusBadge';
import { fetchDocuments, fetchCredentials, fetchClientHistory, logCredentialAccess, fetchKPIRules, fetchCompanyKPIRules, upsertCompanyKPIRule } from '../lib/supabaseData';
import { supabase } from '../lib/supabaseClient';
import { X, Shield, History, FileText, Lock, Globe, Building, Building2, Download, Eye, EyeOff, Users, DollarSign, AlertTriangle, MapPin, Briefcase, Database, Key, User, Send, Check, Calculator, Trash2, Plus, ChevronRight, ArrowRight } from 'lucide-react';

interface DrawerProps {
  company: Company | null;
  operation: OperationEntry | null;
  payments: Payment[];
  staff?: Staff[];
  lang: Language;
  userId?: string;
  onClose: () => void;
  onSave?: (company: Company) => void;
}

type TabId = 'pasport' | 'soliq' | 'loginlar' | 'jamoa' | 'shartnoma' | 'xavf' | 'xizmatlar' | 'kpi';

const CompanyDrawer: React.FC<DrawerProps> = ({ company, operation, payments, staff = [], lang, userId, onClose, onSave }) => {
  const t = translations[lang];
  const [documents, setDocuments] = useState<any[]>([]);
  const [credentials, setCredentials] = useState<ClientCredential[]>([]);
  const [clientHistory, setClientHistory] = useState<ClientHistory[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<TabId>('pasport');
  const [isEditingMainLogin, setIsEditingMainLogin] = useState(false);
  const [isAddingCredential, setIsAddingCredential] = useState(false);
  const [newCred, setNewCred] = useState({ serviceName: '', loginId: '', password: '', notes: '' });
  const [tempLogin, setTempLogin] = useState(company.login || '');
  const [tempPassword, setTempPassword] = useState(company.password || '');
  const [kpiRules, setKpiRules] = useState<KPIRule[]>([]);
  const [companyKpiRules, setCompanyKpiRules] = useState<any[]>([]);
  const [isSavingKpi, setIsSavingKpi] = useState<string | null>(null); // ruleId of saving item
  const [isLoadingKpi, setIsLoadingKpi] = useState(false);


  useEffect(() => {
    if (company) {
      setIsLoadingDocs(true);
      Promise.all([
        fetchDocuments(company.id),
        fetchCredentials(company.id),
        fetchClientHistory(company.id),
        supabase.from('contract_assignments').select('*').eq('client_id', company.id)
      ]).then(([docs, creds, history, assRes]) => {
        setDocuments(docs);
        setCredentials(creds);
        setClientHistory(history);
        setAssignments(assRes.data || []);
        setIsLoadingDocs(false);
      });

      // Fetch KPI Data
      setIsLoadingKpi(true);
      Promise.all([
        fetchKPIRules(),
        fetchCompanyKPIRules(company.id)
      ]).then(([rules, compRules]) => {
        setKpiRules(rules);
        setCompanyKpiRules(compRules);
        setIsLoadingKpi(false);
      });

    }
  }, [company]);

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
    { id: 'pasport', label: '📄 Pasport', icon: <Building size={16} /> },
    { id: 'soliq', label: '⚖️ Soliq', icon: <Briefcase size={16} /> },
    { id: 'loginlar', label: '🔐 Loginlar', icon: <Lock size={16} /> },
    { id: 'jamoa', label: '👥 Jamoa', icon: <Users size={16} /> },
    { id: 'shartnoma', label: '💰 Shartnoma', icon: <DollarSign size={16} /> },
    { id: 'xavf', label: '⚠️ Xavf', icon: <AlertTriangle size={16} /> },
    { id: 'xizmatlar', label: '🛠️ Xizmatlar', icon: <Check size={16} /> },
    { id: 'kpi', label: '📊 KPI', icon: <Calculator size={16} /> },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] transition-opacity animate-fade-in" onClick={onClose}></div>
      <div className="fixed right-0 top-0 h-full w-full max-w-3xl bg-slate-50 dark:bg-apple-darkBg shadow-[-20px_0_50px_rgba(0,0,0,0.2)] z-[101] overflow-y-auto scrollbar-thin overflow-x-hidden" style={{ animation: 'slideLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}>
        <div className="bg-white dark:bg-apple-darkCard border-b border-apple-border dark:border-apple-darkBorder sticky top-0 z-10">
          <div className="p-6 md:p-8 flex justify-between items-start">
            <div className="flex items-center gap-5">
              <div className="h-16 w-16 bg-apple-accent rounded-2xl flex items-center justify-center text-2xl text-white font-black shadow-lg">
                {company.name.charAt(0)}
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight leading-none mb-2">{company.name}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 bg-slate-100 dark:bg-white/5 rounded-lg text-[10px] font-black text-slate-500 font-mono">INN: {company.inn}</span>
                  <span className="px-2.5 py-1 bg-apple-accent/10 rounded-lg text-[10px] font-black text-apple-accent uppercase">{company.taxType}</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-3 bg-slate-50 dark:bg-white/5 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-500 rounded-xl text-slate-400 transition-all">
              <X size={20} strokeWidth={3} />
            </button>
          </div>
          <div className="flex px-6 overflow-x-auto scrollbar-none border-t border-apple-border dark:border-apple-darkBorder">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-4 border-b-2 transition-all font-black text-[10px] uppercase tracking-widest whitespace-nowrap ${activeTab === tab.id ? 'border-apple-accent text-apple-accent' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 md:p-8 space-y-6">
          {activeTab === 'pasport' && (
            <div className="space-y-6 animate-fade-in">
              <div className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                <div className="flex items-center gap-3 mb-4">
                  <User size={16} className="text-apple-accent" />
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Direktor</h4>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-black text-slate-800 dark:text-white">{company.directorName || '—'}</p>
                    <p className="text-sm font-bold text-slate-400">{company.directorPhone || 'Telefon ko\'rsatilmagan'}</p>
                  </div>
                </div>
              </div>
              <div className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                <div className="flex items-center gap-3 mb-4">
                  <MapPin size={16} className="text-apple-accent" />
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Yuridik Manzil</h4>
                </div>
                <p className="text-base font-bold text-slate-700 dark:text-slate-200">{company.legalAddress || 'Manzil ko\'rsatilmagan'}</p>
              </div>
              <div className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <FileText size={16} className="text-apple-accent" />
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Hujjatlar</h4>
                  </div>
                  <span className="text-[10px] font-black text-slate-300">{documents.length} fayl</span>
                </div>
                {isLoadingDocs ? (
                  <p className="text-sm text-slate-400 animate-pulse">Yuklanmoqda...</p>
                ) : documents.length > 0 ? (
                  <div className="space-y-2">
                    {documents.slice(0, 5).map((doc, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-white/5 rounded-xl">
                        <span className="text-sm font-bold text-slate-600 dark:text-slate-300 truncate">{doc.file_name}</span>
                        <a href={doc.file_url} target="_blank" rel="noreferrer" className="text-apple-accent hover:text-blue-600">
                          <Download size={16} />
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-300">Hujjatlar mavjud emas</p>
                )}
              </div>

              {/* Service Scope in Passport */}
              <div className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                <div className="flex items-center gap-3 mb-4">
                  <Check size={16} className="text-apple-accent" />
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Xizmatlar Ko'lami</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {company.serviceScope?.length ? company.serviceScope.map(s => (
                    <span key={s} className="px-3 py-1.5 bg-emerald-500/10 text-emerald-600 text-[10px] font-black rounded-lg uppercase border border-emerald-500/10">{s}</span>
                  )) : (
                    <p className="text-xs font-bold text-slate-300">Xizmatlar tanlanmagan</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'soliq' && (
            <div className="space-y-6 animate-fade-in">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">1C Server & Baza</h4>
                  <div className="space-y-2">
                    <p className="text-sm font-black text-slate-700 dark:text-white">Server ID: <span className="text-apple-accent">{company.serverInfo || '—'}</span></p>
                    {company.serverName && (
                      <p className="text-sm font-black text-slate-700 dark:text-white">Server Nomi: <span className="text-emerald-500">{company.serverName}</span></p>
                    )}
                    <p className="text-xs font-bold text-slate-400">Baza: {company.baseName1c || '—'}</p>
                  </div>
                </div>
                <div className={`p-5 rounded-2xl border flex items-center gap-3 ${company.itParkResident ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-500' : 'bg-slate-50 dark:bg-white/5 border-apple-border dark:border-apple-darkBorder text-slate-400'}`}>
                  <Shield size={20} />
                  <span className="text-xs font-black uppercase">IT Park Rezidenti</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Statistika Hisobotlari</h4>
                  <div className="flex flex-wrap gap-2">
                    {company.statReports?.length ? company.statReports.map(s => (
                      <span key={s} className="px-2.5 py-1 bg-slate-100 dark:bg-white/5 text-[10px] font-black rounded-lg text-slate-500">{s}</span>
                    )) : <p className="text-xs text-slate-300">belgilanmagan</p>}
                  </div>
                </div>

                <div className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Majburiy Hisobotlar</h4>
                  <div className="flex flex-wrap gap-2">
                    {company.requiredReports?.length ? company.requiredReports.map(r => (
                      <span key={r} className="px-2.5 py-1 bg-rose-500/10 text-[10px] font-black rounded-lg text-rose-500">{r}</span>
                    )) : <p className="text-xs text-slate-300">belgilanmagan</p>}
                  </div>
                </div>

                <div className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder col-span-1 md:col-span-2">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Xizmatlar Ko'lami (Scope)</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {company.serviceScope?.length ? company.serviceScope.map(s => (
                      <div key={s} className="flex items-center gap-2 px-3 py-2 bg-apple-accent/5 border border-apple-accent/10 text-apple-accent rounded-xl">
                        <Check size={12} className="shrink-0" />
                        <span className="text-[10px] font-black uppercase truncate">{s}</span>
                      </div>
                    )) : (
                      <div className="col-span-full py-4 text-center border-2 border-dashed border-apple-border dark:border-apple-darkBorder rounded-2xl">
                        <p className="text-xs font-bold text-slate-300 tracking-tight">Xizmatlar tanlanmagan</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                <div className="flex items-center gap-3 mb-4">
                  <Database size={16} className="text-apple-accent" />
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">1C Holati</h4>
                </div>
                <div className="flex flex-wrap gap-3">
                  {['cloud', 'local', 'server', 'none'].map(status => (
                    <div key={status} className={`px-4 py-2 rounded-xl font-black text-xs uppercase ${company.oneCStatus === status ? 'bg-apple-accent text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-400'}`}>
                      {status === 'cloud' ? '☁️ Cloud' : status === 'local' ? '💻 Local' : status === 'server' ? '🖥️ Server' : '❌ Yo\'q'}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'loginlar' && (
            <div className="space-y-6 animate-fade-in">
              <div className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <Globe size={16} className="text-apple-accent" />
                    <h4 className="text-sm font-black text-slate-700 dark:text-white">Soliq.uz (Asosiy)</h4>
                  </div>
                  {isEditingMainLogin ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setIsEditingMainLogin(false);
                          setTempLogin(company.login || '');
                          setTempPassword(company.password || '');
                        }}
                        className="px-3 py-1.5 text-[10px] font-black text-slate-400 uppercase hover:text-slate-600 transition-colors"
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
                        className="px-4 py-1.5 bg-apple-accent text-white text-[10px] font-black uppercase rounded-lg shadow-lg shadow-blue-500/10 hover:bg-blue-600 transition-all font-bold"
                      >
                        Saqlash
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsEditingMainLogin(true)}
                      className="px-3 py-1.5 bg-slate-50 dark:bg-white/5 text-[10px] font-black text-slate-400 uppercase rounded-lg hover:text-apple-accent hover:bg-apple-accent/5 transition-all"
                    >
                      Tahrirlash
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                    <p className="text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Login</p>
                    {isEditingMainLogin ? (
                      <input
                        type="text"
                        className="w-full bg-white dark:bg-apple-darkBg p-2 rounded-lg border border-apple-border dark:border-apple-darkBorder font-mono text-sm font-bold outline-none focus:ring-2 focus:ring-apple-accent/20"
                        value={tempLogin}
                        onChange={(e) => setTempLogin(e.target.value)}
                      />
                    ) : (
                      <p className="text-sm font-mono font-bold text-slate-700 dark:text-slate-200 ml-1">{company.login || '—'}</p>
                    )}
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                    <p className="text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Parol</p>
                    <div className="flex items-center justify-between">
                      {isEditingMainLogin ? (
                        <input
                          type="text"
                          className="w-full bg-white dark:bg-apple-darkBg p-2 rounded-lg border border-apple-border dark:border-apple-darkBorder font-mono text-sm font-bold outline-none focus:ring-2 focus:ring-apple-accent/20"
                          value={tempPassword}
                          onChange={(e) => setTempPassword(e.target.value)}
                        />
                      ) : (
                        <>
                          <p className="text-sm font-mono font-bold text-slate-700 dark:text-slate-200 ml-1">
                            {showPasswords['main'] ? company.password || '—' : '••••••••'}
                          </p>
                          <button onClick={() => setShowPasswords(prev => ({ ...prev, main: !prev.main }))} className="text-slate-300 hover:text-apple-accent transition-colors">
                            {showPasswords['main'] ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between ml-1">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Qo'shimcha Kirish Ma'lumotlari</h4>
                  <button
                    onClick={() => setIsAddingCredential(true)}
                    className="flex items-center gap-1.5 text-[10px] font-black text-apple-accent uppercase py-1 px-3 bg-apple-accent/5 rounded-full hover:bg-apple-accent/10 transition-all"
                  >
                    <Plus size={12} /> Yangi Qo'shish
                  </button>
                </div>

                {isAddingCredential && (
                  <div className="p-5 bg-slate-50 dark:bg-apple-darkCard rounded-2xl border-2 border-dashed border-apple-accent/30 animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="col-span-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">Xizmat nomi (Masalan: Didox, Bank-Klient)</label>
                        <input
                          type="text"
                          placeholder="Xizmat nomi..."
                          className="w-full bg-white dark:bg-apple-darkBg p-3 rounded-xl border border-apple-border dark:border-apple-darkBorder font-bold text-sm outline-none focus:ring-2 focus:ring-apple-accent/20 transition-all"
                          value={newCred.serviceName}
                          onChange={e => setNewCred({ ...newCred, serviceName: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">Login</label>
                        <input
                          type="text"
                          placeholder="Login..."
                          className="w-full bg-white dark:bg-apple-darkBg p-3 rounded-xl border border-apple-border dark:border-apple-darkBorder font-mono font-bold text-sm outline-none focus:ring-2 focus:ring-apple-accent/20 transition-all"
                          value={newCred.loginId}
                          onChange={e => setNewCred({ ...newCred, loginId: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">Parol</label>
                        <input
                          type="text"
                          placeholder="Parol..."
                          className="w-full bg-white dark:bg-apple-darkBg p-3 rounded-xl border border-apple-border dark:border-apple-darkBorder font-mono font-bold text-sm outline-none focus:ring-2 focus:ring-apple-accent/20 transition-all"
                          value={newCred.password}
                          onChange={e => setNewCred({ ...newCred, password: e.target.value })}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">Izoh (ixtiyoriy)</label>
                        <textarea
                          placeholder="Tahlillar, kalitlar va h.k..."
                          className="w-full bg-white dark:bg-apple-darkBg p-3 rounded-xl border border-apple-border dark:border-apple-darkBorder font-medium text-xs outline-none focus:ring-2 focus:ring-apple-accent/20 transition-all resize-none"
                          rows={2}
                          value={newCred.notes}
                          onChange={e => setNewCred({ ...newCred, notes: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setIsAddingCredential(false)}
                        className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase hover:text-slate-600 transition-colors"
                      >
                        Bekor qilish
                      </button>
                      <button
                        disabled={!newCred.serviceName || !newCred.loginId}
                        onClick={async () => {
                          const { data, error } = await supabase.from('client_credentials').insert({
                            company_id: company.id,
                            service_name: newCred.serviceName,
                            login_id: newCred.loginId,
                            encrypted_password: newCred.password,
                            notes: newCred.notes,
                            updated_by: (await supabase.auth.getUser()).data.user?.id
                          }).select();

                          if (data) {
                            setCredentials(prev => [...prev, ...data.map(d => ({
                              id: d.id,
                              companyId: d.company_id,
                              serviceName: d.service_name,
                              loginId: d.login_id,
                              encryptedPassword: d.encrypted_password,
                              notes: d.notes
                            }))]);
                            setIsAddingCredential(false);
                            setNewCred({ serviceName: '', loginId: '', password: '', notes: '' });
                          }
                        }}
                        className="px-6 py-2 bg-apple-accent text-white text-[10px] font-black uppercase rounded-xl shadow-lg shadow-blue-500/10 hover:bg-blue-600 transition-all disabled:opacity-50"
                      >
                        Qo'shish
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {credentials.map((cred) => (
                    <div key={cred.id} className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder group relative hover:border-apple-accent/30 transition-all">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <Key size={16} className="text-apple-accent" />
                          <p className="text-sm font-black text-slate-700 dark:text-white uppercase tracking-tight">{cred.serviceName}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (confirm(`${cred.serviceName} ma'lumotlarini o'chirishni tasdiqlaysizmi?`)) {
                                supabase.from('client_credentials').delete().eq('id', cred.id).then(() => {
                                  setCredentials(prev => prev.filter(c => c.id !== cred.id));
                                });
                              }
                            }}
                            className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl border border-apple-border dark:border-apple-darkBorder">
                          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Login</p>
                          <p className="text-sm font-mono font-bold text-slate-700 dark:text-slate-200 truncate">{cred.loginId || '—'}</p>
                        </div>
                        <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl border border-apple-border dark:border-apple-darkBorder">
                          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Parol</p>
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-mono font-bold text-slate-700 dark:text-slate-200">
                              {showPasswords[cred.id] ? cred.encryptedPassword || '—' : '••••••••'}
                            </p>
                            <button onClick={() => handleShowPassword(cred.id, company.id)} className="text-slate-300 hover:text-apple-accent transition-colors">
                              {showPasswords[cred.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                        </div>
                      </div>
                      {cred.notes && (
                        <div className="mt-4 pt-4 border-t border-apple-border dark:border-apple-darkBorder">
                          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Izoh</p>
                          <p className="text-[11px] font-medium text-slate-500">{cred.notes}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'jamoa' && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 ml-1">Amaldagi Jamoa</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {assignments.length > 0 ? assignments.map(asgn => {
                    const member = staff.find(s => s.id === asgn.user_id);
                    return (
                      <div key={asgn.id} className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                          <Users size={40} />
                        </div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">{asgn.role.toUpperCase().replace('_', ' ')}</p>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 bg-slate-100 dark:bg-white/5 rounded-xl flex items-center justify-center text-apple-accent font-black">
                            {member?.name?.charAt(0) || '?'}
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-800 dark:text-white">{member?.name || 'Mavjud emas'}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">
                              {asgn.salary_type === 'percent' ? `${asgn.salary_value}%` : `${asgn.salary_value?.toLocaleString()} so'm`}
                            </p>
                          </div>
                        </div>
                        {asgn.start_date && (
                          <div className="mt-4 pt-4 border-t border-apple-border dark:border-apple-darkBorder flex items-center justify-between">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Tayinlangan sana:</span>
                            <span className="text-[9px] font-black text-slate-500">{new Date(asgn.start_date).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                    );
                  }) : (
                    <div className="col-span-2 p-10 text-center bg-white dark:bg-apple-darkCard rounded-2xl border border-dashed border-apple-border dark:border-apple-darkBorder">
                      <Users size={32} className="mx-auto mb-3 text-slate-300" />
                      <p className="text-sm font-bold text-slate-400">Jamoa a'zolari tayinlanmagan</p>
                    </div>
                  )}
                </div>
              </div>

              {clientHistory.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 ml-1">Tayinlovlar Tarixi</h4>
                  <div className="space-y-3">
                    {clientHistory.filter(h => h.changeType === 'assign_role' || h.changeType === 'remove_role').map((h, i) => (
                      <div key={i} className="flex items-center gap-4 p-4 bg-white dark:bg-apple-darkCard rounded-xl border border-apple-border dark:border-apple-darkBorder">
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${h.changeType === 'assign_role' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                          {h.changeType === 'assign_role' ? <Check size={14} /> : <X size={14} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-700 dark:text-white truncate">
                            {h.notes || 'Rol o\'zgarishi'}
                          </p>
                          <p className="text-[10px] text-slate-400 font-medium">
                            {new Date(h.changedAt).toLocaleString()} • {h.changedByName || 'Tizim'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'shartnoma' && (
            <div className="space-y-6 animate-fade-in">
              <div className="grid grid-cols-2 gap-4">
                {company.internalContractor && (
                  <div className="p-5 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 col-span-2">
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Ichki Pudratchi (Ijrochi)</p>
                    <div className="flex items-center gap-3">
                      <Building2 size={24} className="text-indigo-500" />
                      <p className="text-xl font-black text-indigo-600 dark:text-indigo-400">{company.internalContractor}</p>
                    </div>
                  </div>
                )}

                <div className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Shartnoma Raqami</p>
                  <p className="text-sm font-black text-slate-800 dark:text-white">{company.contractNumber || '—'}</p>
                </div>
                <div className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Sana</p>
                  <p className="text-sm font-black text-slate-800 dark:text-white">{company.contractDate || '—'}</p>
                </div>
              </div>

              <div className="p-6 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder overflow-hidden relative">
                <div className="absolute -right-6 -top-6 h-24 w-24 bg-apple-accent/5 rounded-full" />
                <h4 className="text-xs font-black text-slate-400 upper tracking-widest mb-6">Moliyaviy Holat</h4>
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Xizmat Narxi</p>
                    <p className="text-2xl font-black text-apple-accent">{company.contractAmount?.toLocaleString()} so'm</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Joriy Balans</p>
                    <p className={`text-2xl font-black ${(company.currentBalance || 0) < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {(company.currentBalance || 0).toLocaleString()} so'm
                    </p>
                  </div>
                </div>

                <div className="mt-8 pt-8 border-t border-slate-100 dark:border-white/5">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Kaskadli Taqsimot (Oylik prognozi)</h4>
                  <div className="space-y-3">
                    {/* Calculation: Head 7%, Controller 5%, Bank 5%, Accountant 20% */}
                    {[
                      { label: 'Bosh Buxgalter (Yorqinoy)', perc: company.chiefAccountantPerc || 0, sum: company.chiefAccountantSum, type: 'head' },
                      { label: 'Nazoratchi', perc: company.supervisorPerc || 0, type: 'sup' },
                      { label: 'Bank Klient', perc: company.bankClientPerc || 0, sum: company.bankClientSum, type: 'bank' },
                      { label: 'Buxgalter', perc: company.accountantPerc || 0, type: 'acc' }
                    ].map((item, i) => {
                      const amount = company.contractAmount || 0;
                      const val = item.sum || (amount * (item.perc / 100));
                      return (
                        <div key={i} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-white/5 rounded-xl">
                          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{item.label}</span>
                          <div className="text-right">
                            <p className="text-sm font-black text-slate-800 dark:text-white">{val.toLocaleString()} so'm</p>
                            <p className="text-[10px] text-slate-400">{item.sum ? 'Fikslangan' : `${item.perc}% ulush`}</p>
                          </div>
                        </div>
                      )
                    })}
                    <div className="flex items-center justify-between p-3 bg-emerald-500/10 rounded-xl mt-2 border border-emerald-500/20">
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Kompaniya Qoldig'i</span>
                      <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                        {((company.contractAmount || 0) - (
                          (company.chiefAccountantSum || ((company.contractAmount || 0) * (company.chiefAccountantPerc || 0) / 100)) +
                          (company.supervisorPerc ? (company.contractAmount || 0) * company.supervisorPerc / 100 : 0) +
                          (company.bankClientSum || ((company.contractAmount || 0) * (company.bankClientPerc || 0) / 100)) +
                          ((company.contractAmount || 0) * (company.accountantPerc || 0) / 100)
                        )).toLocaleString()} so'm
                      </span>
                    </div>
                  </div>
                </div>
              </div>


            </div>
          )}

          {activeTab === 'xavf' && operation && (
            <div className="space-y-6 animate-fade-in">
              <div className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Kompaniya Holati</h4>
                <div className="flex flex-wrap gap-3">
                  {Object.values(CompanyStatus).map(status => (
                    <div key={status} className={`px-4 py-2 rounded-xl font-black text-xs uppercase ${(company.companyStatus || 'active') === status ? 'bg-apple-accent text-white shadow-lg' : 'bg-slate-100 dark:bg-white/5 text-slate-400'}`}>
                      {status}
                    </div>
                  ))}
                </div>
              </div>
              <div className={`p-6 rounded-2xl border ${riskBadge.color}`}>
                <div className="flex items-center gap-4">
                  <span className="text-4xl">{riskBadge.emoji}</span>
                  <div>
                    <h4 className="text-lg font-black">{riskBadge.text}</h4>
                    <p className="text-sm font-medium opacity-70">AI xavf darajasi</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'xizmatlar' && (
            <div className="space-y-6 animate-fade-in">
              <div className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <Check size={16} className="text-apple-accent" />
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Aktiv Xizmatlar</h4>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (onSave) {
                          const allKeys = ['didox', 'xatlar', 'avtokameral', 'my_mehnat', 'one_c', 'pul_oqimlari', 'chiqadigan_soliqlar', 'hisoblangan_oylik', 'debitor_kreditor', 'foyda_va_zarar', 'tovar_ostatka', 'yer_soligi', 'mol_mulk_soligi', 'suv_soligi', 'bonak', 'aksiz_soligi', 'nedro_soligi', 'norezident_foyda', 'norezident_nds', 'aylanma_qqs', 'daromad_soliq', 'inps', 'foyda_soliq', 'moliyaviy_natija', 'buxgalteriya_balansi', 'stat_12_invest', 'stat_12_moliya', 'stat_12_korxona', 'stat_12_narx', 'stat_4_invest', 'stat_4_mehnat', 'stat_4_korxona_miz', 'stat_4_kb_qur_sav_xiz', 'stat_4_kb_sanoat', 'stat_1_invest', 'stat_1_ih', 'stat_1_energiya', 'stat_1_korxona', 'stat_1_korxona_tif', 'stat_1_moliya', 'stat_1_akt', 'itpark_oylik', 'itpark_chorak', 'kom_suv', 'kom_gaz', 'kom_svet'];
                          onSave({ ...company, activeServices: allKeys });
                        }
                      }}
                      className="px-3 py-1.5 text-[10px] font-black text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-all uppercase"
                    >
                      Hammasini yoqish
                    </button>
                    <button
                      onClick={() => {
                        if (onSave) onSave({ ...company, activeServices: [] });
                      }}
                      className="px-3 py-1.5 text-[10px] font-black text-rose-500 bg-rose-50 rounded-lg hover:bg-rose-100 transition-all uppercase"
                    >
                      Hammasini o'chirish
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mb-4">Yoqilmagan xizmatlar Operatsiyalar jadvalida kulrang (bloklangan) bo'lib ko'rsatiladi. Bo'sh ro'yxat = hammasi yoqilgan.</p>
                {[
                  { group: 'Oylik', keys: ['didox', 'xatlar', 'avtokameral', 'my_mehnat', 'one_c', 'pul_oqimlari', 'chiqadigan_soliqlar', 'hisoblangan_oylik', 'debitor_kreditor', 'foyda_va_zarar', 'tovar_ostatka'], color: 'blue' },
                  { group: 'Soliqlar', keys: ['yer_soligi', 'mol_mulk_soligi', 'suv_soligi', 'bonak', 'aksiz_soligi', 'nedro_soligi', 'norezident_foyda', 'norezident_nds'], color: 'orange' },
                  { group: 'Soliq H/T', keys: ['aylanma_qqs', 'daromad_soliq', 'inps', 'foyda_soliq'], color: 'purple' },
                  { group: 'Yillik', keys: ['moliyaviy_natija', 'buxgalteriya_balansi'], color: 'green' },
                  { group: 'Statistika', keys: ['stat_12_invest', 'stat_12_moliya', 'stat_12_korxona', 'stat_12_narx', 'stat_4_invest', 'stat_4_mehnat', 'stat_4_korxona_miz', 'stat_4_kb_qur_sav_xiz', 'stat_4_kb_sanoat', 'stat_1_invest', 'stat_1_ih', 'stat_1_energiya', 'stat_1_korxona', 'stat_1_korxona_tif', 'stat_1_moliya', 'stat_1_akt'], color: 'cyan' },
                  { group: 'IT Park', keys: ['itpark_oylik', 'itpark_chorak'], color: 'violet' },
                  { group: 'Komunalka', keys: ['kom_suv', 'kom_gaz', 'kom_svet'], color: 'rose' },
                ].map(section => (
                  <div key={section.group} className="mb-4">
                    <h5 className={`text-[10px] font-black uppercase tracking-widest mb-2 text-${section.color}-600`}>{section.group}</h5>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
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
                          <label key={key} className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all ${isChecked ? `bg-${section.color}-50 dark:bg-${section.color}-950/20 border-${section.color}-200 dark:border-${section.color}-800` : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-50'}`}>
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
                              className="rounded accent-blue-600"
                            />
                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate">{labels[key] || key}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}


          {activeTab === 'kpi' && (
            <div className="space-y-6 animate-fade-in">
              <div className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                <div className="flex items-center gap-3 mb-6">
                  <Calculator size={16} className="text-apple-accent" />
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">KPI Sozlamalari (Kompaniya uchun maxsus)</h4>
                </div>

                <div className="space-y-4">
                  {isLoadingKpi ? (
                    <div className="flex flex-col items-center justify-center py-10 opacity-50">
                      <div className="w-8 h-8 border-4 border-apple-accent border-t-transparent rounded-full animate-spin mb-4"></div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Yuklanmoqda...</p>
                    </div>
                  ) : (
                    <div className="space-y-8">
                      {['automation', 'manual'].map(category => (
                        <div key={category} className="space-y-4">
                          <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <span className="w-4 h-[1px] bg-apple-accent"></span>
                            {category === 'automation' ? "Operatsiyalar (Avtomatik)" : "Nazoratchi Vazifalari (Qo'lda)"}
                          </h5>
                          {kpiRules.filter(r => r.category === category).map(rule => {
                            const compRule = companyKpiRules.find(r => r.ruleId === rule.id);
                            const currentReward = compRule?.rewardPercent ?? '';
                            const currentPenalty = compRule?.penaltyPercent ?? '';
                            const hasOverride = compRule && (compRule.rewardPercent !== null || compRule.penaltyPercent !== null);

                            return (
                              <div key={rule.id} className={`p-4 rounded-xl border transition-all ${hasOverride ? 'bg-apple-accent/5 border-apple-accent/20' : 'bg-slate-50 dark:bg-white/5 border-apple-border dark:border-apple-darkBorder'}`}>
                                <div className="flex items-center justify-between mb-3">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-black text-slate-800 dark:text-white">{rule.nameUz}</p>
                                      {isSavingKpi === rule.id && <div className="w-2 h-2 bg-apple-accent rounded-full animate-pulse"></div>}
                                    </div>
                                    <p className="text-[10px] text-slate-400 uppercase font-black">{rule.role}</p>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <div className="text-right">
                                      <p className="text-[10px] text-slate-400 font-bold">Global Standart</p>
                                      <div className="flex gap-2 justify-end">
                                        <span className="text-xs font-bold text-emerald-500">+{rule.rewardPercent}%</span>
                                        <span className="text-xs font-bold text-rose-500">{rule.penaltyPercent}%</span>
                                      </div>
                                    </div>
                                    {hasOverride && (
                                      <button
                                        onClick={async () => {
                                          if (!window.confirm('Haqiqatan ham ushbu qoidani standart qiymatga qaytarmoqchimisiz?')) return;
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
                                        className="p-2 hover:bg-rose-500/10 text-rose-500 rounded-lg transition-colors"
                                        title="Standartga qaytarish"
                                      >
                                        <History size={14} />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="text-[10px] font-black text-emerald-600 uppercase mb-1 block">Bonus (%)</label>
                                    <input
                                      type="number"
                                      step="0.1"
                                      placeholder={`Global: ${rule.rewardPercent}`}
                                      className="w-full bg-white dark:bg-apple-darkBg p-2 rounded-lg border border-apple-border dark:border-apple-darkBorder font-mono font-bold text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
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
                                  <div>
                                    <label className="text-[10px] font-black text-rose-500 uppercase mb-1 block">Jarima (%)</label>
                                    <input
                                      type="number"
                                      step="0.1"
                                      placeholder={`Global: ${rule.penaltyPercent}`}
                                      className="w-full bg-white dark:bg-apple-darkBg p-2 rounded-lg border border-apple-border dark:border-apple-darkBorder font-mono font-bold text-sm outline-none focus:ring-2 focus:ring-rose-500/20"
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
