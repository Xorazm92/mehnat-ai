import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AlertCircle, Eye, EyeOff, TrendingUp } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';

// Lazy load heavy modules
const Dashboard = React.lazy(() => import('./components/Dashboard'));
const OrganizationModule = React.lazy(() => import('./components/OrganizationModule'));
const OperationModule = React.lazy(() => import('./components/OperationModule'));
const AnalysisModule = React.lazy(() => import('./components/AnalysisModule'));
const StaffModule = React.lazy(() => import('./components/StaffModule'));
const StaffKPIReport = React.lazy(() => import('./components/StaffKPIReport'));
const StaffProfileDrawer = React.lazy(() => import('./components/StaffProfileDrawer'));
const CompanyDrawer = React.lazy(() => import('./components/CompanyDrawer'));
const DocumentsModule = React.lazy(() => import('./components/DocumentsModule'));
const SalaryKPIModule = React.lazy(() => import('./components/SalaryKPIModule'));
const KassaModule = React.lazy(() => import('./components/KassaModule'));
const ExpenseModule = React.lazy(() => import('./components/ExpenseModule'));
const StaffCabinet = React.lazy(() => import('./components/StaffCabinet'));
const PayrollDrafts = React.lazy(() => import('./components/PayrollDrafts'));
const AuditLogModule = React.lazy(() => import('./components/AuditLogModule'));
import { AppView, Company, OperationEntry, Staff, AccountantKPI, ReportStatus, Language, Payment, Expense, EmployeeSalarySummary, ContractAssignment, AppNotification } from './types';
import { supabase } from './lib/supabaseClient';
import {
  fetchProfile,
  fetchCompanies,
  fetchOperations,
  fetchMonthlyReports,
  fetchStaff,
  fetchKpiMetrics,
  fetchPayments,
  fetchExpenses,
  fetchContractAssignments,
  upsertCompany,
  deleteCompany,
  onboardCompany,
  upsertOperation,
  ensureOperationSnapshot,
  upsertOperationsBatch,
  upsertStaff,
  deleteStaff,
  upsertPayment,
  upsertExpense,
  deletePayment,
  deleteExpense,
  fetchNotifications,
  markNotificationAsRead,
  deleteNotification
} from './lib/supabaseData';
import { seedFirmaData } from './lib/seedFirmaData';
import type { Session } from '@supabase/supabase-js';
import { ALLOWED_VIEWS, ROLES, UserRole } from './lib/permissions';
import { getCurrentPeriod, periodsEqual } from './lib/periods';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [lang, setLang] = useState<Language>(() => (localStorage.getItem('lang') as Language) || 'uz');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark' ||
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  const [companies, setCompanies] = useState<Company[]>([]);
  const [operations, setOperations] = useState<OperationEntry[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [assignments, setAssignments] = useState<ContractAssignment[]>([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedPeriod, setSelectedPeriod] = useState(() => getCurrentPeriod());
  const [isSyncing, setIsSyncing] = useState(false);
  const initialized = useRef(false);
  const [lastSync, setLastSync] = useState('');
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [svodOperationFilter, setSvodOperationFilter] = useState<string>('all');
  const [showPassword, setShowPassword] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const pendingReportsCount = useMemo(() => {
    // Only count for relevant roles (Supervisor/Admin) or show own pending actions for Accountants?
    // For now, matching the "Notification" context which usually implies "To Do" for the user.
    if (userRole === 'accountant') {
      // For accountants, maybe show "Rejected" or "New" tasks?
      // Leaving 0 for now to keep it clean, or could count 'rejected'
      return 0;
    }

    return operations
      .filter(op => periodsEqual(op.period, selectedPeriod))
      .flatMap(op => op.tasks || [])
      .filter(t => t.status === 'pending_review')
      .length;
  }, [operations, selectedPeriod, userRole]);

  useEffect(() => {
    if (selectedCompany) {
      const updated = companies.find(c => c.id === selectedCompany.id);
      if (updated) setSelectedCompany(updated);
    }
  }, [companies]);

  useEffect(() => {
    const init = async () => {
      if (initialized.current) return;
      initialized.current = true;

      const clearAuthStorage = () => {
        if (typeof window === 'undefined') return;

        const keys: string[] = [];
        try {
          for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i);
            if (k) keys.push(k);
          }
        } catch { }

        for (const k of keys) {
          const lk = k.toLowerCase();
          if (
            (lk.startsWith('sb-') && lk.includes('auth-token')) ||
            lk.includes('supabase.auth.token')
          ) {
            try { window.localStorage.removeItem(k); } catch { }
          }
        }
      };

      let currentUserId: string | undefined;

      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        setSession(data.session);
        if (data.session?.user) {
          currentUserId = data.session.user.id;
          await loadProfile(currentUserId);
          await refreshData();
        }
      } catch (err: any) {
        console.error('Session initialization error:', err);
        const msg = String(err?.message || '');
        if (
          msg.includes('Refresh Token Not Found') ||
          msg.includes('Invalid Refresh Token')
        ) {
          try { await supabase.auth.signOut(); } catch { }
          try { clearAuthStorage(); } catch { }
          setSession(null);
          setCompanies([]);
          setOperations([]);
          setStaff([]);
          setNotifications([]);
          if (typeof window !== 'undefined') {
            window.location.reload();
          }
        }
      }

      // Realtime Notifications
      const channel = supabase
        .channel('db-notifications')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' },
          payload => {
            const newNotif = payload.new as any;
            if (newNotif.user_id === currentUserId) {
              setNotifications(prev => [{
                id: newNotif.id,
                userId: newNotif.user_id,
                type: newNotif.type,
                title: newNotif.title,
                message: newNotif.message,
                link: newNotif.link,
                isRead: newNotif.is_read,
                createdAt: newNotif.created_at
              }, ...prev]);
              toast.info(newNotif.title, { description: newNotif.message });
            }
          })
        .subscribe();

      const { data: listener } = supabase.auth.onAuthStateChange(async (event, s) => {
        if (event === 'SIGNED_OUT') {
          initialized.current = false;
        }

        setSession(s);
        if (s?.user) {
          await loadProfile(s.user.id);
          // Only refresh if not just initialized
          if (event !== 'INITIAL_SESSION') {
            await refreshData();
          }
        } else {
          setCompanies([]);
          setOperations([]);
          setStaff([]);
          setNotifications([]);
        }
      });
      setIsLoading(false);
      return () => {
        listener.subscription.unsubscribe();
        supabase.removeChannel(channel);
      };
    };
    init();
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const loadProfile = async (userId: string) => {
    const profile = await fetchProfile(userId);
    if (profile) {
      setUserName(profile.full_name || '');
      setUserRole(profile.role || '');
    }
  };

  const refreshData = async () => {
    setIsSyncing(true);
    try {
      const [c, ops, reports, s, kpi, p, e, ass] = await Promise.all([
        fetchCompanies(),
        fetchOperations(),
        fetchMonthlyReports(),
        fetchStaff(),
        fetchKpiMetrics(),
        fetchPayments(),
        fetchExpenses(),
        fetchContractAssignments()
      ]);

      const isUUID = (str?: string) => str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

      // Helper to resolve name from staff list
      const resolveName = (id?: string) => {
        if (!id) return '';
        return s.find(staff => staff.id === id)?.name || '';
      };

      // Enrich Companies
      const enrichedCompanies = c.map(comp => ({
        ...comp,
        accountantName: (comp.accountantName && !isUUID(comp.accountantName)) ? comp.accountantName : resolveName(comp.accountantId),
        supervisorName: (comp.supervisorName && !isUUID(comp.supervisorName)) ? comp.supervisorName : resolveName(comp.supervisorId),
        bankClientName: (comp.bankClientName && !isUUID(comp.bankClientName)) ? comp.bankClientName : resolveName(comp.bankClientId),
        chiefAccountantName: (comp.chiefAccountantName && !isUUID(comp.chiefAccountantName)) ? comp.chiefAccountantName : resolveName(comp.chiefAccountantId),
      }));

      // Merge operations (tasks/kpi) with monthly reports (historical snapshots/columns)
      const unifiedOps: OperationEntry[] = [...reports];

      ops.forEach(op => {
        const existingIdx = unifiedOps.findIndex(r => r.companyId === op.companyId && r.period === op.period);
        if (existingIdx !== -1) {
          unifiedOps[existingIdx] = { ...unifiedOps[existingIdx], ...op };
        } else {
          unifiedOps.push(op);
        }
      });

      // Enrich Operations with names
      const enrichedOps = unifiedOps.map(op => ({
        ...op,
        assigned_accountant_name: (op.assigned_accountant_name && !isUUID(op.assigned_accountant_name)) ? op.assigned_accountant_name : resolveName(op.assigned_accountant_id),
        assigned_supervisor_name: (op.assigned_supervisor_name && !isUUID(op.assigned_supervisor_name)) ? op.assigned_supervisor_name : resolveName(op.assigned_supervisor_id),
        assigned_bank_manager_name: (op.assigned_bank_manager_name && !isUUID(op.assigned_bank_manager_name)) ? op.assigned_bank_manager_name : resolveName(op.assigned_bank_manager_id),
      }));

      setCompanies(enrichedCompanies);
      setOperations(enrichedOps);
      setStaff(s);
      setPayments(p);
      setExpenses(e);
      setAssignments(ass);
      if (session?.user) {
        const notifs = await fetchNotifications(session.user.id);
        setNotifications(notifs);
      }
      setLastSync(new Date().toLocaleString());
    } catch (err: any) {
      console.error('[refreshData] failed', err);
      const msg = err?.message || 'Supabase bilan ulanishda xatolik';
      toast.error(msg);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    await markNotificationAsRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const handleDeleteNotification = async (id: string) => {
    await deleteNotification(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const toggleTheme = () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    localStorage.setItem('theme', newTheme ? 'dark' : 'light');
  };

  const toggleLang = () => {
    const newLang = lang === 'uz' ? 'ru' : 'uz';
    setLang(newLang);
    localStorage.setItem('lang', newLang);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      toast.info('Ma\'lumotlar yangilanmoqda...');
      const seedResult = await seedFirmaData();
      if (seedResult.success) {
        toast.success(`Tizim yangilandi! ${seedResult.count} ta firma tekshirildi.`);
      } else {
        toast.warning('Fayldan yangilashda xatolik, lekin tizim ishmoqda.');
      }
      await refreshData();
    } catch (e) {
      console.error(e);
      toast.error('Xatolik yuz berdi');
    } finally {
      setIsSyncing(false);
    }
  };



  const handleDashboardFilter = (filterId: string) => {
    setActiveFilter(filterId);
    setActiveView('reports');
  };

  const handleAnalysisFilterApply = (filterStr: string) => {
    setActiveFilter(filterStr);
    setActiveView('reports');
  };

  const kpis: AccountantKPI[] = useMemo(() => {
    const REPORT_FIELDS = [
      'didox', 'xatlar', 'avtokameral', 'my_mehnat', 'one_c',
      'pul_oqimlari', 'chiqadigan_soliqlar', 'hisoblangan_oylik', 'debitor_kreditor', 'foyda_va_zarar', 'tovar_ostatka',
      'aylanma_qqs', 'daromad_soliq', 'inps', 'foyda_soliq',
      'moliyaviy_natija', 'buxgalteriya_balansi', 'statistika',
      'bonak', 'yer_soligi', 'mol_mulk_soligi', 'suv_soligi'
    ] as const;

    return staff.map(s => {
      const assignedIdsFromAssignmentsArr: string[] = assignments
        .filter(a => a.role === 'accountant' && a.userId === s.id)
        .map(a => String(a.clientId));
      const assignedCompanyIdsFromAssignments = new Set<string>(assignedIdsFromAssignmentsArr);

      const assignedIdsFromCompaniesArr: string[] = companies
        .filter(c => c.accountantId === s.id)
        .map(c => String(c.id));
      const assignedCompanyIdsFromCompanies = new Set<string>(assignedIdsFromCompaniesArr);

      const assignedCompanyIds = new Set<string>([
        ...Array.from(assignedCompanyIdsFromAssignments),
        ...Array.from(assignedCompanyIdsFromCompanies)
      ]);

      const assignedCompanies = companies.filter(c => assignedCompanyIds.has(c.id));

      let annualCompleted = 0;
      let annualPending = 0;
      let annualBlocked = 0;
      let statsCompleted = 0;
      let totalPoints = 0;
      const totalCompanies = assignedCompanies.length;

      assignedCompanies.forEach(company => {
        const op = operations.find(o => o.companyId === company.id && periodsEqual(o.period, selectedPeriod));

        if (svodOperationFilter !== 'all') {
          totalPoints++;
          const val = String((op as any)?.[svodOperationFilter] || '').trim().toLowerCase();
          if (val === '+' || val === 'topshirildi' || val.startsWith('+')) annualCompleted++;
          else if (val === 'kartoteka') annualBlocked++;
          else if (val === '-' || val === 'rad etildi' || !val || val === '0') annualPending++;
          else annualCompleted++; // Catch-all for other non-negative values

          if (svodOperationFilter === 'statistika' && (val === '+' || val.startsWith('+'))) statsCompleted++;
        } else {
          // Aggregate across all fields
          REPORT_FIELDS.forEach(field => {
            totalPoints++;
            const val = String((op as any)?.[field] || '').trim().toLowerCase();
            if (val === '+' || val === 'topshirildi' || val.startsWith('+')) annualCompleted++;
            else if (val === 'kartoteka') annualBlocked++;
            else if (val === '-' || val === 'rad etildi' || !val || val === '0') annualPending++;
            else annualCompleted++;
          });

          const statVal = String((op as any)?.statistika || '').trim().toLowerCase();
          if (statVal === '+' || statVal.startsWith('+')) statsCompleted++;
        }
      });

      const annualProgress = totalPoints > 0 ? Math.round((annualCompleted / totalPoints) * 100) : 0;
      const statsProgress = totalCompanies > 0 ? Math.round((statsCompleted / totalCompanies) * 100) : 0;

      return {
        name: s.name,
        role: s.role,
        totalCompanies,
        annualCompleted,
        annualPending,
        annualBlocked,
        statsCompleted,
        annualProgress,
        statsProgress,
        zone: annualProgress >= 90 ? 'green' : (annualProgress >= 60 ? 'yellow' : 'red')
      };
    }).sort((a, b) => b.annualProgress - a.annualProgress);
  }, [staff, assignments, companies, operations, selectedPeriod, svodOperationFilter]);

  const selectedOperation = useMemo(() => {
    if (!selectedCompany) return null;
    return operations.find(o => o.companyId === selectedCompany.id && periodsEqual(o.period, selectedPeriod)) || null;
  }, [selectedCompany, operations, selectedPeriod]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    if (error) setAuthError(error.message);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUserName('');
    setUserRole('');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 relative overflow-hidden">
        {/* Iridescent Background Effects */}
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-[10%] left-[10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px] animate-pulse-slow"></div>
          <div className="absolute bottom-[10%] right-[10%] w-[40%] h-[40%] bg-emerald-500/10 rounded-full blur-[120px] animate-pulse-slow-reverse"></div>
        </div>

        <div className="liquid-glass-card p-16 rounded-[3rem] flex flex-col items-center gap-8 border border-white/20 shadow-glass-2xl relative z-10 animate-macos">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-indigo-500/10 border-t-indigo-500 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 bg-indigo-500/10 rounded-xl backdrop-blur-sm border border-indigo-500/20 shadow-glass flex items-center justify-center">
                <div className="w-4 h-4 bg-indigo-500 rounded-full animate-pulse"></div>
              </div>
            </div>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-widest uppercase mb-2">ASOS Intelligence</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] animate-pulse">Initializing Neural Core...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-[#020617] relative overflow-hidden">
        {/* Dynamic Background Mesh (Handled by CSS body V2, but adding local glows for extra depth) */}
        <div className="absolute inset-0 z-0 opacity-40">
          <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] bg-indigo-500/10 rounded-full blur-[180px]"></div>
          <div className="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] bg-blue-500/10 rounded-full blur-[180px]"></div>
        </div>

        <Toaster position="top-center" richColors />

        <div className="w-full max-w-xl relative z-10 animate-macos">
          {/* Top Branding Section */}
          <div className="text-center mb-16">
            <div className="relative inline-block group">
              <div className="absolute inset-0 bg-indigo-500/20 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
              <div className="w-28 h-28 mx-auto mb-10 liquid-glass-card rounded-[2.5rem] flex items-center justify-center p-0 border border-white/40 shadow-glass-2xl group-hover:scale-110 transition-transform duration-700">
                <div className="glass-reflection"></div>
                <img src="/logo.png" alt="Logo" className="w-16 h-16 object-contain relative z-10 drop-shadow-2xl" />
              </div>
            </div>
            <h1 className="text-6xl font-black text-slate-900 dark:text-white uppercase tracking-tighter leading-none mb-4 premium-text-gradient drop-shadow-sm">ASOS Intelligence</h1>
            <p className="text-[12px] font-black text-slate-400 dark:text-indigo-400/50 uppercase tracking-[0.5em] opacity-80">Integrated Enterprise Neural Network</p>
          </div>

          <form onSubmit={handleSignIn} className="liquid-glass-card p-12 md:p-20 border border-white/30 dark:border-white/10 group/form">
            <div className="glass-reflection"></div>

            <div className="space-y-10 relative z-10">
              <div className="group">
                <div className="flex justify-between items-center mb-5">
                  <label className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-400 group-focus-within:text-indigo-500 transition-colors">Access Identifier</label>
                </div>
                <div className="relative">
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="neural@asos.uz"
                    className="w-full bg-white/10 dark:bg-white/[0.03] border border-white/20 dark:border-white/5 rounded-3xl px-10 py-6 font-bold text-lg outline-none focus:bg-white/20 dark:focus:bg-white/10 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-slate-400/50"
                    required
                  />
                </div>
              </div>

              <div className="group">
                <div className="flex justify-between items-center mb-5">
                  <label className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-400 group-focus-within:text-indigo-500 transition-colors">Security Hashcode</label>
                  <span className="text-[9px] font-black text-slate-400/40 uppercase hover:text-indigo-500 cursor-pointer transition-colors">Emergency Protocol?</span>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-white/10 dark:bg-white/[0.03] border border-white/20 dark:border-white/5 rounded-3xl px-10 py-7 font-bold text-lg outline-none focus:bg-white/20 dark:focus:bg-white/10 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-slate-400/50 pr-20"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-8 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-indigo-500 transition-colors"
                  >
                    {showPassword ? <EyeOff size={28} strokeWidth={2.5} /> : <Eye size={28} strokeWidth={2.5} />}
                  </button>
                </div>
              </div>

              {authError && (
                <div className="p-6 bg-rose-500/5 border border-rose-500/20 rounded-3xl flex items-center gap-5 text-rose-500 animate-shake">
                  <AlertCircle size={24} strokeWidth={3} />
                  <p className="text-[12px] font-black uppercase tracking-widest">{authError}</p>
                </div>
              )}

              <button
                type="submit"
                className="w-full h-24 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-[13px] uppercase tracking-[0.4em] rounded-[2rem] hover:scale-[1.03] active:scale-[0.97] transition-all shadow-glass-indigo relative overflow-hidden group/btn"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-white/20 to-indigo-500/0 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-1000"></div>
                <span className="relative z-10 flex items-center justify-center gap-4">
                  Authorize Transmission <TrendingUp size={24} strokeWidth={3} />
                </span>
              </button>
            </div>
          </form>

          <div className="mt-16 text-center space-y-2 opacity-50">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.5em]">Global Security Verification Key: ASOS-UX-V2-PERFECT</p>
            <div className="flex justify-center gap-6 mt-4">
              <div className="h-1 w-12 bg-indigo-500/20 rounded-full"></div>
              <div className="h-1 w-12 bg-emerald-500/10 rounded-full"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex selection:bg-indigo-500/30 overflow-hidden bg-slate-50 dark:bg-[#050505] text-slate-900 dark:text-white">
      {/* Global Background Glows */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-500/[0.03] rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/[0.02] rounded-full blur-[120px]"></div>
      </div>

      <Toaster
        position="top-center"
        richColors
        toastOptions={{
          style: {
            background: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '24px',
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontSize: '11px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.1)'
          }
        }}
      />

      <Sidebar
        activeView={activeView}
        isOpen={isMobileMenuOpen}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        onClose={() => setIsMobileMenuOpen(false)}
        onViewChange={(view) => {
          setActiveView(view);
          setActiveFilter('all');
          setIsMobileMenuOpen(false);
          setSelectedCompany(null);
        }}
        lang={lang}
        userRole={userRole}
        pendingReportsCount={pendingReportsCount}
      />

      <main className={`flex-1 flex flex-col min-w-0 h-full overflow-hidden transition-all duration-500 ease-in-out relative z-10`}>
        <TopBar
          isDarkMode={isDarkMode}
          onThemeToggle={toggleTheme}
          lang={lang}
          onLangToggle={toggleLang}
          lastSync={lastSync}
          onSync={refreshData}
          isSyncing={isSyncing}
          onMenuToggle={() => setIsMobileMenuOpen(true)}
          userName={userName}
          userRole={userRole}
          onLogout={handleSignOut}
          onProfileClick={() => setActiveView('cabinet')}
          notifications={notifications}
          onDeleteNotification={handleDeleteNotification}
          selectedPeriod={selectedPeriod}
          onPeriodChange={setSelectedPeriod}
        />

        <div className="flex-1 overflow-y-auto scrollbar-none overflow-x-hidden">
          <div className="w-full p-4 sm:p-6 md:p-8 lg:p-6 animate-macos min-h-full group/main">
            {/* Access Control for Main Content */}
            {(!((ALLOWED_VIEWS[(userRole as UserRole) || ROLES.ACCOUNTANT] || ALLOWED_VIEWS[ROLES.ACCOUNTANT]).includes(activeView))) ? (
              <div className="flex flex-col items-center justify-center py-32 text-center">
                <div className="w-32 h-32 rounded-[3rem] bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-10 shadow-glass-rose">
                  <AlertCircle size={64} className="text-rose-500 drop-shadow-xl" />
                </div>
                <h2 className="text-5xl font-black text-slate-800 dark:text-white mb-4 tracking-tighter uppercase leading-none">Access Restricted</h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-black uppercase tracking-[0.4em]">Integrated Security Protocol Active — Authorization Level Insufficient</p>
                <button
                  onClick={() => setActiveView('dashboard')}
                  className="mt-12 px-10 py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:scale-105 transition-all shadow-glass"
                >
                  Return to Safe Zone
                </button>
              </div>
            ) : (
              <React.Suspense fallback={
                <div className="flex items-center justify-center py-20">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sahifa yuklanmoqda...</span>
                  </div>
                </div>
              }>
                {activeView === 'dashboard' && (
                  <>
                    <Dashboard
                      companies={companies}
                      operations={operations}
                      staff={staff}
                      payments={payments}
                      expenses={expenses}
                      activeFilter={'none'}
                      selectedPeriod={selectedPeriod}
                      onPeriodChange={setSelectedPeriod}
                      onFilterChange={handleDashboardFilter}
                      lang={lang}
                      userRole={userRole}
                      userId={session?.user?.id}
                    />
                    <StaffKPIReport
                      kpis={kpis}
                      staff={staff}
                      lang={lang}
                      onStaffSelect={setSelectedStaff}
                      selectedOperation={svodOperationFilter}
                      onOperationChange={setSvodOperationFilter}
                      selectedPeriod={selectedPeriod}
                    />
                  </>
                )}

                {activeView === 'organizations' && (
                  <OrganizationModule
                    companies={companies}
                    staff={staff}
                    lang={lang}
                    selectedPeriod={selectedPeriod}
                    operations={operations}
                    onPeriodChange={setSelectedPeriod}
                    onSave={async (c, assignments) => {
                      if (assignments) {
                        await onboardCompany(c, assignments);
                      } else {
                        await upsertCompany(c as Company);
                      }
                      // Snapshot for the selected period to track historical state
                      await ensureOperationSnapshot(c as Company, selectedPeriod);
                      refreshData();
                    }}
                    onDelete={async (id) => {
                      try {
                        await deleteCompany(id);
                        toast.success('Firma muvaffaqiyatli o\'chirildi');
                        refreshData();
                      } catch (e) {
                        console.error(e);
                        toast.error('O\'chirishda xatolik yuz berdi. Balki ushbu firmaga bog\'liq hujjatlar mavjuddir?');
                      }
                    }}
                    onCompanySelect={setSelectedCompany}
                  />
                )}

                {activeView === 'reports' && (
                  <OperationModule
                    companies={companies}
                    operations={operations}
                    activeFilter={activeFilter}
                    selectedPeriod={selectedPeriod}
                    onPeriodChange={setSelectedPeriod}
                    lang={lang}
                    onUpdate={async () => {
                      await refreshData();
                    }}
                    staff={staff}
                    onBatchUpdate={async (ops) => { await upsertOperationsBatch(ops); refreshData(); }}
                    onCompanySelect={setSelectedCompany}
                    userRole={userRole}
                    currentUserId={session?.user?.id}
                    userName={userName}
                  />
                )}

                {activeView === 'analysis' && (
                  <AnalysisModule
                    companies={companies}
                    operations={operations}
                    selectedPeriod={selectedPeriod}
                    onPeriodChange={setSelectedPeriod}
                    lang={lang}
                    onFilterApply={handleAnalysisFilterApply}
                    staff={staff}
                  />
                )}

                {activeView === 'staff' && (
                  <StaffModule
                    staff={staff}
                    companies={companies}
                    operations={operations}
                    lang={lang}
                    onSave={async (s) => { await upsertStaff(s); refreshData(); }}
                    onDelete={async (id) => {
                      try {
                        await deleteStaff(id);
                        toast.success('Xodim muvaffaqiyatli o\'chirildi');
                        refreshData();
                      } catch (e) {
                        console.error(e);
                        toast.error('Xodimni o\'chirish imkonsiz. Unga bog\'liq ma\'lumotlar bo\'lishi mumkin.');
                      }
                    }}
                    onStaffSelect={setSelectedStaff}
                  />
                )}

                {activeView === 'documents' && (
                  <DocumentsModule
                    companies={companies}
                    lang={lang}
                  />
                )}

                {activeView === 'kpi' && (
                  <SalaryKPIModule
                    companies={companies}
                    operations={operations}
                    staff={staff}
                    lang={lang}
                    currentUserId={session?.user?.id}
                    currentUserRole={userRole}
                  />
                )}

                {activeView === 'payroll' && (
                  <PayrollDrafts
                    staff={staff}
                    companies={companies}
                    operations={operations}
                    lang={lang}
                    userRole={userRole}
                  />
                )}

                {activeView === 'audit_logs' && (
                  <AuditLogModule lang={lang} />
                )}

                {activeView === 'kassa' && (
                  <KassaModule
                    companies={companies}
                    payments={payments}
                    lang={lang}
                    onSavePayment={async (p) => { await upsertPayment(p); refreshData(); }}
                    onDeletePayment={async (id) => {
                      try {
                        await deletePayment(id);
                        toast.success('To\'lov o\'chirildi');
                        refreshData();
                      } catch (e) {
                        console.error(e);
                        toast.error('O\'chirishda xatolik.');
                      }
                    }}
                  />
                )}

                {activeView === 'expenses' && (
                  <ExpenseModule
                    expenses={expenses}
                    lang={lang}
                    onSaveExpense={async (e) => { await upsertExpense(e); refreshData(); }}
                    onDeleteExpense={async (id) => {
                      try {
                        await deleteExpense(id);
                        toast.success('Xarajat o\'chirildi');
                        refreshData();
                      } catch (e) {
                        console.error(e);
                        toast.error('O\'chirishda xatolik.');
                      }
                    }}
                  />
                )}

                {activeView === 'cabinet' && session?.user && (
                  <StaffCabinet
                    currentStaff={staff.find(s => s.id === session.user.id) || { id: session.user.id, name: userName, role: userRole, avatarColor: '#3b82f6' }}
                    companies={companies}
                    operations={operations}
                    staff={staff}
                    lang={lang}
                  />
                )}

                {selectedStaff && (
                  <StaffProfileDrawer
                    staff={selectedStaff}
                    companies={companies}
                    assignments={assignments.filter(a => a.userId === selectedStaff.id)}
                    operations={operations}
                    lang={lang}
                    onClose={() => setSelectedStaff(null)}
                  />
                )}

                {selectedCompany && (
                  <CompanyDrawer
                    company={selectedCompany}
                    operation={selectedOperation}
                    payments={payments}
                    staff={staff}
                    lang={lang}
                    userId={session?.user?.id}
                    onClose={() => setSelectedCompany(null)}
                    onSave={async (c) => {
                      await upsertCompany(c);
                      refreshData();
                    }}
                  />
                )}
              </React.Suspense>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
