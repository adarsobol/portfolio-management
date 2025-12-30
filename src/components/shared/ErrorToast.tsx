import React from 'react';
import { AlertCircle, RefreshCw, X } from 'lucide-react';
import { ErrorDetails } from '../../utils/errorUtils';

interface ErrorToastProps {
  error: ErrorDetails;
  onDismiss: () => void;
  onRecover?: () => void;
}

export const ErrorToast: React.FC<ErrorToastProps> = ({ error, onDismiss, onRecover }) => {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg shadow-lg p-4 flex items-start gap-3 max-w-md">
      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm font-medium text-red-800 mb-1">{error.message}</p>
        {error.code && (
          <p className="text-xs text-red-600 mb-2">Error code: {error.code}</p>
        )}
        {error.recoverable && error.recoveryAction && (
          <button
            onClick={() => {
              error.recoveryAction?.action();
              if (onRecover) {
                onRecover();
              }
              onDismiss();
            }}
            className="mt-2 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors flex items-center gap-1.5"
          >
            <RefreshCw size={12} />
            {error.recoveryAction.label}
          </button>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="flex-shrink-0 text-red-600 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
};

