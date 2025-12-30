export interface ErrorDetails {
  message: string;
  code?: string;
  recoverable?: boolean;
  recoveryAction?: {
    label: string;
    action: () => void;
  };
}

export interface FormattedErrorForUser {
  userMessage: string;
  technicalMessage?: string;
}

// Legacy function for ErrorBoundary compatibility
export const formatErrorForUser = (error: Error): FormattedErrorForUser => {
  if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch')) {
    return {
      userMessage: 'Network error. Please check your connection and try again.',
      technicalMessage: error.message
    };
  }
  
  if (error.message.includes('sync') || error.message.includes('sheets') || error.message.includes('Google')) {
    return {
      userMessage: 'Failed to sync with server. Your changes are saved locally.',
      technicalMessage: error.message
    };
  }
  
  return {
    userMessage: 'An unexpected error occurred. Please try refreshing the page.',
    technicalMessage: error.message
  };
};

// Get user-friendly error message
export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return formatErrorForUser(error).userMessage;
  }
  return 'An unexpected error occurred. Please try again.';
};

// Check if error is a network error
export const isNetworkError = (error: unknown): boolean => {
  if (error instanceof Error) {
    return error.message.includes('fetch') || 
           error.message.includes('network') || 
           error.message.includes('Failed to fetch') ||
           error.message.includes('NetworkError');
  }
  return false;
};

// Check if error is an offline error
export const isOfflineError = (error: unknown): boolean => {
  if (error instanceof Error) {
    return error.message.includes('offline') || 
           error.message.includes('Failed to fetch') ||
           !navigator.onLine;
  }
  return false;
};

export const formatError = (error: unknown, recoveryActions?: {
  retry?: () => void;
  retrySync?: () => void;
}): ErrorDetails => {
  if (error instanceof Error) {
    // Network errors
    if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch')) {
      return {
        message: 'Network error. Please check your connection.',
        code: 'NETWORK_ERROR',
        recoverable: true,
        recoveryAction: recoveryActions?.retry ? {
          label: 'Retry',
          action: recoveryActions.retry
        } : undefined
      };
    }
    
    // Sync errors
    if (error.message.includes('sync') || error.message.includes('sheets') || error.message.includes('Google')) {
      return {
        message: 'Failed to sync with Google Sheets. Your changes are saved locally.',
        code: 'SYNC_ERROR',
        recoverable: true,
        recoveryAction: recoveryActions?.retrySync ? {
          label: 'Retry Sync',
          action: recoveryActions.retrySync
        } : undefined
      };
    }
    
    // Permission errors
    if (error.message.includes('permission') || error.message.includes('unauthorized') || error.message.includes('403') || error.message.includes('401')) {
      return {
        message: 'You don\'t have permission to perform this action.',
        code: 'PERMISSION_ERROR',
        recoverable: false
      };
    }
  }
  
  return {
    message: 'An unexpected error occurred. Please try again.',
    code: 'UNKNOWN_ERROR',
    recoverable: true,
    recoveryAction: recoveryActions?.retry ? {
      label: 'Retry',
      action: recoveryActions.retry
    } : undefined
  };
};
