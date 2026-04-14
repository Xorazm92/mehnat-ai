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
    <header className="h-12 flex items-center justify-between px-3 md:px-4 sticky top-0 z-40 bg-white dark:bg-[#22252B] border-b border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="flex items-center gap-3 flex-1 max-w-xl">
        {/* Mobile menu */}
        <button onClick={onMenuToggle} className="lg:hidden p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors">
          <Menu size={18} />
        </button>

        {/* Search */}
        <div className="relative w-full hidden sm:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
          <input
            type="text"
            placeholder={t.search}
            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded py-1.5 pl-8 pr-3 text-[13px] text-gray-700 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all"
          />
        </div>

        {/* Period Picker */}
        <div className="hidden sm:block shrink-0">
          <MonthPicker
            selectedPeriod={selectedPeriod}
            onChange={onPeriodChange}
            className="h-8 scale-90 origin-left"
          />
        </div>
      </div>

      {/* Right side toolbar */}
      <div className="flex items-center gap-1 md:gap-2">
        {/* Toolbar buttons group */}
        <div className="flex items-center gap-0.5 border border-gray-200 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-800 p-0.5">
          <button
            onClick={onLangToggle}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors uppercase"
            title="Tilni o'zgartirish"
          >
            <Languages size={13} className="hidden xs:block" />
            {lang}
          </button>

          <div className="w-px h-4 bg-gray-200 dark:bg-gray-600" />

          <button
            onClick={onThemeToggle}
            className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title="Tema"
          >
            {isDarkMode ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <button
            onClick={onSync}
            disabled={isSyncing}
            className={`p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors ${isSyncing ? 'animate-spin text-blue-600' : ''}`}
            title="Yangilash"
          >
            <RefreshCw size={15} />
          </button>

          <div className="w-px h-4 bg-gray-200 dark:bg-gray-600" />

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setShowNotifs(!showNotifs)}
              className={`p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors relative ${showNotifs ? 'bg-gray-200 dark:bg-gray-700 text-blue-600' : ''}`}
              title={t.notifications}
            >
              <Bell size={15} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center bg-red-600 text-white text-[9px] font-bold rounded-full">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifs && (
              <div className="absolute right-0 mt-1 w-[calc(100vw-1rem)] sm:w-80 bg-white dark:bg-[#22252B] rounded-md border border-gray-200 dark:border-gray-600 shadow-lg animate-macos z-50 overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-600 flex items-center justify-between bg-gray-50 dark:bg-gray-800">
                  <h3 className="font-bold text-[12px] text-gray-700 dark:text-gray-200">{t.notifications}</h3>
                  <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 text-[10px] font-bold rounded border border-blue-200 dark:border-blue-800">{unreadCount} {t.newLabel}</span>
                </div>
                <div className="max-h-[60vh] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center">
                      <Bell size={24} className="mx-auto mb-2 text-gray-300" />
                      <p className="text-[11px] text-gray-400">{t.noMessages}</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                      {notifications.map(n => (
                        <div key={n.id} className={`px-3 py-2.5 flex gap-3 group transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${n.isRead ? 'opacity-50' : ''}`}>
                          <div className={`shrink-0 w-8 h-8 rounded flex items-center justify-center ${n.isRead ? 'bg-gray-100 dark:bg-gray-700 text-gray-400' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600'}`}>
                            {React.cloneElement(getIcon(n.type) as React.ReactElement, { size: 14 })}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-bold text-gray-800 dark:text-gray-200 leading-tight">{n.title}</p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug mt-0.5 line-clamp-2">{n.message}</p>
                            <div className="mt-1 flex items-center gap-2">
                              <p className="text-[9px] text-gray-400 flex items-center gap-1">
                                <Clock size={10} /> {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                              {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!n.isRead && (
                              <button onClick={() => onMarkAsRead(n.id)} className="p-1 bg-green-50 text-green-600 rounded hover:bg-green-100 transition-colors" title="O'qildi">
                                <Check size={12} />
                              </button>
                            )}
                            <button onClick={() => onDeleteNotification(n.id)} className="p-1 bg-red-50 text-red-500 rounded hover:bg-red-100 transition-colors" title="O'chirish">
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
        <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-200 dark:border-gray-600">
          <button
            onClick={onProfileClick}
            className="flex items-center gap-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors cursor-pointer"
          >
            <div className="h-7 w-7 rounded bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center text-white text-[11px] font-bold">
              {userName ? userName.charAt(0).toUpperCase() : 'A'}
            </div>
            <div className="text-left hidden lg:block">
              <p className="text-[12px] font-bold text-gray-800 dark:text-gray-200 leading-none">{userName || t.administrator}</p>
              <p className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">{(translations[lang] as any)[`role_${userRole}`] || userRole || t.role_super_admin}</p>
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
