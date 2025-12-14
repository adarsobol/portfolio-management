/**
 * Google Cloud Storage Backend
 * 
 * Provides data persistence using Google Cloud Storage buckets.
 * This will replace Google Sheets as the primary data store.
 */

// Note: This module requires @google-cloud/storage package
// Install with: npm install @google-cloud/storage

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
  SNAPSHOTS_DIR: 'snapshots/'
};

// ============================================
// GCS STORAGE CLASS
// ============================================

export class GCSStorage {
  private config: GCSConfig;
  private storage: unknown; // Will be typed when @google-cloud/storage is installed
  private bucket: unknown;
  private initialized = false;

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
