import React from 'react';
import { ChevronLeft, ChevronRight, LogOut, TrendingUp, LayoutDashboard, Database, Users, Settings, Wallet, Receipt, Gauge, Building2, ClipboardList, Calendar } from 'lucide-react';
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
    { id: 'dashboard', label: t.dashboard, icon: <LayoutDashboard size={18} /> },
    { id: 'organizations', label: t.organizations, icon: <Building2 size={18} /> },
    { id: 'reports', label: t.reports, icon: <Database size={18} /> },
    { id: 'kassa', label: t.kassa, icon: <Wallet size={18} /> },
    { id: 'expenses', label: t.expenses, icon: <Receipt size={18} /> },
    { id: 'kpi', label: t.kpi, icon: <Gauge size={18} /> },
    { id: 'payroll', label: t.payroll, icon: <Calendar size={18} /> },
    { id: 'staff', label: t.staff, icon: <Users size={18} /> },
    { id: 'audit_logs', label: t.auditLogs, icon: <ClipboardList size={18} /> },
    { id: 'settings', label: t.settings, icon: <Settings size={18} /> },
  ];

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 lg:hidden ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden={!isOpen}
      />

      <aside
        className={`fixed lg:relative left-0 top-0 h-full transition-all duration-300 ease-in-out z-50 ${isCollapsed ? 'w-[60px]' : 'w-[220px]'} ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 shrink-0`}
        style={{ background: 'linear-gradient(180deg, #FFD600 0%, #FFB800 100%)' }}
        aria-label="Sidebar navigation"
      >
        {/* Dark mode sidebar */}
        <div className="dark:hidden absolute inset-0" style={{ background: 'linear-gradient(180deg, #FFD600 0%, #FFB800 100%)' }} />
        <div className="hidden dark:block absolute inset-0" style={{ background: 'linear-gradient(180deg, #2D2800 0%, #1F1C00 100%)' }} />

        <div className="flex flex-col h-full min-h-0 relative z-10 border-r border-black/10 dark:border-yellow-900/30">
          {/* Logo Section */}
          <div className={`py-4 px-3 flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} border-b border-black/10 dark:border-yellow-900/30`}>
            {!isCollapsed ? (
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 flex items-center justify-center bg-white/30 dark:bg-yellow-500/20 rounded">
                  <img src="/logo.png" alt="ASOS" className="w-6 h-6 object-contain" />
                </div>
                <div>
                  <h1 className="font-bold text-[15px] text-gray-900 dark:text-yellow-400 leading-none">ASOS</h1>
                  <p className="text-[10px] text-gray-700 dark:text-yellow-600 font-medium mt-0.5">Бухгалтерия</p>
                </div>
              </div>
            ) : (
              <div className="h-9 w-9 flex items-center justify-center bg-white/30 dark:bg-yellow-500/20 rounded">
                <img src="/logo.png" alt="ASOS" className="w-6 h-6 object-contain" />
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 min-h-0 px-2 py-2 space-y-0.5 overflow-y-auto scrollbar-none">
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
                  className={`flex items-center gap-2.5 w-full px-3 py-2 rounded transition-all duration-150 text-left
                    ${isActive
                      ? 'bg-black/15 dark:bg-yellow-500/20 text-gray-900 dark:text-yellow-300 font-bold shadow-inner'
                      : 'text-gray-800 dark:text-yellow-200/70 hover:bg-black/8 dark:hover:bg-yellow-500/10 hover:text-gray-900 dark:hover:text-yellow-200'
                    }
                    ${isCollapsed ? 'justify-center px-0' : ''}
                  `}
                  title={isCollapsed ? item.label : ''}
                >
                  <div className={`shrink-0 ${isActive ? 'text-gray-900 dark:text-yellow-300' : 'text-gray-700 dark:text-yellow-400/60'}`}>
                    {item.icon}
                  </div>

                  {!isCollapsed && (
                    <span className="text-[13px] font-semibold whitespace-nowrap overflow-hidden">
                      {item.label}
                    </span>
                  )}

                  {item.id === 'reports' && pendingReportsCount > 0 && !isCollapsed && (
                    <span className="ml-auto bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-sm min-w-[18px] text-center">
                      {pendingReportsCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Collapse button */}
          <div className="px-2 py-2 border-t border-black/10 dark:border-yellow-900/30">
            <button
              onClick={onToggleCollapse}
              className="w-full flex items-center justify-center py-1.5 text-gray-700 dark:text-yellow-400/60 hover:text-gray-900 dark:hover:text-yellow-300 hover:bg-black/8 dark:hover:bg-yellow-500/10 rounded transition-all"
            >
              {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
