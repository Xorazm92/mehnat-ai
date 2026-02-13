import React from 'react';
import { Search, Sun, Moon, RefreshCw, Languages, Menu, LogOut, Bell, Check, Trash2, Clock } from 'lucide-react';
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
}

const TopBar: React.FC<TopBarProps> = ({
  isDarkMode, onThemeToggle, lang, onLangToggle, lastSync, onSync,
  isSyncing, onMenuToggle, userName, userRole, onLogout, onProfileClick,
  notifications, onMarkAsRead, onDeleteNotification
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
    <header className="h-16 md:h-20 bg-white/70 dark:bg-[#0B0F19]/70 backdrop-blur-2xl border-b border-slate-200/60 dark:border-white/[0.05] flex items-center justify-between px-4 md:px-8 sticky top-0 z-40">
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

          {/* Notifications Bell */}
          <div className="relative">
            <button
              onClick={() => setShowNotifs(!showNotifs)}
              className={`p-2 text-slate-500 hover:text-apple-accent hover:bg-white dark:hover:bg-apple-darkCard rounded-lg transition-all relative ${showNotifs ? 'text-apple-accent bg-white dark:bg-apple-darkCard' : ''}`}
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center bg-rose-500 text-white text-[9px] font-black rounded-full ring-2 ring-white dark:ring-apple-darkBg">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifs && (
              <div className="absolute right-0 mt-3 w-80 md:w-96 bg-white dark:bg-apple-darkCard rounded-2xl shadow-2xl border border-slate-200/60 dark:border-white/[0.05] overflow-hidden animate-macos z-50">
                <div className="p-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                  <h3 className="font-black text-sm uppercase tracking-widest text-slate-800 dark:text-white">Bildirishnomalar</h3>
                  <span className="text-[10px] font-bold text-slate-400">{unreadCount} ta yangi</span>
                </div>
                <div className="max-h-[70vh] overflow-y-auto scrollbar-thin">
                  {notifications.length === 0 ? (
                    <div className="p-10 text-center">
                      <p className="text-xs font-bold text-slate-400 italic">Xabarlar yo'q</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-50 dark:divide-white/5">
                      {notifications.map(n => (
                        <div key={n.id} className={`p-4 flex gap-3 group transition-colors ${n.isRead ? 'opacity-60' : 'bg-blue-50/30 dark:bg-blue-500/5'}`}>
                          <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${n.isRead ? 'bg-slate-100 dark:bg-white/5' : 'bg-blue-500 text-white'}`}>
                            {getIcon(n.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-slate-800 dark:text-white truncate">{n.title}</p>
                            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">{n.message}</p>
                            <p className="text-[9px] font-bold text-slate-400 mt-2 flex items-center gap-1">
                              <Clock size={10} /> {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!n.isRead && (
                              <button onClick={() => onMarkAsRead(n.id)} className="p-1.5 hover:bg-emerald-500 hover:text-white text-emerald-500 rounded-md transition-all">
                                <Check size={14} />
                              </button>
                            )}
                            <button onClick={() => onDeleteNotification(n.id)} className="p-1.5 hover:bg-rose-500 hover:text-white text-rose-500 rounded-md transition-all">
                              <Trash2 size={14} />
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

        <div className="flex items-center gap-3 md:pl-6 md:border-l border-slate-200/50 dark:border-white/5">
          <button
            onClick={onProfileClick}
            className="flex items-center gap-3 p-1.5 md:p-2 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-200/50 dark:border-white/5 group hover:bg-white dark:hover:bg-navy-900 transition-all cursor-pointer text-left"
          >
            <div className="h-9 w-9 md:h-11 md:w-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-black shadow-lg shadow-blue-500/20">
              {userName ? userName.charAt(0).toUpperCase() : 'A'}
            </div>
            <div className="text-left pr-2 md:pr-4">
              <p className="text-xs md:text-sm font-black text-slate-800 dark:text-white leading-tight premium-text-gradient">{userName || 'Administrator'}</p>
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
