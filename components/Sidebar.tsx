import React from 'react';
import {
  ChevronLeft, ChevronRight, LayoutDashboard, Building2,
  Database, Wallet, Receipt, Gauge, Calendar, Users,
  ClipboardList, Settings, TrendingUp
} from 'lucide-react';
import { translations } from '../lib/translations';
import { canSeeView } from '../lib/permissions';
import { Language, AppView } from '../types';
import type { UserRole } from '../lib/permissions';

interface SidebarProps {
  activeView: string;
  onViewChange: (view: AppView) => void;
  isOpen?: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClose?: () => void;
  lang: Language;
  userRole: UserRole;
  pendingReportsCount?: number;
}

const NAV_ITEMS = [
  { id: 'dashboard',     icon: LayoutDashboard, color: '#6366F1' },
  { id: 'organizations', icon: Building2,        color: '#10B981' },
  { id: 'reports',       icon: Database,         color: '#3B82F6' },
  { id: 'kassa',         icon: Wallet,           color: '#F59E0B' },
  { id: 'expenses',      icon: Receipt,          color: '#EF4444' },
  { id: 'kpi',           icon: Gauge,            color: '#8B5CF6' },
  { id: 'payroll',       icon: Calendar,         color: '#06B6D4' },
  { id: 'staff',         icon: Users,            color: '#EC4899' },
  { id: 'audit_logs',    icon: ClipboardList,    color: '#F97316' },
  { id: 'settings',      icon: Settings,         color: '#94A3B8' },
];

const Sidebar: React.FC<SidebarProps> = ({
  activeView, onViewChange, isOpen = false,
  isCollapsed, onToggleCollapse, onClose,
  lang, userRole, pendingReportsCount = 0
}) => {
  const t = translations[lang];

  const labels: Record<string, string> = {
    dashboard:     t.dashboard,
    organizations: t.organizations,
    reports:       t.reports,
    kassa:         t.kassa,
    expenses:      t.expenses,
    kpi:           t.kpi,
    payroll:       t.payroll,
    staff:         t.staff,
    audit_logs:    t.auditLogs,
    settings:      t.settings,
  };

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <aside
        className={`fixed lg:relative left-0 top-0 h-full z-50 flex flex-col transition-all duration-300 ease-in-out shrink-0
          ${isCollapsed ? 'w-[64px]' : 'w-[220px]'}
          ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
        style={{ background: 'var(--sb-bg)', borderRight: '1px solid var(--sb-border)' }}
      >
        {/* Logo */}
        <div className={`flex items-center h-14 px-4 shrink-0 ${isCollapsed ? 'justify-center px-0' : 'gap-3'}`}
          style={{ borderBottom: '1px solid var(--sb-border)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)', boxShadow: '0 4px 12px rgba(99,102,241,0.4)' }}>
            <TrendingUp size={16} color="#fff" strokeWidth={2.5} />
          </div>
          {!isCollapsed && (
            <div className="overflow-hidden">
              <p className="font-black text-[13px] text-white leading-none tracking-wide">ASOS</p>
              <p className="text-[9px] font-semibold tracking-widest mt-0.5" style={{ color: 'rgba(99,102,241,0.9)' }}>BUXGALTERIYA</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 min-h-0 overflow-y-auto scrollbar-hide py-3 px-2 space-y-0.5">
          {NAV_ITEMS.map(({ id, icon: Icon, color }) => {
            if (!canSeeView(userRole, id as AppView)) return null;
            const isActive = activeView === id;
            return (
              <button
                key={id}
                onClick={() => { onViewChange(id as AppView); onClose?.(); }}
                title={isCollapsed ? labels[id] : ''}
                className={`group flex items-center w-full rounded-lg transition-all duration-150 relative
                  ${isCollapsed ? 'justify-center p-3' : 'gap-3 px-3 py-2.5'}
                  ${isActive ? 'text-white' : ''}`}
                style={isActive ? {
                  background: `linear-gradient(135deg, ${color}22 0%, ${color}11 100%)`,
                  borderLeft: `2px solid ${color}`,
                  paddingLeft: isCollapsed ? '14px' : '10px',
                } : {
                  color: 'var(--sb-text)',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--sb-hover)'; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = ''; }}
              >
                <span style={{ color: isActive ? color : undefined }} className="shrink-0">
                  <Icon size={17} strokeWidth={isActive ? 2.5 : 1.8} />
                </span>

                {!isCollapsed && (
                  <span className={`text-[12px] font-semibold truncate flex-1 text-left ${isActive ? 'text-white' : ''}`}>
                    {labels[id]}
                  </span>
                )}

                {id === 'reports' && pendingReportsCount > 0 && !isCollapsed && (
                  <span className="ml-auto text-[9px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center text-white"
                    style={{ background: '#EF4444' }}>
                    {pendingReportsCount}
                  </span>
                )}

                {/* Tooltip for collapsed */}
                {isCollapsed && (
                  <span className="absolute left-full ml-2 px-2 py-1 text-[11px] font-semibold text-white rounded-md pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50"
                    style={{ background: '#1E2235', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
                    {labels[id]}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <div className="shrink-0 px-2 py-3" style={{ borderTop: '1px solid var(--sb-border)' }}>
          <button
            onClick={onToggleCollapse}
            className="w-full flex items-center justify-center p-2 rounded-lg transition-all"
            style={{ color: 'var(--sb-text)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--sb-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = '')}
          >
            {isCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
