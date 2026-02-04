
import React from 'react';
import { ReportStatus } from '../types';

interface StatusBadgeProps {
  status: ReportStatus | string;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const getStyles = () => {
    switch (status) {
      case ReportStatus.ACCEPTED:
        return 'bg-[#34C759]/15 text-[#34C759] dark:bg-[#32D74B]/20 dark:text-[#32D74B] border-transparent';
      case ReportStatus.NOT_SUBMITTED:
        return 'bg-[#FF3B30]/15 text-[#FF3B30] dark:bg-[#FF453A]/20 dark:text-[#FF453A] border-transparent';
      case ReportStatus.NOT_REQUIRED:
        return 'bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-slate-500 border-transparent';
      case ReportStatus.BLOCKED:
        return 'bg-[#FF9500]/15 text-[#FF9500] dark:bg-[#FF9F0A]/20 dark:text-[#FF9F0A] border-transparent animate-pulse';
      case ReportStatus.IN_PROGRESS:
        return 'bg-[#5856D6]/15 text-[#5856D6] dark:bg-[#5E5CE6]/20 dark:text-[#5E5CE6] border-transparent';
      default:
        return 'bg-slate-50 text-slate-400 dark:bg-white/5 dark:text-slate-600 border-transparent';
    }
  };

  return (
    <span className={`px-4 py-1.5 rounded-xl text-tiny md:text-xs font-extrabold border uppercase tracking-widest ${getStyles()} shadow-sm inline-flex items-center justify-center min-w-[50px]`}>
      {status === ReportStatus.BLOCKED ? 'KARTOTEKA' : status}
    </span>
  );
};

export default StatusBadge;
