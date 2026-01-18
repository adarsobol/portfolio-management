import { useCallback } from 'react';
import { Notification, Initiative } from '../types';
import { notificationService } from '../services';
import { logger } from '../utils/logger';

interface UseNotificationHandlersOptions {
  notifications: Notification[];
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
  initiatives: Initiative[];
  setEditingItem: (item: Initiative | null) => void;
  setIsModalOpen: (open: boolean) => void;
}

interface UseNotificationHandlersReturn {
  handleMarkAsRead: (id: string) => void;
  handleMarkAllAsRead: () => void;
  handleClearAll: () => void;
  handleNotificationClick: (notification: Notification) => void;
}

/**
 * Custom hook for notification UI handlers.
 * Handles:
 * - Marking notifications as read (optimistic update + server sync)
 * - Clearing notifications
 * - Clicking notifications to open initiatives
 */
export function useNotificationHandlers({
  notifications: _notifications, // Currently unused but kept for potential future use
  setNotifications,
  initiatives,
  setEditingItem,
  setIsModalOpen,
}: UseNotificationHandlersOptions): UseNotificationHandlersReturn {
  void _notifications; // Suppress unused warning

  /**
   * Mark a single notification as read
   */
  const handleMarkAsRead = useCallback((id: string) => {
    // Update local state immediately (optimistic update)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    
    // Sync with server
    notificationService.markAsRead(id).catch(error => {
      logger.error('Failed to mark notification as read on server', { 
        context: 'useNotificationHandlers.handleMarkAsRead', 
        error: error instanceof Error ? error : new Error(String(error)) 
      });
    });
  }, [setNotifications]);

  /**
   * Mark all notifications as read
   */
  const handleMarkAllAsRead = useCallback(() => {
    // Update local state immediately (optimistic update)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    
    // Sync with server
    notificationService.markAllAsRead().catch(error => {
      logger.error('Failed to mark all notifications as read on server', { 
        context: 'useNotificationHandlers.handleMarkAllAsRead', 
        error: error instanceof Error ? error : new Error(String(error)) 
      });
    });
  }, [setNotifications]);

  /**
   * Clear all notifications
   */
  const handleClearAll = useCallback(() => {
    // Update local state immediately (optimistic update)
    setNotifications([]);
    
    // Sync with server
    notificationService.clearAll().catch(error => {
      logger.error('Failed to clear notifications on server', { 
        context: 'useNotificationHandlers.handleClearAll', 
        error: error instanceof Error ? error : new Error(String(error)) 
      });
    });
  }, [setNotifications]);

  /**
   * Handle clicking a notification - opens the related initiative
   */
  const handleNotificationClick = useCallback((notification: Notification) => {
    // Find and open the initiative modal
    const initiative = initiatives.find(i => i.id === notification.initiativeId);
    if (initiative) {
      setEditingItem(initiative);
      setIsModalOpen(true);
    }
  }, [initiatives, setEditingItem, setIsModalOpen]);

  return {
    handleMarkAsRead,
    handleMarkAllAsRead,
    handleClearAll,
    handleNotificationClick,
  };
}
