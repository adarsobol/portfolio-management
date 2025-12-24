/**
 * Data Service Abstraction
 * 
 * Provides a unified interface for data persistence that can work with
 * different backends (Google Sheets, Google Cloud Storage, etc.)
 */

import { Initiative, ChangeRecord, Snapshot, AppConfig, User } from '../types';
import { logger } from '../utils/logger';

// ============================================
// INTERFACES
// ============================================

export interface DataServiceConfig {
  type: 'sheets' | 'gcs' | 'local';
  apiEndpoint?: string;
  bucketName?: string;
  projectId?: string;
}

export interface SyncStatus {
  lastSync: string | null;
  pending: number;
  error: string | null;
  isOnline: boolean;
  isLoading: boolean;
}

export interface DataService {
  // Configuration
  readonly config: DataServiceConfig;
  
  // Status
  getStatus(): SyncStatus;
  subscribe(callback: (status: SyncStatus) => void): () => void;
  
  // Initiatives
  loadInitiatives(): Promise<Initiative[]>;
  saveInitiative(initiative: Initiative): Promise<boolean>;
  saveInitiatives(initiatives: Initiative[]): Promise<boolean>;
  deleteInitiative(id: string): Promise<boolean>;
  
  // Change Log
  appendChangeLog(change: ChangeRecord): Promise<boolean>;
  getChangeLog(initiativeId?: string): Promise<ChangeRecord[]>;
  
  // Snapshots
  createSnapshot(snapshot: Snapshot): Promise<boolean>;
  getSnapshots(): Promise<Snapshot[]>;
  
  // Config & Users (optional, may be stored differently)
  loadConfig?(): Promise<AppConfig | null>;
  saveConfig?(config: AppConfig): Promise<boolean>;
  loadUsers?(): Promise<User[]>;
  saveUsers?(users: User[]): Promise<boolean>;
}

// ============================================
// ABSTRACT BASE CLASS
// ============================================

export abstract class BaseDataService implements DataService {
  abstract readonly config: DataServiceConfig;
  
  protected status: SyncStatus = {
    lastSync: null,
    pending: 0,
    error: null,
    isOnline: navigator.onLine,
    isLoading: false
  };
  
  protected listeners: Set<(status: SyncStatus) => void> = new Set();
  
  constructor() {
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.status.isOnline = true;
      this.notifyListeners();
    });
    
    window.addEventListener('offline', () => {
      this.status.isOnline = false;
      this.notifyListeners();
    });
  }
  
  getStatus(): SyncStatus {
    return { ...this.status };
  }
  
  subscribe(callback: (status: SyncStatus) => void): () => void {
    this.listeners.add(callback);
    callback(this.status);
    return () => this.listeners.delete(callback);
  }
  
  protected notifyListeners(): void {
    this.listeners.forEach(cb => cb({ ...this.status }));
  }
  
  protected setLoading(loading: boolean): void {
    this.status.isLoading = loading;
    this.notifyListeners();
  }
  
  protected setError(error: string | null): void {
    this.status.error = error;
    this.notifyListeners();
  }
  
  protected setLastSync(): void {
    this.status.lastSync = new Date().toISOString();
    this.status.error = null;
    this.notifyListeners();
  }
  
  // Abstract methods to be implemented by concrete services
  abstract loadInitiatives(): Promise<Initiative[]>;
  abstract saveInitiative(initiative: Initiative): Promise<boolean>;
  abstract saveInitiatives(initiatives: Initiative[]): Promise<boolean>;
  abstract deleteInitiative(id: string): Promise<boolean>;
  abstract appendChangeLog(change: ChangeRecord): Promise<boolean>;
  abstract getChangeLog(initiativeId?: string): Promise<ChangeRecord[]>;
  abstract createSnapshot(snapshot: Snapshot): Promise<boolean>;
  abstract getSnapshots(): Promise<Snapshot[]>;
}

// ============================================
// LOCAL STORAGE CACHE HELPERS
// ============================================

const CACHE_KEY = 'portfolio-initiatives-cache';
const CACHE_TIMESTAMP_KEY = 'portfolio-initiatives-cache-timestamp';

export function cacheToLocalStorage(initiatives: Initiative[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(initiatives));
    localStorage.setItem(CACHE_TIMESTAMP_KEY, new Date().toISOString());
  } catch {
    logger.warn('Failed to cache data to localStorage', { context: 'DataService' });
  }
}

export function loadFromLocalStorageCache(): Initiative[] | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    logger.warn('Failed to load from localStorage cache', { context: 'DataService' });
  }
  return null;
}

export function getCacheTimestamp(): string | null {
  return localStorage.getItem(CACHE_TIMESTAMP_KEY);
}

// ============================================
// FACTORY FUNCTION
// ============================================

export function createDataService(config: DataServiceConfig): DataService {
  switch (config.type) {
    case 'gcs':
      // GCS service will be implemented when GCS becomes available
      throw new Error('GCS data service not yet implemented');
    case 'local':
      throw new Error('Local-only data service not yet implemented');
    case 'sheets':
    default:
      // Use the existing sheets sync service
      // This is imported dynamically to avoid circular dependencies
      throw new Error('Use sheetsSync directly for Google Sheets');
  }
}

// ============================================
// SERVICE TYPE DETECTION
// ============================================

export function getDefaultServiceConfig(): DataServiceConfig {
  // Check environment for GCS configuration
  if (typeof process !== 'undefined' && process.env?.GCS_BUCKET_NAME) {
    return {
      type: 'gcs',
      bucketName: process.env.GCS_BUCKET_NAME,
      projectId: process.env.GCS_PROJECT_ID
    };
  }
  
  // Default to sheets for now
  return {
    type: 'sheets',
    apiEndpoint: import.meta.env.VITE_API_ENDPOINT || ''
  };
}
