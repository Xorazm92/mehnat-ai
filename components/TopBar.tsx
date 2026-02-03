
import React from 'react';
import { Search, Bell, Sun, Moon, RefreshCw, Languages } from 'lucide-react';
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
}

const TopBar: React.FC<TopBarProps> = ({ isDarkMode, onThemeToggle, lang, onLangToggle, lastSync, onSync, isSyncing }) => {
  const t = translations[lang];

  return (
    <header className="h-20 bg-white/80 dark:bg-apple-darkCard/80 glass border-b border-apple-border dark:border-apple-darkBorder flex items-center justify-between px-8 sticky top-0 z-40">
      <div className="flex items-center gap-6 flex-1 max-w-xl">
        <div className="relative w-full group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={16} />
          <input 
            type="text" 
            placeholder={t.search} 
            className="w-full bg-black/5 dark:bg-white/5 border border-transparent rounded-xl py-2.5 pl-11 pr-6 outline-none focus:bg-white dark:focus:bg-apple-darkBg focus:border-apple-accent transition-all text-sm font-medium"
          />
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-1.5 p-1 bg-black/5 dark:bg-white/5 rounded-xl">
          <button 
            onClick={onLangToggle}
            className="flex items-center gap-2 px-3 py-2 text-xs font-black uppercase text-slate-500 hover:text-apple-accent hover:bg-white dark:hover:bg-apple-darkCard rounded-lg transition-all"
          >
            <Languages size={14} />
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

        <div className="flex items-center gap-3 pl-4 border-l border-apple-border dark:border-apple-darkBorder">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold leading-none mb-1">Farrux R.</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Admin</p>
          </div>
          {/* macOS Traffic Lights - Windows Style (Right Aligned) */}
          <div className="flex gap-1.5 ml-2 border-l border-apple-border dark:border-apple-darkBorder pl-4">
            <div className="w-3 h-3 rounded-full bg-[#27C93F] cursor-pointer hover:opacity-80 transition-opacity"></div>
            <div className="w-3 h-3 rounded-full bg-[#FFBD2E] cursor-pointer hover:opacity-80 transition-opacity"></div>
            <div className="w-3 h-3 rounded-full bg-[#FF5F56] cursor-pointer hover:opacity-80 transition-opacity"></div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
