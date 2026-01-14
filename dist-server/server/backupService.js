/**
 * Backup Service
 *
 * Provides backup management and restoration capabilities for the Portfolio Manager.
 * Works with GCS object versioning and weekly backup snapshots (Thursday at 6 PM).
 *
 * Features:
 * - List available backups
 * - List object versions
   * - Restore from weekly backups
 * - Restore specific object versions
 * - Create manual backups
 * - Verify backup integrity
 */
// ============================================
// BACKUP SERVICE CLASS
// ============================================
export class BackupService {
    storage;
    bucket;
    bucketName;
    initialized = false;
    DATA_PREFIX = 'data/';
    BACKUPS_PREFIX = 'backups/';
    constructor(bucketName, projectId) {
        this.bucketName = bucketName;
        this.initStorage(projectId);
    }
    /**
     * Initialize the GCS storage client
     */
    async initStorage(projectId) {
        try {
            const { Storage } = await import('@google-cloud/storage');
            this.storage = new Storage({ projectId });
            this.bucket = this.storage.bucket(this.bucketName);
            this.initialized = true;
            console.log(`BackupService initialized with bucket: ${this.bucketName}`);
        }
        catch (error) {
            console.error('Failed to initialize BackupService:', error);
        }
    }
    /**
     * Ensure storage is initialized
     */
    async ensureInitialized() {
        if (!this.initialized) {
            // Wait a bit for async initialization
            await new Promise(resolve => setTimeout(resolve, 100));
            if (!this.initialized) {
                throw new Error('BackupService not initialized');
            }
        }
    }
    // ============================================
    // LIST BACKUPS
    // ============================================
    /**
     * List all available weekly backups
     */
    async listBackups() {
        await this.ensureInitialized();
        try {
            // List all manifest files in backups/
            const [files] = await this.bucket.getFiles({
                prefix: this.BACKUPS_PREFIX,
                delimiter: '/'
            });
            // Get unique date prefixes
            const [, , apiResponse] = await this.bucket.getFiles({
                prefix: this.BACKUPS_PREFIX,
                delimiter: '/'
            });
            const prefixes = apiResponse?.prefixes || [];
            const backups = [];
            for (const prefix of prefixes) {
                // Extract date from prefix (backups/2025-12-25/)
                const dateMatch = prefix.match(/backups\/(\d{4}-\d{2}-\d{2})\//);
                if (!dateMatch)
                    continue;
                const date = dateMatch[1];
                const manifestPath = `${prefix}manifest.json`;
                try {
                    const manifestFile = this.bucket.file(manifestPath);
                    const [exists] = await manifestFile.exists();
                    if (exists) {
                        const [contents] = await manifestFile.download();
                        const manifest = JSON.parse(contents.toString());
                        backups.push({
                            date: manifest.date,
                            path: prefix,
                            files: manifest.files.length,
                            totalSize: manifest.totalSize,
                            status: manifest.status,
                            timestamp: manifest.timestamp
                        });
                    }
                }
                catch (error) {
                    console.error(`Failed to read manifest for ${date}:`, error);
                }
            }
            // Sort by date descending
            backups.sort((a, b) => b.date.localeCompare(a.date));
            return backups;
        }
        catch (error) {
            console.error('Failed to list backups:', error);
            throw error;
        }
    }
    /**
     * Get detailed backup information for a specific date
     */
    async getBackupDetails(date) {
        await this.ensureInitialized();
        try {
            const manifestPath = `${this.BACKUPS_PREFIX}${date}/manifest.json`;
            const manifestFile = this.bucket.file(manifestPath);
            const [exists] = await manifestFile.exists();
            if (!exists) {
                return null;
            }
            const [contents] = await manifestFile.download();
            return JSON.parse(contents.toString());
        }
        catch (error) {
            console.error(`Failed to get backup details for ${date}:`, error);
            return null;
        }
    }
    // ============================================
    // LIST OBJECT VERSIONS
    // ============================================
    /**
     * List all versions of a specific file
     */
    async listObjectVersions(filePath) {
        await this.ensureInitialized();
        try {
            // Ensure path starts with data/ if not already
            const fullPath = filePath.startsWith(this.DATA_PREFIX)
                ? filePath
                : this.DATA_PREFIX + filePath;
            const [files] = await this.bucket.getFiles({
                prefix: fullPath,
                versions: true
            });
            const versions = [];
            for (const file of files) {
                if (file.name !== fullPath)
                    continue;
                const [metadata] = await file.getMetadata();
                versions.push({
                    versionId: metadata.generation || file.generation,
                    timestamp: metadata.updated || metadata.timeCreated,
                    size: parseInt(metadata.size, 10) || 0,
                    isLatest: !metadata.timeDeleted,
                    md5Hash: metadata.md5Hash
                });
            }
            // Sort by timestamp descending
            versions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            return versions;
        }
        catch (error) {
            console.error(`Failed to list versions for ${filePath}:`, error);
            throw error;
        }
    }
    // ============================================
    // RESTORE FROM BACKUP
    // ============================================
    /**
     * Restore all data from a weekly backup
     */
    async restoreFromBackup(date, specificFiles) {
        await this.ensureInitialized();
        const result = {
            success: false,
            filesRestored: 0,
            errors: [],
            timestamp: new Date().toISOString(),
            backupDate: date
        };
        try {
            // Get backup manifest
            const manifest = await this.getBackupDetails(date);
            if (!manifest) {
                result.errors.push(`Backup for ${date} not found`);
                return result;
            }
            // Create a restore point before overwriting (save current state)
            await this.createRestorePoint();
            const backupPath = `${this.BACKUPS_PREFIX}${date}/`;
            // Determine which files to restore
            const filesToRestore = specificFiles
                ? manifest.files.filter(f => specificFiles.includes(f.name))
                : manifest.files.filter(f => f.path.includes(this.DATA_PREFIX.replace('/', '')));
            // Restore each file
            for (const fileInfo of filesToRestore) {
                try {
                    const backupFilePath = backupPath + fileInfo.name;
                    const targetPath = this.DATA_PREFIX + fileInfo.name;
                    const sourceFile = this.bucket.file(backupFilePath);
                    const [exists] = await sourceFile.exists();
                    if (!exists) {
                        result.errors.push(`Backup file not found: ${backupFilePath}`);
                        continue;
                    }
                    // Copy backup file to data directory
                    await sourceFile.copy(this.bucket.file(targetPath));
                    result.filesRestored++;
                    console.log(`Restored: ${fileInfo.name}`);
                }
                catch (error) {
                    result.errors.push(`Failed to restore ${fileInfo.name}: ${error}`);
                }
            }
            result.success = result.filesRestored > 0 && result.errors.length === 0;
            console.log(`Restore completed: ${result.filesRestored} files, ${result.errors.length} errors`);
            return result;
        }
        catch (error) {
            result.errors.push(`Restore failed: ${error}`);
            return result;
        }
    }
    /**
     * Restore a specific version of a file
     */
    async restoreObjectVersion(filePath, versionId) {
        await this.ensureInitialized();
        const result = {
            success: false,
            filesRestored: 0,
            errors: [],
            timestamp: new Date().toISOString(),
            versionId
        };
        try {
            // Ensure path starts with data/ if not already
            const fullPath = filePath.startsWith(this.DATA_PREFIX)
                ? filePath
                : this.DATA_PREFIX + filePath;
            // Create a restore point before overwriting
            await this.createRestorePoint();
            // Get the specific version
            const sourceFile = this.bucket.file(fullPath, { generation: versionId });
            const [exists] = await sourceFile.exists();
            if (!exists) {
                result.errors.push(`Version ${versionId} not found for ${filePath}`);
                return result;
            }
            // Download the old version
            const [contents] = await sourceFile.download();
            // Upload as current version
            const targetFile = this.bucket.file(fullPath);
            await targetFile.save(contents, {
                contentType: 'application/json',
                metadata: {
                    restoredFrom: versionId,
                    restoredAt: new Date().toISOString()
                }
            });
            result.filesRestored = 1;
            result.success = true;
            console.log(`Restored ${filePath} from version ${versionId}`);
            return result;
        }
        catch (error) {
            result.errors.push(`Version restore failed: ${error}`);
            return result;
        }
    }
    // ============================================
    // CREATE MANUAL BACKUP
    // ============================================
    /**
     * Create a manual backup snapshot
     */
    async createManualBackup(label, reporter) {
        await this.ensureInitialized();
        const startTime = Date.now();
        const now = new Date();
        const dateString = now.toISOString().split('T')[0];
        const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const backupId = `manual_${timestamp}_${label || 'backup'}`;
        const backupPath = `${this.BACKUPS_PREFIX}${dateString}-manual-${timestamp}/`;
        const manifest = {
            id: backupId,
            timestamp: now.toISOString(),
            date: dateString,
            files: [],
            totalSize: 0,
            duration: 0,
            status: 'success',
            errors: [],
            reporter: reporter
        };
        try {
            // List all data files
            const [files] = await this.bucket.getFiles({ prefix: this.DATA_PREFIX });
            for (const file of files) {
                if (file.name.endsWith('/'))
                    continue;
                try {
                    const [metadata] = await file.getMetadata();
                    const fileName = file.name.split('/').pop() || file.name;
                    const destPath = backupPath + fileName;
                    await file.copy(this.bucket.file(destPath));
                    manifest.files.push({
                        name: fileName,
                        path: destPath,
                        size: parseInt(metadata.size, 10) || 0,
                        contentType: metadata.contentType || 'application/json',
                        md5Hash: metadata.md5Hash
                    });
                    manifest.totalSize += parseInt(metadata.size, 10) || 0;
                }
                catch (error) {
                    manifest.errors.push(`Failed to backup ${file.name}: ${error}`);
                }
            }
            manifest.duration = Date.now() - startTime;
            if (manifest.errors.length > 0) {
                manifest.status = manifest.files.length > 0 ? 'partial' : 'failed';
            }
            // Save manifest
            const manifestFile = this.bucket.file(backupPath + 'manifest.json');
            await manifestFile.save(JSON.stringify(manifest, null, 2), {
                contentType: 'application/json'
            });
            console.log(`Manual backup created: ${backupId}`);
            return manifest;
        }
        catch (error) {
            manifest.status = 'failed';
            manifest.errors.push(`Backup failed: ${error}`);
            manifest.duration = Date.now() - startTime;
            return manifest;
        }
    }
    /**
     * Create a restore point (backup before restore operation)
     */
    async createRestorePoint() {
        try {
            const now = new Date();
            const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const restorePointPath = `${this.BACKUPS_PREFIX}restore-points/${timestamp}/`;
            const [files] = await this.bucket.getFiles({ prefix: this.DATA_PREFIX });
            for (const file of files) {
                if (file.name.endsWith('/'))
                    continue;
                const fileName = file.name.split('/').pop() || file.name;
                const destPath = restorePointPath + fileName;
                await file.copy(this.bucket.file(destPath));
            }
            console.log(`Restore point created: ${restorePointPath}`);
        }
        catch (error) {
            console.error('Failed to create restore point:', error);
            // Don't throw - restore point is best-effort
        }
    }
    // ============================================
    // VERIFY BACKUP
    // ============================================
    /**
     * Verify backup integrity by comparing checksums
     */
    async verifyBackup(date) {
        await this.ensureInitialized();
        const result = {
            valid: true,
            checked: 0,
            failed: []
        };
        try {
            const manifest = await this.getBackupDetails(date);
            if (!manifest) {
                result.valid = false;
                result.failed.push('Manifest not found');
                return result;
            }
            const backupPath = `${this.BACKUPS_PREFIX}${date}/`;
            for (const fileInfo of manifest.files) {
                const filePath = backupPath + fileInfo.name;
                const file = this.bucket.file(filePath);
                const [exists] = await file.exists();
                if (!exists) {
                    result.failed.push(`Missing: ${fileInfo.name}`);
                    result.valid = false;
                    continue;
                }
                if (fileInfo.md5Hash) {
                    const [metadata] = await file.getMetadata();
                    if (metadata.md5Hash !== fileInfo.md5Hash) {
                        result.failed.push(`Checksum mismatch: ${fileInfo.name}`);
                        result.valid = false;
                    }
                }
                result.checked++;
            }
            return result;
        }
        catch (error) {
            result.valid = false;
            result.failed.push(`Verification error: ${error}`);
            return result;
        }
    }
    // ============================================
    // DOWNLOAD BACKUP
    // ============================================
    /**
     * Get download URLs for backup files
     */
    async getBackupDownloadUrls(date) {
        await this.ensureInitialized();
        const manifest = await this.getBackupDetails(date);
        if (!manifest) {
            throw new Error(`Backup for ${date} not found`);
        }
        const backupPath = `${this.BACKUPS_PREFIX}${date}/`;
        const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour
        const files = [];
        for (const fileInfo of manifest.files) {
            const file = this.bucket.file(backupPath + fileInfo.name);
            const [url] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + 3600000 // 1 hour
            });
            files.push({
                name: fileInfo.name,
                url
            });
        }
        return { files, expiresAt };
    }
}
// ============================================
// SINGLETON INSTANCE
// ============================================
let backupServiceInstance = null;
export function getBackupService() {
    return backupServiceInstance;
}
export function initializeBackupService(bucketName, projectId) {
    if (!backupServiceInstance) {
        backupServiceInstance = new BackupService(bucketName, projectId);
    }
    return backupServiceInstance;
}
export function isBackupServiceEnabled() {
    return !!(process.env.GCS_BUCKET_NAME && process.env.GCS_PROJECT_ID);
}
