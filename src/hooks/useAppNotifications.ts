import { useState, useEffect, useCallback } from 'react';
import { Notification, NotificationType, User, Initiative } from '../types';
import { logger } from '../utils/logger';
import { notificationService, realtimeService } from '../services';
import { generateId } from '../utils';

interface UseAppNotificationsOptions {
  isAuthenticated: boolean;
  isAuthLoading?: boolean;
  currentUser: User | null;
  initiatives: Initiative[];
}

interface UseAppNotificationsReturn {
  notifications: Notification[];
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
  notificationsLoaded: boolean;
  createNotification: (
    type: NotificationType,
    title: string,
    message: string,
    initiativeId: string,
    initiativeTitle: string,
    userId?: string,
    metadata?: Record<string, unknown>
  ) => Notification;
  addNotification: (notification: Notification) => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  clearAllNotifications: () => Promise<void>;
}

/**
 * Custom hook for managing app notifications.
 * Handles:
 * - Loading notifications from the server
 * - Creating and adding notifications
 * - Real-time notification updates via Socket.IO
 * 
 * NOTE: Delay checking is currently handled in App.tsx during shadow mode.
 * Once migration is complete, delay checking should be added here.
 */
export function useAppNotifications({ 
  isAuthenticated,
  isAuthLoading = false,
  currentUser,
  initiatives: _initiatives // Unused during shadow mode - will be used for delay checking after migration
}: UseAppNotificationsOptions): UseAppNotificationsReturn {
  void _initiatives; // Suppress unused variable warning
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsLoaded, setNotificationsLoaded] = useState(false);

  /**
   * Create a notification object (doesn't persist to server)
   */
  const createNotification = useCallback((
    type: NotificationType,
    title: string,
    message: string,
    initiativeId: string,
    initiativeTitle: string,
    userId?: string,
    metadata?: Record<string, unknown>
  ): Notification => {
    return {
      id: generateId(),
      type,
      title,
      message,
      initiativeId,
      initiativeTitle,
      userId: userId || currentUser?.id || '',
      timestamp: new Date().toISOString(),
      read: false,
      metadata,
    };
  }, [currentUser?.id]);

  /**
   * Add a notification and persist to server
   */
  const addNotification = useCallback(async (notification: Notification) => {
    try {
      const targetUserId = notification.userId || currentUser?.id || '';
      await notificationService.createNotification(targetUserId, notification);
      setNotifications(prev => [notification, ...prev]);
    } catch (error) {
      logger.error('Failed to create notification', { 
        context: 'useAppNotifications.addNotification', 
        error: error instanceof Error ? error : new Error(String(error)) 
      });
    }
  }, [currentUser?.id]);

  /**
   * Mark a notification as read
   */
  const markNotificationRead = useCallback(async (notificationId: string) => {
    try {
      await notificationService.markAsRead(notificationId);
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
    } catch (error) {
      logger.error('Failed to mark notification as read', { 
        context: 'useAppNotifications.markNotificationRead', 
        error: error instanceof Error ? error : new Error(String(error)) 
      });
    }
  }, []);

  /**
   * Mark all notifications as read
   */
  const markAllNotificationsRead = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      await notificationService.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (error) {
      logger.error('Failed to mark all notifications as read', { 
        context: 'useAppNotifications.markAllNotificationsRead', 
        error: error instanceof Error ? error : new Error(String(error)) 
      });
    }
  }, [currentUser?.id]);

  /**
   * Clear all notifications
   */
  const clearAllNotifications = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      await notificationService.clearAll();
      setNotifications([]);
    } catch (error) {
      logger.error('Failed to clear notifications', { 
        context: 'useAppNotifications.clearAllNotifications', 
        error: error instanceof Error ? error : new Error(String(error)) 
      });
    }
  }, [currentUser?.id]);

  // Load notifications from server
  useEffect(() => {
    logger.debug('Notification useEffect triggered', {
      context: 'useAppNotifications',
      metadata: { isAuthenticated, isAuthLoading, currentUserId: currentUser?.id, currentUserEmail: currentUser?.email, notificationsLoaded }
    });
    
    // Wait for auth to complete before loading
    if (isAuthLoading) {
      logger.debug('Skipping notification load - auth still loading', {
        context: 'useAppNotifications'
      });
      return;
    }
    
    if (!isAuthenticated || !currentUser?.id || notificationsLoaded) {
      logger.debug('Skipping notification load', {
        context: 'useAppNotifications',
        metadata: { reason: !isAuthenticated ? 'not authenticated' : !currentUser?.id ? 'no user id' : 'already loaded' }
      });
      return;
    }

    const loadNotifications = async () => {
      try {
        logger.debug('Loading notifications for user', { 
          context: 'useAppNotifications.loadNotifications', 
          metadata: { userId: currentUser.id, email: currentUser.email } 
        });
        const serverNotifications = await notificationService.fetchNotifications(currentUser.id);
        logger.debug('Loaded notifications from server', { 
          context: 'useAppNotifications.loadNotifications', 
          metadata: { count: serverNotifications.length } 
        });
        if (serverNotifications.length > 0) {
          logger.debug('Notification details', { 
            context: 'useAppNotifications.loadNotifications', 
            metadata: { notifications: serverNotifications.map(n => ({ id: n.id, title: n.title, userId: n.userId, type: n.type })) } 
          });
        }
        setNotifications(serverNotifications);
      } catch (error) {
        logger.error('Failed to load notifications from server', { 
          context: 'useAppNotifications.loadNotifications', 
          error: error instanceof Error ? error : new Error(String(error)) 
        });
        // Fall back to empty array
        setNotifications([]);
      } finally {
        setNotificationsLoaded(true);
      }
    };

    loadNotifications();
  }, [isAuthenticated, isAuthLoading, currentUser?.id, currentUser?.email, notificationsLoaded]);

  // Subscribe to real-time notifications
  useEffect(() => {
    if (isAuthenticated && currentUser) {
      const unsubNotification = realtimeService.onNotificationReceived(({ notification }) => {
        logger.debug('Received notification via Socket.IO', {
          context: 'useAppNotifications.onNotificationReceived',
          metadata: { 
            notificationId: notification.id, 
            notificationTitle: notification.title, 
            notificationUserId: notification.userId, 
            currentUserId: currentUser.id, 
            currentUserEmail: currentUser.email 
          }
        });
        
        // Add the notification to local state (it's already been filtered for current user)
        setNotifications(prev => {
          // Avoid duplicates
          if (prev.find(n => n.id === notification.id)) {
            logger.debug('Notification already exists, skipping', { 
              context: 'useAppNotifications.onNotificationReceived', 
              metadata: { notificationId: notification.id } 
            });
            return prev;
          }
          logger.debug('Adding notification to state', { 
            context: 'useAppNotifications.onNotificationReceived', 
            metadata: { newCount: prev.length + 1 } 
          });
          return [notification, ...prev];
        });
      });

      return () => {
        unsubNotification();
      };
    }
  }, [isAuthenticated, currentUser]);

  // NOTE: Delay-checking logic is intentionally NOT included here during shadow mode.
  // App.tsx has the delay-checking logic as the source of truth.
  // Once shadow mode validation passes and we complete the migration,
  // delay-checking should be moved here from App.tsx.

  return {
    notifications,
    setNotifications,
    notificationsLoaded,
    createNotification,
    addNotification,
    markNotificationRead,
    markAllNotificationsRead,
    clearAllNotifications,
  };
}
