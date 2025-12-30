export interface ErrorDetails {
  message: string;
  code?: string;
  recoverable?: boolean;
  recoveryAction?: {
    label: string;
    action: () => void;
  };
}

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
