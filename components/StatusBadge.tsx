
import React from 'react';
import { ReportStatus } from '../types';

interface StatusBadgeProps {
  status: ReportStatus | string;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const getStyles = () => {
    switch (status) {
      case ReportStatus.ACCEPTED:
        return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-glass-emerald';
      case ReportStatus.NOT_SUBMITTED:
        return 'bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-glass-rose';
      case ReportStatus.NOT_REQUIRED:
        return 'bg-slate-500/5 text-slate-400 border-white/10 opacity-50';
      case ReportStatus.BLOCKED:
        return 'bg-amber-500/15 text-amber-500 border-amber-500/30 shadow-glass-amber animate-pulse';
      case ReportStatus.IN_PROGRESS:
        return 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20 shadow-glass-indigo';
      default:
        return 'bg-slate-500/5 text-slate-500 border-white/5';
    }
  };

  return (
    <span className={`px-4 py-1.5 rounded-xl text-[9px] font-black border uppercase tracking-[0.2em] ${getStyles()} backdrop-blur-md transition-all duration-500 inline-flex items-center justify-center min-w-[64px] shadow-sm`}>
      {status === ReportStatus.BLOCKED ? 'KARTOTEKA' : status}
    </span>
  );
};

export default StatusBadge;
