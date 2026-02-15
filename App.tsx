import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
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
import { getCurrentPeriod } from './lib/periods';

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
      .filter(op => op.period === selectedPeriod)
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
        if (err.message?.includes('Refresh Token Not Found')) {
          await supabase.auth.signOut();
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

      const { data: listener } = supabase.auth.onAuthStateChange(async (_event, s) => {
        setSession(s);
        if (s?.user) {
          await loadProfile(s.user.id);
          await refreshData();
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

    setCompanies(c);
    setOperations(unifiedOps);
    setStaff(s);
    setPayments(p);
    setExpenses(e);
    setAssignments(ass);
    if (session?.user) {
      const notifs = await fetchNotifications(session.user.id);
      setNotifications(notifs);
    }
    setLastSync(new Date().toLocaleString());
    setIsSyncing(false);
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
    return staff.map(s => {
      const myCompanies = companies.filter(c => c.accountantId === s.id);
      const myOps = operations.filter(op => op.period === selectedPeriod && myCompanies.some(c => c.id === op.companyId));

      const total = myCompanies.length;
      let annualCompleted = 0;
      let annualPending = 0;
      let annualBlocked = 0;
      let statsCompleted = 0;

      if (svodOperationFilter === 'all') {
        annualCompleted = myOps.filter(op => op.profitTaxStatus === ReportStatus.ACCEPTED || op.profitTaxStatus === ReportStatus.NOT_REQUIRED).length;
        annualPending = myOps.filter(op => op.profitTaxStatus === ReportStatus.NOT_SUBMITTED || op.profitTaxStatus === ReportStatus.REJECTED).length;
        annualBlocked = myOps.filter(op => op.profitTaxStatus === ReportStatus.BLOCKED || op.form1Status === ReportStatus.BLOCKED).length;
        statsCompleted = myOps.filter(op => op.statsStatus === ReportStatus.ACCEPTED).length;
      } else {
        // Filter by specific operation field
        myOps.forEach(op => {
          const val = String((op as any)[svodOperationFilter] || '').trim().toLowerCase();
          if (val === '+' || val === 'topshirildi') annualCompleted++;
          else if (val === '-' || val === 'rad etildi') annualPending++;
          else if (val === 'kartoteka') annualBlocked++;
          // Statistics is separate for legacy reasons but we can include it if svodOperationFilter === 'statistika'
          if (svodOperationFilter === 'statistika' && val === '+') statsCompleted++;
        });
      }

      const annualProgress = total > 0 ? Math.round((annualCompleted / total) * 100) : 0;
      const statsProgress = total > 0 ? Math.round((statsCompleted / total) * 100) : 0;

      return {
        name: s.name,
        role: s.role,
        totalCompanies: total,
        annualCompleted,
        annualPending,
        annualBlocked,
        statsCompleted,
        annualProgress,
        statsProgress,
        zone: annualProgress >= 90 ? 'green' : (annualProgress >= 60 ? 'yellow' : 'red')
      };
    }).sort((a, b) => b.annualProgress - a.annualProgress);
  }, [staff, companies, operations, selectedPeriod, svodOperationFilter]);

  const selectedOperation = useMemo(() => {
    if (!selectedCompany) return null;
    return operations.find(o => o.companyId === selectedCompany.id && o.period === selectedPeriod) || null;
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
      <div className="min-h-screen flex items-center justify-center text-slate-500 font-bold uppercase tracking-widest bg-slate-50 dark:bg-apple-darkBg">
        Yuklanmoqda...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-apple-darkBg p-6">
        <Toaster position="top-center" richColors />
        <form onSubmit={handleSignIn} className="w-full max-w-md bg-white dark:bg-apple-darkCard rounded-[2.5rem] shadow-2xl p-10 space-y-6 border border-slate-100 dark:border-apple-darkBorder animate-macos">
          <div className="text-center mb-8">
            <div className="h-16 w-16 mx-auto mb-4 drop-shadow-2xl">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Asos ERP</h1>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">Professional Accounting</p>
          </div>

          <div className="space-y-4">
            <input
              type="email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="Email"
              className="w-full rounded-2xl border border-slate-100 dark:border-apple-darkBorder bg-slate-50 dark:bg-apple-darkBg px-6 py-4 font-bold outline-none focus:ring-4 focus:ring-apple-accent/10 focus:border-apple-accent transition-all"
              required
            />
            <div className="relative group/pass">
              <input
                type={showPassword ? "text" : "password"}
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Parol"
                className="w-full rounded-2xl border border-slate-100 dark:border-apple-darkBorder bg-slate-50 dark:bg-apple-darkBg px-6 py-4 font-bold outline-none focus:ring-4 focus:ring-apple-accent/10 focus:border-apple-accent transition-all pr-14"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-apple-accent transition-colors"
                title={showPassword ? "Berkitish" : "Ko'rsatish"}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {authError && <p className="text-xs font-black text-rose-500 uppercase tracking-widest text-center">{authError}</p>}

          <button
            type="submit"
            className="w-full bg-apple-accent text-white font-black py-5 rounded-2xl hover:bg-blue-600 transition-all shadow-xl shadow-blue-500/20 active:scale-[0.98]"
          >
            Tizimga Kirish
          </button>
        </form>
      </div>
    );
  }



  return (
    <div className="h-screen flex selection:bg-apple-accent/30 overflow-hidden bg-slate-50 dark:bg-apple-darkBg">
      <Toaster position="top-center" richColors />
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

      <main className={`flex-1 flex flex-col min-w-0 h-full overflow-hidden transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-72'}`}>
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
        />

        <div className="flex-1 overflow-y-auto scrollbar-thin overflow-x-hidden">
          <div className="max-w-[1600px] mx-auto p-4 md:p-10 animate-macos min-h-full">
            {/* Access Control for Main Content */}
            {(!((ALLOWED_VIEWS[(userRole as UserRole) || ROLES.ACCOUNTANT] || ALLOWED_VIEWS[ROLES.ACCOUNTANT]).includes(activeView))) ? (
              <div className="flex flex-col items-center justify-center py-20 text-center opacity-80">
                <AlertCircle size={64} className="text-rose-500 mb-6 drop-shadow-xl" />
                <h2 className="text-4xl font-black text-slate-800 dark:text-white mb-3 tracking-tight">Access Denied</h2>
                <p className="text-lg text-slate-500 dark:text-slate-400 font-medium">Sizda ushbu sahifani ko'rish huquqi yo'q.</p>
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
                    lang={lang}
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
