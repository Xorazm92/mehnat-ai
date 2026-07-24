"use client";

import * as React from 'react';
import { AlertCircle, RotateCcw, Home, Sparkles } from 'lucide-react';
import { isChunkLoadError } from '@/lib/errors';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    const { hasError, error } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      if (fallback) {
        return fallback;
      }

      const isVersionError = isChunkLoadError(error);

      return (
        <div className="min-h-dvh bg-[var(--bg-primary)] flex items-center justify-center p-4">
          <div className="c1-card p-6 max-w-md w-full border border-[var(--rule)] bg-[var(--card-bg)] dark:bg-[var(--surface-2)]">
            <div className="flex items-center gap-3 mb-4 bg-[var(--danger-bg)] p-3 border-b border-[var(--danger-border)]">
              <div className={`${isVersionError ? 'text-[var(--accent-indigo)]' : 'text-[var(--danger)]'}`}>
                {isVersionError ? <Sparkles size={24} /> : <AlertCircle size={24} />}
              </div>
              <h2 className="text-sm font-bold text-[var(--text-primary)] dark:text-white uppercase">
                {isVersionError ? 'Yangi versiya tayyor' : 'Xatolik yuz berdi'}
              </h2>
            </div>

            <h2 className="text-3xl font-black text-[var(--text-primary)] dark:text-white mb-3 text-center uppercase tracking-tight">
              {isVersionError ? 'Yangi versiya tayyor' : 'Xatolik yuz berdi'}
            </h2>
            <p className="text-[var(--text-secondary)] text-body mb-6 font-medium">
              {isVersionError
                ? 'Tizim yangilandi. Iltimos, so\'nggi o\'zgarishlarni ko\'rish uchun sahifani yangilang.'
                : (error?.message || 'Noma\'lum xatolik yuz berdi')}
            </p>

            <div className="space-y-2 mt-4 pt-4 border-t border-[var(--rule)]">
              <button
                onClick={() => {
                  if (isVersionError) {
                    window.location.reload();
                  } else {
                    this.handleReset();
                  }
                }}
                className="w-full flex items-center justify-center gap-2 bg-[var(--brand)] hover:bg-[var(--brand)] text-white py-2 rounded-lg text-body font-semibold transition-colors"
              >
                <RotateCcw size={16} />
                {isVersionError ? 'Yangilash va kirish' : 'Qayta urinish'}
              </button>

              {!isVersionError && (
                <button
                  onClick={() => window.location.href = '/'}
                  className="w-full flex items-center justify-center gap-2 bg-[var(--bg-sunken)] hover:bg-[var(--rule)] dark:hover:bg-[var(--surface-2)] text-[var(--text-secondary)] py-2 rounded-lg text-body font-semibold transition-colors border border-[var(--rule)]"
                >
                  <Home size={16} />
                  Bosh sahifaga qaytish
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
