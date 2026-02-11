import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Dashboard from './components/Dashboard';
import OrganizationModule from './components/OrganizationModule';
import OperationModule from './components/OperationModule';
import AnalysisModule from './components/AnalysisModule';
import StaffModule from './components/StaffModule';
import StaffKPIReport from './components/StaffKPIReport';
import StaffProfileDrawer from './components/StaffProfileDrawer';
import CompanyDrawer from './components/CompanyDrawer';
import DocumentsModule from './components/DocumentsModule';
import SalaryKPIModule from './components/SalaryKPIModule';
import KassaModule from './components/KassaModule';
import ExpenseModule from './components/ExpenseModule';
import StaffCabinet from './components/StaffCabinet';
import PayrollDrafts from './components/PayrollDrafts';
import AuditLogModule from './components/AuditLogModule';
import { AppView, Company, OperationEntry, Staff, AccountantKPI, ReportStatus, Language, Payment, Expense, EmployeeSalarySummary, ContractAssignment } from './types';
import { supabase } from './lib/supabaseClient';
import {
  fetchProfile,
  fetchCompanies,
  fetchOperations,
  fetchStaff,
  fetchKpiMetrics,
  upsertCompany,
  deleteCompany,
  onboardCompany,
  upsertOperation,
  upsertOperationsBatch,
  upsertStaff,
  deleteStaff,
  fetchPayments,
  fetchExpenses,
  upsertPayment,
  upsertExpense,
  deletePayment,
  deleteExpense,
  fetchContractAssignments
} from './lib/supabaseData';
import { seedFirmaData } from './lib/seedFirmaData';
import type { Session } from '@supabase/supabase-js';
import { ALLOWED_VIEWS, ROLES, UserRole } from './lib/permissions';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    const year = new Date().getFullYear();
    return `${year} Yillik`;
  });
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
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      if (data.session?.user) {
        await loadProfile(data.session.user.id);
        await refreshData();
      }
      const { data: listener } = supabase.auth.onAuthStateChange(async (_event, s) => {
        setSession(s);
        if (s?.user) {
          await loadProfile(s.user.id);
          await refreshData();
        } else {
          setCompanies([]);
          setOperations([]);
          setStaff([]);
        }
      });
      setIsLoading(false);
      return () => {
        listener.subscription.unsubscribe();
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
    const [c, o, s, kpi, p, e, ass] = await Promise.all([
      fetchCompanies(),
      fetchOperations(),
      fetchStaff(),
      fetchKpiMetrics(),
      fetchPayments(),
      fetchExpenses(),
      fetchContractAssignments()
    ]);

    // Derive correct staff roles from companies data
    // DB has all as 'accountant' by default — fix using company references
    const roleCountMap = new Map<string, { accountant: number; bank_manager: number; supervisor: number }>();
    c.forEach(company => {
      // By ID
      if (company.accountantId) {
        if (!roleCountMap.has(company.accountantId)) roleCountMap.set(company.accountantId, { accountant: 0, bank_manager: 0, supervisor: 0 });
        roleCountMap.get(company.accountantId)!.accountant++;
      }
      if (company.bankClientId) {
        if (!roleCountMap.has(company.bankClientId)) roleCountMap.set(company.bankClientId, { accountant: 0, bank_manager: 0, supervisor: 0 });
        roleCountMap.get(company.bankClientId)!.bank_manager++;
      }
      if (company.supervisorId) {
        if (!roleCountMap.has(company.supervisorId)) roleCountMap.set(company.supervisorId, { accountant: 0, bank_manager: 0, supervisor: 0 });
        roleCountMap.get(company.supervisorId)!.supervisor++;
      }
      // By Name (for staff without IDs)
      s.forEach(staff => {
        const sn = staff.name.trim().toLowerCase();
        if (!company.bankClientId && company.bankClientName?.trim().toLowerCase() === sn) {
          if (!roleCountMap.has(staff.id)) roleCountMap.set(staff.id, { accountant: 0, bank_manager: 0, supervisor: 0 });
          roleCountMap.get(staff.id)!.bank_manager++;
        }
        if (!company.supervisorId && company.supervisorName?.trim().toLowerCase() === sn) {
          if (!roleCountMap.has(staff.id)) roleCountMap.set(staff.id, { accountant: 0, bank_manager: 0, supervisor: 0 });
          roleCountMap.get(staff.id)!.supervisor++;
        }
      });
    });

    // Apply derived roles
    s.forEach(staff => {
      const counts = roleCountMap.get(staff.id);
      if (counts) {
        if (counts.bank_manager > counts.accountant && counts.bank_manager >= counts.supervisor) {
          staff.role = 'bank_manager';
        } else if (counts.supervisor > counts.accountant && counts.supervisor > counts.bank_manager) {
          staff.role = 'supervisor';
        }
        // If accountant is highest or equal, keep 'accountant' (already default)
      }
      // Special: Yorqinoy is always chief
      if (staff.name.trim().toLowerCase() === 'yorqinoy') staff.role = 'chief';
    });

    setCompanies(c);
    setOperations(o);
    setStaff(s);
    setPayments(p);
    setExpenses(e);
    setAssignments(ass);
    setLastSync(new Date().toLocaleString());
    setIsSyncing(false);
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
      const annualCompleted = myOps.filter(op => op.profitTaxStatus === ReportStatus.ACCEPTED || op.profitTaxStatus === ReportStatus.NOT_REQUIRED).length;
      const annualPending = myOps.filter(op => op.profitTaxStatus === ReportStatus.NOT_SUBMITTED || op.profitTaxStatus === ReportStatus.REJECTED).length;
      const annualBlocked = myOps.filter(op => op.profitTaxStatus === ReportStatus.BLOCKED || op.form1Status === ReportStatus.BLOCKED).length;

      const statsCompleted = myOps.filter(op => op.statsStatus === ReportStatus.ACCEPTED).length;

      const annualProgress = total > 0 ? Math.round((annualCompleted / total) * 100) : 0;
      const statsProgress = total > 0 ? Math.round((statsCompleted / total) * 100) : 0;

      return {
        name: s.name,
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
  }, [staff, companies, operations, selectedPeriod]);

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
            <div className="bg-apple-accent h-16 w-16 rounded-[2rem] flex items-center justify-center text-white shadow-2xl shadow-blue-500/20 mx-auto mb-4">
              <span className="font-black text-2xl italic">A</span>
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
            <input
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              placeholder="Parol"
              className="w-full rounded-2xl border border-slate-100 dark:border-apple-darkBorder bg-slate-50 dark:bg-apple-darkBg px-6 py-4 font-bold outline-none focus:ring-4 focus:ring-apple-accent/10 focus:border-apple-accent transition-all"
              required
            />
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

      <main className="flex-1 lg:pl-20 xl:pl-64 flex flex-col min-w-0 h-full overflow-hidden transition-all duration-300">
        <TopBar
          isDarkMode={isDarkMode}
          onThemeToggle={toggleTheme}
          lang={lang}
          onLangToggle={toggleLang}
          lastSync={lastSync}
          onSync={handleSync}
          isSyncing={isSyncing}
          onMenuToggle={() => setIsMobileMenuOpen(true)}
          userName={userName}
          userRole={userRole}
          onLogout={handleSignOut}
          onProfileClick={() => setActiveView('cabinet')}
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
              <>
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
                    />
                  </>
                )}

                {activeView === 'organizations' && (
                  <OrganizationModule
                    companies={companies}
                    staff={staff}
                    lang={lang}
                    onSave={async (c, assignments) => {
                      if (assignments) {
                        await onboardCompany(c, assignments);
                      } else {
                        await upsertCompany(c as Company);
                      }
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
                    onUpdate={async (op) => { await upsertOperation(op); refreshData(); }}
                    onBatchUpdate={async (ops) => { await upsertOperationsBatch(ops); refreshData(); }}
                    onCompanySelect={setSelectedCompany}
                    userRole={userRole}
                    currentUserId={session?.user?.id}
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

              </>
            )}
          </div>
        </div>

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
          />
        )}
      </main>
    </div>
  );
};

export default App;
