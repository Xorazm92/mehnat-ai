import React from 'react';
import { AppView, Language } from '../types';
import { LayoutDashboard, Building2, Users, FileBarChart, PieChart, Settings, LogOut, X, FileText, TrendingUp, Wallet, Receipt, UserCircle, Star, DollarSign, Shield, ChevronLeft, ChevronRight } from 'lucide-react';
import { translations } from '../lib/translations';
import { ALLOWED_VIEWS, ROLES, UserRole } from '../lib/permissions';

interface SidebarProps {
  activeView: AppView;
  isOpen: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClose: () => void;
  onViewChange: (view: AppView) => void;
  lang: Language;
  userRole?: string;
  pendingReportsCount?: number;
}

const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  isOpen,
  isCollapsed,
  onToggleCollapse,
  onClose,
  onViewChange,
  lang,
  userRole,
  pendingReportsCount = 0
}) => {
  const t = translations[lang];

  const menuItems = [
    { id: 'dashboard' as AppView, icon: <LayoutDashboard size={20} />, label: t.dashboard },
    { id: 'organizations' as AppView, icon: <Building2 size={20} />, label: t.organizations },
    { id: 'reports' as AppView, icon: <FileBarChart size={20} />, label: t.reports },
    { id: 'kassa' as AppView, icon: <Wallet size={20} />, label: t.kassa || 'Kassa' },
    { id: 'expenses' as AppView, icon: <Receipt size={20} />, label: t.expenses || 'Xarajatlar' },
    { id: 'documents' as AppView, icon: <FileText size={20} />, label: t.documents || 'Hujjatlar' },
    { id: 'kpi' as AppView, icon: <TrendingUp size={20} />, label: t.kpi || 'Samaradorlik' },
    { id: 'payroll' as AppView, icon: <DollarSign size={20} />, label: t.payroll || 'Oyliklar' },
    { id: 'analysis' as AppView, icon: <PieChart size={20} />, label: t.analysis },
    { id: 'staff' as AppView, icon: <Users size={20} />, label: t.staff },
    { id: 'audit_logs' as AppView, icon: <Shield size={20} />, label: 'Audit Log' },
  ];

  // RBAC Filtering
  const currentUserRole = ((userRole || '').toLowerCase() as UserRole) || ROLES.ACCOUNTANT; // Default safe role
  const allowedViews = ALLOWED_VIEWS[currentUserRole] || ALLOWED_VIEWS[ROLES.ACCOUNTANT];

  const filteredItems = menuItems.filter(item => allowedViews.includes(item.id));

  return (
    <>
      {/* Mobile Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 z-[55] lg:hidden transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <aside className={`fixed left-0 top-0 h-full bg-white/95 dark:bg-[#0B0F19] border-r border-slate-200/60 dark:border-white/[0.05] flex flex-col py-6 z-[60] transition-all duration-500 ease-in-out transform 
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${isCollapsed ? 'w-20' : 'w-72'}
      `}>
        {/* Header / Logo */}
        <div className={`mb-6 px-4 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          <div className={`transition-all duration-300 ${isCollapsed ? 'scale-0 w-0 h-0 overflow-hidden' : 'scale-100 flex items-center gap-3'}`}>
            <div className="h-10 w-10 flex items-center justify-center">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="font-black text-xl text-slate-800 dark:text-white tracking-tight leading-none">ASOS</h1>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Management</p>
            </div>
          </div>

          {/* Logo specific for collapsed state */}
          <div className={`absolute left-0 w-full flex justify-center transition-all duration-300 ${isCollapsed ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`}>
            <div className="h-10 w-10 flex items-center justify-center">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
          </div>
        </div>


        {/* Navigation Items */}
        <nav className="flex-1 flex flex-col gap-1 w-full px-3 overflow-y-auto scrollbar-none">
          {filteredItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`relative flex items-center gap-3 p-3 rounded-xl transition-all duration-300 group
                ${activeView === item.id
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                }
                ${isCollapsed ? 'justify-center' : ''}
              `}
              title={isCollapsed ? item.label : ''}
            >
              <div className={`shrink-0 transition-transform duration-300 ${activeView === item.id ? 'scale-110' : 'group-hover:scale-110'}`}>
                {item.icon}
              </div>

              <span className={`font-bold text-sm tracking-tight whitespace-nowrap overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                {item.label}
              </span>

              {item.id === 'reports' && pendingReportsCount > 0 && (
                <span className={`absolute top-2 right-2 flex h-2.5 w-2.5 items-center justify-center ${isCollapsed ? 'flex' : 'hidden'}`}>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                </span>
              )}
              {item.id === 'reports' && pendingReportsCount > 0 && !isCollapsed && (
                <span className="ml-auto bg-white/20 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                  {pendingReportsCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Footer Actions */}
        <div className="mt-auto px-3 space-y-1 pt-4 border-t border-slate-100 dark:border-white/5">
          {/* Collapse Toggle */}
          <button
            onClick={onToggleCollapse}
            className="hidden lg:flex items-center gap-3 p-3 rounded-xl w-full text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-all group justify-center"
          >
            {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>

          <button className={`flex items-center gap-3 p-3 rounded-xl w-full text-rose-500 hover:bg-rose-500/10 transition-all group ${isCollapsed ? 'justify-center' : ''}`}>
            <LogOut size={20} className="group-hover:-translate-x-1 transition-transform" />
            <span className={`font-bold text-sm whitespace-nowrap overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
              {t.logout}
            </span>
          </button>

          {!isCollapsed && userRole === ROLES.SUPER_ADMIN && (
            <div className="mt-4 px-3 py-2 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2">
              <Star size={12} className="text-amber-500 fill-amber-500" />
              <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Premium System Admin</span>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
