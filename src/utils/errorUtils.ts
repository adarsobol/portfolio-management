/**
 * Error handling utilities for consistent error message formatting
 */

export interface AppError {
  message: string;
  userMessage: string;
  code?: string;
  details?: Record<string, unknown>;
}

/**
 * Convert any error to a user-friendly message
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unexpected error occurred';
}

/**
 * Convert error to user-friendly format
 */
export function formatErrorForUser(error: unknown): AppError {
  if (error instanceof Error) {
    return {
      message: error.message,
      userMessage: getUserFriendlyMessage(error),
      details: { stack: error.stack }
    };
  }
  
  return {
    message: String(error),
    userMessage: getUserFriendlyMessage(error)
  };
}

/**
 * Map technical error messages to user-friendly ones
 */
function getUserFriendlyMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    // Network errors
    if (message.includes('failed to fetch') || message.includes('network')) {
      return 'Unable to connect to the server. Please check your internet connection.';
    }
    
    // Authentication errors
    if (message.includes('unauthorized') || message.includes('401')) {
      return 'Your session has expired. Please log in again.';
    }
    
    // Permission errors
    if (message.includes('forbidden') || message.includes('403')) {
      return 'You don\'t have permission to perform this action.';
    }
    
    // Not found errors
    if (message.includes('not found') || message.includes('404')) {
      return 'The requested resource could not be found.';
    }
    
    // Server errors
    if (message.includes('500') || message.includes('internal server')) {
      return 'A server error occurred. Please try again later.';
    }
    
    // Rate limiting
    if (message.includes('rate limit') || message.includes('429')) {
      return 'Too many requests. Please wait a moment and try again.';
    }
  }
  
  return 'Something went wrong. Please try again.';
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    return error.message.includes('Failed to fetch') || error.message.includes('NetworkError');
  }
  return false;
}

/**
 * Check if error is offline-related
 */
export function isOfflineError(error: unknown): boolean {
  if (isNetworkError(error)) {
    return !navigator.onLine;
  }
  return false;
}
