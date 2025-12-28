/**
 * Portfolio Manager - Daily Backup Cloud Function
 * 
 * This function creates daily snapshots of all portfolio data stored in GCS.
 * It's designed to be triggered by Cloud Scheduler at a regular interval (e.g., daily at 2 AM).
 * 
 * Features:
 * - Creates timestamped backup folders
 * - Copies all data files to backup location
 * - Creates a manifest with metadata
 * - Supports Slack notifications for success/failure
 * - Cleans up old backups beyond retention period (handled by lifecycle policy)
 */

import { Storage, Bucket, File } from '@google-cloud/storage';
import * as functions from '@google-cloud/functions-framework';

// ============================================
// CONFIGURATION
// ============================================

interface BackupConfig {
  bucketName: string;
  dataPrefix: string;
  backupPrefix: string;
  slackWebhookUrl?: string;
  projectId?: string;
}

interface BackupManifest {
  id: string;
  timestamp: string;
  date: string;
  files: BackupFileInfo[];
  totalSize: number;
  duration: number;
  status: 'success' | 'partial' | 'failed';
  errors?: string[];
  reporter?: string;
}

interface BackupFileInfo {
  name: string;
  path: string;
  size: number;
  contentType: string;
  md5Hash?: string;
}

// Get configuration from environment
function getConfig(): BackupConfig {
  const bucketName = process.env.GCS_BUCKET_NAME;
  
  if (!bucketName) {
    throw new Error('GCS_BUCKET_NAME environment variable is required');
  }
  
  return {
    bucketName,
    dataPrefix: process.env.DATA_PREFIX || 'data/',
    backupPrefix: process.env.BACKUP_PREFIX || 'backups/',
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
    projectId: process.env.GCS_PROJECT_ID
  };
}

// ============================================
// BACKUP FUNCTIONS
// ============================================

/**
 * List all files in a GCS prefix
 */
async function listFiles(bucket: Bucket, prefix: string): Promise<File[]> {
  const [files] = await bucket.getFiles({ prefix });
  return files.filter(file => !file.name.endsWith('/'));
}

/**
 * Copy a file to backup location
 */
async function copyFileToBackup(
  bucket: Bucket,
  sourceFile: File,
  backupPath: string
): Promise<BackupFileInfo> {
  const [metadata] = await sourceFile.getMetadata();
  const destFileName = backupPath + sourceFile.name.split('/').pop();
  
  await sourceFile.copy(bucket.file(destFileName));
  
  return {
    name: sourceFile.name.split('/').pop() || sourceFile.name,
    path: destFileName,
    size: parseInt(metadata.size as string, 10) || 0,
    contentType: metadata.contentType || 'application/octet-stream',
    md5Hash: metadata.md5Hash
  };
}

/**
 * Create backup manifest
 */
async function createManifest(
  bucket: Bucket,
  backupPath: string,
  manifest: BackupManifest
): Promise<void> {
  const manifestFile = bucket.file(backupPath + 'manifest.json');
  await manifestFile.save(JSON.stringify(manifest, null, 2), {
    contentType: 'application/json',
    metadata: {
      backupId: manifest.id,
      backupDate: manifest.date,
      status: manifest.status
    }
  });
}

/**
 * Send Slack notification
 */
async function sendSlackNotification(
  webhookUrl: string,
  manifest: BackupManifest,
  isSuccess: boolean
): Promise<void> {
  const emoji = isSuccess ? ':white_check_mark:' : ':x:';
  const color = isSuccess ? '#36a64f' : '#dc3545';
  const title = isSuccess 
    ? 'Portfolio Backup Completed' 
    : 'Portfolio Backup Failed';
  
  const payload = {
    attachments: [{
      color,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${emoji} ${title}`,
            emoji: true
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Date:*\n${manifest.date}`
            },
            {
              type: 'mrkdwn',
              text: `*Status:*\n${manifest.status}`
            },
            {
              type: 'mrkdwn',
              text: `*Files Backed Up:*\n${manifest.files.length}`
            },
            {
              type: 'mrkdwn',
              text: `*Total Size:*\n${formatBytes(manifest.totalSize)}`
            },
            {
              type: 'mrkdwn',
              text: `*Duration:*\n${manifest.duration}ms`
            },
            {
              type: 'mrkdwn',
              text: `*Backup ID:*\n${manifest.id}`
            }
          ]
        }
      ]
    }]
  };
  
  if (manifest.errors && manifest.errors.length > 0) {
    payload.attachments[0].blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Errors:*\n${manifest.errors.join('\n')}`
      }
    } as any);
  }
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      console.error('Failed to send Slack notification:', response.statusText);
    }
  } catch (error) {
    console.error('Error sending Slack notification:', error);
  }
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Generate backup ID
 */
function generateBackupId(): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const random = Math.random().toString(36).substring(2, 8);
  return `backup_${dateStr}_${random}`;
}

/**
 * Get today's date string in YYYY-MM-DD format
 */
function getDateString(): string {
  return new Date().toISOString().split('T')[0];
}

// ============================================
// MAIN BACKUP FUNCTION
// ============================================

/**
 * Main backup function - creates a daily snapshot of all data
 */
async function performBackup(reporter?: string): Promise<BackupManifest> {
  const startTime = Date.now();
  const config = getConfig();
  const storage = new Storage({ projectId: config.projectId });
  const bucket = storage.bucket(config.bucketName);
  
  const backupId = generateBackupId();
  const dateString = getDateString();
  const backupPath = `${config.backupPrefix}${dateString}/`;
  
  console.log(`Starting backup: ${backupId}`);
  console.log(`Backup path: ${backupPath}`);
  if (reporter) {
    console.log(`Backup reporter: ${reporter}`);
  }
  
  const manifest: BackupManifest = {
    id: backupId,
    timestamp: new Date().toISOString(),
    date: dateString,
    files: [],
    totalSize: 0,
    duration: 0,
    status: 'success',
    errors: [],
    reporter: reporter || 'scheduler'
  };
  
  try {
    // Check if backup for today already exists
    const [existingManifest] = await bucket.file(backupPath + 'manifest.json').exists();
    if (existingManifest) {
      console.log(`Backup for ${dateString} already exists, skipping`);
      manifest.status = 'success';
      manifest.duration = Date.now() - startTime;
      return manifest;
    }
    
    // List all data files
    console.log(`Listing files in ${config.dataPrefix}...`);
    const files = await listFiles(bucket, config.dataPrefix);
    console.log(`Found ${files.length} files to backup`);
    
    // Copy each file to backup location
    for (const file of files) {
      try {
        console.log(`Backing up: ${file.name}`);
        const fileInfo = await copyFileToBackup(bucket, file, backupPath);
        manifest.files.push(fileInfo);
        manifest.totalSize += fileInfo.size;
      } catch (error) {
        const errorMessage = `Failed to backup ${file.name}: ${error}`;
        console.error(errorMessage);
        manifest.errors!.push(errorMessage);
      }
    }
    
    // Also backup snapshots directory (recent ones)
    console.log('Backing up recent snapshots...');
    try {
      const snapshotFiles = await listFiles(bucket, 'snapshots/');
      console.log(`Found ${snapshotFiles.length} snapshot files`);
      
      if (snapshotFiles.length === 0) {
        console.log('No snapshot files found in snapshots/ directory');
      } else {
        const recentSnapshots = snapshotFiles.slice(0, 10); // Only last 10 snapshots
        console.log(`Backing up ${recentSnapshots.length} recent snapshots`);
        
        for (const file of recentSnapshots) {
          try {
            console.log(`Backing up snapshot: ${file.name}`);
            const fileInfo = await copyFileToBackup(bucket, file, backupPath + 'snapshots/');
            manifest.files.push(fileInfo);
            manifest.totalSize += fileInfo.size;
            console.log(`Successfully backed up snapshot: ${file.name}`);
          } catch (error) {
            const errorMessage = `Failed to backup snapshot ${file.name}: ${error}`;
            console.error(errorMessage);
            manifest.errors!.push(errorMessage);
          }
        }
      }
    } catch (error) {
      const errorMessage = `Failed to list or backup snapshots: ${error}`;
      console.error(errorMessage);
      manifest.errors!.push(errorMessage);
      // Don't fail the entire backup if snapshot backup fails
    }
    
    // Set status based on errors
    if (manifest.errors!.length > 0) {
      manifest.status = manifest.files.length > 0 ? 'partial' : 'failed';
    }
    
  } catch (error) {
    console.error('Backup failed:', error);
    manifest.status = 'failed';
    manifest.errors!.push(`Backup failed: ${error}`);
  }
  
  manifest.duration = Date.now() - startTime;
  
  // Save manifest
  try {
    await createManifest(bucket, backupPath, manifest);
    console.log('Manifest saved');
  } catch (error) {
    console.error('Failed to save manifest:', error);
  }
  
  // Send Slack notification if configured
  if (config.slackWebhookUrl) {
    await sendSlackNotification(
      config.slackWebhookUrl,
      manifest,
      manifest.status === 'success'
    );
  }
  
  console.log(`Backup completed: ${manifest.status}`);
  console.log(`Files: ${manifest.files.length}, Size: ${formatBytes(manifest.totalSize)}, Duration: ${manifest.duration}ms`);
  
  return manifest;
}

// ============================================
// HTTP FUNCTION ENTRY POINT
// ============================================

/**
 * HTTP Cloud Function entry point
 * Triggered by Cloud Scheduler or manual HTTP request
 */
functions.http('backupDaily', async (req, res) => {
  // Verify request is from Cloud Scheduler or authorized source
  const authHeader = req.headers.authorization;
  const schedulerSecret = req.headers['x-scheduler-secret'];
  
  // In production, validate the request
  // Cloud Scheduler uses OIDC tokens which are validated by Cloud Functions
  // For manual testing, you can use a secret header
  if (process.env.NODE_ENV === 'production') {
    if (!authHeader && schedulerSecret !== process.env.SCHEDULER_SECRET) {
      res.status(403).json({ error: 'Unauthorized' });
      return;
    }
  }
  
  try {
    console.log('Backup triggered at', new Date().toISOString());
    
    // Extract reporter from request body or headers, default to "scheduler"
    const reporter = req.body?.reporter || req.headers['x-backup-reporter'] || 'scheduler';
    
    const manifest = await performBackup(reporter);
    
    if (manifest.status === 'failed') {
      res.status(500).json({
        success: false,
        error: 'Backup failed',
        manifest
      });
    } else {
      res.status(200).json({
        success: true,
        message: `Backup ${manifest.status}`,
        manifest
      });
    }
  } catch (error) {
    console.error('Unhandled error in backup function:', error);
    res.status(500).json({
      success: false,
      error: String(error)
    });
  }
});

// Export for testing
export { performBackup, BackupManifest, BackupConfig };

