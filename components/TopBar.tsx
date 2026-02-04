
import React from 'react';
import { Search, Sun, Moon, RefreshCw, Languages, Menu } from 'lucide-react';
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
}

const TopBar: React.FC<TopBarProps> = ({ isDarkMode, onThemeToggle, lang, onLangToggle, lastSync, onSync, isSyncing, onMenuToggle, userName, userRole, onLogout }) => {
  const t = translations[lang];

  return (
    <header className="h-16 md:h-20 bg-white/80 dark:bg-apple-darkCard/80 glass border-b border-apple-border dark:border-apple-darkBorder flex items-center justify-between px-4 md:px-8 sticky top-0 z-40">
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
            {isDarkMode ? <Sun size={18}/> : <Moon size={18}/>}
          </button>
          <button 
            onClick={onSync}
            disabled={isSyncing}
            className={`p-2 text-slate-500 hover:text-apple-accent hover:bg-white dark:hover:bg-apple-darkCard rounded-lg transition-all ${isSyncing ? 'animate-spin text-apple-accent' : ''}`}
          >
            <RefreshCw size={18}/>
          </button>
        </div>

        <div className="flex items-center gap-2 md:gap-3 md:pl-4 md:border-l border-apple-border dark:border-apple-darkBorder">
          <div className="text-right hidden xs:block">
            <p className="text-xs md:text-sm font-bold leading-none mb-1">{userName || '—'}</p>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{userRole || t.admin}</p>
          </div>
          <div className="hidden md:flex gap-1.5 ml-2 border-l border-apple-border dark:border-apple-darkBorder pl-4">
            <div className="w-3 h-3 rounded-full bg-[#27C93F]"></div>
            <div className="w-3 h-3 rounded-full bg-[#FFBD2E]"></div>
            <div className="w-3 h-3 rounded-full bg-[#FF5F56]"></div>
          </div>
          {onLogout && (
            <button 
              onClick={onLogout}
              className="px-3 py-2 text-xs font-bold uppercase tracking-wide bg-black/5 dark:bg-white/5 rounded-lg text-slate-500 hover:text-apple-accent hover:bg-white dark:hover:bg-apple-darkCard transition-all"
            >
              Logout
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default TopBar;
