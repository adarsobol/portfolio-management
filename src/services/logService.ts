/**
 * Log Service
 * Sends error logs and activity logs to the backend API
 */

import { ErrorLog, ActivityLog, LogSeverity, ActivityType } from '../types';
import { API_ENDPOINT } from '../config';

class LogService {
  private batchQueue: Array<{ type: 'error' | 'activity'; data: any }> = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private readonly BATCH_DELAY = 2000; // 2 seconds
  private readonly MAX_BATCH_SIZE = 10;

  private async sendErrorLog(errorLog: Partial<ErrorLog>): Promise<boolean> {
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
          url: window.location.href,
          userAgent: navigator.userAgent,
        }),
      });

      if (!response.ok) {
        console.warn('Failed to send error log to backend:', response.statusText);
        return false;
      }

      return true;
    } catch (error) {
      console.warn('Error sending error log:', error);
      return false;
    }
  }

  private async sendActivityLog(activityLog: Partial<ActivityLog>): Promise<boolean> {
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
        console.warn('Failed to send activity log to backend:', response.statusText);
        return false;
      }

      return true;
    } catch (error) {
      console.warn('Error sending activity log:', error);
      return false;
    }
  }

  private flushBatch(): void {
    if (this.batchQueue.length === 0) return;

    const batch = [...this.batchQueue];
    this.batchQueue = [];

    // Send each log individually (could be optimized to batch on backend)
    batch.forEach(({ type, data }) => {
      if (type === 'error') {
        this.sendErrorLog(data).catch(() => {});
      } else {
        this.sendActivityLog(data).catch(() => {});
      }
    });
  }

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

  logActivity(
    type: ActivityType,
    description: string,
    metadata?: {
      initiativeId?: string;
      taskId?: string;
      [key: string]: unknown;
    }
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
        throw new Error(`Failed to fetch activity logs: ${response.statusText}`);
      }

      const data = await response.json();
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
}

export const logService = new LogService();

