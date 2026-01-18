/**
 * Notification Routes
 * Handles notification CRUD and real-time updates
 */

import { Router, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { serverLogger } from '../logger.js';
import { AuthenticatedRequest, authenticateToken } from '../middleware.js';
import { getGCSStorage } from '../gcsStorage.js';

/**
 * Create notification routes with Socket.IO instance for real-time updates
 */
export function createNotificationRoutes(io: SocketIOServer): Router {
  const router = Router();

  // ============================================
  // GET /api/notifications/:userId - Get notifications for a user
  // ============================================
  router.get('/:userId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      
      // Users can only access their own notifications
      const isOwnNotifications = req.user?.id === userId || req.user?.email === userId;
      if (!isOwnNotifications && req.user?.role !== 'Admin') {
        res.status(403).json({ error: 'Cannot access other users notifications' });
        return;
      }

      const gcs = getGCSStorage();
      if (gcs) {
        serverLogger.debug('Fetching notifications', { context: 'Notification', metadata: { userId, requesterId: req.user?.id } });
        
        // Try loading by userId first, then by email if userId is an email
        let notifications = await gcs.loadNotifications(userId);
        
        // If no notifications found and userId looks like an email, try loading by user ID
        if (notifications.length === 0 && userId.includes('@') && req.user?.id) {
          notifications = await gcs.loadNotifications(req.user.id);
        }
        
        // Also try loading by email if we have user email and userId is an ID
        if (notifications.length === 0 && !userId.includes('@') && req.user?.email) {
          notifications = await gcs.loadNotifications(req.user.email);
        }
        
        serverLogger.debug(`Returning ${notifications.length} notifications`, { context: 'Notification' });
        res.json({ notifications });
      } else {
        // Fallback: return empty array if GCS not available
        serverLogger.warn('GCS storage not available for notifications', { context: 'Notification' });
        res.json({ notifications: [] });
      }
    } catch (error) {
      serverLogger.error('Error fetching notifications', { context: 'Notification', error: error as Error });
      res.status(500).json({ error: String(error) });
    }
  });

  // ============================================
  // POST /api/notifications - Create a new notification
  // ============================================
  router.post('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { notification, targetUserId } = req.body;

      if (!notification || !targetUserId) {
        res.status(400).json({ error: 'Notification and targetUserId are required' });
        return;
      }

      const gcs = getGCSStorage();
      if (gcs) {
        const result = await gcs.addNotification(targetUserId, notification);
        if (result.success) {
          // Emit real-time notification to the target user via Socket.IO
          io.emit('notification:received', { userId: targetUserId, notification });
          res.json({ success: true });
        } else {
          // Log the error with full context for debugging
          serverLogger.error('Failed to save notification', {
            context: 'NotificationService.createNotification',
            metadata: {
              targetUserId,
              notificationId: notification.id,
              notificationTitle: notification.title,
              notificationType: notification.type,
              error: result.error
            }
          });
          res.status(500).json({ 
            error: 'Failed to save notification',
            details: result.error || 'Unknown error occurred'
          });
        }
      } else {
        // Emit via Socket.IO even without GCS persistence
        io.emit('notification:received', { userId: targetUserId, notification });
        res.json({ success: true, message: 'Notification sent via real-time only (no persistence)' });
      }
    } catch (error) {
      serverLogger.error('Error creating notification', { 
        context: 'NotificationService.createNotification',
        error: error as Error,
        metadata: {
          targetUserId: req.body?.targetUserId,
          notificationId: req.body?.notification?.id
        }
      });
      res.status(500).json({ error: String(error) });
    }
  });

  // ============================================
  // PATCH /api/notifications/:notificationId/read - Mark as read
  // ============================================
  router.patch('/:notificationId/read', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { notificationId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User ID required' });
        return;
      }

      const gcs = getGCSStorage();
      if (gcs) {
        const success = await gcs.markNotificationRead(userId, notificationId);
        res.json({ success });
      } else {
        res.json({ success: true, message: 'No persistence available' });
      }
    } catch (error) {
      serverLogger.error('Error marking notification as read', { context: 'Notification', error: error as Error });
      res.status(500).json({ error: String(error) });
    }
  });

  // ============================================
  // POST /api/notifications/mark-all-read - Mark all as read
  // ============================================
  router.post('/mark-all-read', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User ID required' });
        return;
      }

      const gcs = getGCSStorage();
      if (gcs) {
        const success = await gcs.markAllNotificationsRead(userId);
        res.json({ success });
      } else {
        res.json({ success: true, message: 'No persistence available' });
      }
    } catch (error) {
      serverLogger.error('Error marking all notifications as read', { context: 'Notification', error: error as Error });
      res.status(500).json({ error: String(error) });
    }
  });

  // ============================================
  // DELETE /api/notifications - Clear all notifications
  // ============================================
  router.delete('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User ID required' });
        return;
      }

      const gcs = getGCSStorage();
      if (gcs) {
        const success = await gcs.clearNotifications(userId);
        res.json({ success });
      } else {
        res.json({ success: true, message: 'No persistence available' });
      }
    } catch (error) {
      serverLogger.error('Error clearing notifications', { context: 'Notification', error: error as Error });
      res.status(500).json({ error: String(error) });
    }
  });

  return router;
}

export default createNotificationRoutes;
