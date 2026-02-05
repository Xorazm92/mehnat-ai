import React from 'react';
import { Company, OperationEntry, ReportStatus, Language, Staff } from '../types';
import { translations } from '../lib/translations';
import { ROLES } from '../lib/permissions';
import AccountantDashboard from './AccountantDashboard';
import NazoratchiChecklist from './NazoratchiChecklist';

interface DashboardProps {
  companies: Company[];
  operations: OperationEntry[];
  staff?: Staff[];
  activeFilter?: string;
  onFilterChange?: (filter: string) => void;
  lang: Language;
  userRole?: string;
  userId?: string;
}

const Dashboard: React.FC<DashboardProps> = ({
  companies,
  operations,
  staff = [],
  activeFilter = 'all',
  onFilterChange = (_: string) => { },
  lang,
  userRole,
  userId
}) => {
  const t = translations[lang];

  // Role-Based Routing
  if (userRole === ROLES.ACCOUNTANT) {
    const myCompanies = userId ? companies.filter(c => c.accountantId === userId) : [];
    return <AccountantDashboard companies={myCompanies} operations={operations} lang={lang} />;
  }

  if (userRole === ROLES.SUPERVISOR) {
    return <NazoratchiChecklist companies={companies} staff={staff} lang={lang} currentUserRole={userRole} currentUserId={userId} />;
  }

  if (userRole === ROLES.BANK_MANAGER) {
    // Placeholder for Bank Manager
    // Effectively an Accountant view but for Bank Clients?
    // For now, return Admin View or Accountant View
    // Let's use Accountant Dashboard logic but for Bank Clients
    const myCompanies = userId ? companies.filter(c => c.bankClientId === userId) : [];
    return <AccountantDashboard companies={myCompanies} operations={operations} lang={lang} />;
  }

  // --- STANDARD ADMIN DASHBOARD ---
  const stats = {
    total: companies.length,
    completed: operations.filter(op =>
      op.profitTaxStatus === ReportStatus.ACCEPTED &&
      op.form1Status === ReportStatus.ACCEPTED
    ).length,
    delayed: operations.filter(op =>
      op.profitTaxStatus === ReportStatus.NOT_SUBMITTED ||
      op.form1Status === ReportStatus.NOT_SUBMITTED ||
      op.statsStatus === ReportStatus.NOT_SUBMITTED
    ).length,
    blocked: operations.filter(op =>
      op.form1Status === ReportStatus.BLOCKED || op.form2Status === ReportStatus.BLOCKED
    ).length
  };

  const progress = stats.total > 0 ? Math.round((stats.completed / (stats.total || 1)) * 100) : 0;

  const Card = ({ id, label, value, sub, color, icon }: any) => {
    const isActive = activeFilter === id;
    return (
      <button
        onClick={() => onFilterChange(isActive ? 'all' : id)}
        className={`relative p-6 md:p-9 rounded-[2rem] md:rounded-[2.5rem] border transition-all duration-300 text-left overflow-hidden group
          ${isActive
            ? 'bg-white dark:bg-white/10 ring-4 ring-apple-accent/20 border-apple-accent shadow-2xl'
            : 'bg-white dark:bg-apple-darkCard border-apple-border dark:border-apple-darkBorder hover:border-slate-300 dark:hover:border-slate-600 shadow-sm'}`}
      >
        <div className="absolute -right-4 -top-4 text-6xl md:text-8xl opacity-[0.07] group-hover:scale-125 transition-transform duration-700 pointer-events-none">{icon}</div>
        <p className="text-tiny md:text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 md:mb-5">{label}</p>
        <div className="flex items-baseline gap-2">
          <h3 className={`text-4xl md:text-5xl font-extrabold tracking-tighter tabular-nums ${isActive ? 'text-apple-accent' : 'text-slate-800 dark:text-white'}`}>{value}</h3>
        </div>
        <p className="text-xs md:text-sm font-semibold text-slate-500 dark:text-slate-400 mt-3 md:mt-5 line-clamp-1">{sub}</p>
        {isActive && <div className="absolute bottom-0 left-0 h-2 w-full bg-apple-accent"></div>}
      </button>
    );
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-8 mb-10 md:mb-16">
      <Card id="progress" label={t.annualProgress} value={`${progress}%`} sub={`${stats.completed} bitgan / завершено`} color="blue" icon="📈" />
      <Card id="delayed" label={t.debtors} value={stats.delayed} sub="Qarzdorlar / Должники" color="red" icon="🚨" />
      <Card id="blocked" label={t.blocked} value={stats.blocked} sub="Hisob band / Счет заблокирован" color="orange" icon="🔒" />
      <Card id="all" label={t.totalFirms} value={stats.total} sub="Jami bazada / Всего в базе" color="slate" icon="📂" />
    </div>
  );
};

export default Dashboard;
