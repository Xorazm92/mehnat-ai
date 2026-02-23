import React, { useState, ReactNode } from 'react';
import { AlertCircle, RotateCcw, Home } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

// Error handling wrapper for React 19 (no class components)
export function ErrorBoundary({ children, fallback }: ErrorBoundaryProps) {
  const [hasError, setHasError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  React.useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error('ErrorBoundary caught an error:', event.error);
      setError(event.error);
      setHasError(true);
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full border border-red-100">
          <div className="flex justify-center mb-6">
            <div className="bg-red-100 rounded-full p-4">
              <AlertCircle className="text-red-600" size={32} />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">Xatolik ro'y berdi</h2>
          <p className="text-gray-600 text-center mb-6">{error?.message || 'Noma\'lum xatolik'}</p>

          <div className="space-y-3">
            <button
              onClick={() => {
                setHasError(false);
                setError(null);
              }}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-blue-700 transition"
            >
              <RotateCcw size={18} />
              Qayta urinish
            </button>

            <button
              onClick={() => window.location.href = '/'}
              className="w-full flex items-center justify-center gap-2 bg-gray-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-gray-700 transition"
            >
              <Home size={18} />
              Bosh sahifaga qaytish
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default ErrorBoundary;
