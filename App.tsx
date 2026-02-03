
import React, { useState, useEffect, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Dashboard from './components/Dashboard';
import OrganizationModule from './components/OrganizationModule';
import OperationModule from './components/OperationModule';
import AnalysisModule from './components/AnalysisModule';
import StaffModule from './components/StaffModule';
import StaffKPIReport from './components/StaffKPIReport';
import StaffProfileDrawer from './components/StaffProfileDrawer';
import { AppView, Company, OperationEntry, Staff, AccountantKPI, ReportStatus, Language } from './types';
import { db } from './lib/db';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [lang, setLang] = useState<Language>(() => (localStorage.getItem('lang') as Language) || 'uz');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark' || 
           (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });
  
  const [companies, setCompanies] = useState<Company[]>([]);
  const [operations, setOperations] = useState<OperationEntry[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState('');
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);

  useEffect(() => {
    db.init();
    refreshData();
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const refreshData = () => {
    setCompanies(db.getCompanies());
    setOperations(db.getOperations());
    setStaff(db.getStaff());
    setLastSync(db.getLastSync());
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
    await db.syncWithSheets();
    refreshData();
    setIsSyncing(false);
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
      const myCompanies = companies.filter(c => c.accountantName === s.name);
      const myOps = operations.filter(op => myCompanies.some(c => c.id === op.companyId));
      const total = myCompanies.length;
      const annualCompleted = myOps.filter(op => 
        op.profitTaxStatus === ReportStatus.ACCEPTED || op.profitTaxStatus === ReportStatus.NOT_REQUIRED
      ).length;
      const statsCompleted = myOps.filter(op => op.statsStatus === ReportStatus.ACCEPTED).length;
      const annualProgress = total > 0 ? Math.round((annualCompleted / total) * 100) : 0;
      const statsProgress = total > 0 ? Math.round((statsCompleted / total) * 100) : 0;

      return { 
        name: s.name, 
        totalCompanies: total, 
        annualCompleted, 
        statsCompleted, 
        annualProgress, 
        statsProgress,
        zone: annualProgress >= 90 ? 'green' : annualProgress >= 60 ? 'yellow' : 'red'
      };
    }).sort((a, b) => b.annualProgress - a.annualProgress);
  }, [staff, companies, operations]);

  return (
    <div className="min-h-screen flex selection:bg-blue-500/30">
      <Sidebar 
        activeView={activeView} 
        onViewChange={(view) => { setActiveView(view); setActiveFilter('all'); }} 
        lang={lang}
      />
      
      <main className="flex-1 lg:pl-20 xl:pl-64 transition-all duration-300">
        <TopBar 
          isDarkMode={isDarkMode} 
          onThemeToggle={toggleTheme}
          lang={lang}
          onLangToggle={toggleLang}
          lastSync={lastSync}
          onSync={handleSync}
          isSyncing={isSyncing}
        />
        
        <div className="max-w-[1600px] mx-auto p-6 md:p-10 animate-macos">
          {activeView === 'dashboard' && (
            <>
              <Dashboard 
                companies={companies} 
                operations={operations} 
                activeFilter={'none'} 
                onFilterChange={handleDashboardFilter} 
                lang={lang}
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
              onSave={(c) => { db.saveCompany(c); refreshData(); }} 
            />
          )}

          {activeView === 'reports' && (
            <OperationModule 
              companies={companies} 
              operations={operations} 
              activeFilter={activeFilter}
              lang={lang}
              onUpdate={(op) => { db.saveOperation(op); refreshData(); }} 
            />
          )}

          {activeView === 'analysis' && (
            <AnalysisModule 
              companies={companies} 
              operations={operations} 
              lang={lang} 
              onFilterApply={handleAnalysisFilterApply}
            />
          )}

          {activeView === 'staff' && (
            <StaffModule 
              staff={staff} 
              companies={companies}
              lang={lang}
              onSave={(s) => { db.saveStaff(s); refreshData(); }} 
              onStaffSelect={setSelectedStaff}
            />
          )}
        </div>

        {selectedStaff && (
          <StaffProfileDrawer 
            staff={selectedStaff}
            companies={companies.filter(c => c.accountantName === selectedStaff.name)}
            operations={operations}
            lang={lang}
            onClose={() => setSelectedStaff(null)}
          />
        )}
      </main>
    </div>
  );
};

export default App;
