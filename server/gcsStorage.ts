/**
 * Google Cloud Storage Backend
 * 
 * Provides data persistence using Google Cloud Storage buckets.
 * This will replace Google Sheets as the primary data store.
 */

// Note: This module requires @google-cloud/storage package
// Install with: npm install @google-cloud/storage

import { serverLogger } from './logger.js';

// Interfaces matching the main types
interface Initiative {
  id: string;
  [key: string]: unknown;
}

interface ChangeRecord {
  id: string;
  initiativeId: string;
  timestamp: string;
  [key: string]: unknown;
}

interface Snapshot {
  id: string;
  timestamp: string;
  data: Initiative[];
}

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  initiativeId: string;
  initiativeTitle: string;
  timestamp: string;
  read: boolean;
  userId?: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// CONFIGURATION
// ============================================

export interface GCSConfig {
  bucketName: string;
  projectId?: string;
  keyFilename?: string; // For local development
}

// File paths in the bucket
const PATHS = {
  INITIATIVES: 'data/initiatives.json',
  CHANGELOG: 'data/changelog.json',
  CONFIG: 'data/config.json',
  USERS: 'data/users.json',
  SNAPSHOTS_DIR: 'snapshots/',
  NOTIFICATIONS_DIR: 'data/notifications/'
};

// ============================================
// GCS STORAGE CLASS
// ============================================

// Result type for notification operations
export interface NotificationResult {
  success: boolean;
  error?: string;
}

export class GCSStorage {
  private config: GCSConfig;
  private storage: unknown; // Will be typed when @google-cloud/storage is installed
  private bucket: unknown;
  private initialized = false;
  // Per-user locks to prevent race conditions in notification operations
  private notificationLocks: Map<string, Promise<void>> = new Map();

  constructor(config: GCSConfig) {
    this.config = config;
  }

  /**
   * Initialize the GCS client
   * This is async because we need to load the Storage class dynamically
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      // Dynamic import to avoid errors if package isn't installed
      const { Storage } = await import('@google-cloud/storage');
      
      this.storage = new Storage({
        projectId: this.config.projectId,
        keyFilename: this.config.keyFilename
      });
      
      // @ts-expect-error - Dynamic typing for optional package
      this.bucket = this.storage.bucket(this.config.bucketName);
      this.initialized = true;
      console.log(`GCS Storage initialized with bucket: ${this.config.bucketName}`);
      return true;
    } catch (error) {
      console.error('Failed to initialize GCS Storage:', error);
      return false;
    }
  }

  /**
   * Check if GCS is available and connected
   */
  async isHealthy(): Promise<boolean> {
    if (!this.initialized) return false;
    
    try {
      // @ts-expect-error - Dynamic typing for optional package
      const [exists] = await this.bucket.exists();
      return exists;
    } catch {
      return false;
    }
  }

  // ============================================
  // INITIATIVES
  // ============================================

  async loadInitiatives(): Promise<Initiative[]> {
    if (!this.initialized) throw new Error('GCS not initialized');

    try {
      // @ts-expect-error - Dynamic typing for optional package
      const file = this.bucket.file(PATHS.INITIATIVES);
      const [exists] = await file.exists();
      
      if (!exists) {
        return [];
      }

      const [contents] = await file.download();
      return JSON.parse(contents.toString());
    } catch (error) {
      console.error('Failed to load initiatives from GCS:', error);
      throw error;
    }
  }

  async saveInitiatives(initiatives: Initiative[]): Promise<boolean> {
    if (!this.initialized) throw new Error('GCS not initialized');

    try {
      // @ts-expect-error - Dynamic typing for optional package
      const file = this.bucket.file(PATHS.INITIATIVES);
      await file.save(JSON.stringify(initiatives, null, 2), {
        contentType: 'application/json',
        metadata: {
          cacheControl: 'private, max-age=0'
        }
      });
      return true;
    } catch (error) {
      console.error('Failed to save initiatives to GCS:', error);
      return false;
    }
  }

  async upsertInitiative(initiative: Initiative): Promise<boolean> {
    const initiatives = await this.loadInitiatives();
    const index = initiatives.findIndex(i => i.id === initiative.id);
    
    if (index >= 0) {
      initiatives[index] = initiative;
    } else {
      initiatives.push(initiative);
    }
    
    return this.saveInitiatives(initiatives);
  }

  async deleteInitiative(id: string): Promise<boolean> {
    const initiatives = await this.loadInitiatives();
    const filtered = initiatives.filter(i => i.id !== id);
    
    if (filtered.length === initiatives.length) {
      return false; // Not found
    }
    
    return this.saveInitiatives(filtered);
  }

  // ============================================
  // CHANGELOG
  // ============================================

  async appendChangelog(change: ChangeRecord): Promise<boolean> {
    if (!this.initialized) throw new Error('GCS not initialized');

    try {
      // @ts-expect-error - Dynamic typing for optional package
      const file = this.bucket.file(PATHS.CHANGELOG);
      const [exists] = await file.exists();
      
      let changelog: ChangeRecord[] = [];
      if (exists) {
        const [contents] = await file.download();
        changelog = JSON.parse(contents.toString());
      }
      
      changelog.unshift(change); // Add to beginning
      
      // Keep last 1000 entries to prevent unbounded growth
      if (changelog.length > 1000) {
        changelog = changelog.slice(0, 1000);
      }
      
      await file.save(JSON.stringify(changelog, null, 2), {
        contentType: 'application/json'
      });
      
      return true;
    } catch (error) {
      console.error('Failed to append changelog to GCS:', error);
      return false;
    }
  }

  async getChangelog(initiativeId?: string): Promise<ChangeRecord[]> {
    if (!this.initialized) throw new Error('GCS not initialized');

    try {
      // @ts-expect-error - Dynamic typing for optional package
      const file = this.bucket.file(PATHS.CHANGELOG);
      const [exists] = await file.exists();
      
      if (!exists) {
        return [];
      }

      const [contents] = await file.download();
      const changelog: ChangeRecord[] = JSON.parse(contents.toString());
      
      if (initiativeId) {
        return changelog.filter(c => c.initiativeId === initiativeId);
      }
      
      return changelog;
    } catch (error) {
      console.error('Failed to get changelog from GCS:', error);
      return [];
    }
  }

  // ============================================
  // SNAPSHOTS
  // ============================================

  async createSnapshot(snapshot: Snapshot): Promise<boolean> {
    if (!this.initialized) throw new Error('GCS not initialized');

    try {
      const filename = `${PATHS.SNAPSHOTS_DIR}${snapshot.id}.json`;
      // @ts-expect-error - Dynamic typing for optional package
      const file = this.bucket.file(filename);
      
      await file.save(JSON.stringify(snapshot, null, 2), {
        contentType: 'application/json',
        metadata: {
          timestamp: snapshot.timestamp
        }
      });
      
      return true;
    } catch (error) {
      console.error('Failed to create snapshot in GCS:', error);
      return false;
    }
  }

  async listSnapshots(): Promise<{ id: string; timestamp: string }[]> {
    if (!this.initialized) throw new Error('GCS not initialized');

    try {
      // @ts-expect-error - Dynamic typing for optional package
      const [files] = await this.bucket.getFiles({ prefix: PATHS.SNAPSHOTS_DIR });
      
      return files.map((file: { name: string; metadata?: { metadata?: { timestamp?: string } } }) => ({
        id: file.name.replace(PATHS.SNAPSHOTS_DIR, '').replace('.json', ''),
        timestamp: file.metadata?.metadata?.timestamp || ''
      }));
    } catch (error) {
      console.error('Failed to list snapshots from GCS:', error);
      return [];
    }
  }

  async loadSnapshot(id: string): Promise<Snapshot | null> {
    if (!this.initialized) throw new Error('GCS not initialized');

    try {
      const filename = `${PATHS.SNAPSHOTS_DIR}${id}.json`;
      // @ts-expect-error - Dynamic typing for optional package
      const file = this.bucket.file(filename);
      const [exists] = await file.exists();
      
      if (!exists) {
        return null;
      }

      const [contents] = await file.download();
      return JSON.parse(contents.toString());
    } catch (error) {
      console.error('Failed to load snapshot from GCS:', error);
      return null;
    }
  }

  // ============================================
  // NOTIFICATIONS
  // ============================================

  /**
   * Acquire a lock for a user's notification operations
   * Waits for any pending operation to complete before proceeding
   */
  private async acquireNotificationLock(userId: string): Promise<() => void> {
    // Wait for any existing lock to complete
    const existingLock = this.notificationLocks.get(userId);
    if (existingLock) {
      await existingLock;
    }

    // Create a new lock for this operation
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.notificationLocks.set(userId, lockPromise);

    return () => {
      releaseLock();
      this.notificationLocks.delete(userId);
    };
  }

  /**
   * Retry a GCS operation with exponential backoff
   * Useful for transient network errors or rate limiting
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    baseDelayMs = 100
  ): Promise<T> {
    let lastError: Error | unknown;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Don't retry on the last attempt
        if (attempt === maxRetries) {
          break;
        }

        // Check if error is retryable (network errors, rate limits, etc.)
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isRetryable = 
          errorMessage.includes('ECONNRESET') ||
          errorMessage.includes('ETIMEDOUT') ||
          errorMessage.includes('rate limit') ||
          errorMessage.includes('429') ||
          errorMessage.includes('503') ||
          errorMessage.includes('500');

        if (!isRetryable) {
          // Not a retryable error, fail immediately
          throw error;
        }

        // Exponential backoff: 100ms, 200ms, 400ms
        const delayMs = baseDelayMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  }

  /**
   * Get the file path for a user's notifications
   */
  private getNotificationFilePath(userId: string): string {
    return `${PATHS.NOTIFICATIONS_DIR}${userId}.json`;
  }

  /**
   * Load notifications for a specific user
   */
  async loadNotifications(userId: string): Promise<Notification[]> {
    if (!this.initialized) throw new Error('GCS not initialized');

    try {
      const filePath = this.getNotificationFilePath(userId);
      // @ts-expect-error - Dynamic typing for optional package
      const file = this.bucket.file(filePath);
      const [exists] = await file.exists();
      
      if (!exists) {
        return [];
      }

      const [contents] = await file.download();
      return JSON.parse(contents.toString());
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      serverLogger.error('Failed to load notifications from GCS', {
        context: 'GCSStorage.loadNotifications',
        error: error instanceof Error ? error : new Error(errorMessage),
        metadata: { userId }
      });
      return [];
    }
  }

  /**
   * Save all notifications for a user (overwrites existing)
   */
  async saveNotifications(userId: string, notifications: Notification[]): Promise<boolean> {
    if (!this.initialized) throw new Error('GCS not initialized');

    try {
      const filePath = this.getNotificationFilePath(userId);
      // @ts-expect-error - Dynamic typing for optional package
      const file = this.bucket.file(filePath);
      
      // Keep only last 100 notifications per user to prevent unbounded growth
      const trimmedNotifications = notifications.slice(0, 100);
      
      // Retry with exponential backoff for transient failures
      await this.retryWithBackoff(async () => {
        await file.save(JSON.stringify(trimmedNotifications, null, 2), {
          contentType: 'application/json',
          metadata: {
            cacheControl: 'private, max-age=0'
          }
        });
      });
      
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      serverLogger.error(`Failed to save notifications for user ${userId} to GCS`, {
        context: 'GCSStorage.saveNotifications',
        error: error instanceof Error ? error : new Error(errorMessage),
        metadata: { userId, notificationCount: notifications.length }
      });
      return false;
    }
  }

  /**
   * Add a new notification for a user
   * Uses per-user locking to prevent race conditions in concurrent operations
   */
  async addNotification(userId: string, notification: Notification): Promise<NotificationResult> {
    const releaseLock = await this.acquireNotificationLock(userId);
    
    try {
      const notifications = await this.loadNotifications(userId);
      notifications.unshift(notification); // Add to beginning (newest first)
      const saved = await this.saveNotifications(userId, notifications);
      
      if (saved) {
        return { success: true };
      } else {
        const errorMsg = 'Failed to save notification to GCS';
        serverLogger.error('Failed to add notification', {
          context: 'GCSStorage.addNotification',
          metadata: { userId, notificationId: notification.id, notificationTitle: notification.title }
        });
        return { success: false, error: errorMsg };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      serverLogger.error('Failed to add notification', {
        context: 'GCSStorage.addNotification',
        error: error instanceof Error ? error : new Error(errorMessage),
        metadata: { userId, notificationId: notification.id, notificationTitle: notification.title }
      });
      return { success: false, error: errorMessage };
    } finally {
      releaseLock();
    }
  }

  /**
   * Mark a notification as read
   * Uses per-user locking to prevent race conditions
   */
  async markNotificationRead(userId: string, notificationId: string): Promise<boolean> {
    const releaseLock = await this.acquireNotificationLock(userId);
    
    try {
      const notifications = await this.loadNotifications(userId);
      const index = notifications.findIndex(n => n.id === notificationId);
      
      if (index === -1) {
        serverLogger.warn('Notification not found when marking as read', {
          context: 'GCSStorage.markNotificationRead',
          metadata: { userId, notificationId }
        });
        return false; // Notification not found
      }
      
      notifications[index].read = true;
      const saved = await this.saveNotifications(userId, notifications);
      
      if (!saved) {
        serverLogger.error('Failed to save notification after marking as read', {
          context: 'GCSStorage.markNotificationRead',
          metadata: { userId, notificationId }
        });
      }
      
      return saved;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      serverLogger.error('Failed to mark notification as read', {
        context: 'GCSStorage.markNotificationRead',
        error: error instanceof Error ? error : new Error(errorMessage),
        metadata: { userId, notificationId }
      });
      return false;
    } finally {
      releaseLock();
    }
  }

  /**
   * Mark all notifications as read for a user
   * Uses per-user locking to prevent race conditions
   */
  async markAllNotificationsRead(userId: string): Promise<boolean> {
    const releaseLock = await this.acquireNotificationLock(userId);
    
    try {
      const notifications = await this.loadNotifications(userId);
      const updatedNotifications = notifications.map(n => ({ ...n, read: true }));
      const saved = await this.saveNotifications(userId, updatedNotifications);
      
      if (!saved) {
        serverLogger.error('Failed to save notifications after marking all as read', {
          context: 'GCSStorage.markAllNotificationsRead',
          metadata: { userId, notificationCount: notifications.length }
        });
      }
      
      return saved;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      serverLogger.error('Failed to mark all notifications as read', {
        context: 'GCSStorage.markAllNotificationsRead',
        error: error instanceof Error ? error : new Error(errorMessage),
        metadata: { userId }
      });
      return false;
    } finally {
      releaseLock();
    }
  }

  /**
   * Clear all notifications for a user
   * Uses per-user locking to prevent race conditions
   */
  async clearNotifications(userId: string): Promise<boolean> {
    const releaseLock = await this.acquireNotificationLock(userId);
    
    try {
      const saved = await this.saveNotifications(userId, []);
      
      if (!saved) {
        serverLogger.error('Failed to clear notifications', {
          context: 'GCSStorage.clearNotifications',
          metadata: { userId }
        });
      }
      
      return saved;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      serverLogger.error('Failed to clear notifications', {
        context: 'GCSStorage.clearNotifications',
        error: error instanceof Error ? error : new Error(errorMessage),
        metadata: { userId }
      });
      return false;
    } finally {
      releaseLock();
    }
  }
}

// ============================================
// FACTORY & SINGLETON
// ============================================

let gcsInstance: GCSStorage | null = null;

export function getGCSStorage(): GCSStorage | null {
  return gcsInstance;
}

export async function initializeGCSStorage(config: GCSConfig): Promise<GCSStorage | null> {
  if (gcsInstance) return gcsInstance;

  gcsInstance = new GCSStorage(config);
  const success = await gcsInstance.initialize();
  
  if (!success) {
    gcsInstance = null;
    return null;
  }
  
  return gcsInstance;
}

export function isGCSEnabled(): boolean {
  return !!(process.env.GCS_BUCKET_NAME && process.env.GCS_PROJECT_ID);
}

export function getGCSConfig(): GCSConfig | null {
  if (!isGCSEnabled()) return null;
  
  return {
    bucketName: process.env.GCS_BUCKET_NAME!,
    projectId: process.env.GCS_PROJECT_ID,
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
  };
}
