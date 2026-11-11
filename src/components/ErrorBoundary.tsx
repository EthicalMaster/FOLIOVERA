/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Foliovera — Phase 1.5: React Error Boundary
 * Captures uncaught React rendering errors and structured FirestoreErrorInfo payloads.
 */

import React from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  errorDetails?: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  public state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
    errorDetails: undefined,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let errorMessage = error.message || 'An unexpected error occurred.';
    let errorDetails: string | undefined;

    try {
      const parsed = JSON.parse(error.message);
      if (parsed && typeof parsed === 'object' && parsed.operationType) {
        errorMessage = `Firestore ${parsed.operationType.toUpperCase()} error on ${parsed.path || 'unknown path'}: ${parsed.error}`;
        errorDetails = JSON.stringify(parsed, null, 2);
      }
    } catch {
      // Not a JSON-encoded FirestoreErrorInfo
    }

    return {
      hasError: true,
      errorMessage,
      errorDetails,
    };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[Foliovera ErrorBoundary]:', error, errorInfo);
  }

  private handleReload = () => {
    this.setState({ hasError: false, errorMessage: '', errorDetails: undefined });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F6F5F1] text-[#242824] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-[#E5E3DC] rounded-2xl p-8 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-red-50 text-red-700 flex items-center justify-center mb-5">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h1 className="font-serif text-2xl font-semibold text-[#242824] mb-2">
              Application Recovery Guard
            </h1>
            <p className="text-sm text-[#5C625C] leading-relaxed mb-4">
              {this.state.errorMessage}
            </p>
            {this.state.errorDetails && (
              <pre className="text-xs bg-[#F6F5F1] border border-[#E5E3DC] rounded-lg p-3 overflow-x-auto text-[#242824] mb-5">
                {this.state.errorDetails}
              </pre>
            )}
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#365C4C] text-white text-sm font-medium hover:bg-[#2C4C3E] transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Foliovera
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
