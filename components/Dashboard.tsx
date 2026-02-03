
import React from 'react';
import { Company, OperationEntry, ReportStatus, Language } from '../types';
import { translations } from '../lib/translations';

interface DashboardProps {
  companies: Company[];
  operations: OperationEntry[];
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  lang: Language;
}

const Dashboard: React.FC<DashboardProps> = ({ companies, operations, activeFilter, onFilterChange, lang }) => {
  const t = translations[lang];
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

  const progress = Math.round((stats.completed / stats.total) * 100);

  const Card = ({ id, label, value, sub, color, icon }: any) => {
    const isActive = activeFilter === id;
    return (
      <button 
        onClick={() => onFilterChange(isActive ? 'all' : id)}
        className={`relative p-7 rounded-[2rem] border transition-all duration-300 text-left overflow-hidden group
          ${isActive 
            ? 'bg-white dark:bg-white/10 ring-4 ring-apple-accent/20 border-apple-accent shadow-xl scale-[1.02]' 
            : 'bg-white dark:bg-apple-darkCard border-apple-border dark:border-apple-darkBorder hover:border-slate-300 dark:hover:border-slate-600 shadow-sm'}`}
      >
        <div className="absolute -right-4 -top-4 text-7xl opacity-[0.05] group-hover:scale-125 transition-transform duration-500">{icon}</div>
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">{label}</p>
        <div className="flex items-baseline gap-1.5">
          <h3 className={`text-4xl font-extrabold tracking-tighter ${isActive ? 'text-apple-accent' : 'text-slate-800 dark:text-white'}`}>{value}</h3>
        </div>
        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-3">{sub}</p>
        {isActive && <div className="absolute bottom-0 left-0 h-1.5 w-full bg-apple-accent"></div>}
      </button>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
      <Card id="progress" label={t.annualProgress} value={`${progress}%`} sub={`${stats.completed} bitgan / завершено`} color="blue" icon="📈" />
      <Card id="delayed" label={t.debtors} value={stats.delayed} sub="Qarzdorlar / Должники" color="red" icon="🚨" />
      <Card id="blocked" label={t.blocked} value={stats.blocked} sub="Hisob band / Счет заблокирован" color="orange" icon="🔒" />
      <Card id="all" label={t.totalFirms} value={stats.total} sub="Jami bazada / Всего в базе" color="slate" icon="📂" />
    </div>
  );
};

export default Dashboard;
