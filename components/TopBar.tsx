
import React from 'react';
import { Search, Sun, Moon, RefreshCw, Languages, Menu, LogOut } from 'lucide-react';
import { Language } from '../types';
import { translations } from '../lib/translations';

interface TopBarProps {
  isDarkMode: boolean;
  onThemeToggle: () => void;
  lang: Language;
  onLangToggle: () => void;
  lastSync: string;
  onSync: () => void;
  isSyncing: boolean;
  onMenuToggle: () => void;
  userName?: string;
  userRole?: string;
  onLogout?: () => void;
  onProfileClick?: () => void;
}

const TopBar: React.FC<TopBarProps> = ({ isDarkMode, onThemeToggle, lang, onLangToggle, lastSync, onSync, isSyncing, onMenuToggle, userName, userRole, onLogout, onProfileClick }) => {
  const t = translations[lang];

  return (
    <header className="h-16 md:h-20 bg-white/80 dark:bg-[#0B0F19]/80 backdrop-blur-xl border-b border-slate-200/60 dark:border-white/[0.05] flex items-center justify-between px-4 md:px-8 sticky top-0 z-40">
      <div className="flex items-center gap-3 md:gap-6 flex-1 max-w-xl">
        <button onClick={onMenuToggle} className="lg:hidden p-2 text-slate-500 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl">
          <Menu size={20} />
        </button>
        <div className="relative w-full group hidden sm:block">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={16} />
          <input
            type="text"
            placeholder={t.search}
            className="w-full bg-black/5 dark:bg-white/5 border border-transparent rounded-xl py-2.5 pl-11 pr-6 outline-none focus:bg-white dark:focus:bg-apple-darkBg focus:border-apple-accent transition-all text-sm font-medium"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-6">
        <div className="flex items-center gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-xl">
          <button
            onClick={onLangToggle}
            className="flex items-center gap-2 px-2 md:px-3 py-2 text-[10px] md:text-xs font-black uppercase text-slate-500 hover:text-apple-accent hover:bg-white dark:hover:bg-apple-darkCard rounded-lg transition-all"
          >
            <Languages size={14} className="hidden xs:block" />
            {lang}
          </button>
          <button
            onClick={onThemeToggle}
            className="p-2 text-slate-500 hover:text-apple-accent hover:bg-white dark:hover:bg-apple-darkCard rounded-lg transition-all"
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            onClick={onSync}
            disabled={isSyncing}
            className={`p-2 text-slate-500 hover:text-apple-accent hover:bg-white dark:hover:bg-apple-darkCard rounded-lg transition-all ${isSyncing ? 'animate-spin text-apple-accent' : ''}`}
          >
            <RefreshCw size={18} />
          </button>
        </div>

        <div className="flex items-center gap-3 md:pl-6 md:border-l border-slate-200/50 dark:border-white/5">
          <button
            onClick={onProfileClick}
            className="flex items-center gap-3 p-1.5 md:p-2 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-200/50 dark:border-white/5 group hover:bg-white dark:hover:bg-navy-900 transition-all cursor-pointer text-left"
          >
            <div className="h-9 w-9 md:h-11 md:w-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-black shadow-lg shadow-blue-500/20">
              {userName ? userName.charAt(0).toUpperCase() : 'A'}
            </div>
            <div className="text-left pr-2 md:pr-4">
              <p className="text-xs md:text-sm font-black text-slate-800 dark:text-white leading-tight">{userName || 'Administrator'}</p>
              <p className="text-[9px] md:text-[10px] text-blue-500 dark:text-blue-400 font-black uppercase tracking-widest">{userRole || 'Admin'}</p>
            </div>
          </button>

          {onLogout && (
            <button
              onClick={onLogout}
              className="p-2.5 md:p-3 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-all"
              title={t.logout}
            >
              <LogOut size={20} />
            </button>
          )}
        </div>
      </div>
    </header >
  );
};

export default TopBar;
