// Google Sheets Sync Service - Primary Mode
// Google Sheets is the primary data source, localStorage is fallback cache

import { Initiative, ChangeRecord, Snapshot, AppConfig, User } from '../types';
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

interface SyncQueue {
  initiatives: Map<string, Initiative>; // Deduped by ID
  changes: ChangeRecord[];
  snapshots: Snapshot[];
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
  return {
    id: i.id,
    l1_assetClass: i.l1_assetClass,
    l2_pillar: i.l2_pillar,
    l3_responsibility: i.l3_responsibility,
    l4_target: i.l4_target,
    title: i.title,
    ownerId: i.ownerId,
    secondaryOwner: i.secondaryOwner || '',
    quarter: i.quarter,
    status: i.status,
    priority: i.priority,
    estimatedEffort: i.estimatedEffort ?? 0,
    originalEstimatedEffort: i.originalEstimatedEffort ?? 0,
    actualEffort: i.actualEffort ?? 0,
    eta: i.eta ?? '',
    originalEta: i.originalEta ?? '',
    lastUpdated: i.lastUpdated ?? '',
    dependencies: i.dependencies?.map(d => `${d.team} (${d.deliverable || 'N/A'}, ETA: ${d.eta || 'N/A'})`).join('; ') || '',
    workType: i.workType,
    unplannedTags: JSON.stringify(i.unplannedTags || []),
    riskActionLog: i.riskActionLog || '',
    comments: JSON.stringify(i.comments || []),
    history: JSON.stringify(i.history || [])
  };
}

export function flattenChangeRecord(c: ChangeRecord): Record<string, string> {
  return {
    id: c.id,
    initiativeId: c.initiativeId,
    initiativeTitle: c.initiativeTitle,
    field: c.field,
    oldValue: String(c.oldValue ?? ''),
    newValue: String(c.newValue ?? ''),
    changedBy: c.changedBy,
    timestamp: c.timestamp
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
// SYNC QUEUE MANAGER
// ============================================
class SheetsSyncManager {
  private queue: SyncQueue = {
    initiatives: new Map(),
    changes: [],
    snapshots: []
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
  async loadInitiatives(): Promise<Initiative[]> {
    this.status.isLoading = true;
    this.notify();

    try {
      // Try to load from Google Sheets first
      if (this.status.isOnline && authService.isAuthenticated()) {
        const data = await this.pullFromSheets();
        if (data && data.initiatives.length > 0) {
          // Deduplicate initiatives by ID (keep first occurrence) before caching
          const seenIds = new Set<string>();
          const deduplicated = data.initiatives.filter((init: Initiative) => {
            if (seenIds.has(init.id)) {
              logger.warn('Found duplicate initiative ID', { context: 'SheetsSyncManager.loadInitiatives', metadata: { id: init.id } });
              return false;
            }
            seenIds.add(init.id);
            return true;
          });

          if (data.initiatives.length !== deduplicated.length) {
            logger.info('Deduplicated initiatives from Sheets', { 
              context: 'SheetsSyncManager.loadInitiatives', 
              metadata: { before: data.initiatives.length, after: deduplicated.length, removed: data.initiatives.length - deduplicated.length } 
            });
          }

          // Cache deduplicated initiatives to localStorage for offline access
          cacheToLocalStorage(deduplicated);
          this.status.isLoading = false;
          this.status.lastSync = new Date().toISOString();
          this.notify();
          return deduplicated;
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
        this.status.isLoading = false;
        this.status.error = this.status.isOnline ? 'Using cached data - Sheets empty or unavailable' : 'Offline - using cached data';
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
    if (!this.enabled) return;

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
    if (!this.enabled) return;

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
  async deleteInitiative(id: string): Promise<boolean> {
    if (!this.status.isOnline) {
      this.status.error = 'Offline - cannot delete from Sheets';
      this.notify();
      return false;
    }

    try {
      const response = await fetch(`${API_ENDPOINT}/api/sheets/initiatives/${id}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });

      if (response.status === 401 || response.status === 403) {
        this.status.error = 'Authentication required';
        this.notify();
        return false;
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `Delete failed: ${response.statusText}`);
      }

      // Remove from localStorage cache
      try {
        const cached = loadFromLocalStorageCache() || [];
        const filtered = cached.filter((init: Initiative) => init.id !== id);
        cacheToLocalStorage(filtered);
      } catch {
        // Ignore cache errors
      }

      // Remove from queue if it was queued
      this.queue.initiatives.delete(id);
      this.updatePendingCount();
      this.persistQueue();

      this.status.error = null;
      this.notify();
      return true;
    } catch (error) {
      logger.error('Failed to delete initiative', { context: 'SheetsSyncManager.deleteInitiative', error: error instanceof Error ? error : new Error(String(error)) });
      this.status.error = error instanceof Error ? error.message : 'Delete failed';
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
    this.queue = { initiatives: new Map(), changes: [], snapshots: [] };
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
      this.queue.snapshots.length
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
    if (!this.enabled || !this.status.isOnline || !authService.isAuthenticated()) {
      return;
    }

    // Take snapshot of current queue
    const toSync = {
      initiatives: Array.from(this.queue.initiatives.values()),
      changes: [...this.queue.changes],
      snapshots: [...this.queue.snapshots]
    };

    // Clear queue before async operations
    this.queue = { initiatives: new Map(), changes: [], snapshots: [] };
    this.persistQueue();

    const errors: string[] = [];

    try {
      // Sync initiatives (upsert)
      if (toSync.initiatives.length > 0) {
        const success = await this.syncInitiatives(toSync.initiatives);
        if (!success) {
          // Re-queue failed initiatives
          toSync.initiatives.forEach(i => this.queue.initiatives.set(i.id, i));
          errors.push('initiatives');
        }
      }

      // Append change logs
      if (toSync.changes.length > 0) {
        const success = await this.appendChangeLogs(toSync.changes);
        if (!success) {
          // Re-queue failed changes
          this.queue.changes.push(...toSync.changes);
          errors.push('changelog');
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
      const response = await fetch(`${API_ENDPOINT}/api/sheets/initiatives`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ initiatives: initiatives.map(flattenInitiative) })
      });
      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Sync initiatives failed', { context: 'SheetsSyncManager.syncInitiatives', metadata: { status: response.status, errorText: errorText.substring(0, 100) } });
        const errorMsg = errorText.length > 0 ? errorText.substring(0, 100) : response.statusText;
        this.status.error = `Sync failed (${response.status}): ${errorMsg}`;
        this.notify();
      }
      return response.ok;
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

  private async createSnapshotTab(snapshot: Snapshot): Promise<boolean> {
    try {
      const response = await fetch(`${API_ENDPOINT}/api/sheets/snapshot`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          snapshot: {
            ...snapshot,
            data: snapshot.data.map(flattenInitiative)
          }
        })
      });
      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Create snapshot failed', { context: 'SheetsSyncManager.createSnapshotTab', metadata: { status: response.status, errorText: errorText.substring(0, 100) } });
        const errorMsg = errorText.length > 0 ? errorText.substring(0, 100) : response.statusText;
        this.status.error = `Snapshot failed (${response.status}): ${errorMsg}`;
        this.notify();
      }
      return response.ok;
    } catch (error) {
      logger.error('Create snapshot error', { context: 'SheetsSyncManager.createSnapshotTab', error: error instanceof Error ? error : new Error(String(error)) });
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
          snapshots: this.queue.snapshots
        })
      );
    } catch {
      // Ignore storage errors
    }
  }

}

// Singleton instance
export const sheetsSync = new SheetsSyncManager();
