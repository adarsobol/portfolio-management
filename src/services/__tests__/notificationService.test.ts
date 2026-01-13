import { describe, it, expect, beforeEach, vi } from 'vitest';
import { notificationService } from '../notificationService';
import { NotificationType, Notification } from '../../types';

// Mock fetch globally
global.fetch = vi.fn();

describe('NotificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Set up a mock auth token
    localStorage.setItem('portfolio-auth-token', 'test-token-123');
  });

  describe('fetchNotifications', () => {
    it('should fetch notifications for a user', async () => {
      const mockNotifications: Notification[] = [
        {
          id: 'n1',
          type: NotificationType.StatusChange,
          title: 'Status Changed',
          message: 'Initiative moved to In Progress',
          initiativeId: 'init-1',
          initiativeTitle: 'Test Initiative',
          timestamp: '2024-10-15T12:00:00.000Z',
          read: false,
          userId: 'user-1',
        },
        {
          id: 'n2',
          type: NotificationType.Mention,
          title: 'You were mentioned',
          message: '@user mentioned you in a comment',
          initiativeId: 'init-2',
          initiativeTitle: 'Another Initiative',
          timestamp: '2024-10-14T12:00:00.000Z',
          read: true,
          userId: 'user-1',
        },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ notifications: mockNotifications }),
      });

      const result = await notificationService.fetchNotifications('user-1');

      expect(result).toEqual(mockNotifications);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/notifications/user-1'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should return empty array on fetch error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Not found' }),
      });

      const result = await notificationService.fetchNotifications('user-1');

      expect(result).toEqual([]);
    });

    it('should return empty array on network error', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const result = await notificationService.fetchNotifications('user-1');

      expect(result).toEqual([]);
    });

    it('should return empty array when notifications are undefined', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const result = await notificationService.fetchNotifications('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('createNotification', () => {
    it('should create a notification successfully', async () => {
      const notification: Notification = {
        id: 'n1',
        type: NotificationType.StatusChange,
        title: 'Status Changed',
        message: 'Initiative moved to Done',
        initiativeId: 'init-1',
        initiativeTitle: 'Test Initiative',
        timestamp: '2024-10-15T12:00:00.000Z',
        read: false,
        userId: 'user-1',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await notificationService.createNotification('user-1', notification);

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/notifications'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            notification,
            targetUserId: 'user-1',
          }),
        })
      );
    });

    it('should return false on create error', async () => {
      const notification: Notification = {
        id: 'n1',
        type: NotificationType.NewComment,
        title: 'New Comment',
        message: 'A new comment was added',
        initiativeId: 'init-1',
        initiativeTitle: 'Test Initiative',
        timestamp: '2024-10-15T12:00:00.000Z',
        read: false,
        userId: 'user-1',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Server error' }),
      });

      const result = await notificationService.createNotification('user-1', notification);

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      const notification: Notification = {
        id: 'n1',
        type: NotificationType.Delay,
        title: 'Initiative Delayed',
        message: 'Initiative has passed its ETA',
        initiativeId: 'init-1',
        initiativeTitle: 'Test Initiative',
        timestamp: '2024-10-15T12:00:00.000Z',
        read: false,
        userId: 'user-1',
      };

      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const result = await notificationService.createNotification('user-1', notification);

      expect(result).toBe(false);
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read successfully', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await notificationService.markAsRead('notification-1');

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/notifications/notification-1/read'),
        expect.objectContaining({
          method: 'PATCH',
        })
      );
    });

    it('should return false on error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Not found' }),
      });

      const result = await notificationService.markAsRead('notification-1');

      expect(result).toBe(false);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await notificationService.markAllAsRead();

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/notifications/mark-all-read'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should return false on error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Server error' }),
      });

      const result = await notificationService.markAllAsRead();

      expect(result).toBe(false);
    });
  });

  describe('clearAll', () => {
    it('should clear all notifications', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await notificationService.clearAll();

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/notifications'),
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('should return false on error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Server error' }),
      });

      const result = await notificationService.clearAll();

      expect(result).toBe(false);
    });
  });
});
