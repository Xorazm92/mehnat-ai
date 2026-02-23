import React from 'react';
import { AlertCircle, RotateCcw, Home } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

declare global {
  interface Window {
    __errorReporter__?: {
      captureException: (error: Error, context: any) => void;
    };
  }
}

/**
 * Error Boundary Component
 * Catches errors in child components and displays fallback UI
 * Prevents entire app from crashing
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  declare state: ErrorBoundaryState;
  declare props: Readonly<ErrorBoundaryProps>;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Update state
    this.setState({
      errorInfo,
    } as ErrorBoundaryState);

    // Log error details
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Send to error tracking service (Sentry, etc.)
    if (window.__errorReporter__) {
      window.__errorReporter__.captureException(error, {
        contexts: {
          react: {
            componentStack: errorInfo.componentStack,
          },
        },
      });
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    } as ErrorBoundaryState);
  };

  handleReload = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full border border-red-100">
            {/* Error Icon */}
            <div className="flex justify-center mb-6">
              <div className="bg-red-100 rounded-full p-4">
                <AlertCircle className="text-red-600" size={32} />
              </div>
            </div>

            {/* Error Title */}
            <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
              Something went wrong
            </h1>

            {/* Error Message */}
            <p className="text-center text-gray-600 mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>

            {/* Error Details (Development only) */}
            {process.env.NODE_ENV === 'development' && (
              <details className="mb-6 p-4 bg-gray-50 rounded border border-gray-200">
                <summary className="cursor-pointer font-mono text-sm font-semibold text-gray-700 mb-2">
                  📋 Error Details
                </summary>
                <div className="mt-3 space-y-2">
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1">
                      Message:
                    </p>
                    <pre className="text-xs text-gray-700 bg-white p-2 rounded border border-gray-200 overflow-x-auto">
                      {this.state.error?.message}
                    </pre>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1">
                      Component Stack:
                    </p>
                    <pre className="text-xs text-gray-700 bg-white p-2 rounded border border-gray-200 overflow-x-auto max-h-40">
                      {this.state.errorInfo?.componentStack}
                    </pre>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1">
                      Stack Trace:
                    </p>
                    <pre className="text-xs text-gray-700 bg-white p-2 rounded border border-gray-200 overflow-x-auto max-h-40">
                      {this.state.error?.stack}
                    </pre>
                  </div>
                </div>
              </details>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
              >
                <RotateCcw size={18} />
                Try Again
              </button>

              <button
                onClick={this.handleReload}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-lg transition-colors"
              >
                <Home size={18} />
                Home
              </button>
            </div>

            {/* Help Text */}
            <p className="text-xs text-gray-500 text-center mt-4">
              If the problem persists, please{' '}
              <a href="mailto:support@asos.uz" className="text-blue-500 hover:underline">
                contact support
              </a>
              .
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
