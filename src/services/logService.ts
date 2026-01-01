/**
 * Log Service
 * Sends error logs and activity logs to the backend API
 * 
 * Features:
 * - Retry mechanism with exponential backoff
 * - Offline queue with localStorage persistence
 * - Immediate sending for critical errors
 * - Batching for performance
 */

import { ErrorLog, ActivityLog, LogSeverity, ActivityType } from '../types';
import { API_ENDPOINT } from '../config';

const OFFLINE_QUEUE_KEY = 'portfolio-offline-log-queue';
const MAX_OFFLINE_QUEUE_SIZE = 100;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY = 1000; // 1 second

interface QueuedLog {
  type: 'error' | 'activity';
  data: Partial<ErrorLog> | Partial<ActivityLog>;
  retryCount: number;
  timestamp: string;
}

class LogService {
  private batchQueue: Array<{ type: 'error' | 'activity'; data: any }> = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private readonly BATCH_DELAY = 2000; // 2 seconds
  private readonly MAX_BATCH_SIZE = 10;
  private isProcessingOfflineQueue = false;
  private onlineListener: (() => void) | null = null;

  constructor() {
    // Set up online listener to process offline queue when connection restored
    if (typeof window !== 'undefined') {
      this.onlineListener = () => this.processOfflineQueue();
      window.addEventListener('online', this.onlineListener);
      
      // Process any existing offline queue on startup
      setTimeout(() => this.processOfflineQueue(), 5000);
    }
  }

  /**
   * Check if browser is online
   */
  private isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  /**
   * Get offline queue from localStorage
   */
  private getOfflineQueue(): QueuedLog[] {
    try {
      const stored = localStorage.getItem(OFFLINE_QUEUE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  /**
   * Save offline queue to localStorage
   */
  private saveOfflineQueue(queue: QueuedLog[]): void {
    try {
      // Limit queue size to prevent localStorage overflow
      const trimmedQueue = queue.slice(-MAX_OFFLINE_QUEUE_SIZE);
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(trimmedQueue));
    } catch (error) {
      console.warn('Failed to save offline log queue:', error);
    }
  }

  /**
   * Add a log to the offline queue
   */
  private addToOfflineQueue(log: QueuedLog): void {
    const queue = this.getOfflineQueue();
    queue.push(log);
    this.saveOfflineQueue(queue);
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Send error log with retry mechanism
   */
  private async sendErrorLogWithRetry(
    errorLog: Partial<ErrorLog>,
    retryCount = 0
  ): Promise<boolean> {
    // If offline, queue for later
    if (!this.isOnline()) {
      this.addToOfflineQueue({
        type: 'error',
        data: errorLog,
        retryCount: 0,
        timestamp: new Date().toISOString(),
      });
      return false;
    }

    try {
      const response = await fetch(`${API_ENDPOINT}/api/logs/errors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({
          message: errorLog.message,
          stack: errorLog.stack,
          severity: errorLog.severity || 'error',
          context: errorLog.context,
          metadata: errorLog.metadata,
          url: typeof window !== 'undefined' ? window.location.href : '',
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      // Retry with exponential backoff
      if (retryCount < MAX_RETRIES) {
        const delay = BASE_RETRY_DELAY * Math.pow(2, retryCount);
        console.warn(`Error log send failed, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        await this.sleep(delay);
        return this.sendErrorLogWithRetry(errorLog, retryCount + 1);
      }

      // Max retries exceeded, add to offline queue
      console.warn('Max retries exceeded for error log, queuing for later:', error);
      this.addToOfflineQueue({
        type: 'error',
        data: errorLog,
        retryCount: MAX_RETRIES,
        timestamp: new Date().toISOString(),
      });
      return false;
    }
  }

  /**
   * Send activity log with retry mechanism
   */
  private async sendActivityLogWithRetry(
    activityLog: Partial<ActivityLog>,
    retryCount = 0
  ): Promise<boolean> {
    // If offline, queue for later
    if (!this.isOnline()) {
      this.addToOfflineQueue({
        type: 'activity',
        data: activityLog,
        retryCount: 0,
        timestamp: new Date().toISOString(),
      });
      return false;
    }

    try {
      const response = await fetch(`${API_ENDPOINT}/api/logs/activity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({
          type: activityLog.type,
          description: activityLog.description,
          metadata: activityLog.metadata,
          initiativeId: activityLog.initiativeId,
          taskId: activityLog.taskId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`[ACTIVITY LOG] Failed to send: HTTP ${response.status}`, errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
      }

      const result = await response.json().catch(() => ({}));
      console.log('[ACTIVITY LOG] Successfully logged:', { type: activityLog.type, description: activityLog.description, result });
      return true;
    } catch (error) {
      // Retry with exponential backoff
      if (retryCount < MAX_RETRIES) {
        const delay = BASE_RETRY_DELAY * Math.pow(2, retryCount);
        console.warn(`Activity log send failed, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        await this.sleep(delay);
        return this.sendActivityLogWithRetry(activityLog, retryCount + 1);
      }

      // Max retries exceeded, add to offline queue
      console.warn('Max retries exceeded for activity log, queuing for later:', error);
      this.addToOfflineQueue({
        type: 'activity',
        data: activityLog,
        retryCount: MAX_RETRIES,
        timestamp: new Date().toISOString(),
      });
      return false;
    }
  }

  /**
   * Process offline queue when back online
   */
  async processOfflineQueue(): Promise<void> {
    if (this.isProcessingOfflineQueue || !this.isOnline()) {
      return;
    }

    this.isProcessingOfflineQueue = true;
    const queue = this.getOfflineQueue();

    if (queue.length === 0) {
      this.isProcessingOfflineQueue = false;
      return;
    }

    console.info(`Processing ${queue.length} queued logs from offline storage`);
    const failedLogs: QueuedLog[] = [];

    for (const log of queue) {
      let success = false;
      if (log.type === 'error') {
        success = await this.sendErrorLogWithRetry(log.data as Partial<ErrorLog>, 0);
      } else {
        success = await this.sendActivityLogWithRetry(log.data as Partial<ActivityLog>, 0);
      }

      if (!success) {
        // Keep failed logs for next attempt, but increment retry count
        log.retryCount++;
        if (log.retryCount < MAX_RETRIES * 2) {
          failedLogs.push(log);
        }
      }

      // Small delay between processing to avoid overwhelming the server
      await this.sleep(100);
    }

    // Save any remaining failed logs back to queue
    this.saveOfflineQueue(failedLogs);
    this.isProcessingOfflineQueue = false;

    if (failedLogs.length > 0) {
      console.warn(`${failedLogs.length} logs still failed, will retry later`);
    } else if (queue.length > 0) {
      console.info('All queued logs processed successfully');
    }
  }

  /**
   * Flush the batch queue
   */
  private flushBatch(): void {
    if (this.batchQueue.length === 0) return;

    const batch = [...this.batchQueue];
    this.batchQueue = [];

    // Send each log with retry mechanism
    batch.forEach(({ type, data }) => {
      if (type === 'error') {
        this.sendErrorLogWithRetry(data).catch(() => {});
      } else {
        this.sendActivityLogWithRetry(data).catch(() => {});
      }
    });
  }

  /**
   * Log an error (batched, with retry)
   */
  logError(
    message: string,
    options?: {
      error?: Error;
      context?: string;
      metadata?: Record<string, unknown>;
      severity?: LogSeverity;
    }
  ): void {
    const errorLog: Partial<ErrorLog> = {
      message,
      stack: options?.error?.stack,
      severity: options?.severity || LogSeverity.ERROR,
      context: options?.context,
      metadata: {
        ...options?.metadata,
        errorMessage: options?.error?.message,
        errorName: options?.error?.name,
      },
      timestamp: new Date().toISOString(),
    };

    // Add to batch queue
    this.batchQueue.push({ type: 'error', data: errorLog });

    // Flush if batch is full
    if (this.batchQueue.length >= this.MAX_BATCH_SIZE) {
      this.flushBatch();
    } else if (!this.batchTimeout) {
      // Schedule flush after delay
      this.batchTimeout = setTimeout(() => {
        this.flushBatch();
        this.batchTimeout = null;
      }, this.BATCH_DELAY);
    }
  }

  /**
   * Log a critical error immediately (no batching, for crashes)
   * Use this in Error Boundaries or for unrecoverable errors
   */
  async logCriticalError(
    message: string,
    options?: {
      error?: Error;
      context?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<boolean> {
    const errorLog: Partial<ErrorLog> = {
      message,
      stack: options?.error?.stack,
      severity: LogSeverity.CRITICAL,
      context: options?.context,
      metadata: {
        ...options?.metadata,
        errorMessage: options?.error?.message,
        errorName: options?.error?.name,
        critical: true,
      },
      timestamp: new Date().toISOString(),
    };

    // Send immediately with retry, don't batch
    return this.sendErrorLogWithRetry(errorLog);
  }

  /**
   * Log an activity (batched, with retry)
   */
  logActivity(
    type: ActivityType,
    description: string,
    metadata?: {
      initiativeId?: string;
      taskId?: string;
      [key: string]: unknown;
    },
    immediate?: boolean
  ): void {
    const activityLog: Partial<ActivityLog> = {
      type,
      description,
      metadata,
      initiativeId: metadata?.initiativeId,
      taskId: metadata?.taskId,
      timestamp: new Date().toISOString(),
    };

    // Add to batch queue
    this.batchQueue.push({ type: 'activity', data: activityLog });

    // If immediate flag is set, flush immediately
    if (immediate) {
      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout);
        this.batchTimeout = null;
      }
      this.flushBatch();
    } else {
      // Flush if batch is full
      if (this.batchQueue.length >= this.MAX_BATCH_SIZE) {
        this.flushBatch();
      } else if (!this.batchTimeout) {
        // Schedule flush after delay
        this.batchTimeout = setTimeout(() => {
          this.flushBatch();
          this.batchTimeout = null;
        }, this.BATCH_DELAY);
      }
    }
  }

  /**
   * Force flush all pending logs (useful before page unload)
   */
  forceFlush(): void {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    this.flushBatch();
  }

  /**
   * Get count of queued offline logs
   */
  getOfflineQueueCount(): number {
    return this.getOfflineQueue().length;
  }

  /**
   * Clear the offline queue (use with caution)
   */
  clearOfflineQueue(): void {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  }

  async getErrorLogs(params?: {
    startDate?: Date;
    endDate?: Date;
    severity?: LogSeverity;
    userId?: string;
  }): Promise<ErrorLog[]> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.startDate) {
        queryParams.append('startDate', params.startDate.toISOString());
      }
      if (params?.endDate) {
        queryParams.append('endDate', params.endDate.toISOString());
      }
      if (params?.severity) {
        queryParams.append('severity', params.severity);
      }
      if (params?.userId) {
        queryParams.append('userId', params.userId);
      }

      const response = await fetch(`${API_ENDPOINT}/api/logs/errors?${queryParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch error logs: ${response.statusText}`);
      }

      const data = await response.json();
      return data.logs || [];
    } catch (error) {
      console.error('Error fetching error logs:', error);
      return [];
    }
  }

  async getActivityLogs(params?: {
    startDate?: Date;
    endDate?: Date;
    type?: ActivityType;
    userId?: string;
  }): Promise<ActivityLog[]> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.startDate) {
        queryParams.append('startDate', params.startDate.toISOString());
      }
      if (params?.endDate) {
        queryParams.append('endDate', params.endDate.toISOString());
      }
      if (params?.type) {
        queryParams.append('type', params.type);
      }
      if (params?.userId) {
        queryParams.append('userId', params.userId);
      }

      const response = await fetch(`${API_ENDPOINT}/api/logs/activity?${queryParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`[ACTIVITY LOG] Failed to fetch: HTTP ${response.status}`, errorText);
        throw new Error(`Failed to fetch activity logs: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      console.log('[ACTIVITY LOG] Fetched logs:', { count: data.logs?.length || 0, params });
      return data.logs || [];
    } catch (error) {
      console.error('Error fetching activity logs:', error);
      return [];
    }
  }

  async searchLogs(params: {
    query?: string;
    logType?: 'error' | 'activity' | 'all';
    startDate?: Date;
    endDate?: Date;
    severity?: LogSeverity;
    userId?: string;
  }): Promise<Array<ErrorLog | ActivityLog>> {
    try {
      const queryParams = new URLSearchParams();
      if (params.query) {
        queryParams.append('query', params.query);
      }
      if (params.logType) {
        queryParams.append('logType', params.logType);
      }
      if (params.startDate) {
        queryParams.append('startDate', params.startDate.toISOString());
      }
      if (params.endDate) {
        queryParams.append('endDate', params.endDate.toISOString());
      }
      if (params.severity) {
        queryParams.append('severity', params.severity);
      }
      if (params.userId) {
        queryParams.append('userId', params.userId);
      }

      const response = await fetch(`${API_ENDPOINT}/api/logs/search?${queryParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to search logs: ${response.statusText}`);
      }

      const data = await response.json();
      return data.logs || [];
    } catch (error) {
      console.error('Error searching logs:', error);
      return [];
    }
  }

  /**
   * Cleanup - remove event listener
   */
  destroy(): void {
    if (this.onlineListener && typeof window !== 'undefined') {
      window.removeEventListener('online', this.onlineListener);
    }
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }
  }
}

export const logService = new LogService();

// Flush logs before page unload to prevent data loss
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    logService.forceFlush();
  });
}
