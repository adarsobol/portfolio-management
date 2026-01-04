/**
 * Google Cloud Storage Backend
 *
 * Provides data persistence using Google Cloud Storage buckets.
 * This will replace Google Sheets as the primary data store.
 */
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
export class GCSStorage {
    config;
    storage; // Will be typed when @google-cloud/storage is installed
    bucket;
    initialized = false;
    constructor(config) {
        this.config = config;
    }
    /**
     * Initialize the GCS client
     * This is async because we need to load the Storage class dynamically
     */
    async initialize() {
        if (this.initialized)
            return true;
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
        }
        catch (error) {
            console.error('Failed to initialize GCS Storage:', error);
            return false;
        }
    }
    /**
     * Check if GCS is available and connected
     */
    async isHealthy() {
        if (!this.initialized)
            return false;
        try {
            // @ts-expect-error - Dynamic typing for optional package
            const [exists] = await this.bucket.exists();
            return exists;
        }
        catch {
            return false;
        }
    }
    // ============================================
    // INITIATIVES
    // ============================================
    async loadInitiatives() {
        if (!this.initialized)
            throw new Error('GCS not initialized');
        try {
            // @ts-expect-error - Dynamic typing for optional package
            const file = this.bucket.file(PATHS.INITIATIVES);
            const [exists] = await file.exists();
            if (!exists) {
                return [];
            }
            const [contents] = await file.download();
            return JSON.parse(contents.toString());
        }
        catch (error) {
            console.error('Failed to load initiatives from GCS:', error);
            throw error;
        }
    }
    async saveInitiatives(initiatives) {
        if (!this.initialized)
            throw new Error('GCS not initialized');
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
        }
        catch (error) {
            console.error('Failed to save initiatives to GCS:', error);
            return false;
        }
    }
    async upsertInitiative(initiative) {
        const initiatives = await this.loadInitiatives();
        const index = initiatives.findIndex(i => i.id === initiative.id);
        if (index >= 0) {
            initiatives[index] = initiative;
        }
        else {
            initiatives.push(initiative);
        }
        return this.saveInitiatives(initiatives);
    }
    async deleteInitiative(id) {
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
    async appendChangelog(change) {
        if (!this.initialized)
            throw new Error('GCS not initialized');
        try {
            // @ts-expect-error - Dynamic typing for optional package
            const file = this.bucket.file(PATHS.CHANGELOG);
            const [exists] = await file.exists();
            let changelog = [];
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
        }
        catch (error) {
            console.error('Failed to append changelog to GCS:', error);
            return false;
        }
    }
    async getChangelog(initiativeId) {
        if (!this.initialized)
            throw new Error('GCS not initialized');
        try {
            // @ts-expect-error - Dynamic typing for optional package
            const file = this.bucket.file(PATHS.CHANGELOG);
            const [exists] = await file.exists();
            if (!exists) {
                return [];
            }
            const [contents] = await file.download();
            const changelog = JSON.parse(contents.toString());
            if (initiativeId) {
                return changelog.filter(c => c.initiativeId === initiativeId);
            }
            return changelog;
        }
        catch (error) {
            console.error('Failed to get changelog from GCS:', error);
            return [];
        }
    }
    // ============================================
    // SNAPSHOTS
    // ============================================
    async createSnapshot(snapshot) {
        if (!this.initialized)
            throw new Error('GCS not initialized');
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
        }
        catch (error) {
            console.error('Failed to create snapshot in GCS:', error);
            return false;
        }
    }
    async listSnapshots() {
        if (!this.initialized)
            throw new Error('GCS not initialized');
        try {
            // @ts-expect-error - Dynamic typing for optional package
            const [files] = await this.bucket.getFiles({ prefix: PATHS.SNAPSHOTS_DIR });
            return files.map((file) => ({
                id: file.name.replace(PATHS.SNAPSHOTS_DIR, '').replace('.json', ''),
                timestamp: file.metadata?.metadata?.timestamp || ''
            }));
        }
        catch (error) {
            console.error('Failed to list snapshots from GCS:', error);
            return [];
        }
    }
    async loadSnapshot(id) {
        if (!this.initialized)
            throw new Error('GCS not initialized');
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
        }
        catch (error) {
            console.error('Failed to load snapshot from GCS:', error);
            return null;
        }
    }
    // ============================================
    // NOTIFICATIONS
    // ============================================
    /**
     * Get the file path for a user's notifications
     */
    getNotificationFilePath(userId) {
        return `${PATHS.NOTIFICATIONS_DIR}${userId}.json`;
    }
    /**
     * Load notifications for a specific user
     */
    async loadNotifications(userId) {
        if (!this.initialized)
            throw new Error('GCS not initialized');
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
        }
        catch (error) {
            console.error(`Failed to load notifications for user ${userId} from GCS:`, error);
            return [];
        }
    }
    /**
     * Save all notifications for a user (overwrites existing)
     */
    async saveNotifications(userId, notifications) {
        if (!this.initialized)
            throw new Error('GCS not initialized');
        try {
            const filePath = this.getNotificationFilePath(userId);
            // @ts-expect-error - Dynamic typing for optional package
            const file = this.bucket.file(filePath);
            // Keep only last 100 notifications per user to prevent unbounded growth
            const trimmedNotifications = notifications.slice(0, 100);
            await file.save(JSON.stringify(trimmedNotifications, null, 2), {
                contentType: 'application/json',
                metadata: {
                    cacheControl: 'private, max-age=0'
                }
            });
            return true;
        }
        catch (error) {
            console.error(`Failed to save notifications for user ${userId} to GCS:`, error);
            return false;
        }
    }
    /**
     * Add a new notification for a user
     */
    async addNotification(userId, notification) {
        try {
            const notifications = await this.loadNotifications(userId);
            notifications.unshift(notification); // Add to beginning (newest first)
            return this.saveNotifications(userId, notifications);
        }
        catch (error) {
            console.error(`Failed to add notification for user ${userId}:`, error);
            return false;
        }
    }
    /**
     * Mark a notification as read
     */
    async markNotificationRead(userId, notificationId) {
        try {
            const notifications = await this.loadNotifications(userId);
            const index = notifications.findIndex(n => n.id === notificationId);
            if (index === -1) {
                return false; // Notification not found
            }
            notifications[index].read = true;
            return this.saveNotifications(userId, notifications);
        }
        catch (error) {
            console.error(`Failed to mark notification ${notificationId} as read:`, error);
            return false;
        }
    }
    /**
     * Mark all notifications as read for a user
     */
    async markAllNotificationsRead(userId) {
        try {
            const notifications = await this.loadNotifications(userId);
            const updatedNotifications = notifications.map(n => ({ ...n, read: true }));
            return this.saveNotifications(userId, updatedNotifications);
        }
        catch (error) {
            console.error(`Failed to mark all notifications as read for user ${userId}:`, error);
            return false;
        }
    }
    /**
     * Clear all notifications for a user
     */
    async clearNotifications(userId) {
        try {
            return this.saveNotifications(userId, []);
        }
        catch (error) {
            console.error(`Failed to clear notifications for user ${userId}:`, error);
            return false;
        }
    }
}
// ============================================
// FACTORY & SINGLETON
// ============================================
let gcsInstance = null;
export function getGCSStorage() {
    return gcsInstance;
}
export async function initializeGCSStorage(config) {
    if (gcsInstance)
        return gcsInstance;
    gcsInstance = new GCSStorage(config);
    const success = await gcsInstance.initialize();
    if (!success) {
        gcsInstance = null;
        return null;
    }
    return gcsInstance;
}
export function isGCSEnabled() {
    return !!(process.env.GCS_BUCKET_NAME && process.env.GCS_PROJECT_ID);
}
export function getGCSConfig() {
    if (!isGCSEnabled())
        return null;
    return {
        bucketName: process.env.GCS_BUCKET_NAME,
        projectId: process.env.GCS_PROJECT_ID,
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    };
}
