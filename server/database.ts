/**
 * Database Connection and Helper Functions
 * Manages Google Sheets connection and shared data operations
 */

import { GoogleSpreadsheet, GoogleSpreadsheetRow } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import dotenv from 'dotenv';
import { serverLogger } from './logger.js';
import { AuthenticatedRequest } from './middleware.js';
import { getLogStorage } from './logStorage.js';
import { ActivityType } from '../src/types/index.js';

dotenv.config();

// ============================================
// CONFIGURATION
// ============================================
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;

/**
 * Handle various private key formats from environment variables
 */
function parsePrivateKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  
  let cleanKey = key.trim();
  
  // Check if it's already properly formatted with newlines
  if (cleanKey.includes('-----BEGIN') && cleanKey.includes('\n')) {
    return cleanKey;
  }
  
  // Handle escaped newlines (\\n or \n)
  if (cleanKey.includes('\\n')) {
    return cleanKey.replace(/\\n/g, '\n');
  }
  
  // Handle single-line key format
  if (cleanKey.includes('-----BEGIN PRIVATE KEY-----')) {
    const header = '-----BEGIN PRIVATE KEY-----';
    const footer = '-----END PRIVATE KEY-----';
    
    let content = cleanKey.replace(header, '').replace(footer, '');
    content = content.replace(/\s+/g, '');
    const wrappedContent = content.match(/.{1,64}/g)?.join('\n');
    
    return `${header}\n${wrappedContent}\n${footer}`;
  }
  
  return cleanKey;
}

const SERVICE_ACCOUNT_PRIVATE_KEY = parsePrivateKey(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);

// ============================================
// SHEET HEADERS
// ============================================
export const INITIATIVE_HEADERS = [
  'id', 'initiativeType', 'l1_assetClass', 'l2_pillar', 'l3_responsibility', 'l4_target',
  'title', 'ownerId', 'secondaryOwner', 'quarter', 'status', 'priority',
  'estimatedEffort', 'originalEstimatedEffort', 'actualEffort',
  'eta', 'originalEta', 'lastUpdated', 'createdAt', 'createdBy', 'lastWeeklyUpdate', 'dependencies', 'workType',
  'unplannedTags', 'riskActionLog', 'isAtRisk', 'definitionOfDone',
  'tasks', 'overlookedCount', 'lastDelayDate', 'completionRate',
  'comments', 'history', 'version', 'deletedAt'
];

export const CHANGELOG_HEADERS = [
  'id', 'issueType', 'parentId', 'initiativeId', 'initiativeTitle', 'taskId',
  'field', 'oldValue', 'newValue', 'changedBy', 'timestamp'
];

export const TASK_HEADERS = [
  'id', 'parentId', 'initiativeTitle', 'title', 'estimatedEffort', 'actualEffort',
  'eta', 'ownerId', 'owner', 'status', 'tags', 'comments', 'createdAt', 'createdBy', 'lastUpdated', 'deletedAt'
];

export const USER_HEADERS = ['id', 'email', 'passwordHash', 'name', 'role', 'avatar', 'lastLogin', 'team'];

// ============================================
// DATABASE CONNECTION
// ============================================
let lastConnectionError: string | null = null;

/**
 * Get Google Spreadsheet document connection
 */
export async function getDoc(): Promise<GoogleSpreadsheet | null> {
  if (!SPREADSHEET_ID || !SERVICE_ACCOUNT_EMAIL || !SERVICE_ACCOUNT_PRIVATE_KEY) {
    lastConnectionError = 'Missing credentials: ' + 
      (!SPREADSHEET_ID ? 'SPREADSHEET_ID ' : '') +
      (!SERVICE_ACCOUNT_EMAIL ? 'EMAIL ' : '') +
      (!SERVICE_ACCOUNT_PRIVATE_KEY ? 'PRIVATE_KEY' : '');
    serverLogger.error(lastConnectionError, { context: 'Sheets' });
    return null;
  }

  try {
    const serviceAccountAuth = new JWT({
      email: SERVICE_ACCOUNT_EMAIL,
      key: SERVICE_ACCOUNT_PRIVATE_KEY,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    lastConnectionError = null;
    return doc;
  } catch (error) {
    lastConnectionError = error instanceof Error ? error.message : String(error);
    serverLogger.error(`Failed to connect to Google Sheets: ${lastConnectionError}`, { context: 'Sheets' });
    return null;
  }
}

export function getLastConnectionError(): string | null {
  return lastConnectionError;
}

// ============================================
// CONFIG HELPERS
// ============================================

/**
 * Load app config from Config sheet
 */
export async function loadAppConfig(doc: GoogleSpreadsheet): Promise<any> {
  try {
    const configSheet = doc.sheetsByTitle['Config'];
    if (!configSheet) {
      return null;
    }
    
    await configSheet.loadHeaderRow();
    const configRows = await configSheet.getRows();
    if (configRows.length === 0) {
      return null;
    }
    
    const configRow = configRows[0];
    const configData = configRow.get('config');
    if (!configData) {
      return null;
    }
    
    return JSON.parse(configData);
  } catch (error) {
    serverLogger.error('Error loading config', { context: 'loadAppConfig', error: error as Error });
    return null;
  }
}

// ============================================
// AUTHORIZATION HELPERS
// ============================================

/**
 * Normalize user ID for comparison
 */
export function normalizeUserId(userId: string | undefined | null): string | null {
  if (!userId) return null;
  const trimmed = String(userId).trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Check if two user identifiers match, handling both userId and email formats
 */
export function matchesUserId(
  ownerId: string | null | undefined,
  currentUserId: string,
  currentUserEmail?: string
): boolean {
  const normalizedOwnerId = normalizeUserId(ownerId);
  const normalizedCurrentUserId = normalizeUserId(currentUserId);
  
  if (!normalizedOwnerId || !normalizedCurrentUserId) {
    return false;
  }
  
  // Direct ID-to-ID match
  if (normalizedOwnerId === normalizedCurrentUserId) {
    return true;
  }
  
  // Email match: If ownerId looks like an email, compare with currentUserEmail
  if (normalizedOwnerId.includes('@') && currentUserEmail) {
    const normalizedOwnerEmail = normalizedOwnerId.toLowerCase().trim();
    const normalizedCurrentEmail = String(currentUserEmail).toLowerCase().trim();
    if (normalizedOwnerEmail === normalizedCurrentEmail) {
      return true;
    }
  }
  
  // Reverse email match
  if (normalizedCurrentUserId.includes('@') && normalizedOwnerId) {
    const normalizedCurrentEmail = normalizedCurrentUserId.toLowerCase().trim();
    const normalizedOwnerEmail = normalizedOwnerId.toLowerCase().trim();
    if (normalizedCurrentEmail === normalizedOwnerEmail) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if user can delete a task (server-side authorization)
 */
export function canUserDeleteTask(
  config: any,
  userRole: string,
  taskOwnerId: string | undefined | null,
  initiativeOwnerId: string | undefined | null,
  currentUserId: string,
  currentUserEmail?: string
): boolean {
  // Admin users can always delete tasks
  if (userRole === 'Admin') {
    return true;
  }
  
  if (!config || !config.rolePermissions) {
    serverLogger.warn('Config or rolePermissions missing', { context: 'canUserDeleteTask' });
    return false;
  }
  
  const rolePermissions = config.rolePermissions[userRole];
  if (!rolePermissions) {
    return false;
  }
  
  const deleteScope = rolePermissions.deleteTasks;
  
  if (deleteScope === 'yes') {
    return true;
  } else if (deleteScope === 'own') {
    // Check task ownership first (if task has an owner)
    if (taskOwnerId) {
      return matchesUserId(taskOwnerId, currentUserId, currentUserEmail);
    }
    
    // Fall back to initiative ownership
    return matchesUserId(initiativeOwnerId, currentUserId, currentUserEmail);
  }
  
  return false;
}

// ============================================
// ACTIVITY LOGGING
// ============================================

/**
 * Log an activity to the log storage
 */
export function logActivity(
  req: AuthenticatedRequest,
  type: ActivityType,
  description: string,
  metadata?: Record<string, unknown>
): void {
  const logStorage = getLogStorage();
  if (!logStorage || !logStorage.isInitialized()) {
    return; // Silently skip if log storage not available
  }

  const activityLog = {
    id: `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    userId: req.user?.id || 'unknown',
    userEmail: req.user?.email || 'unknown',
    timestamp: new Date().toISOString(),
    description,
    metadata,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    sessionId: req.headers['x-session-id'] as string,
    correlationId: req.headers['x-correlation-id'] as string,
  };

  // Don't await - log asynchronously to avoid blocking requests
  logStorage.storeActivityLog(activityLog).catch(err => {
    serverLogger.error('Failed to store activity log', { error: err as Error });
  });
}
