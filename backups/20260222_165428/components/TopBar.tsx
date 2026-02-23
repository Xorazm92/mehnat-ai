import React from 'react';
import { Search, Sun, Moon, RefreshCw, Languages, Menu, LogOut, Bell, Check, Trash2, Clock, Calendar } from 'lucide-react';
import { MonthPicker } from './ui/MonthPicker';
import { Language, AppNotification } from '../types';
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
  notifications: AppNotification[];
  onMarkAsRead: (id: string) => void;
  onDeleteNotification: (id: string) => void;
  selectedPeriod: string;
  onPeriodChange: (p: string) => void;
}

const TopBar: React.FC<TopBarProps> = ({
  isDarkMode, onThemeToggle, lang, onLangToggle, lastSync, onSync,
  isSyncing, onMenuToggle, userName, userRole, onLogout, onProfileClick,
  notifications, onMarkAsRead, onDeleteNotification,
  selectedPeriod, onPeriodChange
}) => {
  const t = translations[lang];
  const [showNotifs, setShowNotifs] = React.useState(false);
  const unreadCount = notifications.filter(n => !n.isRead).length;

  const getIcon = (type: string) => {
    switch (type) {
      case 'approval_request': return <Clock size={14} />;
      case 'deadline': return <Bell size={14} className="text-amber-500" />;
      default: return <Bell size={14} />;
    }
  };

  return (
    <header className="h-20 md:h-24 flex items-center justify-between px-6 md:px-10 sticky top-0 z-40 bg-white/5 dark:bg-black/10 backdrop-blur-3xl border-b border-white/10 shadow-glass-sm">
      {/* Background Accent */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-1 bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent"></div>

      <div className="flex items-center gap-4 md:gap-8 flex-1 max-w-2xl relative z-10">
        <button onClick={onMenuToggle} className="lg:hidden p-3 text-slate-500 hover:bg-white/10 dark:hover:bg-white/5 rounded-2xl transition-all border border-transparent hover:border-white/10">
          <Menu size={24} />
        </button>
        <div className="relative w-full group hidden sm:block">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={18} strokeWidth={2.5} />
          <input
            type="text"
            placeholder={t.search}
            className="w-full bg-white/5 dark:bg-white/[0.03] border border-white/10 rounded-2xl py-3.5 pl-14 pr-8 outline-none text-[13px] font-black tracking-widest uppercase text-slate-700 dark:text-white placeholder:text-slate-400 focus:bg-white/10 focus:border-indigo-500/30 transition-all shadow-inner"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-focus-within:opacity-100 transition-opacity">
            <span className="px-2 py-1 bg-white/10 rounded-md text-[9px] font-black text-slate-400 border border-white/10 select-none">ESC</span>
          </div>
        </div>

        {/* Global Period Picker Integration */}
        <div className="hidden sm:block shrink-0">
          <MonthPicker
            selectedPeriod={selectedPeriod}
            onChange={onPeriodChange}
            className="h-12 scale-90 md:scale-100 origin-left"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 md:gap-8 relative z-10">
        <div className="flex items-center gap-2 p-1.5 bg-white/5 dark:bg-white/[0.02] border border-white/10 rounded-[1.8rem] shadow-inner">
          <button
            onClick={onLangToggle}
            className="flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase text-slate-500 hover:text-indigo-500 hover:bg-white/10 rounded-xl transition-all"
          >
            <Languages size={15} strokeWidth={3} className="hidden xs:block" />
            {lang}
          </button>

          <div className="w-[1px] h-4 bg-white/10 mx-1"></div>

          <button
            onClick={onThemeToggle}
            className="p-2.5 text-slate-400 hover:text-indigo-500 hover:bg-white/10 rounded-xl transition-all"
          >
            {isDarkMode ? <Sun size={20} strokeWidth={2.5} /> : <Moon size={20} strokeWidth={2.5} />}
          </button>
          <button
            onClick={onSync}
            disabled={isSyncing}
            className={`p-2.5 text-slate-400 hover:text-indigo-500 hover:bg-white/10 rounded-xl transition-all ${isSyncing ? 'animate-spin text-indigo-500' : ''}`}
          >
            <RefreshCw size={20} strokeWidth={2.5} />
          </button>

          <div className="w-[1px] h-4 bg-white/10 mx-1"></div>

          {/* Notifications Bell */}
          <div className="relative">
            <button
              onClick={() => setShowNotifs(!showNotifs)}
              className={`p-2.5 text-slate-400 hover:text-indigo-500 hover:bg-white/10 rounded-xl transition-all relative ${showNotifs ? 'text-indigo-500 bg-white/10' : ''}`}
            >
              <Bell size={20} strokeWidth={2.5} />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 flex h-4.5 w-4.5 items-center justify-center bg-rose-500 text-white text-[9px] font-black rounded-full ring-4 ring-white/10 animate-pulse-subtle">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifs && (
              <div className="absolute right-0 mt-6 w-[calc(100vw-2rem)] sm:w-96 liquid-glass-card rounded-[2.5rem] overflow-hidden animate-macos z-50 border border-white/20 shadow-glass-2xl">
                <div className="p-8 border-b border-white/10 flex items-center justify-between bg-white/5">
                  <h3 className="font-black text-[11px] uppercase tracking-[0.3em] text-slate-800 dark:text-white">Bildirishnomalar</h3>
                  <span className="px-3 py-1 bg-indigo-500/10 text-indigo-500 text-[9px] font-black rounded-lg border border-indigo-500/20">{unreadCount} YANGI</span>
                </div>
                <div className="max-h-[70vh] overflow-y-auto scrollbar-none">
                  {notifications.length === 0 ? (
                    <div className="p-16 text-center">
                      <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-6 text-slate-300">
                        <Bell size={32} strokeWidth={1.5} className="opacity-40" />
                      </div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Hozircha xabarlar yo'q</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {notifications.map(n => (
                        <div key={n.id} className={`p-6 flex gap-5 group transition-all hover:bg-white/5 ${n.isRead ? 'opacity-50 grayscale-[0.5]' : ''}`}>
                          <div className={`shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${n.isRead ? 'bg-white/5 border-white/10 text-slate-400' : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-500 shadow-glass-indigo'}`}>
                            {React.cloneElement(getIcon(n.type) as React.ReactElement, { size: 20, strokeWidth: 3 })}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-black text-slate-800 dark:text-white leading-tight mb-1">{n.title}</p>
                            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">{n.message}</p>
                            <div className="mt-3 flex items-center gap-4">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 opacity-60">
                                <Clock size={12} strokeWidth={2.5} /> {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                              {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>}
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!n.isRead && (
                              <button onClick={() => onMarkAsRead(n.id)} className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl hover:bg-emerald-500 hover:text-white transition-all border border-emerald-500/20">
                                <Check size={16} strokeWidth={3} />
                              </button>
                            )}
                            <button onClick={() => onDeleteNotification(n.id)} className="p-2 bg-rose-500/10 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all border border-rose-500/20">
                              <Trash2 size={16} strokeWidth={3} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 md:pl-8 md:border-l border-white/10">
          <button
            onClick={onProfileClick}
            className="flex items-center gap-4 p-2 bg-white/5 hover:bg-white/10 border border-white/10 dark:border-white/5 rounded-[2rem] transition-all group cursor-pointer shadow-sm"
          >
            <div className="h-10 w-10 md:h-12 md:w-12 rounded-[1.2rem] bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center text-white text-lg font-black shadow-glass-indigo group-hover:scale-105 group-hover:rotate-3 transition-transform">
              {userName ? userName.charAt(0).toUpperCase() : 'A'}
            </div>
            <div className="text-left pr-4 hidden lg:block">
              <p className="text-[13px] font-black text-slate-800 dark:text-white leading-none mb-1 premium-text-gradient uppercase tracking-tight">{userName || 'Administrator'}</p>
              <p className="text-[9px] text-indigo-500 dark:text-indigo-400 font-black uppercase tracking-[0.2em]">{userRole || 'Super Admin'}</p>
            </div>
          </button>

          {onLogout && (
            <button
              onClick={onLogout}
              className="p-3 text-rose-500/70 hover:text-rose-500 hover:bg-rose-500/10 rounded-2xl transition-all border border-transparent hover:border-rose-500/20"
              title={t.logout}
            >
              <LogOut size={22} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default TopBar;
