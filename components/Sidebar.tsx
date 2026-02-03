
import React from 'react';
import { AppView, Language } from '../types';
import { LayoutDashboard, Building2, Users, FileBarChart, PieChart, Settings, LogOut } from 'lucide-react';
import { translations } from '../lib/translations';

interface SidebarProps {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  lang: Language;
}

const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange, lang }) => {
  const t = translations[lang];
  const menuItems = [
    { id: 'dashboard' as AppView, icon: <LayoutDashboard size={20} />, label: t.dashboard },
    { id: 'organizations' as AppView, icon: <Building2 size={20} />, label: t.organizations },
    { id: 'reports' as AppView, icon: <FileBarChart size={20} />, label: t.reports },
    { id: 'analysis' as AppView, icon: <PieChart size={20} />, label: t.analysis },
    { id: 'staff' as AppView, icon: <Users size={20} />, label: t.staff },
  ];

  return (
    <aside className="fixed left-0 top-0 h-full w-20 xl:w-64 bg-white/80 dark:bg-apple-darkCard glass border-r border-apple-border dark:border-apple-darkBorder flex flex-col items-center py-6 z-50 transition-all duration-300">
      <div className="mb-12 xl:w-full xl:px-8 flex items-center gap-3">
        <div className="bg-apple-accent h-11 w-11 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-500/20 shrink-0">
          <span className="font-black text-lg tracking-tighter italic">A</span>
        </div>
        <div className="hidden xl:block">
          <h1 className="font-extrabold text-slate-800 dark:text-white text-base tracking-tight leading-none">ASOS ERP</h1>
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Professional</span>
        </div>
      </div>

      <nav className="flex flex-col gap-1.5 w-full px-3 xl:px-4">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={`flex items-center gap-3.5 p-3.5 rounded-xl transition-all duration-200 group relative ${
              activeView === item.id 
                ? 'sidebar-active shadow-sm' 
                : 'text-slate-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <div className={`shrink-0 transition-transform duration-200 ${activeView === item.id ? 'scale-110' : 'group-hover:scale-110'}`}>
              {item.icon}
            </div>
            <span className="hidden xl:block font-bold text-sm tracking-tight">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="mt-auto w-full px-3 xl:px-4 space-y-1">
        <button className="flex items-center gap-3.5 p-3.5 rounded-xl w-full text-slate-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5 transition-all">
          <Settings size={20} />
          <span className="hidden xl:block font-bold text-sm">{t.settings}</span>
        </button>
        <button className="flex items-center gap-3.5 p-3.5 rounded-xl w-full text-rose-500 hover:bg-rose-500/10 transition-all">
          <LogOut size={20} />
          <span className="hidden xl:block font-bold text-sm">{t.logout}</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
