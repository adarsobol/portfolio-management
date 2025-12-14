import { User } from '../types';

/**
 * Generate a unique ID for entities
 */
export const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
};

/**
 * Get owner name from user ID
 */
export const getOwnerName = (users: User[], id?: string): string => {
  return users.find(u => u.id === id)?.name || 'Unknown';
};

/**
 * Format a date object to ISO date string (YYYY-MM-DD)
 */
export const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

/**
 * Get relative date from today
 */
export const getRelativeDate = (daysFromToday: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return formatDate(date);
};

/**
 * Check if a date string is outdated (more than 14 days ago)
 */
export const checkOutdated = (dateStr: string): boolean => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 14;
};

// Export mention parser utilities
export { parseMentions, getMentionedUsers } from './mentionParser';

// Export utilities
export { exportToCSV, exportToExcel, exportFilteredData, exportToClipboard, exportUnplannedToNotionClipboard } from './exportUtils';

// Export error handling utilities
export { logger } from './logger';
export { getErrorMessage, formatErrorForUser, isNetworkError, isOfflineError } from './errorUtils';

