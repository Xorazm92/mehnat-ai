import React, { useState, useEffect } from 'react';
import { Company, OperationEntry, Payment, PaymentStatus, Language, ClientCredential, ClientHistory, Staff, TaxType, CompanyStatus, RiskLevel } from '../types';
import { translations } from '../lib/translations';
import StatusBadge from './StatusBadge';
import { fetchDocuments, fetchCredentials, fetchClientHistory, logCredentialAccess } from '../lib/supabaseData';
import { supabase } from '../lib/supabaseClient';
import { X, Shield, History, FileText, Lock, Globe, Building, Download, Eye, EyeOff, Users, DollarSign, AlertTriangle, MapPin, Briefcase, Database, Key, User, Send, Check, Calculator, Trash2 } from 'lucide-react';

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

type TabId = 'pasport' | 'soliq' | 'loginlar' | 'jamoa' | 'shartnoma' | 'xavf';

const CompanyDrawer: React.FC<DrawerProps> = ({ company, operation, payments, staff = [], lang, userId, onClose, onSave }) => {
  const t = translations[lang];
  const [documents, setDocuments] = useState<any[]>([]);
  const [credentials, setCredentials] = useState<ClientCredential[]>([]);
  const [clientHistory, setClientHistory] = useState<ClientHistory[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<TabId>('pasport');

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
            </div>
          )}

          {activeTab === 'soliq' && (
            <div className="space-y-6 animate-fade-in">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">1C Server & Baza</h4>
                  <div className="space-y-2">
                    <p className="text-sm font-black text-slate-700 dark:text-white">Server: <span className="text-apple-accent">{company.serverInfo || '—'}</span></p>
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
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Xizmatlar Ko'lami</h4>
                  <div className="flex flex-wrap gap-2">
                    {company.serviceScope?.length ? company.serviceScope.map(s => (
                      <span key={s} className="px-2.5 py-1 bg-apple-accent/10 text-[10px] font-black rounded-lg text-apple-accent">{s}</span>
                    )) : <p className="text-xs text-slate-300">belgilanmagan</p>}
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
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Globe size={16} className="text-apple-accent" />
                    <h4 className="text-sm font-black text-slate-700 dark:text-white">Soliq.uz (Asosiy)</h4>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Login</p>
                    <p className="text-sm font-mono font-bold text-slate-700 dark:text-slate-200">{company.login || '—'}</p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Parol</p>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-mono font-bold text-slate-700 dark:text-slate-200">
                        {showPasswords['main'] ? company.password || '—' : '••••••••'}
                      </p>
                      <button onClick={() => setShowPasswords(prev => ({ ...prev, main: !prev.main }))} className="text-slate-300">
                        {showPasswords['main'] ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {credentials.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Qo'shimcha Kirish Ma'lumotlari</h4>
                  {credentials.map((cred) => (
                    <div key={cred.id} className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder group relative">
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
                        <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl">
                          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Login</p>
                          <p className="text-sm font-mono font-bold text-slate-700 dark:text-slate-200">{cred.loginId || '—'}</p>
                        </div>
                        <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl">
                          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Parol</p>
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-mono font-bold text-slate-700 dark:text-slate-200">
                              {showPasswords[cred.id] ? cred.encryptedPassword || '—' : '••••••••'}
                            </p>
                            <button onClick={() => handleShowPassword(cred.id, company.id)} className="text-slate-300">
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
              )}
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
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Moliyaviy Holat</h4>
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Xizmat Narxi</p>
                    <p className="text-2xl font-black text-apple-accent">{contractAmount.toLocaleString()} so'm</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Joriy Balans</p>
                    <p className={`text-2xl font-black ${(company.currentBalance || 0) < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {(company.currentBalance || 0).toLocaleString()} so'm
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                <div className="flex items-center gap-3 mb-4">
                  <Calculator size={16} className="text-apple-accent" />
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Taqsimot</h4>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-bold">Firma Ulushi:</span>
                    <span className="font-black text-slate-700 dark:text-white">{firmaShare.toLocaleString()} so'm ({(company.firmaSharePercent || 50)}%)</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-bold">Buxgalter Ulushi:</span>
                    <span className="font-black text-slate-700 dark:text-white">{buxgalterShare.toLocaleString()} so'm ({(company.accountantPerc || 20)}%)</span>
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
        </div >
      </div >
    </>
  );
};

export default CompanyDrawer;
