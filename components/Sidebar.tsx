import React from 'react';
import { ChevronLeft, ChevronRight, LogOut, TrendingUp, Star, LayoutDashboard, Database, Users, Shield, FileText, Calendar, BarChart3, Settings, Wallet, Receipt, FileSearch, Gauge, Building2, ClipboardList } from 'lucide-react';
import { translations } from '../lib/translations';
import { UserRole, ROLES, canSeeView } from '../lib/permissions';
import { Language, AppView } from '../types';

interface SidebarProps {
  activeView: string;
  onViewChange: (view: AppView) => void;
  isOpen?: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClose?: () => void;
  lang: Language;
  userRole: UserRole;
  pendingReportsCount?: number;
}

const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onViewChange,
  isOpen = false,
  isCollapsed,
  onToggleCollapse,
  onClose,
  lang,
  userRole,
  pendingReportsCount = 0
}) => {
  const t = translations[lang];

  const navItems = [
    { id: 'dashboard', label: `${t.dashboard} / Boshqaruv`, icon: <LayoutDashboard size={22} /> },
    { id: 'organizations', label: 'Korxonalar', icon: <Building2 size={22} /> },
    { id: 'reports', label: 'Operatsiyalar', icon: <Database size={22} /> },
    { id: 'kassa', label: 'Kassa', icon: <Wallet size={22} /> },
    { id: 'expenses', label: 'Xarajatlar', icon: <Receipt size={22} /> },
    { id: 'documents', label: 'Hujjatlar', icon: <FileSearch size={22} /> },
    { id: 'kpi', label: 'Samaradorlik', icon: <Gauge size={22} /> },
    { id: 'payroll', label: 'Oyliklar', icon: <Calendar size={22} /> },
    { id: 'analysis', label: 'Tahlillar', icon: <BarChart3 size={22} /> },
    { id: 'staff', label: 'Jamoa', icon: <Users size={22} /> },
    { id: 'audit_logs', label: 'AuditLog', icon: <ClipboardList size={22} /> },
    { id: 'settings', label: 'Sozlamalar', icon: <Settings size={22} /> },
  ];

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden={!isOpen}
      />
      <aside
        className={`fixed lg:relative left-0 top-0 h-full transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] z-50 liquid-glass-sidebar border-r-0 ${isCollapsed ? 'w-24' : 'w-64'} ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 shrink-0`}
        aria-label="Sidebar navigation"
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[10%] -left-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-[100px] animate-pulse-slow"></div>
          <div className="absolute bottom-[20%] -right-20 w-64 h-64 bg-emerald-500/5 rounded-full blur-[100px] animate-pulse-slow-reverse"></div>
        </div>

        <div className="flex flex-col h-full min-h-0 relative z-10 py-6">
          <div className={`mb-8 px-6 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} relative`}>
            <div className={`transition-all duration-700 ${isCollapsed ? 'scale-0 w-0 h-0 overflow-hidden opacity-0' : 'scale-100 flex items-center gap-5'}`}>
              <div className="h-12 w-12 flex items-center justify-center bg-white/10 dark:bg-white/[0.03] rounded-2xl border border-white/20 shadow-glass-lg liquid-glass-rim group/logo">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="group-hover:rotate-12 transition-all duration-500 drop-shadow-xl">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="white" fillOpacity="0.9" />
                  <path d="M2 17L12 22L22 17M2 12L12 17L22 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <h1 className="font-black text-2xl text-slate-800 dark:text-white tracking-tighter leading-none mb-1 premium-text-gradient">ASOS</h1>
                <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.45em] opacity-60">Intelligence</p>
              </div>
            </div>

            <div className={`absolute left-0 w-full flex justify-center transition-all duration-700 ${isCollapsed ? 'opacity-100 scale-100' : 'opacity-0 scale-0 pointer-events-none'}`}>
              <div className="h-14 w-14 flex items-center justify-center bg-indigo-500/10 rounded-2xl border border-indigo-500/30 shadow-glass-indigo text-indigo-500 liquid-glass-rim">
                <TrendingUp size={34} strokeWidth={3} className="animate-pulse-subtle" />
              </div>
            </div>
          </div>

          <nav className="flex-1 min-h-0 px-4 space-y-3 overflow-y-auto scrollbar-none scrollbar-hide">
            {navItems.map((item) => {
              if (!canSeeView(userRole as UserRole, item.id as AppView)) return null;
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onViewChange(item.id as AppView);
                    onClose?.();
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative flex items-center gap-5 p-4 rounded-[1.25rem] transition-all duration-700 group/nav w-full
                  ${isActive
                      ? 'bg-indigo-500 text-white shadow-glass-indigo scale-[1.03] liquid-glass-rim'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-white/10 dark:hover:bg-white/[0.03] hover:text-slate-900 dark:hover:text-white'
                    }
                  ${isCollapsed ? 'justify-center px-0 h-16' : ''}
                `}
                  title={isCollapsed ? item.label : ''}
                >
                  {isActive && (
                    <>
                      <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent rounded-[inherit] overflow-hidden">
                        <div className="absolute inset-0 glass-reflection"></div>
                      </div>
                      <div className="absolute -inset-1 bg-white/10 blur-xl opacity-20"></div>
                    </>
                  )}

                  <div className={`shrink-0 transition-all duration-700 relative z-10 ${isActive ? 'scale-110' : 'group-hover/nav:scale-110 group-hover/nav:text-indigo-500 drop-shadow-lg'}`}>
                    {React.cloneElement(item.icon as React.ReactElement, { size: isCollapsed ? 32 : 24, strokeWidth: isActive ? 3 : 2.5 })}
                  </div>

                  {!isCollapsed && (
                    <span className={`font-black text-[10px] uppercase tracking-[0.28em] whitespace-nowrap overflow-hidden transition-all duration-700 relative z-10 ${isActive ? 'translate-x-2' : 'group-hover/nav:translate-x-2 opacity-80 group-hover/nav:opacity-100'}`}>
                      {item.label}
                    </span>
                  )}

                  {item.id === 'reports' && pendingReportsCount > 0 && !isCollapsed && (
                    <span className="ml-auto bg-rose-500 text-white text-[9px] font-black px-3 py-1.5 rounded-full shadow-glass-rose animate-pulse relative z-10 border border-white/20">
                      {pendingReportsCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

        </div>
      </aside>
    </>
  );
};

export default Sidebar;
