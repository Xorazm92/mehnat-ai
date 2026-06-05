import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AlertCircle, Eye, EyeOff, TrendingUp } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import ErrorBoundary from './components/ErrorBoundary';
import { lazyWithRetry } from './lib/lazyWithRetry';

// Lazy load heavy modules with retry logic
const Dashboard = lazyWithRetry(() => import('./components/Dashboard'));
const OrganizationModule = lazyWithRetry(() => import('./components/OrganizationModule'));
const OperationModule = lazyWithRetry(() => import('./components/OperationModule'));
const StaffModule = lazyWithRetry(() => import('./components/StaffModule'));
const StaffKPIReport = lazyWithRetry(() => import('./components/StaffKPIReport'));
const StaffProfileDrawer = lazyWithRetry(() => import('./components/StaffProfileDrawer'));
const CompanyDrawer = lazyWithRetry(() => import('./components/CompanyDrawer'));
const SalaryKPIModule = lazyWithRetry(() => import('./components/SalaryKPIModule'));
const KassaModule = lazyWithRetry(() => import('./components/KassaModule'));
const ExpenseModule = lazyWithRetry(() => import('./components/ExpenseModule'));
const StaffCabinet = lazyWithRetry(() => import('./components/StaffCabinet'));
const PayrollDrafts = lazyWithRetry(() => import('./components/PayrollDrafts'));
const AuditLogModule = lazyWithRetry(() => import('./components/AuditLogModule'));
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
import { translations } from './lib/translations';

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
  const [connectionError, setConnectionError] = useState<string | null>(null);

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
      let sessionExists = false;

      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        setSession(data.session);
        if (data.session?.user) {
          currentUserId = data.session.user.id;
          sessionExists = true;
          await loadProfile(currentUserId);
          await refreshData();
        }
      } catch (err: any) {
        console.error('Session initialization error:', err);
        const msg = String(err?.message || '');
        
        // Detect connection/DNS errors
        if (
          msg.includes('Failed to fetch') || 
          msg.includes('Load failed') || 
          msg.includes('net::ERR_NAME_NOT_RESOLVED') ||
          msg.includes('fetch failed')
        ) {
          setConnectionError('supabase_unreachable');
          setIsLoading(false);
          return;
        }

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

      // Start token rotation for active sessions
      if (sessionExists) {
        const loadAuth = async (retries = 2): Promise<void> => {
          try {
            const { startTokenRotation } = await import('./lib/auth');
            startTokenRotation();
          } catch (err) {
            if (retries > 0) {
              await new Promise(r => setTimeout(r, 1000));
              return loadAuth(retries - 1);
            }
            console.error('Failed to start token rotation after retries:', err);
          }
        };
        loadAuth();
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
      // Batch #1: Core dimensions
      const [c, s] = await Promise.all([
        fetchCompanies(),
        fetchStaff()
      ]);

      // Batch #2: Heavy transaction dimensions
      const [ops, reports] = await Promise.all([
        fetchOperations(),
        fetchMonthlyReports()
      ]);

      // Batch #3: Financials and metrics
      const [kpi, p, e, ass] = await Promise.all([
        fetchKpiMetrics(),
        fetchPayments(),
        fetchExpenses(),
        fetchContractAssignments()
      ]);

      console.log('[refreshData] Companies fetched:', c.length);
      console.log('[refreshData] Staff fetched:', s.length);
      console.log('[refreshData] Operations fetched:', ops.length);

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
      // Log the specific error for debugging
      console.error('[refreshData] error details:', {
        message: err?.message,
        code: err?.code,
        status: err?.status,
        hint: err?.hint,
        details: err?.details
      });
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
      <div className="min-h-screen flex items-center justify-center bg-[#F0F1F3] dark:bg-[#1A1D23]">
        <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 rounded-md p-12 flex flex-col items-center gap-6 shadow-md animate-macos">
          <div className="relative">
            <div className="w-14 h-14 border-3 border-gray-200 dark:border-gray-600 border-t-yellow-500 rounded-full animate-spin"></div>
          </div>
          <div className="text-center">
            <img src="/logo.png" alt="Logo" className="w-14 h-14 object-contain mx-auto mb-4" />
            <h1 className="text-lg font-bold text-gray-800 dark:text-white mb-1">ASOS Бухгалтерия</h1>
            <p className="text-[11px] text-gray-400 font-medium">{translations[lang].initializing}</p>
          </div>
        </div>
      </div>
    );
  }

  if (connectionError === 'supabase_unreachable') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#F0F1F3] dark:bg-[#1A1D23]">
        <div className="w-full max-w-lg animate-macos">
          <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 rounded-md shadow-md overflow-hidden">
            {/* 1C-style error header */}
            <div className="bg-red-600 px-4 py-3 flex items-center gap-3">
              <AlertCircle size={20} className="text-white" />
              <h2 className="text-[14px] font-bold text-white">Ulanish xatosi</h2>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-[13px] text-gray-700 dark:text-gray-300 font-medium">
                Ma'lumotlar bazasiga ulanib bo'lmadi. Buning sabablari:
              </p>
              <ul className="space-y-2">
                {[
                  "Supabase loyihangiz to'xtatilgan (paused) bo'lishi mumkin.",
                  "Internet aloqangizda muammo bo'lishi mumkin.",
                  "VITE_SUPABASE_URL manzili noto'g'ri bo'lishi mumkin."
                ].map((text, i) => (
                  <li key={i} className="flex gap-2 items-start text-[12px] text-gray-600 dark:text-gray-400">
                    <span className="w-5 h-5 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-gray-500">
                      {i + 1}
                    </span>
                    {text}
                  </li>
                ))}
              </ul>

              <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => window.location.reload()}
                  className="flex-1 py-2 bg-blue-600 text-white font-semibold text-[13px] rounded hover:bg-blue-700 transition-colors"
                >
                  Qayta urinish
                </button>
                <a
                  href="https://supabase.com/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 flex items-center justify-center font-semibold text-[13px] rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Supabase Dashboard
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#F0F1F3] dark:bg-[#1A1D23]">
        <Toaster position="top-center" richColors />

        <div className="w-full max-w-md animate-macos">
          {/* 1C-style Login Card */}
          <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 rounded-md shadow-lg overflow-hidden">
            {/* Yellow 1C Header */}
            <div className="bg-gradient-to-r from-yellow-400 to-yellow-500 dark:from-yellow-700 dark:to-yellow-800 px-6 py-4 flex items-center gap-4">
              <div className="h-12 w-12 flex items-center justify-center bg-white/30 dark:bg-white/10 rounded">
                <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-yellow-100">ASOS Бухгалтерия</h1>
                <p className="text-[11px] text-gray-700 dark:text-yellow-300/70 font-medium">{translations[lang].integratedNeuralNetwork}</p>
              </div>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSignIn} className="p-6 space-y-5">
              <div>
                <label className="block text-[12px] font-semibold text-gray-600 dark:text-gray-400 mb-1.5">{translations[lang].accessIdentifier}</label>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="email@asos.uz"
                  className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-3 py-2.5 text-[14px] text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all"
                  required
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-[12px] font-semibold text-gray-600 dark:text-gray-400">{translations[lang].securityHashcode}</label>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-medium">{translations[lang].emergencyProtocol}</span>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-3 py-2.5 text-[14px] text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {authError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded flex items-center gap-3 text-red-600 dark:text-red-400">
                  <AlertCircle size={16} />
                  <p className="text-[12px] font-semibold">{authError}</p>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2.5 text-white font-bold text-[14px] rounded transition-colors flex items-center justify-center gap-2"
                style={{ background: '#3366CC' }}
                onMouseOver={(e) => (e.currentTarget.style.background = '#1A3D7A')}
                onMouseOut={(e) => (e.currentTarget.style.background = '#3366CC')}
              >
                <TrendingUp size={16} />
                {translations[lang].authorizeTransmission}
              </button>
            </form>

            {/* Footer */}
            <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-center">
              <p className="text-[10px] text-gray-400">ASOS Intelligence v2.0</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="h-screen flex selection:bg-blue-200/50 overflow-hidden bg-[#F0F1F3] dark:bg-[#1A1D23] text-gray-800 dark:text-gray-200">
        <Toaster
          position="top-center"
          richColors
          toastOptions={{
            style: {
              background: '#fff',
              border: '1px solid #E0E3E8',
              borderRadius: '4px',
              fontWeight: 600,
              fontSize: '13px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)'
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

        <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden transition-all duration-200 relative z-10">
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
            onMarkAsRead={handleMarkAsRead}
            onDeleteNotification={handleDeleteNotification}
            selectedPeriod={selectedPeriod}
            onPeriodChange={setSelectedPeriod}
          />

          <div className={`flex-1 ${activeView === 'reports' ? 'overflow-hidden relative' : 'overflow-y-auto overflow-x-hidden'}`}>
            <div className={`${activeView === 'reports' ? 'absolute inset-0 flex flex-col' : 'w-full min-h-full'} p-3 sm:p-4 md:p-5 lg:p-4 animate-macos`}>
              {/* Access Control for Main Content */}
              {(!((ALLOWED_VIEWS[(userRole as UserRole) || ROLES.ACCOUNTANT] || ALLOWED_VIEWS[ROLES.ACCOUNTANT]).includes(activeView))) ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-center justify-center mb-6">
                    <AlertCircle size={32} className="text-red-500" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Ruxsat berilmagan</h2>
                  <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-6">Ushbu bo'limga kirish huquqi mavjud emas</p>
                  <button
                    onClick={() => setActiveView('dashboard')}
                    className="px-6 py-2 bg-blue-600 text-white rounded font-semibold text-[13px] hover:bg-blue-700 transition-colors"
                  >
                    Bosh sahifaga qaytish
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

                  {activeView === 'staff' && (
                    <StaffModule
                      staff={staff}
                      companies={companies}
                      operations={operations}
                      lang={lang}
                      onSave={async (s) => {
                        try {
                          await upsertStaff(s);
                          toast.success('Xodim muvaffaqiyatli saqlandi');
                          refreshData();
                        } catch (e: any) {
                          console.error(e);
                          toast.error(e.message || 'Xodimni saqlashda xatolik yuz berdi');
                        }
                      }}
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
                      onSavePayment={async (p) => {
                        try {
                          await upsertPayment(p);
                          refreshData();
                        } catch (e: any) {
                          console.error('Kassa save error:', e);
                          throw e; // KassaModule will catch this and show toast
                        }
                      }}
                      onDeletePayment={async (id) => {
                        try {
                          await deletePayment(id);
                          toast.success(lang === 'uz' ? 'To\'lov o\'chirildi' : 'Платеж удален');
                          refreshData();
                        } catch (e) {
                          console.error(e);
                          toast.error(lang === 'uz' ? 'O\'chirishda xatolik.' : 'Ошибка при удалении.');
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
                </React.Suspense>
              )}
            </div>
          </div>
        </main>

        {/* Global Overlays (Outside of transformed/scrolled containers) */}
        <React.Suspense fallback={null}>
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
              onSave={async (c, assignments) => {
                if (assignments && assignments.length > 0) {
                  // Full atomic save via the RPC (same as wizard)
                  await onboardCompany(c, assignments);
                } else {
                  await upsertCompany(c);
                }
                refreshData();
              }}
            />
          )}
        </React.Suspense>
      </div>
    </ErrorBoundary>
  );
};

export default App;
