import React, { useState, useEffect } from 'react';
import { Company, OperationEntry, Payment, PaymentStatus, Language, ClientCredential, ClientHistory, Staff, TaxRegime, CompanyStatus, RiskLevel, OneCStatus, CredentialService } from '../types';
import { translations } from '../lib/translations';
import StatusBadge from './StatusBadge';
import { fetchDocuments, fetchCredentials, fetchClientHistory, logCredentialAccess, upsertCredential } from '../lib/supabaseData';
import { X, Shield, History, FileText, Lock, Globe, Building, Download, Eye, EyeOff, Users, DollarSign, AlertTriangle, Phone, MapPin, Briefcase, Calendar, Database, Key, User, ChevronRight, Send } from 'lucide-react';

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
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<TabId>('pasport');

  useEffect(() => {
    if (company) {
      setIsLoadingDocs(true);
      Promise.all([
        fetchDocuments(company.id),
        fetchCredentials(company.id),
        fetchClientHistory(company.id)
      ]).then(([docs, creds, history]) => {
        setDocuments(docs);
        setCredentials(creds);
        setClientHistory(history);
        setIsLoadingDocs(false);
      });
    }
  }, [company]);

  if (!company) return null;

  const companyPayments = payments.filter(p => p.companyId === company.id);
  const totalPaid = companyPayments.filter(p => p.status === PaymentStatus.PAID).reduce((sum, p) => sum + p.amount, 0);
  const totalPending = companyPayments.filter(p => p.status !== PaymentStatus.PAID).reduce((sum, p) => sum + p.amount, 0);

  // Risk indicator
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

  // Handle showing password with logging
  const handleShowPassword = async (credId: string, companyId: string) => {
    if (!showPasswords[credId]) {
      // Log the access
      if (userId) {
        await logCredentialAccess(credId, companyId, userId, 'view');
      }
    }
    setShowPasswords(prev => ({ ...prev, [credId]: !prev[credId] }));
  };

  // Calculate distribution amounts
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

        {/* Header */}
        <div className="bg-white dark:bg-apple-darkCard border-b border-apple-border dark:border-apple-darkBorder sticky top-0 z-10">
          <div className="p-6 md:p-8 flex justify-between items-start">
            <div className="flex items-center gap-5">
              {company.logoUrl ? (
                <img src={company.logoUrl} alt={company.name} className="h-16 w-16 rounded-2xl object-cover shadow-lg" />
              ) : (
                <div className="h-16 w-16 bg-apple-accent rounded-2xl flex items-center justify-center text-2xl text-white font-black shadow-lg shadow-blue-500/20">
                  {company.name.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight leading-none mb-2 truncate">{company.name}</h2>
                {company.brandName && <p className="text-sm font-bold text-slate-400 mb-2">{company.brandName}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 bg-slate-100 dark:bg-white/5 rounded-lg text-[10px] font-black text-slate-500 font-mono">INN: {company.inn}</span>
                  <span className="px-2.5 py-1 bg-apple-accent/10 rounded-lg text-[10px] font-black text-apple-accent uppercase">{company.taxRegime}</span>
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black border ${riskBadge.color}`}>
                    {riskBadge.emoji} {riskBadge.text}
                  </span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-3 bg-slate-50 dark:bg-white/5 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-500 rounded-xl text-slate-400 transition-all active:scale-90">
              <X size={20} strokeWidth={3} />
            </button>
          </div>

          {/* 6 Tabs */}
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

          {/* Tab 1: PASPORT */}
          {activeTab === 'pasport' && (
            <div className="space-y-6 animate-fade-in">
              {/* Director Info */}
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
                  {company.directorPhone && (
                    <a href={`https://t.me/${company.directorPhone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="p-3 bg-apple-accent/10 text-apple-accent rounded-xl hover:bg-apple-accent hover:text-white transition-all">
                      <Send size={18} />
                    </a>
                  )}
                </div>
              </div>

              {/* Legal Address */}
              <div className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                <div className="flex items-center gap-3 mb-4">
                  <MapPin size={16} className="text-apple-accent" />
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Yuridik Manzil</h4>
                </div>
                <p className="text-base font-bold text-slate-700 dark:text-slate-200">{company.legalAddress || 'Manzil ko\'rsatilmagan'}</p>
              </div>

              {/* Founder Info */}
              <div className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                <div className="flex items-center gap-3 mb-4">
                  <Briefcase size={16} className="text-apple-accent" />
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Ta'sischi / Ega</h4>
                </div>
                <p className="text-base font-bold text-slate-700 dark:text-slate-200">{company.founderName || company.ownerName || '—'}</p>
              </div>

              {/* Documents */}
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

          {/* Tab 2: SOLIQ */}
          {activeTab === 'soliq' && (
            <div className="space-y-6 animate-fade-in">
              {/* Tax Regime */}
              <div className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Soliq Rejimi</h4>
                <div className="flex flex-wrap gap-3">
                  {Object.values(TaxRegime).map(regime => (
                    <div key={regime} className={`px-4 py-2 rounded-xl font-black text-sm ${company.taxRegime === regime ? 'bg-apple-accent text-white shadow-lg' : 'bg-slate-100 dark:bg-white/5 text-slate-400'}`}>
                      {regime}
                    </div>
                  ))}
                </div>
                {company.vatCertificateDate && (
                  <p className="text-sm font-bold text-slate-400 mt-4">
                    QQS guvohnoma sanasi: <span className="text-apple-accent">{company.vatCertificateDate}</span>
                  </p>
                )}
              </div>

              {/* Additional Taxes */}
              <div className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Qo'shimcha Soliqlar</h4>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Yer solig\'i', value: company.hasLandTax },
                    { label: 'Suv solig\'i', value: company.hasWaterTax },
                    { label: 'Mol-mulk solig\'i', value: company.hasPropertyTax },
                    { label: 'Aksiz solig\'i', value: company.hasExciseTax },
                    { label: 'Auksion/Birja', value: company.hasAuctionTax },
                  ].map(tax => (
                    <div key={tax.label} className={`flex items-center gap-3 p-3 rounded-xl ${tax.value ? 'bg-emerald-500/10' : 'bg-slate-50 dark:bg-white/5'}`}>
                      <span className={`text-lg ${tax.value ? '✅' : '⬜'}`}></span>
                      <span className={`text-sm font-bold ${tax.value ? 'text-emerald-600' : 'text-slate-400'}`}>{tax.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 1C Status */}
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
                {company.oneCLocation && (
                  <p className="text-sm font-medium text-slate-500 mt-3">Joylashuv: {company.oneCLocation}</p>
                )}
              </div>
            </div>
          )}

          {/* Tab 3: LOGINLAR (Credentials Vault) */}
          {activeTab === 'loginlar' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-3 mb-2">
                <Lock size={16} className="text-rose-500" />
                <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Maxfiy Ma'lumotlar • Faqat vakolatli shaxslar uchun</p>
              </div>

              {/* Default Soliq.uz login from company */}
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
                  <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl relative">
                    <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Parol</p>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-mono font-bold text-slate-700 dark:text-slate-200">
                        {showPasswords['main'] ? company.password || '—' : '••••••••'}
                      </p>
                      <button onClick={() => setShowPasswords(prev => ({ ...prev, main: !prev.main }))} className="text-slate-300 hover:text-apple-accent">
                        {showPasswords['main'] ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Other credentials */}
              {credentials.length > 0 && credentials.map(cred => (
                <div key={cred.id} className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Key size={16} className="text-amber-500" />
                      <h4 className="text-sm font-black text-slate-700 dark:text-white capitalize">{cred.serviceName.replace('_', ' ')}</h4>
                    </div>
                    {cred.keyFilePath && <span className="text-[10px] font-bold text-emerald-500">📎 Kalit fayl mavjud</span>}
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
                        <button onClick={() => handleShowPassword(cred.id, company.id)} className="text-slate-300 hover:text-apple-accent">
                          {showPasswords[cred.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {credentials.length === 0 && (
                <div className="p-8 text-center text-slate-300">
                  <Lock size={32} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-bold">Qo'shimcha loginlar mavjud emas</p>
                </div>
              )}
            </div>
          )}

          {/* Tab 4: JAMOA (Team Assignment) */}
          {activeTab === 'jamoa' && (
            <div className="space-y-6 animate-fade-in">
              {/* Current Team */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { role: 'Buxgalter', name: company.accountantName, id: company.accountantId, color: 'bg-apple-accent' },
                  { role: 'Bank Menejeri', name: company.bankClientName, id: company.bankClientId, color: 'bg-emerald-500' },
                  { role: 'Nazoratchi', name: company.supervisorName, id: company.supervisorId, color: 'bg-amber-500' },
                ].map(member => (
                  <div key={member.role} className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">{member.role}</p>
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 ${member.color} rounded-xl flex items-center justify-center text-white font-black`}>
                        {member.name?.charAt(0) || '?'}
                      </div>
                      <p className="text-base font-black text-slate-800 dark:text-white">{member.name || 'Tayinlanmagan'}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Assignment History */}
              <div className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                <div className="flex items-center gap-3 mb-4">
                  <History size={16} className="text-apple-accent" />
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">O'zgarishlar Tarixi</h4>
                </div>
                {clientHistory.filter(h => h.changeType.includes('_change')).length > 0 ? (
                  <div className="space-y-3">
                    {clientHistory.filter(h => h.changeType.includes('_change')).slice(0, 10).map(h => (
                      <div key={h.id} className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-white/5 rounded-xl">
                        <div className="w-2 h-2 rounded-full bg-apple-accent mt-2"></div>
                        <div>
                          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                            {h.changeType === 'accountant_change' && 'Buxgalter almashdi'}
                            {h.changeType === 'bank_manager_change' && 'Bank menejeri almashdi'}
                            {h.changeType === 'supervisor_change' && 'Nazoratchi almashdi'}
                          </p>
                          <p className="text-xs text-slate-400">{h.changedByName} • {new Date(h.changedAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-300">O'zgarishlar tarixi mavjud emas</p>
                )}
              </div>
            </div>
          )}

          {/* Tab 5: SHARTNOMA (Contract & Finance) */}
          {activeTab === 'shartnoma' && (
            <div className="space-y-6 animate-fade-in">
              {/* Contract Info */}
              <div className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Shartnoma Ma'lumotlari</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Shartnoma Raqami</p>
                    <p className="text-base font-black text-slate-800 dark:text-white">{company.contractNumber || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Sana</p>
                    <p className="text-base font-black text-slate-800 dark:text-white">{company.contractDate || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Xizmat Narxi</p>
                    <p className="text-2xl font-black text-apple-accent">{contractAmount.toLocaleString()} so'm</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">To'lov Kuni</p>
                    <p className="text-base font-black text-slate-800 dark:text-white">Har oyning {company.paymentDay || 5}-sanasi</p>
                  </div>
                </div>
              </div>

              {/* Distribution */}
              <div className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Oylik Taqsimot</h4>
                <div className="space-y-3">
                  {[
                    { label: 'Firma', percent: company.firmaSharePercent || 50, amount: firmaShare, color: 'bg-apple-accent' },
                    { label: 'Buxgalter', percent: company.accountantPerc || 20, amount: buxgalterShare, color: 'bg-emerald-500' },
                    { label: 'Bank', percent: null, amount: bankShare, color: 'bg-amber-500', isFixed: true },
                    { label: 'Nazoratchi', percent: company.supervisorPerc || 2.5, amount: nazoratchiShare, color: 'bg-purple-500' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-white/5 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded ${item.color}`}></div>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{item.label}</span>
                        {item.percent && <span className="text-xs text-slate-400">({item.percent}%)</span>}
                        {item.isFixed && <span className="text-xs text-slate-400">(qat'iy)</span>}
                      </div>
                      <span className="text-sm font-black text-slate-800 dark:text-white tabular-nums">{item.amount.toLocaleString()} so'm</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Balance */}
              <div className="p-5 bg-gradient-to-r from-apple-accent to-blue-600 rounded-2xl text-white">
                <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-2">Joriy Balans</p>
                <p className="text-3xl font-black">{(company.currentBalance || 0).toLocaleString()} so'm</p>
                <p className="text-sm font-medium opacity-70 mt-2">
                  {(company.currentBalance || 0) >= 0 ? 'Oldindan to\'lov' : 'Qarzdorlik'}
                </p>
              </div>
            </div>
          )}

          {/* Tab 6: XAVF (Risk Management) */}
          {activeTab === 'xavf' && operation && (
            <div className="space-y-6 animate-fade-in">
              {/* Status */}
              <div className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Kompaniya Holati</h4>
                <div className="flex flex-wrap gap-3">
                  {Object.values(CompanyStatus).map(status => (
                    <div key={status} className={`px-4 py-2 rounded-xl font-black text-xs uppercase ${(company.companyStatus || 'active') === status ? 'bg-apple-accent text-white shadow-lg' : 'bg-slate-100 dark:bg-white/5 text-slate-400'}`}>
                      {status === 'active' && '🟢 Faol'}
                      {status === 'suspended' && '🟡 To\'xtatilgan'}
                      {status === 'debtor' && '🔴 Qarzdor'}
                      {status === 'problem' && '🔴 Muammoli'}
                      {status === 'bankrupt' && '⚫ Bankrot'}
                    </div>
                  ))}
                </div>
              </div>

              {/* Risk Level */}
              <div className={`p-6 rounded-2xl border ${riskBadge.color}`}>
                <div className="flex items-center gap-4">
                  <span className="text-4xl">{riskBadge.emoji}</span>
                  <div>
                    <h4 className="text-lg font-black">{riskBadge.text}</h4>
                    <p className="text-sm font-medium opacity-70">AI tomonidan hisoblangan xavf darajasi</p>
                  </div>
                </div>
              </div>

              {/* Report Status */}
              <div className="p-5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Hisobotlar Holati</h4>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Foyda Solig\'i', status: operation.profitTaxStatus },
                    { label: 'Balans (F1)', status: operation.form1Status },
                    { label: 'Moliya Natija (F2)', status: operation.form2Status },
                    { label: 'Statistika', status: operation.statsStatus },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-white/5 rounded-xl">
                      <span className="text-sm font-bold text-slate-600 dark:text-slate-300">{item.label}</span>
                      <StatusBadge status={item.status} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Risk Notes */}
              {company.riskNotes && (
                <div className="p-5 bg-rose-500/5 border border-rose-500/20 rounded-2xl">
                  <div className="flex items-center gap-3 mb-3">
                    <AlertTriangle size={16} className="text-rose-500" />
                    <h4 className="text-xs font-black text-rose-500 uppercase tracking-widest">Muhim Eslatmalar</h4>
                  </div>
                  <p className="text-sm font-medium text-rose-700 dark:text-rose-300">{company.riskNotes}</p>
                </div>
              )}
            </div>
          )}

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
