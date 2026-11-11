/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — Common State Views
 * Engineering Rule 7: Include loading, empty, failure, and retry states.
 */

import React from 'react';
import { AlertCircle, RefreshCw, FolderSearch, Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({ message = 'Loading career intelligence...' }) => {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center" role="status" aria-live="polite">
      <Loader2 className="w-8 h-8 text-[#365C4C] dark:text-[#68A289] animate-spin mb-3" />
      <p className="text-sm font-medium text-[#242824] dark:text-[#F1F3F1]">{message}</p>
      <span className="text-xs text-[#767E76] mt-1">Verifying cryptographic provenance & storage pipelines</span>
    </div>
  );
};

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionLabel,
  onAction
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center border border-dashed border-[#D6D2C8] dark:border-[#2C3531] rounded-2xl bg-[#FDFCFA]/60 dark:bg-[#1A1F1D]/50">
      <div className="w-12 h-12 rounded-full bg-[#E9E5DD] dark:bg-[#242E2A] flex items-center justify-center mb-4 text-[#365C4C] dark:text-[#78B39A]">
        <FolderSearch className="w-5 h-5" />
      </div>
      <h3 className="font-editorial text-lg font-medium text-[#242824] dark:text-[#F1F3F1] mb-1">{title}</h3>
      <p className="text-sm text-[#545B54] dark:text-[#B4BDB7] max-w-md mb-6">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-4 py-2 text-xs font-medium text-white bg-[#365C4C] rounded-lg hover:bg-[#2B4B3E] transition-colors whitespace-nowrap"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

interface FailureStateProps {
  title?: string;
  message: string;
  onRetry: () => void;
}

export const FailureState: React.FC<FailureStateProps> = ({
  title = 'Connection or verification error',
  message,
  onRetry
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-4 text-center border border-rose-300/70 dark:border-rose-900/50 rounded-2xl bg-rose-50/40 dark:bg-rose-950/20" role="alert">
      <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center mb-4 text-rose-700 dark:text-rose-400">
        <AlertCircle className="w-6 h-6" />
      </div>
      <h3 className="font-editorial text-lg font-medium text-[#242824] dark:text-[#F1F3F1] mb-1">{title}</h3>
      <p className="text-xs font-mono text-[#545B54] dark:text-[#B4BDB7] max-w-md mb-5">{message}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-[#242824] dark:text-[#F1F3F1] bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#D6D2C8] dark:border-[#2C3531] rounded-lg hover:bg-[#E9E5DD] dark:hover:bg-[#242E2A] transition-colors whitespace-nowrap"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Retry Operation
      </button>
    </div>
  );
};
