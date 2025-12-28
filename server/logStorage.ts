/**
 * Log Storage Service
 * Stores error logs and activity logs in Google Cloud Storage
 * Organized by date for efficient querying and retention policies
 */

import { Storage } from '@google-cloud/storage';
import { ErrorLog, ActivityLog, LogSeverity, ActivityType } from '../src/types';

interface LogStorageConfig {
  bucketName: string;
  projectId?: string;
  keyFilename?: string;
}

class LogStorageService {
  private storage: Storage | null = null;
  private bucketName: string;
  private initialized = false;

  constructor(config: LogStorageConfig) {
    this.bucketName = config.bucketName;
    
    try {
      this.storage = new Storage({
        projectId: config.projectId,
        keyFilename: config.keyFilename,
      });
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize GCS for log storage:', error);
      this.initialized = false;
    }
  }

  private getDatePath(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  }

  private getErrorLogPath(date: Date = new Date()): string {
    return `logs/errors/${this.getDatePath(date)}/errors.json`;
  }

  private getActivityLogPath(date: Date = new Date()): string {
    return `logs/activity/${this.getDatePath(date)}/activity.json`;
  }

  async storeErrorLog(errorLog: ErrorLog): Promise<boolean> {
    if (!this.initialized || !this.storage) {
      console.warn('Log storage not initialized, skipping error log');
      return false;
    }

    try {
      const bucket = this.storage.bucket(this.bucketName);
      const filePath = this.getErrorLogPath(new Date(errorLog.timestamp));
      const file = bucket.file(filePath);

      // Read existing logs
      let existingLogs: ErrorLog[] = [];
      try {
        const [exists] = await file.exists();
        if (exists) {
          const [contents] = await file.download();
          existingLogs = JSON.parse(contents.toString());
        }
      } catch (error) {
        // File doesn't exist or is invalid, start fresh
        console.warn('Could not read existing error logs, starting fresh:', error);
      }

      // Add new log
      existingLogs.push(errorLog);

      // Write back to storage
      await file.save(JSON.stringify(existingLogs, null, 2), {
        contentType: 'application/json',
        metadata: {
          cacheControl: 'no-cache',
        },
      });

      return true;
    } catch (error) {
      console.error('Failed to store error log:', error);
      return false;
    }
  }

  async storeActivityLog(activityLog: ActivityLog): Promise<boolean> {
    if (!this.initialized || !this.storage) {
      console.warn('Log storage not initialized, skipping activity log');
      return false;
    }

    try {
      const bucket = this.storage.bucket(this.bucketName);
      const filePath = this.getActivityLogPath(new Date(activityLog.timestamp));
      const file = bucket.file(filePath);

      // Read existing logs
      let existingLogs: ActivityLog[] = [];
      try {
        const [exists] = await file.exists();
        if (exists) {
          const [contents] = await file.download();
          existingLogs = JSON.parse(contents.toString());
        }
      } catch (error) {
        // File doesn't exist or is invalid, start fresh
        console.warn('Could not read existing activity logs, starting fresh:', error);
      }

      // Add new log
      existingLogs.push(activityLog);

      // Write back to storage
      await file.save(JSON.stringify(existingLogs, null, 2), {
        contentType: 'application/json',
        metadata: {
          cacheControl: 'no-cache',
        },
      });

      return true;
    } catch (error) {
      console.error('Failed to store activity log:', error);
      return false;
    }
  }

  async getErrorLogs(
    startDate?: Date,
    endDate?: Date,
    severity?: LogSeverity,
    userId?: string
  ): Promise<ErrorLog[]> {
    if (!this.initialized || !this.storage) {
      return [];
    }

    try {
      const bucket = this.storage.bucket(this.bucketName);
      const allLogs: ErrorLog[] = [];

      // Determine date range
      const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default: last 7 days
      const end = endDate || new Date();

      // Iterate through dates
      const currentDate = new Date(start);
      while (currentDate <= end) {
        const filePath = this.getErrorLogPath(currentDate);
        const file = bucket.file(filePath);

        try {
          const [exists] = await file.exists();
          if (exists) {
            const [contents] = await file.download();
            const logs: ErrorLog[] = JSON.parse(contents.toString());
            allLogs.push(...logs);
          }
        } catch (error) {
          // Skip files that don't exist or can't be read
          console.warn(`Could not read error logs for ${currentDate.toISOString()}:`, error);
        }

        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Filter logs
      let filteredLogs = allLogs;
      if (severity) {
        filteredLogs = filteredLogs.filter(log => log.severity === severity);
      }
      if (userId) {
        filteredLogs = filteredLogs.filter(log => log.userId === userId);
      }

      // Sort by timestamp (newest first)
      return filteredLogs.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch (error) {
      console.error('Failed to get error logs:', error);
      return [];
    }
  }

  async getActivityLogs(
    startDate?: Date,
    endDate?: Date,
    type?: ActivityType,
    userId?: string
  ): Promise<ActivityLog[]> {
    if (!this.initialized || !this.storage) {
      return [];
    }

    try {
      const bucket = this.storage.bucket(this.bucketName);
      const allLogs: ActivityLog[] = [];

      // Determine date range
      const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default: last 7 days
      const end = endDate || new Date();

      // Iterate through dates
      const currentDate = new Date(start);
      while (currentDate <= end) {
        const filePath = this.getActivityLogPath(currentDate);
        const file = bucket.file(filePath);

        try {
          const [exists] = await file.exists();
          if (exists) {
            const [contents] = await file.download();
            const logs: ActivityLog[] = JSON.parse(contents.toString());
            allLogs.push(...logs);
          }
        } catch (error) {
          // Skip files that don't exist or can't be read
          console.warn(`Could not read activity logs for ${currentDate.toISOString()}:`, error);
        }

        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Filter logs
      let filteredLogs = allLogs;
      if (type) {
        filteredLogs = filteredLogs.filter(log => log.type === type);
      }
      if (userId) {
        filteredLogs = filteredLogs.filter(log => log.userId === userId);
      }

      // Sort by timestamp (newest first)
      return filteredLogs.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch (error) {
      console.error('Failed to get activity logs:', error);
      return [];
    }
  }

  async deleteOldLogs(retentionDays: number): Promise<number> {
    if (!this.initialized || !this.storage) {
      return 0;
    }

    try {
      const bucket = this.storage.bucket(this.bucketName);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      let deletedCount = 0;

      // Delete old error logs
      const errorPrefix = 'logs/errors/';
      const [errorFiles] = await bucket.getFiles({ prefix: errorPrefix });
      
      for (const file of errorFiles) {
        const fileDate = this.extractDateFromPath(file.name);
        if (fileDate && fileDate < cutoffDate) {
          await file.delete();
          deletedCount++;
        }
      }

      // Delete old activity logs
      const activityPrefix = 'logs/activity/';
      const [activityFiles] = await bucket.getFiles({ prefix: activityPrefix });
      
      for (const file of activityFiles) {
        const fileDate = this.extractDateFromPath(file.name);
        if (fileDate && fileDate < cutoffDate) {
          await file.delete();
          deletedCount++;
        }
      }

      return deletedCount;
    } catch (error) {
      console.error('Failed to delete old logs:', error);
      return 0;
    }
  }

  private extractDateFromPath(path: string): Date | null {
    // Extract date from path like "logs/errors/2024/12/19/errors.json"
    const match = path.match(/(\d{4})\/(\d{2})\/(\d{2})/);
    if (match) {
      const [, year, month, day] = match;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    return null;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

// Singleton instance
let logStorageInstance: LogStorageService | null = null;

export function initializeLogStorage(config: LogStorageConfig): LogStorageService {
  logStorageInstance = new LogStorageService(config);
  return logStorageInstance;
}

export function getLogStorage(): LogStorageService | null {
  return logStorageInstance;
}

export function isLogStorageEnabled(): boolean {
  return logStorageInstance?.isInitialized() ?? false;
}

