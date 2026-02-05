import React from 'react';
import { AppView, Language } from '../types';
import { LayoutDashboard, Building2, Users, FileBarChart, PieChart, Settings, LogOut, X, FileText, TrendingUp, Wallet, Receipt, UserCircle } from 'lucide-react';
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
    { id: 'cabinet' as AppView, icon: <UserCircle size={20} />, label: 'Shaxsiy Kabinet' },
    { id: 'organizations' as AppView, icon: <Building2 size={20} />, label: t.organizations },
    { id: 'reports' as AppView, icon: <FileBarChart size={20} />, label: t.reports },
    { id: 'kassa' as AppView, icon: <Wallet size={20} />, label: 'Kassa' },
    { id: 'expenses' as AppView, icon: <Receipt size={20} />, label: 'Xarajatlar' },
    { id: 'documents' as AppView, icon: <FileText size={20} />, label: t.documents || 'Hujjatlar' },
    { id: 'kpi' as AppView, icon: <TrendingUp size={20} />, label: t.kpi || 'Samaradorlik' },
    { id: 'analysis' as AppView, icon: <PieChart size={20} />, label: t.analysis },
    { id: 'staff' as AppView, icon: <Users size={20} />, label: t.staff },
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

      <aside className={`fixed left-0 top-0 h-full w-64 lg:w-20 xl:w-64 bg-white/90 dark:bg-apple-darkCard glass border-r border-apple-border dark:border-apple-darkBorder flex flex-col py-6 z-[60] transition-all duration-300 transform ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="mb-12 px-6 lg:px-0 lg:w-full xl:px-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-apple-accent h-11 w-11 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-500/20 shrink-0">
              <span className="font-black text-lg tracking-tighter italic">A</span>
            </div>
            <div className="xl:block lg:hidden">
              <h1 className="font-extrabold text-slate-800 dark:text-white text-base tracking-tight leading-none uppercase">Asos ERP</h1>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t.professional}</span>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden p-2 text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <nav className="flex flex-col gap-1.5 w-full px-3 xl:px-4">
          {filteredItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`flex items-center gap-3.5 p-3.5 rounded-xl transition-all duration-200 group relative ${activeView === item.id
                ? 'sidebar-active shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
            >
              <div className={`shrink-0 transition-transform duration-200 ${activeView === item.id ? 'scale-110' : 'group-hover:scale-110'}`}>
                {item.icon}
              </div>
              <span className="xl:block lg:hidden font-bold text-sm tracking-tight">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto w-full px-3 xl:px-4 space-y-1">
          <button className="flex items-center gap-3.5 p-3.5 rounded-xl w-full text-slate-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5 transition-all">
            <Settings size={20} />
            <span className="xl:block lg:hidden font-bold text-sm">{t.settings}</span>
          </button>
          <button className="flex items-center gap-3.5 p-3.5 rounded-xl w-full text-rose-500 hover:bg-rose-500/10 transition-all">
            <LogOut size={20} />
            <span className="xl:block lg:hidden font-bold text-sm">{t.logout}</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
