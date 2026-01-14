// Google Sheets Sync Service - Primary Mode
// Google Sheets is the primary data source, localStorage is fallback cache

import { Initiative, ChangeRecord, Snapshot, AppConfig, User, Task, Status } from '../types';
import { authService } from './authService';
import { logger } from '../utils/logger';

// ============================================
// CONFIGURATION
// ============================================
const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || '';

// ============================================
// TYPES
// ============================================
export interface SyncStatus {
  lastSync: string | null;
  pending: number;
  error: string | null;
  isOnline: boolean;
  isLoading: boolean;
}

interface TaskWithParent {
  task: Task;
  initiative: Initiative;
}

interface SyncQueue {
  initiatives: Map<string, Initiative>; // Deduped by ID
  changes: ChangeRecord[];
  snapshots: Snapshot[];
  tasks: Map<string, TaskWithParent>; // Deduped by task ID
}

export interface SheetsPullData {
  initiatives: Initiative[];
  config: AppConfig | null;
  users: User[] | null;
}

// ============================================
// FLATTEN HELPERS (for Sheet row format)
// ============================================
export function flattenInitiative(i: Initiative): Record<string, string | number | boolean> {
  // Guard against undefined/null initiatives
  if (!i) {
    logger.error('flattenInitiative called with undefined/null initiative', { context: 'Sync' });
    throw new Error('Cannot flatten undefined initiative');
  }
  
  const taskCount = i.tasks?.length || 0;
  if (taskCount > 0) {
    logger.debug(`flattenInitiative: ${i.id} has ${taskCount} tasks`, { context: 'Sync', metadata: { taskIds: i.tasks?.map(t => t.id) } });
  }
  return {
    id: i.id,
    initiativeType: i.initiativeType || 'WP',
    l1_assetClass: i.l1_assetClass,
    l2_pillar: i.l2_pillar,
    l3_responsibility: i.l3_responsibility,
    l4_target: i.l4_target,
    title: i.title,
    ownerId: i.ownerId,
    assignee: i.assignee || '',
    quarter: i.quarter,
    status: i.status,
    priority: i.priority,
    estimatedEffort: i.estimatedEffort ?? 0,
    originalEstimatedEffort: i.originalEstimatedEffort ?? 0,
    actualEffort: i.actualEffort ?? 0,
    eta: i.eta ?? '',
    originalEta: i.originalEta ?? '',
    lastUpdated: i.lastUpdated ?? '',
    createdAt: i.createdAt ?? '',
    lastWeeklyUpdate: i.lastWeeklyUpdate ?? '',
    dependencies: i.dependencies?.map(d => `${d.team} (${d.deliverable || 'N/A'}, ETA: ${d.eta || 'N/A'})`).join('; ') || '',
    workType: i.workType,
    unplannedTags: JSON.stringify(i.unplannedTags || []),
    riskActionLog: i.riskActionLog || '',
    isAtRisk: i.status === 'At Risk',
    definitionOfDone: i.definitionOfDone || '',
    tasks: JSON.stringify(i.tasks || []),
    overlookedCount: i.overlookedCount ?? 0,
    lastDelayDate: i.lastDelayDate ?? '',
    completionRate: i.completionRate ?? 0,
    comments: JSON.stringify(i.comments || []),
    history: JSON.stringify(i.history || []),
    version: i.version ?? 0,
    deletedAt: i.deletedAt ?? ''
  };
}

export function flattenChangeRecord(c: ChangeRecord): Record<string, string> {
  return {
    id: c.id,
    issueType: c.issueType || 'Initiative',
    parentId: c.parentId || c.initiativeId, // Parent ID for connecting items
    initiativeId: c.initiativeId,
    initiativeTitle: c.initiativeTitle,
    taskId: c.taskId || '',
    field: c.field,
    oldValue: String(c.oldValue ?? ''),
    newValue: String(c.newValue ?? ''),
    changedBy: c.changedBy,
    timestamp: c.timestamp
  };
}

export interface FlatTask {
  id: string;
  parentId: string;
  initiativeTitle: string;
  title: string;
  estimatedEffort: number;
  actualEffort: number;
  eta: string;
  ownerId: string;
  status: string;
  tags: string;
  comments: string;
  createdAt: string;
  lastUpdated: string;
  deletedAt: string;
}

export function flattenTask(task: Task, initiative: Initiative): FlatTask {
  return {
    id: task.id,
    parentId: initiative.id,
    initiativeTitle: initiative.title,
    title: task.title || '',
    estimatedEffort: task.estimatedEffort ?? 0,
    actualEffort: task.actualEffort ?? 0,
    eta: task.eta || '',
    ownerId: task.ownerId || '',
    status: task.status || '',
    tags: JSON.stringify(task.tags || []),
    comments: JSON.stringify(task.comments || []),
    createdAt: task.createdAt || '',
    lastUpdated: new Date().toISOString().split('T')[0],
    deletedAt: task.deletedAt || ''
  };
}

// ============================================
// LOCAL STORAGE CACHE
// ============================================
const CACHE_KEY = 'portfolio-initiatives-cache';
const CACHE_TIMESTAMP_KEY = 'portfolio-initiatives-cache-timestamp';

function cacheToLocalStorage(initiatives: Initiative[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(initiatives));
    localStorage.setItem(CACHE_TIMESTAMP_KEY, new Date().toISOString());
  } catch {
    // Ignore storage errors
  }
}

function loadFromLocalStorageCache(): Initiative[] | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

// ============================================
// CONFLICT TYPES
// ============================================
export interface SyncConflict {
  id: string;
  serverVersion: number;
  clientVersion: number;
  serverData: Record<string, unknown>;
}

// ============================================
// SYNC QUEUE MANAGER
// ============================================
class SheetsSyncManager {
  private queue: SyncQueue = {
    initiatives: new Map(),
    changes: [],
    snapshots: [],
    tasks: new Map()
  };
  private syncTimeout: ReturnType<typeof setTimeout> | null = null;
  private status: SyncStatus = {
    lastSync: null,
    pending: 0,
    error: null,
    isOnline: navigator.onLine,
    isLoading: false
  };
  private listeners: Set<(status: SyncStatus) => void> = new Set();
  private enabled: boolean = true;
  private debounceMs: number = 1000; // Reduced for more responsive syncing

  private static listenersRegistered = false;
  private static sharedHandlers: { online?: () => void; offline?: () => void } = {};

  constructor() {
    // Only register event listeners once globally (prevents duplicate listeners during HMR)
    if (!SheetsSyncManager.listenersRegistered) {
      // Create shared handlers that reference 'this' instance
      SheetsSyncManager.sharedHandlers.online = () => {
        // Access the singleton instance via the exported sheetsSync
        // This ensures we always use the current instance even after HMR
        const currentInstance = (globalThis as any).__sheetsSyncInstance;
        if (currentInstance) {
          currentInstance.status.isOnline = true;
          currentInstance.notify();
          if (currentInstance.getPendingCount() > 0) {
            currentInstance.scheduleSyncFlush();
          }
        }
      };

      SheetsSyncManager.sharedHandlers.offline = () => {
        const currentInstance = (globalThis as any).__sheetsSyncInstance;
        if (currentInstance) {
          currentInstance.status.isOnline = false;
          currentInstance.notify();
        }
      };

      window.addEventListener('online', SheetsSyncManager.sharedHandlers.online);
      window.addEventListener('offline', SheetsSyncManager.sharedHandlers.offline);
      SheetsSyncManager.listenersRegistered = true;
    }

    // Store reference to this instance globally for event handlers
    (globalThis as any).__sheetsSyncInstance = this;

    // Don't load persisted queue on initialization - this was causing duplicates
    // this.loadPersistedQueue();
  }

  destroy(): void {
    // Remove listeners if they exist
    if (SheetsSyncManager.listenersRegistered) {
      if (SheetsSyncManager.sharedHandlers.online) {
        window.removeEventListener('online', SheetsSyncManager.sharedHandlers.online);
      }
      if (SheetsSyncManager.sharedHandlers.offline) {
        window.removeEventListener('offline', SheetsSyncManager.sharedHandlers.offline);
      }
      SheetsSyncManager.listenersRegistered = false;
      SheetsSyncManager.sharedHandlers = {};
    }
    if ((globalThis as any).__sheetsSyncInstance === this) {
      (globalThis as any).__sheetsSyncInstance = null;
    }
  }

  // ============================================
  // PUBLIC API
  // ============================================

  /** Get auth headers for API requests */
  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...authService.getAuthHeader()
    };
  }

  /** Subscribe to sync status updates */
  subscribe(callback: (status: SyncStatus) => void): () => void {
    this.listeners.add(callback);
    callback(this.status); // Immediate callback with current status
    return () => this.listeners.delete(callback);
  }

  /** Enable or disable syncing */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled && this.getPendingCount() > 0) {
      this.scheduleSyncFlush();
    }
  }

  /** Check if sync is enabled */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** Load initiatives from Google Sheets (primary source) with localStorage fallback */
  /** CRITICAL: Merges local + server data to prevent data loss on refresh */
  async loadInitiatives(): Promise<Initiative[]> {
    this.status.isLoading = true;
    this.notify();

    try {
      // Load from localStorage first to preserve local state
      const localCached = loadFromLocalStorageCache();
      let localInitiatives: Initiative[] = [];
      
      if (localCached && localCached.length > 0) {
        // Deduplicate local cache
        const seenIds = new Set<string>();
        localInitiatives = localCached.filter((init: Initiative) => {
          if (seenIds.has(init.id)) {
            return false;
          }
          seenIds.add(init.id);
          return true;
        });
      }

      // Try to load from Google Sheets
      if (this.status.isOnline && authService.isAuthenticated()) {
        const data = await this.pullFromSheets();
        if (data && data.initiatives.length > 0) {
          // Deduplicate server initiatives by ID (keep first occurrence)
          const seenIds = new Set<string>();
          const serverInitiatives = data.initiatives.filter((init: Initiative) => {
            if (seenIds.has(init.id)) {
              logger.warn('Found duplicate initiative ID', { context: 'SheetsSyncManager.loadInitiatives', metadata: { id: init.id } });
              return false;
            }
            seenIds.add(init.id);
            return true;
          });

          // MERGE: Combine local + server data intelligently
          // Strategy: Keep local items that don't exist on server OR have newer timestamps
          const merged = new Map<string, Initiative>();
          
          // First, add all server initiatives
          serverInitiatives.forEach(init => {
            merged.set(init.id, init);
          });
          
          // Then, add local initiatives that are missing on server OR newer
          localInitiatives.forEach(localInit => {
            const serverInit = merged.get(localInit.id);
            if (!serverInit) {
              // Local item doesn't exist on server - keep it (likely failed to sync)
              logger.info('Keeping local initiative not found on server', { 
                context: 'SheetsSyncManager.loadInitiatives', 
                metadata: { id: localInit.id, title: localInit.title } 
              });
              merged.set(localInit.id, localInit);
            } else {
              // Both exist - keep the one with newer lastUpdated timestamp
              const localTime = localInit.lastUpdated || localInit.createdAt || '';
              const serverTime = serverInit.lastUpdated || serverInit.createdAt || '';
              if (localTime > serverTime) {
                logger.info('Keeping local initiative with newer timestamp', { 
                  context: 'SheetsSyncManager.loadInitiatives', 
                  metadata: { id: localInit.id, localTime, serverTime } 
                });
                merged.set(localInit.id, localInit);
              }
            }
          });

          const mergedArray = Array.from(merged.values());
          
          if (mergedArray.length > serverInitiatives.length) {
            logger.info('Merged local + server data', { 
              context: 'SheetsSyncManager.loadInitiatives', 
              metadata: { 
                serverCount: serverInitiatives.length, 
                localCount: localInitiatives.length,
                mergedCount: mergedArray.length,
                addedFromLocal: mergedArray.length - serverInitiatives.length
              } 
            });
          }

          // Cache merged initiatives to localStorage
          cacheToLocalStorage(mergedArray);
          this.status.isLoading = false;
          this.status.lastSync = new Date().toISOString();
          this.notify();
          return mergedArray;
        }
      }

      // Fall back to localStorage cache - but check for corruption first
      const cached = loadFromLocalStorageCache();
      if (cached && cached.length > 0) {
        // Deduplicate cached initiatives as well (in case cache was corrupted)
        const seenIds = new Set<string>();
        const deduplicatedCached = cached.filter((init: Initiative) => {
          if (seenIds.has(init.id)) {
            logger.warn('Found duplicate initiative ID in cache', { context: 'SheetsSyncManager.loadInitiatives', metadata: { id: init.id } });
            return false;
          }
          seenIds.add(init.id);
          return true;
        });

        // If cache has excessive duplicates (more than 50% duplicates), clear it completely
        const duplicateRatio = (cached.length - deduplicatedCached.length) / cached.length;
        if (duplicateRatio > 0.5 || cached.length > 100) {
          logger.warn('Cache appears corrupted (too many duplicates or too many items), clearing cache', { 
            context: 'SheetsSyncManager.loadInitiatives', 
            metadata: { cachedCount: cached.length, deduplicatedCount: deduplicatedCached.length, duplicateRatio } 
          });
          // Clear corrupted cache
          try {
            localStorage.removeItem(CACHE_KEY);
            localStorage.removeItem(CACHE_TIMESTAMP_KEY);
          } catch {
            // Ignore storage errors
          }
          this.status.isLoading = false;
          this.status.error = 'Cache corrupted - cleared. Please refresh from Google Sheets.';
          this.notify();
          return [];
        }

        if (cached.length !== deduplicatedCached.length) {
          logger.info('Deduplicated initiatives from cache', { 
            context: 'SheetsSyncManager.loadInitiatives', 
            metadata: { before: cached.length, after: deduplicatedCached.length, removed: cached.length - deduplicatedCached.length } 
          });
          // Update cache with deduplicated data
          cacheToLocalStorage(deduplicatedCached);
        }

        logger.info('Loaded initiatives from localStorage cache', { context: 'SheetsSyncManager.loadInitiatives', metadata: { count: deduplicatedCached.length } });
        
        // AUTO-PUSH: If Sheets is empty but we have local data, push it automatically
        if (this.status.isOnline && authService.isAuthenticated()) {
          logger.info('Google Sheets empty but localStorage has data - auto-pushing to Sheets', { 
            context: 'SheetsSyncManager.loadInitiatives', 
            metadata: { count: deduplicatedCached.length } 
          });
          // Push all cached initiatives to Sheets in background (don't await)
          this.pushFullData({ initiatives: deduplicatedCached }).then((success) => {
            if (success) {
              logger.info('Auto-push to Sheets completed successfully', { context: 'SheetsSyncManager.loadInitiatives' });
            }
          }).catch((err) => {
            logger.error('Auto-push to Sheets failed', { context: 'SheetsSyncManager.loadInitiatives', error: err });
          });
        }
        
        this.status.isLoading = false;
        this.status.error = this.status.isOnline ? 'Syncing local data to Sheets...' : 'Offline - using cached data';
        this.notify();
        return deduplicatedCached;
      }

      // Return empty if nothing available
      this.status.isLoading = false;
      this.notify();
      return [];
    } catch (error) {
      logger.error('Failed to load initiatives', { context: 'SheetsSyncManager.loadInitiatives', error: error instanceof Error ? error : new Error(String(error)) });
      this.status.isLoading = false;
      this.status.error = error instanceof Error ? error.message : 'Failed to load data';
      this.notify();

      // Try localStorage as last resort - but don't use if corrupted
      const cached = loadFromLocalStorageCache();
      if (cached && cached.length > 0) {
        // Deduplicate cached initiatives as well (in case cache was corrupted)
        const seenIds = new Set<string>();
        const deduplicatedCached = cached.filter((init: Initiative) => {
          if (seenIds.has(init.id)) {
            return false;
          }
          seenIds.add(init.id);
          return true;
        });
        
        // If cache is severely corrupted, don't use it
        const duplicateRatio = (cached.length - deduplicatedCached.length) / cached.length;
        if (duplicateRatio > 0.5 || cached.length > 100) {
          // Clear corrupted cache
          try {
            localStorage.removeItem(CACHE_KEY);
            localStorage.removeItem(CACHE_TIMESTAMP_KEY);
          } catch {
            // Ignore storage errors
          }
          return [];
        }
        
        return deduplicatedCached;
      }
      return [];
    }
  }

  /** Queue initiative for sync (debounced, deduped) */
  queueInitiativeSync(initiative: Initiative): void {
    if (!this.enabled) {
      logger.warn('Sync is disabled, skipping queue', { context: 'Sync' });
      return;
    }

    const taskCount = initiative.tasks?.length || 0;
    logger.debug(`Queuing initiative for sync: ${initiative.id}`, { context: 'Sync', metadata: { title: initiative.title, taskCount } });
    this.queue.initiatives.set(initiative.id, initiative);
    this.updatePendingCount();
    this.persistQueue();
    
    // Also update localStorage cache immediately for optimistic UI
    this.updateLocalStorageCache(initiative);
    
    this.scheduleSyncFlush();
  }

  /** Queue multiple initiatives for sync */
  queueInitiativesSync(initiatives: Initiative[]): void {
    if (!this.enabled) return;

    // Deduplicate initiatives before queuing (keep first occurrence)
    const seenIds = new Set<string>();
    const deduplicated = initiatives.filter(init => {
      if (seenIds.has(init.id)) {
        logger.warn('Found duplicate initiative ID in queue', { context: 'SheetsSyncManager.queueInitiativesSync', metadata: { id: init.id } });
        return false;
      }
      seenIds.add(init.id);
      return true;
    });

    if (initiatives.length !== deduplicated.length) {
      logger.info('Deduplicated initiatives before queuing', { 
        context: 'SheetsSyncManager.queueInitiativesSync', 
        metadata: { before: initiatives.length, after: deduplicated.length, removed: initiatives.length - deduplicated.length } 
      });
    }

    deduplicated.forEach(i => {
      this.queue.initiatives.set(i.id, i);
      this.updateLocalStorageCache(i);
    });
    this.updatePendingCount();
    this.persistQueue();
    this.scheduleSyncFlush();
  }

  /** Update localStorage cache with a single initiative */
  private updateLocalStorageCache(initiative: Initiative): void {
    try {
      const cached = loadFromLocalStorageCache() || [];
      // Deduplicate cache first
      const seenIds = new Set<string>();
      const deduplicatedCached = cached.filter((init: Initiative) => {
        if (seenIds.has(init.id)) {
          return false;
        }
        seenIds.add(init.id);
        return true;
      });

      const index = deduplicatedCached.findIndex(i => i.id === initiative.id);
      if (index >= 0) {
        deduplicatedCached[index] = initiative;
      } else {
        deduplicatedCached.push(initiative);
      }
      cacheToLocalStorage(deduplicatedCached);
    } catch {
      // Ignore cache errors
    }
  }

  /** Queue change log entry */
  queueChangeLog(change: ChangeRecord): void {
    if (!this.enabled) {
      logger.warn('Changelog sync disabled, skipping', { context: 'Sync' });
      return;
    }

    logger.debug(`Queuing changelog: ${change.initiativeId}`, { context: 'Sync', metadata: { field: change.field } });
    this.queue.changes.push(change);
    this.updatePendingCount();
    this.persistQueue();
    this.scheduleSyncFlush();
  }

  /** Queue snapshot creation */
  queueSnapshot(snapshot: Snapshot): void {
    if (!this.enabled) return;

    this.queue.snapshots.push(snapshot);
    this.updatePendingCount();
    this.persistQueue();
    this.scheduleSyncFlush();
  }

  /** Queue tasks for sync to separate Tasks sheet */
  queueTasksSync(tasks: Task[], initiative: Initiative): void {
    if (!this.enabled) return;

    const taskCount = tasks.length;
    logger.debug(`Queuing ${taskCount} tasks from ${initiative.id} for sync`, { context: 'Sync' });
    
    tasks.forEach(task => {
      this.queue.tasks.set(task.id, { task, initiative });
    });
    
    this.updatePendingCount();
    this.persistQueue();
    this.scheduleSyncFlush();
  }

  /** Force immediate sync */
  async forceSyncNow(): Promise<void> {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }
    await this.flushSync();
  }

  /** Pull all data from Google Sheets */
  async pullFromSheets(): Promise<SheetsPullData | null> {
    if (!this.status.isOnline) {
      this.status.error = 'Offline - cannot pull from Sheets';
      this.notify();
      return null;
    }

    try {
      const response = await fetch(`${API_ENDPOINT}/api/sheets/pull`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (response.status === 401 || response.status === 403) {
        this.status.error = 'Authentication required';
        this.notify();
        return null;
      }

      if (!response.ok) {
        throw new Error(`Pull failed: ${response.statusText}`);
      }

      const data = await response.json();
      this.status.error = null;
      this.notify();
      return data;
    } catch (error) {
      this.status.error = error instanceof Error ? error.message : 'Pull failed';
      this.notify();
      return null;
    }
  }

  /** Delete an initiative from Sheets */
  /** Soft delete an initiative (sets status to Deleted) */
  async deleteInitiative(id: string): Promise<{ success: boolean; deletedAt?: string }> {
    if (!this.status.isOnline) {
      this.status.error = 'Offline - cannot delete from Sheets';
      this.notify();
      return { success: false };
    }

    try {
      const response = await fetch(`${API_ENDPOINT}/api/sheets/initiatives/${id}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });

      if (response.status === 401 || response.status === 403) {
        this.status.error = 'Authentication required';
        this.notify();
        return { success: false };
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `Delete failed: ${response.statusText}`);
      }

      const result = await response.json();

      // Update localStorage cache to mark as deleted
      try {
        const cached = loadFromLocalStorageCache() || [];
        const updated = cached.map((init: Initiative) => 
          init.id === id 
            ? { ...init, status: Status.Deleted, deletedAt: result.deletedAt } 
            : init
        );
        cacheToLocalStorage(updated);
      } catch {
        // Ignore cache errors
      }

      // Remove from queue if it was queued
      this.queue.initiatives.delete(id);
      this.updatePendingCount();
      this.persistQueue();

      this.status.error = null;
      this.notify();
      return { success: true, deletedAt: result.deletedAt };
    } catch (error) {
      logger.error('Failed to delete initiative', { context: 'SheetsSyncManager.deleteInitiative', error: error instanceof Error ? error : new Error(String(error)) });
      this.status.error = error instanceof Error ? error.message : 'Delete failed';
      this.notify();
      return { success: false };
    }
  }

  /** Restore a soft-deleted initiative */
  async restoreInitiative(id: string): Promise<boolean> {
    if (!this.status.isOnline) {
      this.status.error = 'Offline - cannot restore from Sheets';
      this.notify();
      return false;
    }

    try {
      const response = await fetch(`${API_ENDPOINT}/api/sheets/initiatives/${id}/restore`, {
        method: 'POST',
        headers: this.getHeaders()
      });

      if (response.status === 401 || response.status === 403) {
        this.status.error = 'Authentication required';
        this.notify();
        return false;
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `Restore failed: ${response.statusText}`);
      }

      // Update localStorage cache to restore
      try {
        const cached = loadFromLocalStorageCache() || [];
        const updated = cached.map((init: Initiative) => 
          init.id === id 
            ? { ...init, status: Status.NotStarted, deletedAt: undefined } 
            : init
        );
        cacheToLocalStorage(updated);
      } catch {
        // Ignore cache errors
      }

      this.status.error = null;
      this.notify();
      return true;
    } catch (error) {
      logger.error('Failed to restore initiative', { context: 'SheetsSyncManager.restoreInitiative', error: error instanceof Error ? error : new Error(String(error)) });
      this.status.error = error instanceof Error ? error.message : 'Restore failed';
      this.notify();
      return false;
    }
  }

  /** Soft delete a task */
  async deleteTask(id: string): Promise<{ success: boolean; deletedAt?: string }> {
    if (!this.status.isOnline) {
      this.status.error = 'Offline - cannot delete task from Sheets';
      this.notify();
      return { success: false };
    }

    try {
      const response = await fetch(`${API_ENDPOINT}/api/sheets/tasks/${id}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `Delete task failed: ${response.statusText}`);
      }

      const result = await response.json();
      this.status.error = null;
      this.notify();
      return { success: true, deletedAt: result.deletedAt };
    } catch (error) {
      logger.error('Failed to delete task', { context: 'SheetsSyncManager.deleteTask', error: error instanceof Error ? error : new Error(String(error)) });
      this.status.error = error instanceof Error ? error.message : 'Delete task failed';
      this.notify();
      return { success: false };
    }
  }

  /** Restore a soft-deleted task */
  async restoreTask(id: string): Promise<boolean> {
    if (!this.status.isOnline) {
      this.status.error = 'Offline - cannot restore task from Sheets';
      this.notify();
      return false;
    }

    try {
      const response = await fetch(`${API_ENDPOINT}/api/sheets/tasks/${id}/restore`, {
        method: 'POST',
        headers: this.getHeaders()
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `Restore task failed: ${response.statusText}`);
      }

      this.status.error = null;
      this.notify();
      return true;
    } catch (error) {
      logger.error('Failed to restore task', { context: 'SheetsSyncManager.restoreTask', error: error instanceof Error ? error : new Error(String(error)) });
      this.status.error = error instanceof Error ? error.message : 'Restore task failed';
      this.notify();
      return false;
    }
  }

  /** Push full data to Sheets (overwrite) */
  async pushFullData(data: {
    initiatives: Initiative[];
    config?: AppConfig;
    users?: User[];
  }): Promise<boolean> {
    if (!this.status.isOnline) {
      this.status.error = 'Offline - cannot push to Sheets';
      this.notify();
      return false;
    }

    try {
      // Deduplicate initiatives before pushing
      const seenIds = new Set<string>();
      const deduplicated = data.initiatives.filter(init => {
        if (seenIds.has(init.id)) {
          logger.warn('Found duplicate initiative ID before push', { context: 'SheetsSyncManager.pushFullData', metadata: { id: init.id } });
          return false;
        }
        seenIds.add(init.id);
        return true;
      });

      if (data.initiatives.length !== deduplicated.length) {
        logger.info('Deduplicated initiatives before push', { 
          context: 'SheetsSyncManager.pushFullData', 
          metadata: { before: data.initiatives.length, after: deduplicated.length, removed: data.initiatives.length - deduplicated.length } 
        });
      }

      const response = await fetch(`${API_ENDPOINT}/api/sheets/push`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          initiatives: deduplicated.map(flattenInitiative)
        })
      });

      if (!response.ok) {
        throw new Error(`Push failed: ${response.statusText}`);
      }

      // Update local cache with deduplicated data
      cacheToLocalStorage(deduplicated);

      this.status.lastSync = new Date().toISOString();
      this.status.error = null;
      this.notify();
      return true;
    } catch (error) {
      this.status.error = error instanceof Error ? error.message : 'Push failed';
      this.notify();
      return false;
    }
  }

  /** Get current sync status */
  getStatus(): SyncStatus {
    return { ...this.status };
  }

  /** Clear all pending items */
  clearQueue(): void {
    this.queue = { initiatives: new Map(), changes: [], snapshots: [], tasks: new Map() };
    this.updatePendingCount();
    this.persistQueue();
  }

  /** Clear corrupted localStorage cache */
  clearCache(): void {
    try {
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(CACHE_TIMESTAMP_KEY);
      logger.info('Cleared localStorage cache', { context: 'SheetsSyncManager.clearCache' });
    } catch {
      // Ignore storage errors
    }
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private notify(): void {
    this.listeners.forEach(cb => cb({ ...this.status }));
  }

  private getPendingCount(): number {
    return (
      this.queue.initiatives.size +
      this.queue.changes.length +
      this.queue.snapshots.length +
      this.queue.tasks.size
    );
  }

  private updatePendingCount(): void {
    this.status.pending = this.getPendingCount();
    this.notify();
  }

  private scheduleSyncFlush(): void {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }
    this.syncTimeout = setTimeout(() => this.flushSync(), this.debounceMs);
  }

  private async flushSync(): Promise<void> {
    if (!this.enabled) {
      logger.warn('flushSync: Sync is disabled', { context: 'Sync' });
      return;
    }
    if (!this.status.isOnline) {
      logger.warn('flushSync: Offline, cannot sync', { context: 'Sync' });
      return;
    }
    if (!authService.isAuthenticated()) {
      logger.warn('flushSync: Not authenticated, cannot sync', { context: 'Sync' });
      return;
    }

    logger.debug('flushSync: Starting sync...', { context: 'Sync' });

    // Take snapshot of current queue
    const toSync = {
      initiatives: Array.from(this.queue.initiatives.values()),
      changes: [...this.queue.changes],
      snapshots: [...this.queue.snapshots],
      tasks: Array.from(this.queue.tasks.values())
    };

    // Clear queue before async operations
    this.queue = { initiatives: new Map(), changes: [], snapshots: [], tasks: new Map() };
    this.persistQueue();

    const errors: string[] = [];

    try {
      // Sync initiatives (upsert)
      if (toSync.initiatives.length > 0) {
        logger.debug(`Syncing ${toSync.initiatives.length} initiative(s)...`, { context: 'Sync' });
        const success = await this.syncInitiatives(toSync.initiatives);
        if (!success) {
          logger.error('Initiative sync FAILED, re-queuing', { context: 'Sync' });
          // Re-queue failed initiatives
          toSync.initiatives.forEach(i => this.queue.initiatives.set(i.id, i));
          errors.push('initiatives');
        } else {
          logger.debug('Initiative sync SUCCESS', { context: 'Sync' });
        }
      }

      // Append change logs
      if (toSync.changes.length > 0) {
        logger.debug(`Syncing ${toSync.changes.length} changelog(s)`, { context: 'Sync' });
        const success = await this.appendChangeLogs(toSync.changes);
        if (!success) {
          logger.error('Changelog sync FAILED, re-queuing', { context: 'Sync' });
          // Re-queue failed changes
          this.queue.changes.push(...toSync.changes);
          errors.push('changelog');
        } else {
          logger.debug('Changelog sync SUCCESS', { context: 'Sync' });
        }
      }

      // Sync tasks to separate Tasks sheet
      if (toSync.tasks.length > 0) {
        logger.debug(`Syncing ${toSync.tasks.length} task(s)...`, { context: 'Sync' });
        const success = await this.syncTasks(toSync.tasks);
        if (!success) {
          logger.error('Tasks sync FAILED, re-queuing', { context: 'Sync' });
          toSync.tasks.forEach(t => this.queue.tasks.set(t.task.id, t));
          errors.push('tasks');
        } else {
          logger.debug('Tasks sync SUCCESS', { context: 'Sync' });
        }
      }

      // Create snapshot tabs
      for (const snapshot of toSync.snapshots) {
        const success = await this.createSnapshotTab(snapshot);
        if (!success) {
          this.queue.snapshots.push(snapshot);
          errors.push('snapshot');
        }
      }

      if (errors.length === 0) {
        this.status.lastSync = new Date().toISOString();
        this.status.error = null;
      } else {
        this.status.error = `Failed to sync: ${errors.join(', ')}`;
      }
    } catch (error) {
      this.status.error = error instanceof Error ? error.message : 'Sync failed';
      // Re-queue everything on general failure
      toSync.initiatives.forEach(i => this.queue.initiatives.set(i.id, i));
      this.queue.changes.push(...toSync.changes);
      this.queue.snapshots.push(...toSync.snapshots);
    }

    this.updatePendingCount();
    this.persistQueue();
  }

  private async syncInitiatives(initiatives: Initiative[]): Promise<boolean> {
    try {
      // Filter out any undefined/null initiatives to prevent errors
      const validInitiatives = initiatives.filter(i => {
        if (!i) {
          logger.warn('Found undefined initiative in sync queue, skipping', { context: 'Sync' });
          return false;
        }
        if (!i.id) {
          logger.warn('Found initiative without ID in sync queue, skipping', { context: 'Sync' });
          return false;
        }
        return true;
      });
      
      if (validInitiatives.length === 0) {
        logger.warn('No valid initiatives to sync after filtering', { context: 'Sync' });
        return true; // Nothing to sync, but not an error
      }
      
      if (validInitiatives.length !== initiatives.length) {
        logger.warn(`Filtered out ${initiatives.length - validInitiatives.length} invalid initiative(s)`, { context: 'Sync' });
      }
      
      logger.debug(`POST ${API_ENDPOINT}/api/sheets/initiatives with ${validInitiatives.length} initiative(s)`, { context: 'Sync' });
      const response = await fetch(`${API_ENDPOINT}/api/sheets/initiatives`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ initiatives: validInitiatives.map(flattenInitiative) })
      });
      
      logger.debug(`Response status: ${response.status}`, { context: 'Sync' });
      
      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Sync initiatives failed', { context: 'SheetsSyncManager.syncInitiatives', metadata: { status: response.status, errorText: errorText.substring(0, 100) } });
        const errorMsg = errorText.length > 0 ? errorText.substring(0, 100) : response.statusText;
        this.status.error = `Sync failed (${response.status}): ${errorMsg}`;
        this.notify();
        return false;
      }
      
      // Parse response and check for server-newer items (last-write-wins)
      const result = await response.json();
      
      if (result.serverNewer && result.serverNewer.length > 0) {
        // Server had newer data - log it but don't treat as error
        // The data will be refreshed on next pull
        logger.info('Some items had newer server data (last-write-wins)', { 
          context: 'SheetsSyncManager.syncInitiatives', 
          metadata: { count: result.serverNewer.length } 
        });
        logger.info(`${result.serverNewer.length} item(s) skipped - server has newer data`, { context: 'Sync' });
      }
      
      return true;
    } catch (error) {
      logger.error('Sync initiatives error', { context: 'SheetsSyncManager.syncInitiatives', error: error instanceof Error ? error : new Error(String(error)) });
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        this.status.error = 'Cannot connect to server. Make sure the backend server is running on port 3001.';
      } else {
        this.status.error = error instanceof Error ? error.message : 'Network error';
      }
      this.notify();
      return false;
    }
  }

  private async appendChangeLogs(changes: ChangeRecord[]): Promise<boolean> {
    try {
      const response = await fetch(`${API_ENDPOINT}/api/sheets/changelog`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ changes: changes.map(flattenChangeRecord) })
      });
      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Sync changelog failed', { context: 'SheetsSyncManager.appendChangeLogs', metadata: { status: response.status, errorText: errorText.substring(0, 100) } });
        const errorMsg = errorText.length > 0 ? errorText.substring(0, 100) : response.statusText;
        this.status.error = `Changelog sync failed (${response.status}): ${errorMsg}`;
        this.notify();
      }
      return response.ok;
    } catch (error) {
      logger.error('Sync changelog error', { context: 'SheetsSyncManager.appendChangeLogs', error: error instanceof Error ? error : new Error(String(error)) });
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        this.status.error = 'Cannot connect to server. Make sure the backend server is running on port 3001.';
      } else {
        this.status.error = error instanceof Error ? error.message : 'Network error';
      }
      this.notify();
      return false;
    }
  }

  private async syncTasks(tasksWithParent: TaskWithParent[]): Promise<boolean> {
    try {
      const flatTasks = tasksWithParent.map(({ task, initiative }) => flattenTask(task, initiative));
      logger.debug(`POST ${API_ENDPOINT}/api/sheets/tasks with ${flatTasks.length} task(s)`, { context: 'Sync' });
      
      const response = await fetch(`${API_ENDPOINT}/api/sheets/tasks`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ tasks: flatTasks })
      });
      
      logger.debug(`Tasks response status: ${response.status}`, { context: 'Sync' });
      
      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Sync tasks failed', { context: 'SheetsSyncManager.syncTasks', metadata: { status: response.status, errorText: errorText.substring(0, 100) } });
        const errorMsg = errorText.length > 0 ? errorText.substring(0, 100) : response.statusText;
        this.status.error = `Tasks sync failed (${response.status}): ${errorMsg}`;
        this.notify();
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Sync tasks error', { context: 'SheetsSyncManager.syncTasks', error: error instanceof Error ? error : new Error(String(error)) });
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        this.status.error = 'Cannot connect to server. Make sure the backend server is running on port 3001.';
      } else {
        this.status.error = error instanceof Error ? error.message : 'Network error';
      }
      this.notify();
      return false;
    }
  }

  private async createSnapshotTab(snapshot: Snapshot): Promise<boolean> {
    try {
      logger.debug('createSnapshotTab called', { context: 'Sync', metadata: { 
        hasData: !!(snapshot?.data), 
        dataLength: Array.isArray(snapshot?.data) ? snapshot.data.length : 0,
        snapshotId: snapshot?.id
      }});

      // Validate snapshot data before sending
      if (!snapshot) {
        const errorMsg = 'Snapshot is missing';
        logger.error('Snapshot validation failed', { context: 'Sync', metadata: { error: errorMsg } });
        logger.error('Create snapshot failed', { context: 'SheetsSyncManager.createSnapshotTab', metadata: { error: errorMsg } });
        this.status.error = `Snapshot failed: ${errorMsg}`;
        this.notify();
        return false;
      }

      // If snapshot.data is missing or empty, try to fetch current initiatives from server
      let snapshotData = snapshot.data;
      if (!snapshotData || !Array.isArray(snapshotData) || snapshotData.length === 0) {
        logger.debug('Snapshot data is empty, fetching from server...', { context: 'Sync' });
        try {
          const response = await fetch(`${API_ENDPOINT}/api/sheets/pull`, {
            method: 'GET',
            headers: this.getHeaders()
          });
          
          if (response.ok) {
            const pullData = await response.json();
            if (pullData.initiatives && Array.isArray(pullData.initiatives) && pullData.initiatives.length > 0) {
              snapshotData = pullData.initiatives;
              logger.info(`Fetched ${snapshotData.length} initiatives from server as fallback`, { context: 'Sync' });
            } else {
              const errorMsg = 'Snapshot data is empty and no initiatives found on server';
              logger.error('Create snapshot failed', { context: 'Sync', metadata: { error: errorMsg } });
              this.status.error = `Snapshot failed: ${errorMsg}`;
              this.notify();
              return false;
            }
          } else {
            const errorMsg = 'Failed to fetch initiatives from server as fallback';
            logger.error('Create snapshot failed', { context: 'Sync', metadata: { error: errorMsg } });
            this.status.error = `Snapshot failed: ${errorMsg}`;
            this.notify();
            return false;
          }
        } catch (fetchError) {
          const errorMsg = 'Snapshot data is empty and cannot fetch from server';
          logger.error('Create snapshot failed', { context: 'Sync', metadata: { error: errorMsg }, error: fetchError as Error });
          this.status.error = `Snapshot failed: ${errorMsg}`;
          this.notify();
          return false;
        }
      }

      // Update snapshot with fetched data if needed
      if (snapshotData !== snapshot.data) {
        snapshot = { ...snapshot, data: snapshotData };
      }

      logger.debug(`Validated snapshot: ${snapshotData.length} initiatives, flattening data...`, { context: 'Sync' });

      // Flatten initiatives for sending
      const flattenedData = snapshotData.map((initiative, index) => {
        try {
          const flattened = flattenInitiative(initiative);
          return flattened;
        } catch (flattenError) {
          logger.error(`Error flattening initiative ${index}`, { context: 'Sync', error: flattenError as Error });
          throw flattenError;
        }
      });
      
      if (flattenedData.length === 0) {
        const errorMsg = 'Failed to flatten snapshot data';
        logger.error('Snapshot flattening failed', { context: 'Sync', metadata: { error: errorMsg } });
        this.status.error = `Snapshot failed: ${errorMsg}`;
        this.notify();
        return false;
      }

      logger.debug(`Flattened ${flattenedData.length} initiatives, sending to server...`, { context: 'Sync' });

      const requestBody = {
        snapshot: {
          ...snapshot,
          data: flattenedData
        }
      };

      logger.debug('Sending snapshot request', { context: 'Sync', metadata: { snapshotId: requestBody.snapshot.id, dataCount: flattenedData.length } });

      const response = await fetch(`${API_ENDPOINT}/api/sheets/snapshot`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        const errorTextStr = String(errorText || '');
        logger.error('Snapshot creation failed', { context: 'Sync', metadata: { status: response.status, errorText: errorTextStr.substring(0, 100) } });
        const errorMsg = errorTextStr.length > 0 ? errorTextStr.substring(0, 100) : response.statusText;
        this.status.error = `Snapshot failed (${response.status}): ${errorMsg}`;
        this.notify();
        return false;
      }

      const result = await response.json();
      logger.info('Snapshot created successfully', { context: 'Sync', metadata: { tabName: result.tabName, count: result.count } });
      
      // If this snapshot came from a version, mark it as synced
      // The snapshot.id should match the version id
      if (snapshot.id && snapshot.id.startsWith('version-')) {
        try {
          const { getVersionService } = await import('./versionService');
          const versionService = getVersionService();
          versionService.markSyncedToSheets(snapshot.id, result.tabName);
        } catch (error) {
          // Log but don't fail if version service is not available
          logger.warn('Could not mark version as synced', { context: 'Sync', error: error as Error });
        }
      }
      
      return true;
    } catch (error) {
      logger.error('Snapshot creation error', { context: 'Sync', error: error instanceof Error ? error : new Error(String(error)) });
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        this.status.error = 'Cannot connect to server. Make sure the backend server is running on port 3001.';
      } else {
        this.status.error = error instanceof Error ? error.message : 'Network error';
      }
      this.notify();
      return false;
    }
  }

  private persistQueue(): void {
    try {
      sessionStorage.setItem(
        'sheets-sync-queue',
        JSON.stringify({
          initiatives: Array.from(this.queue.initiatives.entries()),
          changes: this.queue.changes,
          snapshots: this.queue.snapshots,
          tasks: Array.from(this.queue.tasks.entries())
        })
      );
    } catch {
      // Ignore storage errors
    }
  }

}

// Singleton instance
export const sheetsSync = new SheetsSyncManager();
