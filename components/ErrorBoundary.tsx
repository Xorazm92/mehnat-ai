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
        <div className="min-h-screen bg-[#F0F1F3] dark:bg-[#1A1D23] flex items-center justify-center p-4">
          <div className="c1-card p-6 max-w-md w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#22252B]">
            <div className="flex items-center gap-3 mb-4 bg-red-50 dark:bg-red-900/20 p-3 border-b border-red-200 dark:border-red-900">
              <div className={`${isVersionError ? 'text-indigo-600' : 'text-red-600'}`}>
                {isVersionError ? <Sparkles size={24} /> : <AlertCircle size={24} />}
              </div>
              <h2 className="text-[14px] font-bold text-gray-800 dark:text-white uppercase">
                {isVersionError ? 'Yangi versiya tayyor' : 'Xatolik yuz berdi'}
              </h2>
            </div>

            <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-3 text-center uppercase tracking-tight">
              {isVersionError ? 'Yangi versiya tayyor' : 'Xatolik yuz berdi'}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-[13px] mb-6 font-medium">
              {isVersionError
                ? 'Tizim yangilandi. Iltimos, so\'nggi o\'zgarishlarni ko\'rish uchun sahifani yangilang.'
                : (error?.message || 'Noma\'lum xatolik yuz berdi')}
            </p>

            <div className="space-y-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => {
                  if (isVersionError) {
                    window.location.reload();
                  } else {
                    this.handleReset();
                  }
                }}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded text-[13px] font-semibold transition-colors"
              >
                <RotateCcw size={16} />
                {isVersionError ? 'Yangilash va kirish' : 'Qayta urinish'}
              </button>

              {!isVersionError && (
                <button
                  onClick={() => window.location.href = '/'}
                  className="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 py-2 rounded text-[13px] font-semibold transition-colors border border-gray-300 dark:border-gray-600"
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
