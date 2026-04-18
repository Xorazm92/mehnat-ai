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
      case 'deadline': return <Bell size={14} className="text-amber-600" />;
      default: return <Bell size={14} />;
    }
  };

  return (
    <header className="h-12 flex items-center justify-between px-3 md:px-5 sticky top-0 z-40 bg-white dark:bg-[#22252B] border-b border-[#DEE2E6] dark:border-[#3A3D44] shadow-sm transition-colors">
      <div className="flex items-center gap-4 flex-1 max-w-xl">
        {/* Mobile menu */}
        <button onClick={onMenuToggle} className="lg:hidden p-1.5 text-gray-400 hover:bg-[#F0F2F5] dark:hover:bg-[#1A1D23] rounded-sm transition-colors">
          <Menu size={18} />
        </button>

        {/* Search */}
        <div className="relative w-full hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={13} />
          <input
            type="text"
            placeholder="PROYEKT BOYLAB QIDIRISH..."
            className="w-full bg-[#F8F9FA] dark:bg-[#111318] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm py-1.5 pl-9 pr-3 text-[10px] font-bold text-gray-800 dark:text-white placeholder:text-gray-400 uppercase tracking-tight focus:border-[#3366CC] transition-all"
          />
        </div>

        {/* Period Picker */}
        <div className="hidden sm:block shrink-0">
          <MonthPicker
            selectedPeriod={selectedPeriod}
            onChange={onPeriodChange}
            className="h-8 scale-90 origin-left border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm bg-[#F8F9FA] dark:bg-[#111318]"
          />
        </div>
      </div>

      {/* Right side toolbar */}
      <div className="flex items-center gap-1.5 md:gap-3">
        {/* Toolbar buttons group */}
        <div className="flex items-center gap-1 border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm bg-[#F8F9FA] dark:bg-[#111318] p-0.5 shadow-sm">
          <button
            onClick={onLangToggle}
            className="flex items-center gap-1 px-2 py-1 text-[9px] font-black text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-[#22252B] hover:text-[#3366CC] rounded-sm transition-all uppercase tracking-widest border border-transparent hover:border-[#DEE2E6] dark:hover:border-[#3A3D44]"
            title="Tilni o'zgartirish"
          >
            <Languages size={12} className="hidden xs:block" />
            {lang}
          </button>

          <div className="w-px h-3 bg-[#DEE2E6] dark:bg-[#3A3D44]" />

          <button
            onClick={onThemeToggle}
            className="p-1.5 text-gray-400 hover:text-[#3366CC] hover:bg-white dark:hover:bg-[#22252B] rounded-sm transition-all border border-transparent hover:border-[#DEE2E6] dark:hover:border-[#3A3D44]"
            title="Tema"
          >
            {isDarkMode ? <Sun size={14} /> : <Moon size={14} />}
          </button>

          <button
            onClick={onSync}
            disabled={isSyncing}
            className={`p-1.5 text-gray-400 hover:text-[#3366CC] hover:bg-white dark:hover:bg-[#22252B] rounded-sm transition-all border border-transparent hover:border-[#DEE2E6] dark:hover:border-[#3A3D44] ${isSyncing ? 'animate-spin text-[#3366CC]' : ''}`}
            title="Yangilash"
          >
            <RefreshCw size={14} />
          </button>

          <div className="w-px h-3 bg-[#DEE2E6] dark:bg-[#3A3D44]" />

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setShowNotifs(!showNotifs)}
              className={`p-1.5 text-gray-400 hover:text-[#3366CC] hover:bg-white dark:hover:bg-[#22252B] rounded-sm transition-all border border-transparent hover:border-[#DEE2E6] dark:hover:border-[#3A3D44] relative ${showNotifs ? 'bg-white dark:bg-[#22252B] text-[#3366CC] border-[#DEE2E6] dark:border-[#3A3D44]' : ''}`}
              title={t.notifications}
            >
              <Bell size={14} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center bg-rose-600 text-white text-[7px] font-black rounded-sm border border-white dark:border-[#22252B]">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifs && (
              <div className="absolute right-0 mt-1 w-[calc(100vw-1rem)] sm:w-80 bg-white dark:bg-[#22252B] rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] shadow-2xl z-50 overflow-hidden transition-all animate-fade-in">
                <div className="px-3 py-2 border-b border-[#DEE2E6] dark:border-[#3A3D44] flex items-center justify-between bg-[#F8F9FA] dark:bg-[#111318]">
                  <h3 className="font-bold text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-widest">{t.notifications}</h3>
                  <span className="px-2 py-0.5 bg-[#EBF3FF] dark:bg-[#1C2531] text-[#3366CC] text-[9px] font-black rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] uppercase">{unreadCount} {t.newLabel}</span>
                </div>
                <div className="max-h-[60vh] overflow-y-auto scrollbar-hide">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center bg-white dark:bg-[#22252B]">
                      <Bell size={24} className="mx-auto mb-2 text-gray-200" />
                      <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">{t.noMessages}</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-[#F0F2F5] dark:divide-[#1e2025]">
                      {notifications.map(n => (
                        <div key={n.id} className={`px-4 py-3 flex gap-3 group transition-colors hover:bg-[#F8F9FA] dark:hover:bg-[#111318] ${n.isRead ? 'opacity-50' : ''}`}>
                          <div className={`shrink-0 w-8 h-8 rounded-sm flex items-center justify-center border ${n.isRead ? 'bg-[#F0F2F5] dark:bg-[#1A1D23] text-gray-400 border-[#DEE2E6] dark:border-[#3A3D44]' : 'bg-[#EBF3FF] dark:bg-[#1C2531] text-[#3366CC] border-[#DEE2E6] dark:border-[#3A3D44]'}`}>
                            {React.cloneElement(getIcon(n.type) as React.ReactElement, { size: 14 })}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold text-gray-800 dark:text-white leading-tight uppercase tracking-tight">{n.title}</p>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug mt-1 line-clamp-2">{n.message}</p>
                            <div className="mt-1.5 flex items-center gap-2">
                              <p className="text-[8px] text-gray-400 font-bold uppercase tracking-widest flex items-center gap-1">
                                <Clock size={10} /> {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                              {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-[#3366CC]" />}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!n.isRead && (
                              <button onClick={() => onMarkAsRead(n.id)} className="p-1 px-1.5 bg-[#EBFBF0] text-emerald-600 rounded-sm border border-[#C3E6CB] hover:bg-[#D7F7E1] transition-all" title="O'qildi">
                                <Check size={12} />
                              </button>
                            )}
                            <button onClick={() => onDeleteNotification(n.id)} className="p-1 px-1.5 bg-rose-50 text-rose-500 rounded-sm border border-rose-200 hover:bg-rose-100 transition-all" title="O'chirish">
                              <Trash2 size={12} />
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

        {/* User profile */}
        <div className="flex items-center gap-2 ml-3 pl-3 border-l border-[#DEE2E6] dark:border-[#3A3D44]">
          <button
            onClick={onProfileClick}
            className="flex items-center gap-2.5 p-1 hover:bg-[#F0F2F5] dark:hover:bg-[#1A1D23] rounded-sm transition-all border border-transparent hover:border-[#DEE2E6] dark:hover:border-[#3A3D44]"
          >
            <div className="h-7 w-7 rounded-sm bg-[#3366CC] flex items-center justify-center text-white text-[10px] font-black shadow-sm">
              {userName ? userName.charAt(0).toUpperCase() : 'A'}
            </div>
            <div className="text-left hidden lg:block leading-none">
              <p className="text-[11px] font-bold text-gray-800 dark:text-white uppercase tracking-tight">{userName || t.administrator}</p>
              <p className="text-[8px] text-[#3366CC] font-bold uppercase tracking-widest mt-1">{(translations[lang] as any)[`role_${userRole}`] || userRole || t.role_super_admin}</p>
            </div>
          </button>

          {onLogout && (
            <button
              onClick={onLogout}
              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
              title={t.logout}
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default TopBar;
