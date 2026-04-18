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
          css: 'c1-badge-success',
          icon: <CheckCircle2 size={size === 'sm' ? 12 : 14} />
        };
      case ReportStatus.NOT_SUBMITTED:
        return {
          css: 'c1-badge-danger',
          icon: <AlertCircle size={size === 'sm' ? 12 : 14} />
        };
      case ReportStatus.NOT_REQUIRED:
        return {
          css: 'bg-gray-100 text-gray-500 border border-gray-300 dark:bg-gray-800 dark:border-gray-700',
          icon: <MinusCircle size={size === 'sm' ? 12 : 14} />
        };
      case ReportStatus.BLOCKED:
        return {
          css: 'c1-badge-warning',
          icon: <ShieldAlert size={size === 'sm' ? 12 : 14} />
        };
      case ReportStatus.IN_PROGRESS:
        return {
          css: 'c1-badge-info',
          icon: <Clock size={size === 'sm' ? 12 : 14} />
        };
      default:
        return {
          css: 'bg-gray-50 text-gray-500 border border-gray-200 dark:bg-gray-800 dark:border-gray-700',
          icon: <MinusCircle size={size === 'sm' ? 12 : 14} />
        };
    }
  };

  const { css, icon } = getStyles();
  const label = status === ReportStatus.BLOCKED ? 'KARTOTEKA' :
    status === ReportStatus.ACCEPTED ? 'TOP' :
      status === ReportStatus.NOT_SUBMITTED ? 'YANGI' :
        status === '-' ? 'YO\'Q' : status;

  return (
    <span className={`c1-badge ${css} inline-flex items-center justify-center gap-1 min-w-[60px] ${size === 'sm' ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-1'} transition-all rounded-sm uppercase font-bold tracking-tight shadow-sm`}>
      {icon}
      {label}
    </span>
  );
};

export default StatusBadge;
