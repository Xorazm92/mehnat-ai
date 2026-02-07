import React from 'react';
import { AppView, Language } from '../types';
import { LayoutDashboard, Building2, Users, FileBarChart, PieChart, Settings, LogOut, X, FileText, TrendingUp, Wallet, Receipt, UserCircle, Star, DollarSign, Shield } from 'lucide-react';
import { translations } from '../lib/translations';
import { ALLOWED_VIEWS, ROLES, UserRole } from '../lib/permissions';

interface SidebarProps {
  activeView: AppView;
  isOpen: boolean;
  onClose: () => void;
  onViewChange: (view: AppView) => void;
  lang: Language;
  userRole?: string;
}

const Sidebar: React.FC<SidebarProps> = ({ activeView, isOpen, onClose, onViewChange, lang, userRole }) => {
  const t = translations[lang];

  const menuItems = [
    { id: 'dashboard' as AppView, icon: <LayoutDashboard size={20} />, label: t.dashboard },
    { id: 'organizations' as AppView, icon: <Building2 size={20} />, label: t.organizations },
    { id: 'reports' as AppView, icon: <FileBarChart size={20} />, label: t.reports },
    { id: 'kassa' as AppView, icon: <Wallet size={20} />, label: 'Kassa' },
    { id: 'expenses' as AppView, icon: <Receipt size={20} />, label: 'Xarajatlar' },
    { id: 'documents' as AppView, icon: <FileText size={20} />, label: t.documents || 'Hujjatlar' },
    { id: 'kpi' as AppView, icon: <TrendingUp size={20} />, label: t.kpi || 'Samaradorlik' },
    { id: 'payroll' as AppView, icon: <DollarSign size={20} />, label: 'Oyliklar' },
    { id: 'analysis' as AppView, icon: <PieChart size={20} />, label: t.analysis },
    { id: 'staff' as AppView, icon: <Users size={20} />, label: t.staff },
    { id: 'audit_logs' as AppView, icon: <Shield size={20} />, label: 'Audit Log' },
  ];

  // RBAC Filtering
  const currentUserRole = (userRole as UserRole) || ROLES.ACCOUNTANT; // Default safe role
  const allowedViews = ALLOWED_VIEWS[currentUserRole] || ALLOWED_VIEWS[ROLES.ACCOUNTANT];

  const filteredItems = menuItems.filter(item => allowedViews.includes(item.id));

  return (
    <>
      {/* Mobile Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 z-[55] lg:hidden transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <aside className={`fixed left-0 top-0 h-full w-64 lg:w-24 xl:w-72 bg-white/95 dark:bg-[#0B0F19] border-r border-slate-200/60 dark:border-white/[0.05] flex flex-col py-8 z-[60] transition-all duration-500 transform ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="mb-10 px-6 xl:px-8">
          <button
            onClick={() => onViewChange('dashboard')}
            className="flex items-center gap-4 group transition-all active:scale-95"
          >
            <div className="h-12 w-12 rounded-[1.25rem] bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-2xl shadow-blue-500/40 shrink-0 group-hover:rotate-6 transition-transform">
              <div className="grid grid-cols-2 gap-1 p-2">
                <div className="w-2 h-2 rounded-full bg-white"></div>
                <div className="w-2 h-2 rounded-full bg-white/50"></div>
                <div className="w-2 h-2 rounded-full bg-white/50"></div>
                <div className="w-2 h-2 rounded-full bg-white"></div>
              </div>
            </div>
            <div className="xl:block lg:hidden text-left">
              <h1 className="font-black text-2xl text-slate-800 dark:text-white tracking-tighter leading-none">ASOS</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Management</p>
            </div>
          </button>
        </div>


        <nav className="flex-1 flex flex-col gap-1 w-full px-4 overflow-y-auto scrollbar-none">
          {filteredItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`flex items-center gap-4 p-4 rounded-2xl transition-all duration-300 group ${activeView === item.id
                ? 'sidebar-active scale-[1.02]'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
            >
              <div className={`shrink-0 transition-all duration-300 ${activeView === item.id ? 'scale-110 drop-shadow-md' : 'group-hover:scale-110'}`}>
                {item.icon}
              </div>
              <span className="xl:block lg:hidden font-bold text-[0.938rem] tracking-tight">{item.label}</span>
              {item.id === 'reports' && (
                <span className="ml-auto bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg shadow-rose-500/40">12</span>
              )}
            </button>
          ))}
        </nav>

        <div className="mt-auto w-full px-4 space-y-1">
          <button className="flex items-center gap-4 p-4 rounded-2xl w-full text-rose-500 hover:bg-rose-500/10 transition-all group">
            <LogOut size={20} className="group-hover:translate-x-1 transition-transform" />
            <span className="xl:block lg:hidden font-black text-[0.938rem]">{t.logout}</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
