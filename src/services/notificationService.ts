/**
 * Notification Service
 * 
 * Handles notification CRUD operations with server persistence
 * and real-time synchronization via Socket.IO
 */

import { API_ENDPOINT } from '../config';
import { Notification } from '../types';
import { authService } from './authService';
import { logger } from '../utils/logger';

class NotificationService {
  /**
   * Fetch notifications for a user from the server
   */
  async fetchNotifications(userId: string): Promise<Notification[]> {
    try {
      logger.debug('Fetching notifications', { context: 'NotificationService.fetchNotifications', metadata: { userId } });
      const url = `${API_ENDPOINT}/api/notifications/${userId}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeader()
        }
      });

      logger.debug('Response received', { context: 'NotificationService.fetchNotifications', metadata: { status: response.status, statusText: response.statusText } });

      if (!response.ok) {
        const error = await response.json();
        logger.error('Failed to fetch notifications', { 
          context: 'NotificationService.fetchNotifications', 
          error: new Error(error.error || 'Unknown error'),
          metadata: { errorResponse: error }
        });
        return [];
      }

      const data = await response.json();
      logger.debug('Notifications fetched', { context: 'NotificationService.fetchNotifications', metadata: { count: data.notifications?.length || 0 } });
      return data.notifications || [];
    } catch (error) {
      logger.error('Error fetching notifications', { 
        context: 'NotificationService.fetchNotifications', 
        error: error instanceof Error ? error : new Error(String(error)) 
      });
      return [];
    }
  }

  /**
   * Create a notification on the server
   */
  async createNotification(targetUserId: string, notification: Notification): Promise<boolean> {
    try {
      const response = await fetch(`${API_ENDPOINT}/api/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeader()
        },
        body: JSON.stringify({ 
          notification, 
          targetUserId 
        })
      });

      if (!response.ok) {
        const error = await response.json();
        logger.error('Failed to create notification', { 
          context: 'NotificationService.createNotification', 
          error: new Error(error.error || 'Unknown error') 
        });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error creating notification', { 
        context: 'NotificationService.createNotification', 
        error: error instanceof Error ? error : new Error(String(error)) 
      });
      return false;
    }
  }

  /**
   * Mark a notification as read on the server
   */
  async markAsRead(notificationId: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_ENDPOINT}/api/notifications/${notificationId}/read`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeader()
        }
      });

      if (!response.ok) {
        const error = await response.json();
        logger.error('Failed to mark notification as read', { 
          context: 'NotificationService.markAsRead', 
          error: new Error(error.error || 'Unknown error') 
        });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error marking notification as read', { 
        context: 'NotificationService.markAsRead', 
        error: error instanceof Error ? error : new Error(String(error)) 
      });
      return false;
    }
  }

  /**
   * Mark all notifications as read on the server
   */
  async markAllAsRead(): Promise<boolean> {
    try {
      const response = await fetch(`${API_ENDPOINT}/api/notifications/mark-all-read`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeader()
        }
      });

      if (!response.ok) {
        const error = await response.json();
        logger.error('Failed to mark all notifications as read', { 
          context: 'NotificationService.markAllAsRead', 
          error: new Error(error.error || 'Unknown error') 
        });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error marking all notifications as read', { 
        context: 'NotificationService.markAllAsRead', 
        error: error instanceof Error ? error : new Error(String(error)) 
      });
      return false;
    }
  }

  /**
   * Clear all notifications on the server
   */
  async clearAll(): Promise<boolean> {
    try {
      const response = await fetch(`${API_ENDPOINT}/api/notifications`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeader()
        }
      });

      if (!response.ok) {
        const error = await response.json();
        logger.error('Failed to clear notifications', { 
          context: 'NotificationService.clearAll', 
          error: new Error(error.error || 'Unknown error') 
        });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error clearing notifications', { 
        context: 'NotificationService.clearAll', 
        error: error instanceof Error ? error : new Error(String(error)) 
      });
      return false;
    }
  }
}

// Export singleton instance
export const notificationService = new NotificationService();

