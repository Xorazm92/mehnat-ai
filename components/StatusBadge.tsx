import React from 'react';
import { ReportStatus } from '../types';
import { CheckCircle2, AlertCircle, Clock, MinusCircle, ShieldAlert } from 'lucide-react';

interface StatusBadgeProps {
  status: ReportStatus | string;
  size?: 'sm' | 'md' | 'lg';
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'sm' }) => {
  const getStyles = () => {
    switch (status) {
      case ReportStatus.ACCEPTED:
        return {
          css: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-glass-emerald',
          icon: <CheckCircle2 size={size === 'sm' ? 12 : 16} />
        };
      case ReportStatus.NOT_SUBMITTED:
        return {
          css: 'bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-glass-rose',
          icon: <AlertCircle size={size === 'sm' ? 12 : 16} />
        };
      case ReportStatus.NOT_REQUIRED:
        return {
          css: 'bg-slate-500/5 text-slate-400 border-white/10 opacity-50',
          icon: <MinusCircle size={size === 'sm' ? 12 : 16} />
        };
      case ReportStatus.BLOCKED:
        return {
          css: 'bg-amber-500/15 text-amber-500 border-amber-500/30' + (size === 'sm' ? '' : ' animate-pulse'),
          icon: <ShieldAlert size={size === 'sm' ? 12 : 16} />
        };
      case ReportStatus.IN_PROGRESS:
        return {
          css: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20 shadow-glass-indigo',
          icon: <Clock size={size === 'sm' ? 12 : 16} />
        };
      default:
        return {
          css: 'bg-slate-500/5 text-slate-500 border-white/5',
          icon: <MinusCircle size={size === 'sm' ? 12 : 16} />
        };
    }
  };

  const { css, icon } = getStyles();
  const label = status === ReportStatus.BLOCKED ? 'KARTOTEKA' :
    status === ReportStatus.ACCEPTED ? 'TOP' :
      status === ReportStatus.NOT_SUBMITTED ? 'YANGI' :
        status === '-' ? 'YO\'Q' : status;

  return (
    <span className={`px-4 py-1.5 rounded-xl font-black border uppercase tracking-[0.2em] ${css} backdrop-blur-md transition-all duration-500 inline-flex items-center gap-2 min-w-[70px] justify-center shadow-sm ${size === 'sm' ? 'text-[8px]' : 'text-[10px]'}`}>
      {icon}
      {label}
    </span>
  );
};

export default StatusBadge;
