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
        className={`fixed lg:relative left-0 top-0 h-full transition-all duration-300 ease-in-out z-50 ${isCollapsed ? 'w-[60px]' : 'w-[220px]'} ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 shrink-0 border-r border-[#DEE2E6] dark:border-[#3A3D44]`}
        aria-label="Sidebar navigation"
      >
        <div className="absolute inset-0 bg-[#F8F9FA] dark:bg-[#1A1D23]" />

        <div className="flex flex-col h-full min-h-0 relative z-10 transition-colors">
          {/* Logo Section */}
          <div className={`py-4 px-3 flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} border-b border-[#DEE2E6] dark:border-[#3A3D44] bg-white dark:bg-[#22252B]`}>
            {!isCollapsed ? (
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 flex items-center justify-center bg-[#F0F2F5] dark:bg-[#1A1D23] rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44]">
                  <img src="/logo.png" alt="ASOS" className="w-6 h-6 object-contain" />
                </div>
                <div>
                  <h1 className="font-bold text-[14px] text-gray-800 dark:text-white leading-none uppercase tracking-wider">ASOS</h1>
                  <p className="text-[9px] text-[#3366CC] font-bold uppercase tracking-widest mt-1">BUXGALTERIYA</p>
                </div>
              </div>
            ) : (
              <div className="h-9 w-9 flex items-center justify-center bg-[#F0F2F5] dark:bg-[#1A1D23] rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44]">
                <img src="/logo.png" alt="ASOS" className="w-6 h-6 object-contain" />
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 min-h-0 px-2 py-3 space-y-1 overflow-y-auto scrollbar-hide">
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
                  className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-sm transition-all duration-150 text-left group
                    ${isActive
                      ? 'bg-[#3366CC] text-white font-bold shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-[#EBF3FF] dark:hover:bg-[#1C2531] hover:text-[#3366CC]'
                    }
                    ${isCollapsed ? 'justify-center px-0' : ''}
                  `}
                  title={isCollapsed ? item.label : ''}
                >
                  <div className={`shrink-0 transition-colors ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-[#3366CC]'}`}>
                    {React.cloneElement(item.icon as React.ReactElement, { size: 16 })}
                  </div>

                  {!isCollapsed && (
                    <span className="text-[11px] font-bold uppercase tracking-wider whitespace-nowrap overflow-hidden">
                      {item.label}
                    </span>
                  )}

                  {item.id === 'reports' && pendingReportsCount > 0 && !isCollapsed && (
                    <span className="ml-auto bg-rose-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-sm min-w-[18px] text-center border border-rose-700/20">
                      {pendingReportsCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Collapse button */}
          <div className="px-2 py-2 border-t border-[#DEE2E6] dark:border-[#3A3D44] bg-white dark:bg-[#22252B]">
            <button
              onClick={onToggleCollapse}
              className="w-full flex items-center justify-center py-1.5 text-gray-400 hover:text-[#3366CC] hover:bg-[#F0F2F5] dark:hover:bg-[#1A1D23] rounded-sm transition-all"
            >
              {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
