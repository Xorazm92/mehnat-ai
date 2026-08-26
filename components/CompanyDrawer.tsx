import React, { useState, useEffect } from 'react';
import { ALL_SERVICE_KEYS, SERVICE_LABELS, serviceGroups } from '@/lib/reportColumns';
import { createPortal } from 'react-dom';
import {
  getCompanyContracts,
  createContract,
  updateContract,
  deactivateContract,
} from '@/server/contracts';
import { Company, OperationEntry, Payment, Language, ClientCredential, ClientHistory, Staff } from '@/types';
import {
  X,
  Shield,
  FileText,
  Lock,
  Globe,
  Building2,
  Download,
  Eye,
  EyeOff,
  Users,
  DollarSign,
  AlertTriangle,
  MapPin,
  Briefcase,
  Database,
  Key,
  User,
  Check,
  Calculator,
  Trash2,
  Plus,
  Pencil,
  Save,
  Loader2,
  Phone,
  History,
} from 'lucide-react';
import { getKpiRules, getCompanyKpiRules, upsertCompanyKpiRule } from '@/server/kpi';
import { getClientCredentials, createClientCredential, deleteClientCredential, setPrimaryCredential } from '@/server/credentials';
import { formatUzDate, formatUzDateTime, formatNum } from '@/lib/format';
import { kpiCategoryLabel } from '@/lib/kpiLabels';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { taxRegimeLabel } from '@/lib/taxRegimes';
import { useModalA11y } from '@/hooks/useModalA11y';
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Tabs, TabPanel, type TabItem } from "@/components/ui/Tabs";
import RecordTimeline from "@/components/RecordTimeline";
import {
  ASSIGNMENT_ROLE_LABELS,
  normalizeAssignmentRole,
  sortStaffForAssignmentRole,
  type AssignmentRole,
} from '@/lib/permissions';
import { friendlyError } from "@/lib/actionError";

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

type TabId = 'pasport' | 'soliq' | 'loginlar' | 'jamoa' | 'shartnoma' | 'xizmatlar' | 'kpi' | 'tarix';

/**
 * Xizmat katakchalari — barcha matritsa ustunlari, guruh tartibida.
 * Ilgari bu yerda 23 ta kalitli qo'lda yozilgan ro'yxat bor edi: undagi
 * ustunlar yoqilib, qolgan hammasi (jumladan barcha "…to'lov" kataklari)
 * jimgina o'chib qolardi.
 */
const SERVICE_ROWS: { key: string; label: string }[] = serviceGroups().flatMap((g) =>
  g.keys.map((key) => ({ key, label: SERVICE_LABELS[key] || key })),
);

const CompanyDrawer: React.FC<DrawerProps> = ({ company, staff = [], onClose, onSave }) => {
  // Dialog semantikasi + fokus tuzog'i + Escape (avval hech biri yo'q edi:
  // klaviatura bilan bu paneldan chiqib bo'lmasdi).
  const panelRef = useModalA11y<HTMLDivElement>({ open: Boolean(company), onClose });
  const confirm = useConfirm();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [credentials, setCredentials] = useState<ClientCredential[]>([]);
  const [clientHistory, setClientHistory] = useState<ClientHistory[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<TabId>('pasport');
  const [isEditingMainLogin, setIsEditingMainLogin] = useState(false);
  const [isAddingCredential, setIsAddingCredential] = useState(false);
  const [newCred, setNewCred] = useState({ serviceName: '', loginId: '', password: '', notes: '' });
  const [tempLogin, setTempLogin] = useState(company?.login || '');
  const [tempPassword, setTempPassword] = useState(company?.password || '');
  const [kpiRules, setKpiRules] = useState<any[]>([]);
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
      setAssignmentsError(null);
      (async () => {
        try {
          setClientHistory([]);
          // Kirish ma'lumotlari (credentials) — serverdan
          try {
            const creds = await getClientCredentials(company.id);
            setCredentials(creds as unknown as ClientCredential[]);
          } catch (e) {
            console.warn('[CompanyDrawer] getClientCredentials failed:', e);
            setCredentials([]);
          }
          // Assignments derived from company props (server action on page saves to DB)
          setAssignments(teamFallbackAssignments());
        } catch (e) {
          console.warn('[CompanyDrawer] yuklashda xato:', e);
        }
      })();

      // Fetch KPI Data
      setIsLoadingKpi(true);
      (async () => {
        try {
          const [rulesRes, compRulesRes] = await Promise.allSettled([
            getKpiRules(),
            getCompanyKpiRules(company.id)
          ]);

          if (rulesRes.status === 'fulfilled') setKpiRules(rulesRes.value);
          else console.warn('[CompanyDrawer] getKpiRules failed:', rulesRes.reason);

          if (compRulesRes.status === 'fulfilled') setCompanyKpiRules(compRulesRes.value);
          else console.warn('[CompanyDrawer] getCompanyKpiRules failed:', compRulesRes.reason);
        } finally {
          setIsLoadingKpi(false);
        }
      })();

    }
  }, [company?.id, company?.login, company?.password]);

  // Yagona manba: rol uchun haq turi/qiymatini bitta qoidaga ko'ra aniqlaydi.
  // Jamoa va Shartnoma tablari SHU yordamchidan foydalanadi — ikki xil
  // ko'rinish (takrorlanish) bo'lmasligi uchun.
  const deriveRoleComp = (perc?: any, sum?: any): { type: 'percent' | 'fixed'; value: number } =>
    sum != null && Number(sum) > 0
      ? { type: 'fixed', value: Number(sum) }
      : { type: 'percent', value: Number(perc || 0) };

  /** Firma shartnomalari (Contract jadvali). Eski bitta ustun o'rniga. */
  const contractList: {
    id: string; number: string; signedAt: string | null;
    amount: number | null; source?: string; ownFirmName?: string | null;
  }[] = ((company as unknown as { contracts?: unknown[] })?.contracts ?? []) as never;

  // Sarlavha va rol filtri yagona manbadan — lib/permissions.ts.
  const roleLabelFor = (role: string): string => {
    const canonical = normalizeAssignmentRole(role);
    return canonical ? ASSIGNMENT_ROLE_LABELS[canonical] : role.replace(/_/g, ' ');
  };

  /** Shu o'rin uchun xodimlar: HAMMASI, odatdagi lavozim tepada (lavozim ≠ firmadagi ish). */
  const staffForAssignmentRole = (role: string): Staff[] =>
    sortStaffForAssignmentRole(staff || [], role);

  const teamFallbackAssignments = () => {
    const res: any[] = [];
    if (!company) return res;

    const push = (role: string, userIdValue?: string, perc?: any, sum?: any) => {
      if (!userIdValue) return;
      const comp = deriveRoleComp(perc, sum);
      res.push({
        id: `fallback-${role}-${userIdValue}`,
        role,
        user_id: userIdValue,
        salary_type: comp.type,
        salary_value: comp.value
      });
    };

    push('accountant', company.accountantId, company.accountantPerc, company.accountantSum);
    push('controller', company.supervisorId, company.supervisorPerc, company.supervisorSum);
    push('bank_manager', company.bankClientId, company.bankClientPerc, company.bankClientSum);
    push('chief_accountant', company.chiefAccountantId, company.chiefAccountantPerc, company.chiefAccountantSum);
    return res;
  };

  // Jamoa tahririni company maydonlariga ham ko'chiradi — Shartnoma tabi
  // saqlashdan keyin darhol bir xil qiymat ko'rsatishi uchun.
  const mergeAssignmentsIntoCompany = (base: Company, list: any[]): Company => {
    const merged: any = { ...base };
    for (const a of list) {
      if (!a.userId) continue;
      const isPercent = a.salaryType === 'percent';
      if (a.role === 'accountant') {
        merged.accountantId = a.userId;
        merged.accountantPerc = isPercent ? a.salaryValue : null;
        merged.accountantSum = isPercent ? null : a.salaryValue;
      } else if (a.role === 'controller') {
        merged.supervisorId = a.userId;
        merged.supervisorPerc = isPercent ? a.salaryValue : null;
        merged.supervisorSum = isPercent ? null : a.salaryValue;
      } else if (a.role === 'bank_manager') {
        merged.bankClientId = a.userId;
        merged.bankClientPerc = isPercent ? a.salaryValue : null;
        merged.bankClientSum = isPercent ? null : a.salaryValue;
      } else if (a.role === 'chief' || a.role === 'chief_accountant') {
        merged.chiefAccountantId = a.userId;
        merged.chiefAccountantPerc = isPercent ? a.salaryValue : null;
        merged.chiefAccountantSum = isPercent ? null : a.salaryValue;
      }
    }
    return merged as Company;
  };

  if (!company || !mounted) return null;

  const handleShowPassword = async (credId: string) => {
    if (!showPasswords[credId]) {
      // Access logged
    }
    setShowPasswords(prev => ({ ...prev, [credId]: !prev[credId] }));
  };

  // Ikonka komponent sifatida (element emas) — `Tabs` uni o'zi kerakli
  // o'lchamda chizadi; ilgari har biri `cloneElement` bilan qayta o'lchanardi.
  const tabs: TabItem<TabId>[] = [
    { id: 'pasport', label: 'Pasport', icon: FileText },
    { id: 'soliq', label: 'Soliq', icon: Briefcase },
    { id: 'loginlar', label: 'Loginlar', icon: Lock },
    { id: 'jamoa', label: 'Jamoa', icon: Users },
    { id: 'shartnoma', label: 'Shartnoma', icon: DollarSign },
    { id: 'xizmatlar', label: 'Xizmatlar', icon: Check },
    { id: 'kpi', label: 'KPI', icon: Calculator },
    { id: 'tarix', label: 'Tarix', icon: History },
  ];

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] transition-opacity" onClick={onClose}></div>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${company.name} — firma kartasi`}
        tabIndex={-1}
        className="fixed right-0 top-0 h-full w-full max-w-[850px] z-[110] overflow-y-auto overflow-x-hidden animate-in slide-in-from-right duration-300 flex flex-col shadow-2xl outline-none"
        style={{ background: 'var(--input-bg)' }}
      >
        <div className="dashboard-card shrink-0 z-20 shadow-md !rounded-none !border-0 !border-b border-[var(--border)] relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'var(--accent-blue)' }}></div>
          <div className="p-6 flex justify-between items-start">
            <div className="flex gap-5 items-start">
              <div className="w-16 h-16 rounded-xl flex items-center justify-center text-3xl text-white font-semibold shrink-0 shadow-md transition-transform hover:scale-105" style={{ background: `linear-gradient(135deg, var(--primary), var(--accent-blue-hover))` }}>
                {company.name.charAt(0)}
              </div>
              <div className="flex flex-col gap-1.5 pt-1">
                <h2 className="text-sm font-semibold tracking-tight leading-none" style={{ color: 'var(--text)' }}>{company.name}</h2>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="c1-badge" style={{ background: 'var(--input-bg)', color: 'var(--text-secondary)' }}>INN: {company.inn}</span>
                  <span className="c1-badge" style={{ background: 'var(--accent-blue-light)', color: 'var(--accent-blue)' }}>{taxRegimeLabel(company.taxRegime ?? company.taxType)}</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl transition-all shadow-sm icon-btn-danger" style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text-secondary)' }}>
              <X size={20} />
            </button>
          </div>
          {/* SAKKIZTA yorliq — ilgari hammasi "asosiy amal" tugmasi
              ko'rinishida edi va panel sarlavhasi ostida ko'k tugmalar
              devorini hosil qilardi. */}
          <div className="px-6 pb-1">
            <Tabs
              items={tabs}
              value={activeTab}
              onChange={setActiveTab}
              idBase="company-drawer"
              size="sm"
              ariaLabel="Firma ma'lumoti bo'limlari"
            />
          </div>
        </div>

        <TabPanel tabId={activeTab} idBase="company-drawer" className="p-6 flex-1 space-y-6">
          {activeTab === 'pasport' && (
            <div className="space-y-6 animate-fade-in pb-10">
              <div className="dashboard-card p-5 border-l-4" style={{ borderLeftColor: 'var(--accent-blue)' }}>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors shadow-sm" style={{ background: 'var(--accent-blue-light)', color: 'var(--accent-blue)' }}>
                    <User size={20} />
                  </div>
                  <h4 className="text-meta font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Direktor / Rahbar</h4>
                </div>
                <div className="pl-14">
                  <p className="text-xl font-semibold tracking-tight leading-none" style={{ color: 'var(--text)' }}>{company.directorName || '—'}</p>
                  <p className="text-xs font-bold mt-3 tabular-nums flex items-center gap-2" style={{ color: 'var(--accent-blue)' }}>
                    <Phone size={14} /> {company.directorPhone || 'MALUMOT YOQ'}
                  </p>
                </div>
              </div>

              <div className="dashboard-card p-5">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors shadow-sm" style={{ background: 'var(--warning-light)', color: 'var(--warning)' }}>
                    <MapPin size={20} />
                  </div>
                  <h4 className="text-meta font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Yuridik Manzil</h4>
                </div>
                <div className="pl-14">
                  <p className="text-body font-bold tracking-tight leading-relaxed" style={{ color: 'var(--text)' }}>{company.legalAddress || 'Manzil ko\'rsatilmagan'}</p>
                </div>
              </div>

              {/* Service Scope in Passport */}
              <div className="dashboard-card overflow-hidden">
                <div className="px-5 py-4 flex items-center gap-3" style={{ background: 'var(--input-bg)', borderBottom: '1px solid var(--card-border)' }}>
                  <Check size={18} style={{ color: 'var(--text-muted)' }} />
                  <h4 className="text-meta font-bold uppercase tracking-widest" style={{ color: 'var(--text)' }}>Xizmatlar & Operatsiyalar</h4>
                </div>
                <div className="p-6">
                  <div className="flex flex-wrap gap-2 mb-6">
                    {company.serviceScope?.length ? company.serviceScope.map(s => (
                      <span key={s} className="c1-badge" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>{s}</span>
                    )) : company.activeServices?.length ? company.activeServices.slice(0, 8).map(s => (
                      <span key={s} className="c1-badge" style={{ background: 'var(--accent-blue-light)', color: 'var(--accent-blue)' }}>{s.replace('_', ' ')}</span>
                    )) : (
                      <p className="text-meta font-bold uppercase tracking-[0.2em] opacity-50" style={{ color: 'var(--text-muted)' }}>Xizmatlar tanlanmagan</p>
                    )}
                    {company.activeServices && company.activeServices.length > 8 && (
                      <span className="text-micro font-bold flex items-center px-1 uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>+{company.activeServices.length - 8} YANA</span>
                    )}
                  </div>
                  <button
                    onClick={() => setActiveTab('xizmatlar')}
                    className="w-full py-3 rounded-lg text-meta font-bold uppercase tracking-[0.2em] transition-all shadow-sm flex items-center justify-center gap-2 icon-btn-accent"
                    style={{ background: 'var(--input-bg)', color: 'var(--text-secondary)', border: '1px solid var(--card-border)' }}
                  >
                    BARCHASINI KO&apos;RISH
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'soliq' && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-2 gap-4">
                <div className="dashboard-card p-5">
                  <h4 className="text-meta font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>1C Server & Baza</h4>
                  <div className="space-y-3 text-xs">
                    <p className="font-bold uppercase tracking-tight" style={{ color: 'var(--text-secondary)' }}>Server ID: <span style={{ color: 'var(--accent-blue)' }}>{company.serverInfo || '—'}</span></p>
                    {company.serverName && (
                      <p className="font-bold uppercase tracking-tight" style={{ color: 'var(--text-secondary)' }}>Server Nomi: <span style={{ color: 'var(--success)' }}>{company.serverName}</span></p>
                    )}
                    <p className="font-bold uppercase tracking-tight" style={{ color: 'var(--text-muted)' }}>Baza: {company.baseName1c || '—'}</p>
                  </div>
                </div>
                <div className={`dashboard-card p-5 flex items-center gap-4 transition-colors`} style={{ background: company.itParkResident ? 'var(--accent-blue-light)' : 'var(--card-bg)', borderColor: company.itParkResident ? 'var(--accent-blue)' : 'var(--card-border)' }}>
                  <Shield size={24} className="shrink-0" style={{ color: company.itParkResident ? 'var(--accent-blue)' : 'var(--text-muted)' }} />
                  <span className="text-body font-semibold" style={{ color: company.itParkResident ? 'var(--accent-blue)' : 'var(--text-muted)' }}>IT Park Rezidenti</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="dashboard-card p-5">
                  <h4 className="text-meta font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>Statistika Hisobotlari</h4>
                  <div className="flex flex-wrap gap-2">
                    {company.statReports?.length ? company.statReports.map(s => (
                      <span key={s} className="c1-badge" style={{ background: 'var(--input-bg)', color: 'var(--text-secondary)' }}>{s}</span>
                    )) : <p className="text-meta font-bold uppercase tracking-widest opacity-50" style={{ color: 'var(--text-muted)' }}>belgilanmagan</p>}
                  </div>
                </div>

                <div className="dashboard-card p-5">
                  <h4 className="text-meta font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>Majburiy Hisobotlar</h4>
                  <div className="flex flex-wrap gap-2">
                    {company.requiredReports?.length ? company.requiredReports.map(r => (
                      <span key={r} className="c1-badge" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>{r}</span>
                    )) : <p className="text-meta font-bold uppercase tracking-widest opacity-50" style={{ color: 'var(--text-muted)' }}>belgilanmagan</p>}
                  </div>
                </div>

                <div className="dashboard-card p-5 col-span-1 md:col-span-2">
                  <h4 className="text-meta font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>Xizmatlar Ko&apos;lami (Scope)</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {company.serviceScope?.length ? company.serviceScope.map(s => (
                      <div key={s} className="flex items-center gap-2 p-2 rounded-lg transition-colors" style={{ background: 'var(--accent-blue-light)', color: 'var(--accent-blue)' }}>
                        <Check size={14} className="shrink-0" />
                        <span className="text-micro font-bold uppercase truncate tracking-tight">{s}</span>
                      </div>
                    )) : (
                      <div className="col-span-full py-8 text-center rounded-lg border border-dashed transition-colors" style={{ borderColor: 'var(--card-border)', background: 'var(--input-bg)' }}>
                        <p className="text-meta font-bold uppercase tracking-widest opacity-50" style={{ color: 'var(--text-muted)' }}>Xizmatlar tanlanmagan</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="dashboard-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Database size={16} style={{ color: 'var(--text-muted)' }} />
                  <h4 className="text-meta font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>1C Holati</h4>
                </div>
                <div className="flex flex-wrap gap-3">
                  {['cloud', 'local', 'server', 'none'].map(status => (
                    <Button variant="primary" size="md" key={status} className={`px-4 py-2 rounded-lg border font-bold text-meta uppercase transition-all tracking-widest shadow-sm`} style={company.oneCStatus === status ? { background: 'var(--accent-blue)', borderColor: 'var(--accent-blue)', color: '#fff' } : { background: 'var(--input-bg)', borderColor: 'var(--card-border)', color: 'var(--text-secondary)' }}>
                      {status === 'cloud' ? '☁️ Cloud' : status === 'local' ? '💻 Local' : status === 'server' ? '🖥️ Server' : '❌ Yo\'q'}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'loginlar' && (
            <div className="space-y-4 animate-fade-in">
              <div className="bg-[var(--card-bg)] p-4 rounded-lg border border-[var(--card-border)] shadow-sm transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Globe size={12} className="text-[var(--text-muted)]" />
                    <h4 className="text-micro font-bold text-[var(--text)] uppercase tracking-widest">Soliq.uz (Asosiy)</h4>
                  </div>
                  {isEditingMainLogin ? (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => {
                          setIsEditingMainLogin(false);
                          setTempLogin(company.login || '');
                          setTempPassword(company.password || '');
                        }}
                        className="px-2.5 py-1 text-micro font-bold text-[var(--text-muted)] uppercase rounded-lg border border-[var(--card-border)] hover:bg-[var(--bg-hover)] transition-all"
                      >
                        Bekor qilish
                      </button>
                      <button
                        onClick={async () => {
                          // Shifrlangan vault'ga yoziladi (ClientCredential,
                          // serviceName="soliq"), Company.login/password
                          // ustunlariga EMAS — ular deprecated ochiq matn.
                          try {
                            await setPrimaryCredential(company.id, tempLogin, tempPassword);
                            // Ota-komponentdagi ro'yxat yangilansin (parol
                            // faqat huquqi bor foydalanuvchiga qaytariladi).
                            onSave?.({ ...company, login: tempLogin, password: tempPassword });
                          } catch (e) {
                            console.warn('[CompanyDrawer] setPrimaryCredential failed:', e);
                          }
                          setIsEditingMainLogin(false);
                        }}
                        className="px-2.5 py-1 bg-[var(--success)] hover:opacity-90 text-white text-micro font-bold uppercase rounded-lg border border-[var(--success-border)] transition-all shadow-sm"
                      >
                        Saqlash
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsEditingMainLogin(true)}
                      className="px-2.5 py-1 bg-[var(--input-bg)] hover:bg-[var(--bg-hover)] text-micro font-bold text-[var(--text-secondary)] uppercase rounded-lg border border-[var(--card-border)] transition-all hover:text-[var(--accent-blue)]"
                    >
                      Tahrirlash
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <p className="text-micro font-bold text-[var(--text-muted)] uppercase tracking-widest">Login</p>
                    {isEditingMainLogin ? (
                      <input
                        type="text"
                        className="w-full bg-[var(--input-bg)] p-1.5 rounded-lg border border-[var(--card-border)] font-mono text-meta uppercase outline-none focus:border-[var(--accent-blue)] transition-colors"
                        value={tempLogin}
                        onChange={(e) => setTempLogin(e.target.value)}
                      />
                    ) : (
                      <p className="text-meta font-mono font-bold text-[var(--text)] uppercase bg-[var(--input-bg)] p-1.5 rounded-lg border border-[var(--card-border)] transition-colors">{company.login || '—'}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="text-micro font-bold text-[var(--text-muted)] uppercase tracking-widest">Parol</p>
                    <div className="relative">
                      {isEditingMainLogin ? (
                        <input
                          type="text"
                          className="w-full bg-[var(--input-bg)] p-1.5 rounded-lg border border-[var(--card-border)] font-mono text-meta outline-none focus:border-[var(--accent-blue)] transition-colors"
                          value={tempPassword}
                          onChange={(e) => setTempPassword(e.target.value)}
                        />
                      ) : (
                        <div className="flex items-center justify-between bg-[var(--input-bg)] p-1.5 rounded-lg border border-[var(--card-border)] transition-colors">
                          <p className="text-meta font-mono font-bold text-[var(--text)] tracking-widest leading-none">
                            {showPasswords['main'] ? company.password || '—' : '••••••••'}
                          </p>
                          <button onClick={() => setShowPasswords(prev => ({ ...prev, main: !prev.main }))} className="text-[var(--text-muted)] hover:text-[var(--accent-blue)] transition-all">
                            {showPasswords['main'] ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--card-border)] shadow-sm overflow-hidden transition-colors">
                <div className="bg-[var(--input-bg)] px-3 py-2 flex items-center justify-between border-b border-[var(--card-border)]">
                  <h4 className="text-micro font-bold text-[var(--text)] uppercase tracking-widest">Qo&apos;shimcha Kirish Ma&apos;lumotlari</h4>
                  <button
                    onClick={() => setIsAddingCredential(true)}
                    className="flex items-center gap-1 text-micro font-bold text-[var(--accent-blue)] uppercase py-1 px-2.5 bg-[var(--accent-blue-light)] rounded-lg border border-[var(--card-border)] hover:bg-[var(--bg-hover)] transition-all shadow-sm"
                  >
                    <Plus size={10} /> Yangi Qo&apos;shish
                  </button>
                </div>

                {isAddingCredential && (
                  <div className="p-3 border-b border-[var(--card-border)] bg-[var(--accent-blue-light)] transition-colors">
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="col-span-2">
                        <label className="text-micro font-bold text-[var(--text-muted)] uppercase mb-1 block tracking-widest">Xizmat nomi (Didox, Bank...)</label>
                        <input
                          type="text"
                          className="w-full bg-[var(--input-bg)] p-1.5 rounded-lg border border-[var(--card-border)] text-meta font-bold outline-none focus:border-[var(--accent-blue)] transition-colors"
                          value={newCred.serviceName}
                          onChange={e => setNewCred({ ...newCred, serviceName: e.target.value })}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-micro font-bold text-[var(--text-muted)] uppercase block tracking-widest whitespace-nowrap">Login</label>
                        <input
                          type="text"
                          className="w-full bg-[var(--input-bg)] p-1.5 rounded-lg border border-[var(--card-border)] font-mono text-meta uppercase outline-none focus:border-[var(--accent-blue)] transition-colors"
                          value={newCred.loginId}
                          onChange={e => setNewCred({ ...newCred, loginId: e.target.value })}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-micro font-bold text-[var(--text-muted)] uppercase block tracking-widest whitespace-nowrap">Parol</label>
                        <input
                          type="text"
                          className="w-full bg-[var(--input-bg)] p-1.5 rounded-lg border border-[var(--card-border)] font-mono text-meta outline-none focus:border-[var(--accent-blue)] transition-colors"
                          value={newCred.password}
                          onChange={e => setNewCred({ ...newCred, password: e.target.value })}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-micro font-bold text-[var(--text-muted)] uppercase mb-1 block tracking-widest">Izoh</label>
                        <input
                          type="text"
                          className="w-full bg-[var(--input-bg)] p-1.5 rounded-lg border border-[var(--card-border)] text-meta font-bold outline-none focus:border-[var(--accent-blue)] transition-colors"
                          value={newCred.notes}
                          onChange={e => setNewCred({ ...newCred, notes: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 text-micro uppercase font-bold">
                      <button onClick={() => setIsAddingCredential(false)} className="px-2.5 py-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors uppercase tracking-widest">Bekor qilish</button>
                      <button
                        disabled={!newCred.serviceName || !newCred.loginId}
                        onClick={async () => {
                          if (!newCred.serviceName || !newCred.loginId) return;
                          try {
                            const saved = await createClientCredential({
                              companyId: company.id,
                              serviceName: newCred.serviceName,
                              loginId: newCred.loginId,
                              password: newCred.password,
                              notes: newCred.notes,
                            });
                            setCredentials(prev => [saved as unknown as ClientCredential, ...prev]);
                            setIsAddingCredential(false);
                            setNewCred({ serviceName: '', loginId: '', password: '', notes: '' });
                          } catch (e) {
                            toast.error(friendlyError(e) || "Saqlashda xatolik");
                          }
                        }}
                        className="px-2.5 py-1 bg-[var(--accent-blue)] text-white rounded-lg border border-[var(--accent-blue)] disabled:opacity-50 shadow-sm transition-all"
                      >
                        Qo&apos;shish
                      </button>
                    </div>
                  </div>
                )}

                <div className="divide-y divide-[var(--card-border)]">
                  {credentials.map((cred) => (
                    <div key={cred.id} className="p-3 hover:bg-[var(--bg-hover)] transition-colors relative group/cred">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <Key size={10} className="text-[var(--text-muted)]" />
                          <p className="text-micro font-bold text-[var(--text)] uppercase tracking-tight">{cred.serviceName}</p>
                        </div>
                        <button
                          onClick={async () => {
                            if (await confirm({ title: `"${cred.serviceName}" kredensiali o'chirilsinmi?`, description: "Saqlangan login va parol o'chiriladi.", confirmLabel: "O'chirish", tone: 'danger' })) {
                              try {
                                await deleteClientCredential(cred.id);
                                setCredentials(prev => prev.filter(c => c.id !== cred.id));
                              } catch (e) {
                                toast.error(friendlyError(e) || "O'chirishda xatolik");
                              }
                            }
                          }}
                          className="p-1 text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)] rounded-lg opacity-0 group-hover/cred:opacity-100 transition-all"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mt-1">
                        <div className="bg-[var(--input-bg)] p-1.5 rounded-lg border border-[var(--card-border)] transition-colors">
                          <p className="text-micro font-bold text-[var(--text-muted)] uppercase mb-0.5 tracking-widest">Login</p>
                          <p className="font-mono text-meta font-bold text-[var(--text)] uppercase truncate leading-none mt-1">{cred.loginId || '—'}</p>
                        </div>
                        <div className="bg-[var(--input-bg)] p-1.5 rounded-lg border border-[var(--card-border)] flex justify-between items-center transition-colors">
                          <div className="flex-1 min-w-0 pr-2">
                            <p className="text-micro font-bold text-[var(--text-muted)] uppercase mb-0.5 tracking-widest">Parol</p>
                            <p className="font-mono text-meta font-bold text-[var(--text)] tracking-widest leading-none mt-1">{showPasswords[cred.id] ? cred.encryptedPassword || '—' : '••••••••'}</p>
                          </div>
                          <button onClick={() => handleShowPassword(cred.id)} className="text-[var(--text-muted)] hover:text-[var(--accent-blue)] transition-all shrink-0">
                            {showPasswords[cred.id] ? <EyeOff size={11} /> : <Eye size={11} />}
                          </button>
                        </div>
                      </div>
                      {cred.notes && <p className="text-micro font-bold text-[var(--text-muted)] mt-2 uppercase tracking-tight italic opacity-70">Izoh: {cred.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'jamoa' && (
            <div className="space-y-4 animate-fade-in">
              <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-sm overflow-hidden transition-colors">
                <div className="bg-[var(--input-bg)] px-3 py-2 flex items-center justify-between border-b border-[var(--card-border)]">
                  <h4 className="text-micro font-bold text-[var(--text)] uppercase tracking-widest">Amaldagi Jamoa</h4>
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
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] text-[var(--text-secondary)] text-micro font-bold uppercase transition-all hover:text-[var(--accent-blue)] hover:bg-[var(--accent-blue-light)]"
                    >
                      <Pencil size={10} /> Tahrirlash
                    </button>
                  )}
                  {isEditingJamoa && (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setIsEditingJamoa(false)}
                        className="px-2.5 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] text-[var(--text-muted)] text-micro font-bold uppercase transition-all"
                      >
                        Bekor
                      </button>
                      <button
                        disabled={isSavingJamoa}
                        onClick={async () => {
                          if (!company || !onSave) return;
                          setIsSavingJamoa(true);
                          try {
                            await onSave(mergeAssignmentsIntoCompany(company, editAssignments), editAssignments);
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
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--success-border)] bg-[var(--success)] hover:opacity-90 text-white text-micro font-bold uppercase transition-all shadow-sm disabled:opacity-50"
                      >
                        {isSavingJamoa ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />} Saqlash
                      </button>
                    </div>
                  )}
                </div>

                {assignmentsError && (
                  <div className="m-3 p-3 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning)]">
                    <p className="text-micro font-bold uppercase tracking-widest leading-none">contract_assignments xatoligi</p>
                    <p className="text-micro uppercase mt-1 opacity-80">{assignmentsError}</p>
                  </div>
                )}

                {!isEditingJamoa ? (
                  <div className="divide-y divide-[var(--card-border)]">
                    {(() => {
                      const displayedAssignments = assignments.length > 0 ? assignments : teamFallbackAssignments();
                      return displayedAssignments.length > 0 ? displayedAssignments.map((asgn: any) => {
                        const member = staff.find(s => s.id === asgn.user_id);
                        return (
                          <div key={asgn.id} className="px-4 py-3.5 flex items-center justify-between hover:bg-[var(--bg-hover)] transition-colors group">
                            <div className="flex gap-3.5 items-center">
                              <div className="w-10 h-10 rounded-lg bg-[var(--accent-blue-light)] border border-[var(--card-border)] flex items-center justify-center text-[var(--accent-blue)] text-sm font-semibold shrink-0 transition-colors">
                                {member?.name?.charAt(0) || '?'}
                              </div>
                              <div className="flex flex-col gap-1">
                                <p className="text-body font-bold text-[var(--text)] tracking-tight leading-none">{member?.name?.toUpperCase() || 'Mavjud emas'}</p>
                                <p className="text-micro font-bold text-[var(--text-muted)] uppercase tracking-wide leading-none">{roleLabelFor(asgn.role)}</p>
                              </div>
                            </div>
                            <div className="text-right flex flex-col gap-1 items-end">
                              <span className="px-2.5 py-1 bg-[var(--input-bg)] rounded-lg border border-[var(--card-border)] text-xs font-bold text-[var(--text)] tabular-nums whitespace-nowrap shadow-sm">
                                {asgn.salary_type === 'percent' ? `${asgn.salary_value}%` : `${formatNum(asgn.salary_value)} so'm`}
                              </span>
                              {asgn.start_date && <p className="text-micro text-[var(--text-muted)] font-semibold tracking-tight">Sana: {formatUzDate(asgn.start_date)}</p>}
                            </div>
                          </div>
                        );
                      }) : (
                        <div className="p-8 text-center bg-[var(--input-bg)] transition-colors">
                          <Users size={20} className="mx-auto mb-2 text-[var(--text-muted)]" />
                          <p className="text-micro font-bold uppercase text-[var(--text-muted)] tracking-widest opacity-50">Jamoa a&apos;zolari tayinlanmagan</p>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="p-3 bg-[var(--accent-blue-light)] space-y-3 transition-colors">
                    {editAssignments.map((asgn, idx) => {
                      const roleOptions = staffForAssignmentRole(asgn.role);
                      return (
                        <div key={asgn.role} className="p-3 bg-[var(--card-bg)] rounded-lg border border-[var(--card-border)] space-y-2.5 shadow-sm transition-colors">
                          <p className="text-micro font-bold text-[var(--accent-blue)] uppercase tracking-widest">{roleLabelFor(asgn.role)}</p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="sm:col-span-2">
                              <label className="text-micro font-bold text-[var(--text-muted)] uppercase block mb-1 tracking-widest">Xodim</label>
                              <select
                                value={asgn.userId || ''}
                                disabled={roleOptions.length === 0}
                                onChange={e => setEditAssignments(prev => prev.map((a, i) => i === idx ? { ...a, userId: e.target.value } : a))}
                                className="w-full bg-[var(--input-bg)] border border-[var(--card-border)] rounded-lg px-2 py-1.5 text-micro font-bold uppercase outline-none focus:border-[var(--accent-blue)] transition-colors"
                              >
                                <option value="">
                                  {roleOptions.length === 0 ? '— BU ROLDA FAOL XODIM YO\'Q —' : '— Tanlanmagan —'}
                                </option>
                                {roleOptions.map(s => <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>)}
                              </select>
                            </div>
                            <div className="flex flex-col">
                              <label className="text-micro font-bold text-[var(--text-muted)] uppercase block mb-1 tracking-widest whitespace-nowrap">
                                {asgn.salaryType === 'percent' ? 'Foiz (%)' : 'Summa (so\'m)'}
                              </label>
                              <div className="flex border border-[var(--card-border)] rounded-lg overflow-hidden shadow-sm transition-colors">
                                <input
                                  type="number"
                                  value={asgn.salaryValue ?? 0}
                                  onChange={e => setEditAssignments(prev => prev.map((a, i) => i === idx ? { ...a, salaryValue: Number(e.target.value) } : a))}
                                  className="w-full bg-[var(--input-bg)] px-2 py-1.5 text-micro font-bold outline-none"
                                />
                                <button
                                  onClick={() => setEditAssignments(prev => prev.map((a, i) => i === idx ? { ...a, salaryType: a.salaryType === 'percent' ? 'fixed' : 'percent' } : a))}
                                  className="px-2 py-1.5 bg-[var(--input-bg)] text-micro font-bold uppercase text-[var(--text-secondary)] shrink-0 border-l border-[var(--card-border)] hover:bg-[var(--accent-blue-light)] transition-all hover:text-[var(--accent-blue)]"
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
                <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-sm overflow-hidden transition-colors">
                  <div className="bg-[var(--input-bg)] px-3 py-2 border-b border-[var(--card-border)]">
                    <h4 className="text-micro font-bold text-[var(--text)] uppercase tracking-widest">Tayinlovlar Tarixi</h4>
                  </div>
                  <div className="divide-y divide-[var(--card-border)] max-h-[250px] overflow-y-auto">
                    {clientHistory.filter(h => h.changeType === 'assign_role' || h.changeType === 'remove_role').map((h, i) => (
                      <div key={i} className="flex gap-2.5 p-2.5 hover:bg-[var(--bg-hover)] transition-colors group">
                        <div className={`mt-0.5 w-6 h-6 rounded-lg shrink-0 flex items-center justify-center border transition-colors ${h.changeType === 'assign_role' ? 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--card-border)]' : 'bg-[var(--danger-bg)] text-[var(--danger)] border-[var(--card-border)]'}`}>
                          {h.changeType === 'assign_role' ? <Check size={10} /> : <X size={10} />}
                        </div>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <p className="text-micro font-bold text-[var(--text-secondary)] uppercase truncate pr-2 tracking-tight leading-tight">{h.notes || 'Rol o\'zgarishi'}</p>
                          <p className="text-micro text-[var(--text-muted)] font-bold uppercase tracking-widest opacity-60 leading-none mt-0.5">{formatUzDateTime(h.changedAt)} • {h.changedByName || 'Tizim'}</p>
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
                {/* Tomon ikki xil bo'ladi: o'z firmamiz (yozma shartnoma) yoki
                    plastik/naqd kanali (og'zaki kelishuv). Ikkalasi bir vaqtda
                    to'ldirilmaydi — DB'da CHECK. */}
                {(company.internalContractor || company.internalChannelLabel) && (
                  <div className="col-span-2 dashboard-card p-5 !shadow-sm flex items-center justify-between" style={{ background: 'var(--accent-blue-light)' }}>
                    <div>
                      <p className="text-micro font-bold uppercase tracking-widest mb-1.5 opacity-70" style={{ color: 'var(--accent-blue)' }}>
                        {company.internalContractor ? 'Ichki Pudratchi (Ijrochi)' : "Og'zaki shartnoma tomoni"}
                      </p>
                      <div className="flex items-center gap-3">
                        <Building2 size={16} style={{ color: 'var(--accent-blue)' }} />
                        <p className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
                          {company.internalContractor || company.internalChannelLabel}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="dashboard-card p-5 !shadow-sm">
                  <p className="text-micro font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Shartnoma Raqami</p>
                  <p className="text-body font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
                    {contractList.length > 0
                      ? contractList.map(k => k.number).join(', ')
                      : company.contractNumber || '—'}
                  </p>
                </div>
                <div className="dashboard-card p-5 !shadow-sm">
                  <p className="text-micro font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Sana</p>
                  <p className="text-body font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
                    {contractList[0]?.signedAt || company.contractDate || '—'}
                  </p>
                </div>
              </div>

              {/* Shartnomalar — endi TAHRIRLANADI.
                  Ilgari bu ro'yxat faqat o'qish uchun edi va shartnoma
                  yaratishning yagona yo'li 1C importi (scripts/import-contracts.ts)
                  bo'lgan: yangi mijozning shartnomasini ekrandan kiritib
                  bo'lmasdi. */}
              <ContractsPanel companyId={company.id} initial={contractList} />

              <div className="dashboard-card overflow-hidden !shadow-sm">
                <div className="p-5 text-center" style={{ background: 'var(--input-bg)', borderBottom: '1px solid var(--card-border)' }}>
                  <h4 className="text-micro font-bold uppercase tracking-widest mb-5" style={{ color: 'var(--text-muted)' }}>Moliyaviy Holat</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <p className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Xizmat Narxi</p>
                      <p className="text-lg font-semibold tabular-nums tracking-tight leading-none" style={{ color: 'var(--text)' }}>{formatNum(Number(company.contractAmount || 0))} <span className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>so&apos;m</span></p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <p className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Joriy Balans</p>
                      <p className={`text-lg font-semibold tabular-nums tracking-tight leading-none uppercase`} style={{ color: Number(company.currentBalance || 0) < 0 ? 'var(--danger)' : 'var(--success)' }}>
                        {formatNum(Number(company.currentBalance || 0))} <span className="text-micro font-bold uppercase tracking-widest">so&apos;m</span>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-5">
                  <h4 className="text-meta font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>Kaskadli Taqsimot (Oylik prognozi)</h4>
                  {(() => {
                    // Jamoa tabi bilan bir xil manba (deriveRoleComp) — qiymatlar
                    // ikkala tabda doim mos keladi.
                    const amount = Number(company.contractAmount || 0);
                    const cascade = [
                      { label: 'Bosh Buxgalter', ...deriveRoleComp(company.chiefAccountantPerc, company.chiefAccountantSum) },
                      { label: 'Nazoratchi', ...deriveRoleComp(company.supervisorPerc, company.supervisorSum) },
                      { label: 'Bank Klient', ...deriveRoleComp(company.bankClientPerc, company.bankClientSum) },
                      { label: 'Buxgalter', ...deriveRoleComp(company.accountantPerc, company.accountantSum) }
                    ].map(item => ({
                      ...item,
                      amountValue: item.type === 'fixed' ? item.value : amount * (item.value / 100)
                    }));
                    const remainder = amount - cascade.reduce((s, i) => s + i.amountValue, 0);
                    return (
                      <>
                        <div className="divide-y rounded-xl overflow-hidden border" style={{ borderColor: 'var(--card-border)' }}>
                          {cascade.map((item, i) => (
                            <div key={i} className="flex items-center justify-between px-4 py-3.5 transition-colors group hover:bg-[var(--input-bg)]" style={{ background: 'var(--card-bg)' }}>
                              <span className="text-body font-bold tracking-tight" style={{ color: 'var(--text)' }}>{item.label}</span>
                              <div className="text-right flex items-center gap-4">
                                <p className="text-meta font-bold px-2.5 py-1 rounded-lg border tabular-nums" style={{ color: 'var(--text-secondary)', background: 'var(--input-bg)', borderColor: 'var(--card-border)' }}>{item.type === 'fixed' ? 'Fiks' : `${item.value}%`}</p>
                                <p className="text-sm font-semibold tabular-nums tracking-tight leading-none min-w-[90px]" style={{ color: 'var(--text)' }}>{formatNum(item.amountValue)} <span className="text-micro font-bold" style={{ color: 'var(--text-muted)' }}>UZS</span></p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 flex items-center justify-between p-4 rounded-xl shadow-sm" style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)' }}>
                          <span className="text-xs font-semibold" style={{ color: 'var(--success)' }}>Kompaniya Qoldig&apos;i</span>
                          <span className="text-sm font-semibold tabular-nums tracking-tight leading-none" style={{ color: remainder < 0 ? 'var(--danger)' : 'var(--success)' }}>
                            {formatNum(remainder)} <span className="text-micro font-bold">UZS</span>
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'xizmatlar' && (
            <div className="space-y-6 animate-fade-in px-2">
              <div className="dashboard-card p-5 !shadow-sm">
                <div className="flex items-center justify-between mb-5 pb-4 border-b" style={{ borderColor: 'var(--card-border)' }}>
                  <div className="flex items-center gap-3">
                    <Check size={16} style={{ color: 'var(--text-muted)' }} />
                    <h4 className="text-meta font-semibold uppercase tracking-widest leading-none mt-0.5" style={{ color: 'var(--text)' }}>Aktiv Xizmatlar</h4>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        if (onSave) {
                          // Yagona manba (lib/reportColumns.ts) — to'lov yarmi bilan birga. Qo'lda
                          // yozilgan eski ro'yxatda `*_tolov` yo'q edi va "Hammasini yoqish"
                          // aslida to'lov kataklarini QULFLAB qo'yardi.
                          const allKeys = ALL_SERVICE_KEYS;
                          onSave({ ...company, activeServices: allKeys });
                        }
                      }}
                      className="px-3 py-2 text-micro font-semibold rounded-lg transition-all uppercase tracking-widest shadow-sm"
                      style={{ color: 'var(--success)', background: 'color-mix(in srgb, var(--success) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--success) 20%, transparent)' }}
                    >
                      Hammasini yoqish
                    </button>
                    <button
                      onClick={() => {
                        if (onSave) onSave({ ...company, activeServices: [] });
                      }}
                      className="px-3 py-2 text-micro font-semibold rounded-lg transition-all uppercase tracking-widest shadow-sm"
                      style={{ color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)' }}
                    >
                      Hammasini o&apos;chirish
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-y-3 gap-x-6 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                  {SERVICE_ROWS.map(service => {
                    // Bo'sh ro'yxat = "hamma ustun yoqilgan" (matritsa shunday
                    // o'qiydi). Ilgari bu yerda hammasi BELGISIZ ko'rinardi va
                    // bitta katakchani bosish ro'yxatni bitta kalitga
                    // qisqartirib, qolgan hamma ustunni o'chirib qo'yardi —
                    // firmalar shu yo'l bilan yarim qulflangan holatga tushgan.
                    const current = company.activeServices || [];
                    const isActive = current.length === 0 || current.includes(service.key);
                    return (
                      <label key={service.key} className="flex items-center gap-3 group cursor-pointer transition-all hover:bg-[var(--input-bg)] p-2 rounded-xl border border-transparent">
                        <div className="relative flex items-center justify-center">
                          <input
                            type="checkbox"
                            className="peer appearance-none w-5 h-5 border rounded-lg transition-all cursor-pointer shadow-sm"
                            style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
                            checked={isActive}
                            onChange={() => {
                              if (!onSave) return;
                              const base = current.length === 0 ? [...ALL_SERVICE_KEYS] : current;
                              const updated = isActive ? base.filter(k => k !== service.key) : [...base, service.key];
                              onSave({ ...company, activeServices: updated });
                            }}
                          />
                          <div className="absolute inset-0 rounded-lg pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" style={{ background: 'var(--accent-blue)' }}></div>
                          <Check size={12} className="absolute text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none z-10" />
                        </div>
                        <span className={`text-micro font-bold uppercase tracking-tight transition-colors`} style={{ color: isActive ? 'var(--text)' : 'var(--text-muted)' }}>
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
                <div className="dashboard-card p-5 flex flex-col items-center justify-center transition-colors">
                  <div className="animate-spin w-8 h-8 border-3 border-t-transparent rounded-full mb-4" style={{ borderColor: 'var(--accent-blue)', borderTopColor: 'transparent' }}></div>
                  <p className="text-meta font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>KPI ma&apos;lumotlari yuklanmoqda...</p>
                </div>
              ) : (
                <div className="dashboard-card p-5 !shadow-sm">
                  <div className="flex items-center gap-3 mb-5 pb-4 border-b" style={{ borderColor: 'var(--card-border)' }}>
                    <Calculator size={16} style={{ color: 'var(--text-muted)' }} />
                    <h4 className="text-meta font-semibold uppercase tracking-widest mt-0.5 leading-none" style={{ color: 'var(--text)' }}>Mijoz KPI Soblamalari (Override)</h4>
                  </div>

                  <div className="space-y-4">
                    {kpiRules.map(rule => {
                      const compRule = companyKpiRules.find(cr => cr.ruleId === rule.id);
                      const isSaving = isSavingKpi === rule.id;
                      const currentReward = compRule?.rewardPercent ?? '';
                      const currentPenalty = compRule?.penaltyPercent ?? '';

                      return (
                        <div key={rule.id} className="p-4 rounded-xl border transition-all group hover:shadow-sm" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                          <div className="flex justify-between items-start mb-4">
                            <div className="min-w-0 flex-1">
                              <p className="text-meta font-semibold uppercase tracking-tight" style={{ color: 'var(--text)' }}>{rule.nameUz}</p>
                              <div className="flex items-center gap-3 mt-1.5">
                                <span className="text-micro font-bold uppercase tracking-tight opacity-70" style={{ color: 'var(--text-muted)' }}>{rule.role}</span>
                                <span className="px-2 py-1 rounded-lg text-micro font-semibold uppercase tracking-widest border" style={{
                                  background: rule.category === 'automation' ? 'color-mix(in srgb, var(--info) 10%, transparent)' : 'color-mix(in srgb, var(--warning) 10%, transparent)',
                                  color: rule.category === 'automation' ? 'var(--info)' : 'var(--warning)',
                                  borderColor: rule.category === 'automation' ? 'color-mix(in srgb, var(--info) 20%, transparent)' : 'color-mix(in srgb, var(--warning) 20%, transparent)'
                                }}>
                                  {kpiCategoryLabel(rule.category)}
                                </span>
                              </div>
                            </div>
                            <div className="ml-5 text-right">
                              <p className="text-micro font-bold uppercase tracking-tight" style={{ color: 'var(--text-muted)' }}>Standart</p>
                              <p className="text-micro font-semibold tracking-tight mt-0.5" style={{ color: 'var(--accent-blue)' }}>+{rule.rewardPercent}/-{rule.penaltyPercent}%</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 mt-4">
                            <div className="flex items-center gap-3 p-2 rounded-lg border transition-colors shadow-sm" style={{ background: 'var(--input-bg)', borderColor: 'var(--card-border)' }}>
                              <label className="text-micro font-semibold uppercase tracking-widest whitespace-nowrap pl-2" style={{ color: 'var(--success)' }}>Bonus %:</label>
                              <input
                                type="number"
                                step="0.1"
                                disabled={isSaving}
                                placeholder="Standart"
                                className="flex-1 bg-transparent border-none outline-none text-meta font-semibold font-mono uppercase transition-colors disabled:opacity-50"
                                style={{ color: 'var(--text)' }}
                                value={currentReward}
                                onBlur={async (e) => {
                                  const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                  if (val === currentReward) return;
                                  setIsSavingKpi(rule.id);
                                  try {
                                    await upsertCompanyKpiRule({
                                      id: compRule?.id,
                                      companyId: company.id,
                                      ruleId: rule.id,
                                      rewardPercent: val,
                                      penaltyPercent: compRule?.penaltyPercent ?? null,
                                      isActive: true
                                    });
                                    const freshRules = await getCompanyKpiRules(company.id);
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
                            <div className="flex items-center gap-3 p-2 rounded-lg border transition-colors shadow-sm" style={{ background: 'var(--input-bg)', borderColor: 'var(--card-border)' }}>
                              <label className="text-micro font-semibold uppercase tracking-widest whitespace-nowrap pl-2" style={{ color: 'var(--danger)' }}>Jarima %:</label>
                              <input
                                type="number"
                                step="0.1"
                                disabled={isSaving}
                                placeholder="Standart"
                                className="flex-1 bg-transparent border-none outline-none text-meta font-semibold font-mono uppercase transition-colors disabled:opacity-50"
                                style={{ color: 'var(--text)' }}
                                value={currentPenalty}
                                onBlur={async (e) => {
                                  const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                  if (val === currentPenalty) return;
                                  setIsSavingKpi(rule.id);
                                  try {
                                    await upsertCompanyKpiRule({
                                      id: compRule?.id,
                                      companyId: company.id,
                                      ruleId: rule.id,
                                      rewardPercent: compRule?.rewardPercent ?? null,
                                      penaltyPercent: val,
                                      isActive: true
                                    });
                                    const freshRules = await getCompanyKpiRules(company.id);
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
                      <div className="p-10 text-center rounded-xl border border-dashed transition-colors" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <AlertTriangle size={24} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                        <p className="text-micro font-bold uppercase tracking-widest opacity-50" style={{ color: 'var(--text-muted)' }}>Hech qanday KPI qoidasi topilmadi</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'tarix' && (
            <div className="animate-fade-in px-2">
              {/* E4: `AuditLog` allaqachon yozilardi, lekin foydalanuvchi turgan
                  joyda ko'rinmasdi. Endi "kim, qachon, nimani o'zgartirdi"
                  savoliga shu yerda javob bor. */}
              <div className="dashboard-card p-5 !shadow-sm">
                <div className="flex items-center gap-3 mb-5 pb-4 border-b" style={{ borderColor: 'var(--card-border)' }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--brand-ghost)', color: 'var(--brand)' }}>
                    <History size={18} />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>O&apos;zgarishlar tarixi</h2>
                    <p className="text-meta" style={{ color: 'var(--text-muted)' }}>Kim, qachon va nimani o&apos;zgartirdi</p>
                  </div>
                </div>
                <RecordTimeline tableName="Company" recordId={company.id} />
              </div>
            </div>
          )}
        </TabPanel>
      </div>
    </>,
    document.body
  );
};

export default CompanyDrawer;

// =====================================================
// SHARTNOMALAR PANELI
// =====================================================
//
// `Contract` jadvali bor edi, lekin ekranda faqat O'QILARDI — yangi shartnoma
// qo'shishning yagona yo'li 1C importi edi. Shu sababdan yangi mijozning
// shartnomasi eski bitta ustunga (`Company.contractNumber`) tushib qolar va
// bitta mijozda bir nechta shartnoma bo'lishi ko'tarilmasdi.
//
// TO'LOV TURI (naqd/plastik/bank) bu yerda YO'Q: u shartnomaning emas, har
// bir to'lovning xossasi va kirim kassasida tanlanadi.

interface ContractRow {
  id: string;
  number: string;
  signedAt: string | null;
  amount: number | null;
  source?: string;
  isActive?: boolean;
  ownFirmName?: string | null;
}

function ContractsPanel({ companyId, initial }: { companyId: string; initial: ContractRow[] }) {
  const [rows, setRows] = useState<ContractRow[]>(initial);
  const [editing, setEditing] = useState<ContractRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [number, setNumber] = useState('');
  const [signedAt, setSignedAt] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    const fresh = await getCompanyContracts(companyId);
    setRows(
      fresh.map((c: any) => ({
        id: c.id,
        number: c.number,
        signedAt: c.signedAt,
        amount: c.amount == null ? null : Number(c.amount),
        source: c.source,
        isActive: c.isActive,
        ownFirmName: c.ownFirm?.name ?? null,
      }))
    );
  };

  const openNew = () => {
    setEditing(null);
    setAdding(true);
    setNumber('');
    setSignedAt('');
    setAmount('');
    setError(null);
  };

  const openEdit = (row: ContractRow) => {
    setAdding(false);
    setEditing(row);
    setNumber(row.number);
    setSignedAt(row.signedAt ? String(row.signedAt).slice(0, 10) : '');
    setAmount(row.amount != null ? String(row.amount) : '');
    setError(null);
  };

  const close = () => {
    setAdding(false);
    setEditing(null);
    setError(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        number,
        signedAt: signedAt || null,
        amount: amount ? Number(amount.replace(/[^\d.]/g, '')) : null,
      };
      if (editing) await updateContract(editing.id, payload);
      else await createContract({ companyId, ...payload });
      await reload();
      close();
    } catch (e) {
      setError(friendlyError(e) || 'Saqlab bo\'lmadi');
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async (row: ContractRow) => {
    setBusy(true);
    setError(null);
    try {
      await deactivateContract(row.id);
      await reload();
    } catch (e) {
      setError(friendlyError(e) || 'Bajarib bo\'lmadi');
    } finally {
      setBusy(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--input-bg)',
    border: '1px solid var(--card-border)',
    color: 'var(--text)',
  };

  const total = rows.filter(r => r.isActive !== false).reduce((sum, k) => sum + (k.amount ?? 0), 0);

  return (
    <div className="dashboard-card overflow-hidden !shadow-sm">
      <div
        className="px-3 py-2 flex items-center justify-between gap-2"
        style={{ background: 'var(--input-bg)', borderBottom: '1px solid var(--card-border)' }}
      >
        <h4 className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text)' }}>
          Shartnomalar ({rows.length})
        </h4>
        <div className="flex items-center gap-2">
          <span className="text-micro font-bold tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {formatNum(total)} so&apos;m
          </span>
          <button
            onClick={openNew}
            className="flex items-center gap-1 px-2 py-1 rounded text-micro font-semibold"
            style={{ background: 'var(--accent-blue)', color: '#fff' }}
          >
            <Plus size={12} /> Qo&apos;shish
          </button>
        </div>
      </div>

      {error && (
        <p className="px-3 py-2 text-micro" style={{ color: 'var(--danger)' }}>{error}</p>
      )}

      {(adding || editing) && (
        <div className="p-3 space-y-2" style={{ borderBottom: '1px solid var(--card-border)' }}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="block">
              <span className="text-micro" style={{ color: 'var(--text-muted)' }}>Shartnoma raqami *</span>
              <input
                className="w-full mt-1 px-2 py-1.5 rounded text-meta outline-none"
                style={inputStyle}
                value={number}
                onChange={e => setNumber(e.target.value)}
                placeholder="02/26BK"
              />
            </label>
            <label className="block">
              <span className="text-micro" style={{ color: 'var(--text-muted)' }}>Sana</span>
              <input
                type="date"
                className="w-full mt-1 px-2 py-1.5 rounded text-meta outline-none"
                style={inputStyle}
                value={signedAt}
                onChange={e => setSignedAt(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-micro" style={{ color: 'var(--text-muted)' }}>Oylik summa (so&apos;m)</span>
              <input
                inputMode="numeric"
                className="w-full mt-1 px-2 py-1.5 rounded text-meta text-right tabular-nums outline-none"
                style={inputStyle}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="3000000"
              />
            </label>
          </div>
          <p className="text-micro" style={{ color: 'var(--text-muted)' }}>
            To&apos;lov turi (naqd / plastik / bank) shartnomada emas — u har bir to&apos;lovda
            kirim kassasida tanlanadi.
          </p>
          <div className="flex gap-2">
            <button
              disabled={busy || !number.trim()}
              onClick={save}
              className="px-3 py-1.5 rounded text-micro font-semibold disabled:opacity-50"
              style={{ background: 'var(--accent-blue)', color: '#fff' }}
            >
              {busy ? 'Saqlanmoqda…' : 'Saqlash'}
            </button>
            <button
              onClick={close}
              className="px-3 py-1.5 rounded text-micro font-semibold"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}
            >
              Bekor qilish
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="px-3 py-3 text-meta" style={{ color: 'var(--text-muted)' }}>
          Shartnoma kiritilmagan.
        </p>
      ) : (
        <div className="divide-y" style={{ borderColor: 'var(--card-border)' }}>
          {rows.map(k => (
            <div
              key={k.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
              style={{ opacity: k.isActive === false ? 0.5 : 1 }}
            >
              <div className="min-w-0">
                <p className="text-body font-semibold tracking-tight truncate" style={{ color: 'var(--text)' }}>
                  {k.number}
                  {k.isActive === false && (
                    <span className="text-micro ml-2" style={{ color: 'var(--text-muted)' }}>nofaol</span>
                  )}
                </p>
                <p className="text-micro" style={{ color: 'var(--text-muted)' }}>
                  {k.signedAt ? formatUzDate(k.signedAt) : 'sana ko\'rsatilmagan'}
                  {k.ownFirmName ? ` · ${k.ownFirmName}` : ''}
                  {k.source === '1c_import' ? ' · 1C' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-body font-semibold tabular-nums whitespace-nowrap" style={{ color: 'var(--text)' }}>
                  {k.amount != null ? `${formatNum(k.amount)} so'm` : '—'}
                </span>
                <button onClick={() => openEdit(k)} title="Tahrirlash" style={{ color: 'var(--text-muted)' }}>
                  <Pencil size={14} />
                </button>
                {k.isActive !== false && (
                  <button
                    onClick={() => deactivate(k)}
                    disabled={busy}
                    title="Nofaol qilish (o'chirilmaydi — to'lovlar tarixi saqlanadi)"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
