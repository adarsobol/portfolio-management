/**
 * Version Service
 * 
 * Provides automatic versioning for initiatives and tasks data stored locally.
 * Supports time-based cleanup, restore functionality, and sync to Google Sheets.
 */

import { Initiative, Task, VersionMetadata, VersionedData, Snapshot, AppConfig } from '../types';
import { logger } from '../utils/logger';

// ============================================
// CONSTANTS
// ============================================

const METADATA_KEY = 'portfolio-versions-metadata';
const VERSION_PREFIX = 'portfolio-versions-';
const DEFAULT_RETENTION_DAYS = 30;

// ============================================
// VERSION SERVICE CLASS
// ============================================

class VersionService {
  private retentionDays: number = DEFAULT_RETENTION_DAYS;
  private debounceTimer: NodeJS.Timeout | null = null;
  private debounceDelay: number = 2000; // 2 seconds

  /**
   * Create a new version with initiatives and tasks data
   */
  createVersion(initiatives: Initiative[], tasks: Task[]): VersionMetadata {
    try {
      // Skip if no initiatives (but allow empty tasks)
      if (!initiatives || initiatives.length === 0) {
        logger.warn('Skipping version creation: no initiatives', { context: 'VersionService' });
        throw new Error('Cannot create version without initiatives');
      }

      const timestamp = new Date().toISOString();
      const id = `version-${Date.now()}`;
      
      // Extract all tasks from nested initiative structure
      const allTasksFromInitiatives: Task[] = [];
      initiatives.forEach(initiative => {
        if (initiative.tasks && Array.isArray(initiative.tasks)) {
          allTasksFromInitiatives.push(...initiative.tasks);
        }
      });

      // Combine tasks from parameter and nested in initiatives
      const allTasks = [...tasks, ...allTasksFromInitiatives];
      // Deduplicate tasks by ID
      const uniqueTasks = Array.from(
        new Map(allTasks.map(task => [task.id, task])).values()
      );

      const versionedData: VersionedData = {
        initiatives: JSON.parse(JSON.stringify(initiatives)), // Deep clone
        tasks: uniqueTasks
      };

      const dataString = JSON.stringify(versionedData);
      const size = new Blob([dataString]).size;

      const metadata: VersionMetadata = {
        id,
        timestamp,
        initiativeCount: initiatives.length,
        taskCount: uniqueTasks.length,
        size,
        syncedToSheets: false
      };

      // Store version data
      const versionKey = `${VERSION_PREFIX}${id}`;
      localStorage.setItem(versionKey, dataString);

      // Update metadata list
      const allMetadata = this.listVersions();
      allMetadata.unshift(metadata); // Add to beginning
      localStorage.setItem(METADATA_KEY, JSON.stringify(allMetadata));

      // Cleanup old versions
      this.cleanupOldVersions(this.retentionDays);

      logger.info('Version created', { 
        context: 'VersionService', 
        metadata: { id, initiativeCount: initiatives.length, taskCount: uniqueTasks.length } 
      });

      return metadata;
    } catch (error) {
      logger.error('Failed to create version', { 
        context: 'VersionService', 
        error: error instanceof Error ? error : new Error(String(error)) 
      });
      throw error;
    }
  }

  /**
   * Create version with debouncing (for automatic versioning)
   */
  createVersionDebounced(initiatives: Initiative[], tasks: Task[]): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      try {
        this.createVersion(initiatives, tasks);
      } catch (error) {
        logger.warn('Debounced version creation failed', { 
          context: 'VersionService', 
          metadata: { error: error instanceof Error ? error.message : String(error) }
        });
      }
      this.debounceTimer = null;
    }, this.debounceDelay);
  }

  /**
   * List all versions (sorted by timestamp, newest first)
   */
  listVersions(): VersionMetadata[] {
    try {
      const metadataJson = localStorage.getItem(METADATA_KEY);
      if (!metadataJson) {
        return [];
      }

      const metadata: VersionMetadata[] = JSON.parse(metadataJson);
      // Sort by timestamp descending (newest first)
      return metadata.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch (error) {
      logger.error('Failed to list versions', { 
        context: 'VersionService', 
        error: error instanceof Error ? error : new Error(String(error)) 
      });
      return [];
    }
  }

  /**
   * Get version data by ID
   */
  getVersion(id: string): VersionedData | null {
    try {
      const versionKey = `${VERSION_PREFIX}${id}`;
      const dataJson = localStorage.getItem(versionKey);
      
      if (!dataJson) {
        return null;
      }

      return JSON.parse(dataJson) as VersionedData;
    } catch (error) {
      logger.error('Failed to get version', { 
        context: 'VersionService', 
        metadata: { id },
        error: error instanceof Error ? error : new Error(String(error)) 
      });
      return null;
    }
  }

  /**
   * Restore a version (returns the data, caller should handle restoration)
   */
  restoreVersion(id: string): VersionedData | null {
    try {
      const versionData = this.getVersion(id);
      if (!versionData) {
        logger.warn('Version not found for restore', { 
          context: 'VersionService', 
          metadata: { id } 
        });
        return null;
      }

      logger.info('Version restored', { 
        context: 'VersionService', 
        metadata: { 
          id, 
          initiativeCount: versionData.initiatives.length,
          taskCount: versionData.tasks.length 
        } 
      });

      return versionData;
    } catch (error) {
      logger.error('Failed to restore version', { 
        context: 'VersionService', 
        metadata: { id },
        error: error instanceof Error ? error : new Error(String(error)) 
      });
      return null;
    }
  }

  /**
   * Delete a version
   */
  deleteVersion(id: string): boolean {
    try {
      // Remove version data
      const versionKey = `${VERSION_PREFIX}${id}`;
      localStorage.removeItem(versionKey);

      // Remove from metadata
      const allMetadata = this.listVersions();
      const filtered = allMetadata.filter(m => m.id !== id);
      localStorage.setItem(METADATA_KEY, JSON.stringify(filtered));

      logger.info('Version deleted', { 
        context: 'VersionService', 
        metadata: { id } 
      });

      return true;
    } catch (error) {
      logger.error('Failed to delete version', { 
        context: 'VersionService', 
        metadata: { id },
        error: error instanceof Error ? error : new Error(String(error)) 
      });
      return false;
    }
  }

  /**
   * Cleanup old versions based on retention period
   */
  cleanupOldVersions(retentionDays?: number): number {
    const days = retentionDays ?? this.retentionDays;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    try {
      const allMetadata = this.listVersions();
      const toKeep: VersionMetadata[] = [];
      const toDelete: string[] = [];
      let deletedCount = 0;

      allMetadata.forEach(metadata => {
        const versionDate = new Date(metadata.timestamp);
        if (versionDate >= cutoffDate) {
          toKeep.push(metadata);
        } else {
          toDelete.push(metadata.id);
        }
      });

      // Delete old versions
      toDelete.forEach(id => {
        const versionKey = `${VERSION_PREFIX}${id}`;
        localStorage.removeItem(versionKey);
        deletedCount++;
      });

      // Update metadata
      if (deletedCount > 0) {
        localStorage.setItem(METADATA_KEY, JSON.stringify(toKeep));
        logger.info('Cleaned up old versions', { 
          context: 'VersionService', 
          metadata: { deletedCount, retentionDays: days } 
        });
      }

      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup old versions', { 
        context: 'VersionService', 
        error: error instanceof Error ? error : new Error(String(error)) 
      });
      return 0;
    }
  }

  /**
   * Export version as Snapshot (for Sheets sync)
   */
  exportVersion(id: string, config: AppConfig, createdBy: string): Snapshot | null {
    try {
      const versionData = this.getVersion(id);
      if (!versionData) {
        return null;
      }

      const metadata = this.listVersions().find(m => m.id === id);
      if (!metadata) {
        return null;
      }

      const snapshot: Snapshot = {
        id: metadata.id,
        name: `Version ${new Date(metadata.timestamp).toLocaleString()}`,
        timestamp: metadata.timestamp,
        data: versionData.initiatives,
        config,
        createdBy
      };

      return snapshot;
    } catch (error) {
      logger.error('Failed to export version', { 
        context: 'VersionService', 
        metadata: { id },
        error: error instanceof Error ? error : new Error(String(error)) 
      });
      return null;
    }
  }

  /**
   * Mark version as synced to Sheets
   */
  markSyncedToSheets(id: string, sheetsTabName: string): boolean {
    try {
      const allMetadata = this.listVersions();
      const metadata = allMetadata.find(m => m.id === id);
      
      if (!metadata) {
        return false;
      }

      metadata.syncedToSheets = true;
      metadata.sheetsTabName = sheetsTabName;

      localStorage.setItem(METADATA_KEY, JSON.stringify(allMetadata));

      logger.info('Version marked as synced', { 
        context: 'VersionService', 
        metadata: { id, sheetsTabName } 
      });

      return true;
    } catch (error) {
      logger.error('Failed to mark version as synced', { 
        context: 'VersionService', 
        metadata: { id },
        error: error instanceof Error ? error : new Error(String(error)) 
      });
      return false;
    }
  }

  /**
   * Get storage usage statistics
   */
  getStorageStats(): {
    totalVersions: number;
    totalSize: number;
    oldestVersion: string | null;
    newestVersion: string | null;
  } {
    try {
      const allMetadata = this.listVersions();
      
      if (allMetadata.length === 0) {
        return {
          totalVersions: 0,
          totalSize: 0,
          oldestVersion: null,
          newestVersion: null
        };
      }

      const totalSize = allMetadata.reduce((sum, m) => sum + m.size, 0);
      const sorted = [...allMetadata].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      return {
        totalVersions: allMetadata.length,
        totalSize,
        oldestVersion: sorted[0].timestamp,
        newestVersion: sorted[sorted.length - 1].timestamp
      };
    } catch (error) {
      logger.error('Failed to get storage stats', { 
        context: 'VersionService', 
        error: error instanceof Error ? error : new Error(String(error)) 
      });
      return {
        totalVersions: 0,
        totalSize: 0,
        oldestVersion: null,
        newestVersion: null
      };
    }
  }

  /**
   * Set retention period
   */
  setRetentionDays(days: number): void {
    this.retentionDays = Math.max(1, days); // Minimum 1 day
  }

  /**
   * Get retention period
   */
  getRetentionDays(): number {
    return this.retentionDays;
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let versionServiceInstance: VersionService | null = null;

export function getVersionService(): VersionService {
  if (!versionServiceInstance) {
    versionServiceInstance = new VersionService();
  }
  return versionServiceInstance;
}

// Export for testing
export { VersionService };

