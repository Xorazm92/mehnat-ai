import React from 'react';
import {
  Search, Sun, Moon, RefreshCw, Languages, Menu,
  LogOut, Bell, Check, Trash2, Clock, ChevronDown
} from 'lucide-react';
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

const ROLE_COLORS: Record<string, string> = {
  super_admin: '#6366F1',
  admin: '#8B5CF6',
  chief_accountant: '#10B981',
  accountant: '#3B82F6',
  supervisor: '#F59E0B',
  bank_manager: '#EF4444',
};

const AVATAR_COLORS = [
  '#6366F1','#8B5CF6','#10B981','#3B82F6','#F59E0B','#EF4444','#EC4899','#06B6D4'
];

const TopBar: React.FC<TopBarProps> = ({
  isDarkMode, onThemeToggle, lang, onLangToggle, lastSync, onSync,
  isSyncing, onMenuToggle, userName, userRole, onLogout, onProfileClick,
  notifications, onMarkAsRead, onDeleteNotification, selectedPeriod, onPeriodChange
}) => {
  const t = translations[lang];
  const [showNotifs, setShowNotifs] = React.useState(false);
  const [showUser, setShowUser] = React.useState(false);
  const unread = notifications.filter(n => !n.isRead).length;
  const avatarColor = AVATAR_COLORS[(userName?.charCodeAt(0) || 0) % AVATAR_COLORS.length];
  const roleColor = ROLE_COLORS[userRole || ''] || '#6366F1';

  const getIcon = (type: string) => {
    if (type === 'approval_request') return <Clock size={13} />;
    if (type === 'deadline') return <Bell size={13} />;
    return <Bell size={13} />;
  };

  const IconBtn = ({ onClick, title, children, active = false, badge = 0 }: {
    onClick: () => void; title: string; children: React.ReactNode; active?: boolean; badge?: number;
  }) => (
    <button
      onClick={onClick}
      title={title}
      className="relative flex items-center justify-center w-8 h-8 rounded-lg transition-all"
      style={{
        background: active ? 'var(--primary-ghost)' : 'transparent',
        color: active ? 'var(--primary)' : 'var(--text-2)',
        border: active ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget.style.background = 'var(--surface-2)'); }}
      onMouseLeave={e => { if (!active) (e.currentTarget.style.background = 'transparent'); }}
    >
      {children}
      {badge > 0 && (
        <span className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 text-[9px] font-black text-white rounded-full"
          style={{ background: '#EF4444', border: '1.5px solid var(--surface)' }}>
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );

  return (
    <header
      className="h-14 flex items-center justify-between px-4 sticky top-0 z-40 transition-colors"
      style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
    >
      {/* Left */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <button
          onClick={onMenuToggle}
          className="lg:hidden flex items-center justify-center w-8 h-8 rounded-lg transition-all"
          style={{ color: 'var(--text-2)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
          onMouseLeave={e => (e.currentTarget.style.background = '')}
        >
          <Menu size={18} />
        </button>

        {/* Search */}
        <div className="relative hidden sm:flex items-center max-w-xs w-full">
          <Search className="absolute left-3 pointer-events-none" size={13} style={{ color: 'var(--text-3)' }} />
          <input
            type="text"
            placeholder={lang === 'uz' ? "Qidirish..." : "Поиск..."}
            className="w-full pl-9 pr-4 py-2 text-[13px] rounded-lg transition-all"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = ''; }}
          />
        </div>

        {/* Period picker */}
        <div className="hidden md:block shrink-0">
          <MonthPicker
            selectedPeriod={selectedPeriod}
            onChange={onPeriodChange}
            className="h-9 text-[13px] rounded-lg"
          />
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-1 ml-3">
        {/* Lang toggle */}
        <button
          onClick={onLangToggle}
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold uppercase transition-all"
          style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
          onMouseLeave={e => (e.currentTarget.style.background = '')}
        >
          <Languages size={12} />
          {lang.toUpperCase()}
        </button>

        {/* Divider */}
        <div className="w-px h-5 mx-1" style={{ background: 'var(--border)' }} />

        {/* Theme */}
        <IconBtn onClick={onThemeToggle} title={isDarkMode ? 'Light mode' : 'Dark mode'}>
          {isDarkMode ? <Sun size={15} /> : <Moon size={15} />}
        </IconBtn>

        {/* Sync */}
        <IconBtn onClick={onSync} title="Yangilash">
          <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} style={{ color: isSyncing ? 'var(--primary)' : undefined }} />
        </IconBtn>

        {/* Notifications */}
        <div className="relative">
          <IconBtn onClick={() => { setShowNotifs(!showNotifs); setShowUser(false); }} title={t.notifications} active={showNotifs} badge={unread}>
            <Bell size={15} />
          </IconBtn>

          {showNotifs && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowNotifs(false)} />
              <div className="absolute right-0 top-full mt-2 w-80 rounded-xl overflow-hidden z-50 animate-fade-in"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
                <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <p className="text-[12px] font-bold" style={{ color: 'var(--text)' }}>{t.notifications}</p>
                  {unread > 0 && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--primary-ghost)', color: 'var(--primary)' }}>
                      {unread} yangi
                    </span>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-2">
                      <Bell size={28} style={{ color: 'var(--text-3)' }} />
                      <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>{t.noMessages}</p>
                    </div>
                  ) : notifications.map(n => (
                    <div key={n.id} className={`flex gap-3 px-4 py-3 transition-colors ${n.isRead ? 'opacity-50' : ''}`}
                      style={{ borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: 'var(--primary-ghost)', color: 'var(--primary)' }}>
                        {getIcon(n.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold truncate" style={{ color: 'var(--text)' }}>{n.title}</p>
                        <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: 'var(--text-2)' }}>{n.message}</p>
                        <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: 'var(--text-3)' }}>
                          <Clock size={9} />
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        {!n.isRead && (
                          <button onClick={() => onMarkAsRead(n.id)}
                            className="w-6 h-6 flex items-center justify-center rounded-md transition-all"
                            style={{ background: 'var(--success-light)', color: 'var(--success)' }}>
                            <Check size={11} />
                          </button>
                        )}
                        <button onClick={() => onDeleteNotification(n.id)}
                          className="w-6 h-6 flex items-center justify-center rounded-md transition-all"
                          style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-5 mx-1" style={{ background: 'var(--border)' }} />

        {/* User */}
        <div className="relative">
          <button
            onClick={() => { setShowUser(!showUser); setShowNotifs(false); }}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all"
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
            onMouseLeave={e => (e.currentTarget.style.background = '')}
          >
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[11px] font-black shrink-0"
              style={{ background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}99)`, boxShadow: `0 2px 8px ${avatarColor}44` }}>
              {userName?.charAt(0)?.toUpperCase() || 'A'}
            </div>
            <div className="hidden lg:block text-left leading-none">
              <p className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{userName || 'Admin'}</p>
              <p className="text-[10px] mt-0.5 font-medium capitalize" style={{ color: roleColor }}>
                {(translations[lang] as any)[`role_${userRole}`] || userRole || 'Super Admin'}
              </p>
            </div>
            <ChevronDown size={12} style={{ color: 'var(--text-3)' }} />
          </button>

          {showUser && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowUser(false)} />
              <div className="absolute right-0 top-full mt-2 w-48 rounded-xl overflow-hidden z-50 animate-fade-in"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
                <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <p className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{userName}</p>
                  <p className="text-[10px] capitalize" style={{ color: roleColor }}>{userRole}</p>
                </div>
                {onProfileClick && (
                  <button onClick={() => { onProfileClick(); setShowUser(false); }}
                    className="flex items-center gap-2 w-full px-3 py-2.5 text-[12px] transition-all"
                    style={{ color: 'var(--text-2)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    Profil
                  </button>
                )}
                {onLogout && (
                  <button onClick={onLogout}
                    className="flex items-center gap-2 w-full px-3 py-2.5 text-[12px] transition-all"
                    style={{ color: 'var(--danger)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--danger-light)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <LogOut size={13} />
                    {t.logout}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default TopBar;
