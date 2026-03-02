import * as React from 'react';
import { AlertCircle, RotateCcw, Home, Sparkles } from 'lucide-react';
import { isChunkLoadError } from '../lib/errors';

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
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
          {/* Background Effects */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-500/[0.05] rounded-full blur-[120px]"></div>
            <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/[0.05] rounded-full blur-[120px]"></div>
          </div>

          <div className="liquid-glass-card p-10 max-w-md w-full border border-white/20 shadow-glass-2xl relative z-10 animate-macos">
            <div className="flex justify-center mb-8">
              <div className={`${isVersionError ? 'bg-indigo-500/10 text-indigo-500' : 'bg-rose-500/10 text-rose-500'} rounded-3xl p-6 shadow-glass`}>
                {isVersionError ? <Sparkles size={40} strokeWidth={2.5} /> : <AlertCircle size={40} strokeWidth={2.5} />}
              </div>
            </div>

            <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-3 text-center uppercase tracking-tight">
              {isVersionError ? 'Yangi versiya tayyor' : 'Xatolik yuz berdi'}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-center mb-10 font-bold uppercase tracking-widest text-[11px] leading-relaxed">
              {isVersionError
                ? 'Tizim yangilandi. Iltimos, so\'nggi o\'zgarishlarni ko\'rish uchun sahifani yangilang.'
                : (error?.message || 'Noma\'lum xatolik yuz berdi')}
            </p>

            <div className="space-y-4">
              <button
                onClick={() => {
                  if (isVersionError) {
                    window.location.reload();
                  } else {
                    this.handleReset();
                  }
                }}
                className="w-full flex items-center justify-center gap-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 py-5 rounded-2xl font-black text-[12px] uppercase tracking-[0.2em] hover:scale-[1.02] active:scale-[0.98] transition-all shadow-glass"
              >
                <RotateCcw size={20} strokeWidth={3} />
                {isVersionError ? 'Yangilash va kirish' : 'Qayta urinish'}
              </button>

              {!isVersionError && (
                <button
                  onClick={() => window.location.href = '/'}
                  className="w-full flex items-center justify-center gap-3 bg-slate-200 dark:bg-white/5 text-slate-600 dark:text-slate-400 py-5 rounded-2xl font-black text-[12px] uppercase tracking-[0.2em] hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  <Home size={20} strokeWidth={3} />
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
