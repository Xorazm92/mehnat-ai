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
          css: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          icon: <CheckCircle2 size={size === 'sm' ? 12 : 16} />
        };
      case ReportStatus.NOT_SUBMITTED:
        return {
          css: 'bg-rose-50 text-rose-700 border-rose-200',
          icon: <AlertCircle size={size === 'sm' ? 12 : 16} />
        };
      case ReportStatus.NOT_REQUIRED:
        return {
          css: 'bg-gray-100 text-gray-500 border-gray-200',
          icon: <MinusCircle size={size === 'sm' ? 12 : 16} />
        };
      case ReportStatus.BLOCKED:
        return {
          css: 'bg-amber-100 text-amber-700 border-amber-300' + (size === 'sm' ? '' : ' animate-pulse'),
          icon: <ShieldAlert size={size === 'sm' ? 12 : 16} />
        };
      case ReportStatus.IN_PROGRESS:
        return {
          css: 'bg-indigo-50 text-indigo-700 border-indigo-200',
          icon: <Clock size={size === 'sm' ? 12 : 16} />
        };
      default:
        return {
          css: 'bg-gray-50 text-gray-500 border-gray-200',
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
    <span className={`px-2 py-0.5 rounded border uppercase font-bold inline-flex items-center justify-center gap-1 min-w-[60px] ${css} ${size === 'sm' ? 'text-[9px]' : 'text-[11px]'} transition-colors`}>
      {icon}
      {label}
    </span>
  );
};

export default StatusBadge;
