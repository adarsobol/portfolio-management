// Backend API Server for Portfolio Manager
// Supports both Google Sheets and Google Cloud Storage backends
// Run with: npx tsx server/index.ts

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { GoogleSpreadsheet, GoogleSpreadsheetRow } from 'google-spreadsheet';
import { JWT, OAuth2Client } from 'google-auth-library';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { isGCSEnabled, getGCSConfig, initializeGCSStorage, getGCSStorage } from './gcsStorage.js';
import { generateInitiativeId } from './idGenerator.js';
import { initializeBackupService, getBackupService, isBackupServiceEnabled } from './backupService.js';
import { initializeLogStorage, getLogStorage, isLogStorageEnabled } from './logStorage.js';
import { initializeSupportStorage, getSupportStorage, isSupportStorageEnabled, memoryStorage } from './supportStorage.js';
import { FeedbackComment } from '../src/types/index.js';
import { ActivityType, SupportTicketStatus, SupportTicketPriority, NotificationType } from '../src/types/index.js';
import {
  validate,
  loginSchema,
  googleAuthSchema,
  registerUserSchema,
  changePasswordSchema,
  initiativesArraySchema,
  changelogSchema,
  snapshotSchema,
  slackWebhookSchema,
  bulkImportUsersSchema,
} from './validation.js';
import { serverLogger } from './logger.js';

dotenv.config();

serverLogger.startup('Starting Portfolio Manager Server...');
serverLogger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
serverLogger.info(`Port: ${process.env.PORT || 8080}`);

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';

// Start listening IMMEDIATELY to satisfy Cloud Run health checks
httpServer.listen(Number(PORT), HOST, () => {
  serverLogger.startup(`Portfolio Manager API Server running on http://${HOST}:${PORT}`);
  serverLogger.info('Socket.IO real-time collaboration enabled');
});

// ============================================
// STORAGE BACKEND INITIALIZATION (In Background)
// ============================================
const STORAGE_BACKEND = isGCSEnabled() ? 'gcs' : 'sheets';
serverLogger.info(`Storage backend: ${STORAGE_BACKEND}`);

// Initialize GCS if enabled (non-blocking)
if (STORAGE_BACKEND === 'gcs') {
  const gcsConfig = getGCSConfig();
  if (gcsConfig) {
    initializeGCSStorage(gcsConfig).then(storage => {
      if (storage) {
        serverLogger.success('GCS Storage initialized successfully');
        // Initialize backup service
        if (isBackupServiceEnabled()) {
          initializeBackupService(gcsConfig.bucketName, gcsConfig.projectId);
          serverLogger.success('Backup Service initialized');
        }
        // Initialize log storage
        initializeLogStorage({
          bucketName: gcsConfig.bucketName,
          projectId: gcsConfig.projectId,
          keyFilename: gcsConfig.keyFilename,
        });
        serverLogger.success('Log Storage initialized');
        // Initialize support storage
        initializeSupportStorage({
          bucketName: gcsConfig.bucketName,
          projectId: gcsConfig.projectId,
          keyFilename: gcsConfig.keyFilename,
        });
        serverLogger.success('Support Storage initialized with GCS');
      } else {
        serverLogger.error('Failed to initialize GCS Storage, falling back to Sheets');
        serverLogger.info('Support Storage will use in-memory fallback');
      }
    }).catch(error => {
      serverLogger.error('Error initializing GCS Storage', { error: error as Error });
      serverLogger.info('Continuing with Sheets backend...');
      serverLogger.info('Support Storage will use in-memory fallback');
    });
  } else {
    serverLogger.info('GCS config not available, using Sheets backend');
    serverLogger.info('Support Storage will use in-memory fallback');
  }
} else {
  serverLogger.info('Using Sheets backend');
}

// Always try to initialize support storage with GCS if available (even if main backend is Sheets)
// This ensures support tickets/feedback persist across Cloud Run instances
serverLogger.debug('Checking if GCS is enabled for support storage...', { context: 'INIT' });
serverLogger.debug(`isGCSEnabled(): ${isGCSEnabled()}`, { context: 'INIT' });

if (isGCSEnabled()) {
  const gcsConfig = getGCSConfig();
  serverLogger.debug('GCS config', { 
    context: 'INIT',
    metadata: gcsConfig ? {
      bucketName: gcsConfig.bucketName,
      hasProjectId: !!gcsConfig.projectId,
      hasKeyFilename: !!gcsConfig.keyFilename
    } : { config: 'null' }
  });
  
  if (gcsConfig) {
    try {
      serverLogger.debug('Calling initializeSupportStorage...', { context: 'INIT' });
      const storage = initializeSupportStorage({
        bucketName: gcsConfig.bucketName,
        projectId: gcsConfig.projectId,
        keyFilename: gcsConfig.keyFilename,
      });
      serverLogger.success(`Support Storage initialized with GCS (independent of main storage backend), isInitialized: ${storage.isInitialized()}`);
    } catch (error) {
      serverLogger.error('Failed to initialize Support Storage with GCS', { context: 'INIT', error: error as Error });
      serverLogger.info('Support Storage will use in-memory fallback', { context: 'INIT' });
    }
  } else {
    serverLogger.info('GCS config is null, Support Storage will use in-memory fallback', { context: 'INIT' });
  }
} else {
  serverLogger.info('GCS not enabled, Support Storage will use in-memory fallback', { context: 'INIT' });
}

// ============================================
// SOCKET.IO SETUP FOR REAL-TIME COLLABORATION
// ============================================
// Get allowed origins for Socket.IO CORS
const getSocketIOOrigins = (): string[] | true => {
  const origins: string[] = [];
  
  // Production origins from environment
  if (process.env.CORS_ALLOWED_ORIGINS) {
    origins.push(...process.env.CORS_ALLOWED_ORIGINS.split(',').map(o => o.trim()));
  }
  
  // In development or if no origins set, allow all (for Cloud Run serving static files)
  if (process.env.NODE_ENV !== 'production') {
    origins.push(
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5173',
      'http://localhost:3000',
      'http://localhost:3002'
    );
  }
  
  // If no specific origins, allow all (needed when serving static from same origin)
  return origins.length > 0 ? origins : true;
};

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: getSocketIOOrigins(),
    credentials: true
  }
});

// Track connected users and what they're viewing/editing
interface UserPresence {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  currentView: string;
  editingInitiativeId: string | null;
  lastActivity: number;
}

const connectedUsers = new Map<string, UserPresence>();

io.on('connection', (socket) => {
  serverLogger.debug(`User connected: ${socket.id}`, { context: 'Socket' });

  // Handle user joining
  socket.on('user:join', (userData: { id: string; name: string; email: string; avatar?: string }) => {
    const presence: UserPresence = {
      ...userData,
      currentView: 'all',
      editingInitiativeId: null,
      lastActivity: Date.now()
    };
    connectedUsers.set(socket.id, presence);
    
    // Broadcast updated user list to all clients
    io.emit('users:presence', Array.from(connectedUsers.values()));
    serverLogger.info(`${userData.name} joined`, { context: 'Socket', metadata: { usersOnline: connectedUsers.size } });
  });

  // Handle view changes
  socket.on('user:viewChange', (view: string) => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      user.currentView = view;
      user.lastActivity = Date.now();
      io.emit('users:presence', Array.from(connectedUsers.values()));
    }
  });

  // Handle initiative edit start
  socket.on('initiative:editStart', (initiativeId: string) => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      user.editingInitiativeId = initiativeId;
      user.lastActivity = Date.now();
      // Notify others that this user is editing
      socket.broadcast.emit('initiative:editingBy', { 
        initiativeId, 
        user: { id: user.id, name: user.name, avatar: user.avatar } 
      });
      io.emit('users:presence', Array.from(connectedUsers.values()));
    }
  });

  // Handle initiative edit end
  socket.on('initiative:editEnd', (initiativeId: string) => {
    const user = connectedUsers.get(socket.id);
    if (user && user.editingInitiativeId === initiativeId) {
      user.editingInitiativeId = null;
      user.lastActivity = Date.now();
      socket.broadcast.emit('initiative:editEnded', { initiativeId, userId: user.id });
      io.emit('users:presence', Array.from(connectedUsers.values()));
    }
  });

  // Handle initiative updates (real-time sync)
  socket.on('initiative:update', (data: { initiative: any; changedBy: string }) => {
    // Broadcast to all other clients
    socket.broadcast.emit('initiative:updated', data);
  });

  // Handle initiative creation
  socket.on('initiative:create', (data: { initiative: any; createdBy: string }) => {
    socket.broadcast.emit('initiative:created', data);
  });

  // Handle new comments
  socket.on('comment:add', (data: { initiativeId: string; comment: any; addedBy: string }) => {
    socket.broadcast.emit('comment:added', data);
  });

  // Handle cursor position (for collaborative editing preview)
  socket.on('cursor:move', (data: { initiativeId: string; field: string }) => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      socket.broadcast.emit('cursor:moved', {
        initiativeId: data.initiativeId,
        field: data.field,
        user: { id: user.id, name: user.name, avatar: user.avatar }
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      serverLogger.info(`${user.name} disconnected`, { context: 'Socket' });
      // Notify others this user stopped editing
      if (user.editingInitiativeId) {
        io.emit('initiative:editEnded', { 
          initiativeId: user.editingInitiativeId, 
          userId: user.id 
        });
      }
    }
    connectedUsers.delete(socket.id);
    io.emit('users:presence', Array.from(connectedUsers.values()));
  });
});

// Clean up inactive users every minute
setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000; // 5 minutes
  
  for (const [socketId, user] of connectedUsers.entries()) {
    if (now - user.lastActivity > timeout) {
      connectedUsers.delete(socketId);
      serverLogger.info(`${user.name} timed out due to inactivity`, { context: 'Socket' });
    }
  }
  io.emit('users:presence', Array.from(connectedUsers.values()));
}, 60000);

// ============================================
// CONFIGURATION
// ============================================
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;

// Handle various private key formats from environment variables
function parsePrivateKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  
  // Clean the key: remove any leading/trailing whitespace
  let cleanKey = key.trim();
  
  // Check if it's already properly formatted with newlines
  if (cleanKey.includes('-----BEGIN') && cleanKey.includes('\n')) {
    return cleanKey;
  }
  
  // Handle escaped newlines (\\n or \n)
  if (cleanKey.includes('\\n')) {
    return cleanKey.replace(/\\n/g, '\n');
  }
  
  // Handle single-line key format (often seen when pasting into UI)
  if (cleanKey.includes('-----BEGIN PRIVATE KEY-----')) {
    // 1. Extract the actual base64 content between the markers
    const header = '-----BEGIN PRIVATE KEY-----';
    const footer = '-----END PRIVATE KEY-----';
    
    let content = cleanKey;
    content = content.replace(header, '').replace(footer, '');
    
    // 2. Remove all whitespace from the content
    content = content.replace(/\s+/g, '');
    
    // 3. Re-wrap the base64 content every 64 characters
    const wrappedContent = content.match(/.{1,64}/g)?.join('\n');
    
    // 4. Reconstruct with proper newlines
    return `${header}\n${wrappedContent}\n${footer}`;
  }
  
  return cleanKey;
}

const SERVICE_ACCOUNT_PRIVATE_KEY = parsePrivateKey(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
const JWT_EXPIRES_IN = '7d';
const NODE_ENV = process.env.NODE_ENV || 'development';

// JWT Secret validation
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (NODE_ENV === 'production') {
    serverLogger.error('WARNING: JWT_SECRET environment variable is not set in production. Using fallback (not recommended for security).');
    serverLogger.error('Please set JWT_SECRET via Secret Manager or environment variables.');
  } else {
    serverLogger.warn('WARNING: JWT_SECRET not set. Using insecure default for development only.');
  }
}
const EFFECTIVE_JWT_SECRET = JWT_SECRET || 'production-fallback-please-set-jwt-secret';

// ============================================
// TYPES
// ============================================
interface AuthenticatedRequest extends Request {
  user?: {
    email: string;
    name: string;
    role: string;
    id: string;
  };
}

// ============================================
// ACTIVITY LOGGING HELPER
// ============================================
function logActivity(
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

// ============================================
// MIDDLEWARE
// ============================================

// Configure CORS based on environment
const getAllowedOrigins = (): string[] | true => {
  const origins: string[] = [];
  
  // Production origins from environment
  if (process.env.CORS_ALLOWED_ORIGINS) {
    origins.push(...process.env.CORS_ALLOWED_ORIGINS.split(',').map(o => o.trim()));
  }
  
  // In development, allow localhost
  if (NODE_ENV !== 'production') {
    origins.push(
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5173',
      'http://localhost:3000',
      'http://localhost:3002'
    );
  }
  
  // If no origins configured and serving static files (same origin), allow all
  // This is a fallback for Cloud Run when CORS_ALLOWED_ORIGINS secret isn't set
  // TODO: Properly configure CORS_ALLOWED_ORIGINS secret in production
  if (origins.length === 0 && process.env.SERVE_STATIC === 'true') {
    return true; // Allow all origins when serving static from same domain
  }
  
  return origins;
};

app.use(cors({
  origin: getAllowedOrigins(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));

// ============================================
// STATIC FILE SERVING (for production deployment)
// ============================================
// Serve static files from dist folder if it exists (production builds)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '..', 'dist');

// Only serve static files in production or if dist folder exists
if (NODE_ENV === 'production' || process.env.SERVE_STATIC === 'true') {
  try {
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath, {
        maxAge: NODE_ENV === 'production' ? '1y' : '0', // Cache in production
        etag: true,
        lastModified: true
      }));
      serverLogger.info(`Serving static files from ${distPath}`);
    }
  } catch (error) {
    serverLogger.warn('Could not serve static files', { error: error as Error });
  }
}

// ============================================
// RATE LIMITING
// ============================================

// Rate limiter for login endpoints (5 requests per minute)
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per window
  message: { error: 'Too many login attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting in development for easier testing
    return NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true';
  },
});

// General API rate limiter (100 requests per minute per IP)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per window
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting in development for easier testing
    return NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true';
  },
});

// Apply general API rate limiting to all routes except health check
app.use((req, res, next) => {
  if (req.path === '/api/sheets/health') {
    return next();
  }
  apiLimiter(req, res, next);
});

// JWT Authentication Middleware
const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  // DEVELOPMENT MODE: Allow bypass when JWT_SECRET is not set (dev mode)
  // This allows local development without OAuth setup
  if (NODE_ENV !== 'production' && !JWT_SECRET) {
    serverLogger.warn('DEVELOPMENT MODE: Authentication bypassed. Set JWT_SECRET to enable auth.', { context: 'Auth' });
    req.user = {
      id: 'u_as',
      email: 'adar.sobol@pagaya.com',
      name: 'Adar Sobol',
      role: 'Admin'
    };
    next();
    return;
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, EFFECTIVE_JWT_SECRET) as { email: string; name: string; role: string; id: string };
    req.user = decoded;
    next();
  } catch {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Optional authentication - doesn't fail, just proceeds without user if invalid
const optionalAuthenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  // DEVELOPMENT MODE: Allow bypass when JWT_SECRET is not set (dev mode)
  if (NODE_ENV !== 'production' && !JWT_SECRET) {
    req.user = {
      id: 'u_as',
      email: 'adar.sobol@pagaya.com',
      name: 'Adar Sobol',
      role: 'Admin'
    };
    next();
    return;
  }

  const authHeader = req.headers['authorization'];
  serverLogger.debug(`Authorization header present: ${!!authHeader}`, { context: 'Auth' });
  
  const token = authHeader && authHeader.split(' ')[1];
  serverLogger.debug(`Token extracted: ${!!token}`, { context: 'Auth' });

  if (!token) {
    // No token - proceed without user (will return empty data for protected resources)
    serverLogger.debug('No token provided, proceeding without user', { context: 'Auth' });
    next();
    return;
  }

  try {
    const decoded = jwt.verify(token, EFFECTIVE_JWT_SECRET) as { email: string; name: string; role: string; id: string };
    req.user = decoded;
    serverLogger.debug(`Token verified successfully, user: ${decoded.email}`, { context: 'Auth' });
    next();
  } catch (error) {
    // Invalid token - proceed without user (will return empty data)
    serverLogger.error('Token verification failed', { context: 'Auth', error: error as Error });
    next();
  }
};

// ============================================
// GOOGLE SHEETS CONNECTION
// ============================================
// Store the last connection error for debugging
let lastConnectionError: string | null = null;

async function getDoc(): Promise<GoogleSpreadsheet | null> {
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

function getLastConnectionError(): string | null {
  return lastConnectionError;
}

// ============================================
// SHEET HEADERS
// ============================================
const INITIATIVE_HEADERS = [
  'id', 'initiativeType', 'l1_assetClass', 'l2_pillar', 'l3_responsibility', 'l4_target',
  'title', 'ownerId', 'secondaryOwner', 'quarter', 'status', 'priority',
  'estimatedEffort', 'originalEstimatedEffort', 'actualEffort',
  'eta', 'originalEta', 'lastUpdated', 'createdAt', 'createdBy', 'lastWeeklyUpdate', 'dependencies', 'workType',
  'unplannedTags', 'riskActionLog', 'isAtRisk', 'definitionOfDone',
  'tasks', 'overlookedCount', 'lastDelayDate', 'completionRate',
  'comments', 'history', 'version', 'deletedAt'
];

const CHANGELOG_HEADERS = [
  'id', 'issueType', 'parentId', 'initiativeId', 'initiativeTitle', 'taskId',
  'field', 'oldValue', 'newValue', 'changedBy', 'timestamp'
];

const TASK_HEADERS = [
  'id', 'parentId', 'initiativeTitle', 'title', 'estimatedEffort', 'actualEffort',
  'eta', 'ownerId', 'owner', 'status', 'tags', 'comments', 'createdAt', 'createdBy', 'lastUpdated', 'deletedAt'
];

const USER_HEADERS = ['id', 'email', 'passwordHash', 'name', 'role', 'avatar', 'lastLogin', 'team'];

// ============================================
// HELPER FUNCTIONS FOR AUTHORIZATION
// ============================================

/**
 * Load app config from Config sheet
 */
async function loadAppConfig(doc: GoogleSpreadsheet): Promise<any> {
  try {
    let configSheet = doc.sheetsByTitle['Config'];
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

/**
 * Normalize user ID for comparison (handles empty strings, whitespace, undefined)
 */
function normalizeUserId(userId: string | undefined | null): string | null {
  if (!userId) return null;
  const trimmed = String(userId).trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Check if two user identifiers match, handling both userId and email formats
 * Mirrors the frontend matchesUserId logic from src/utils/index.ts
 */
function matchesUserId(
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
  
  // Email match: If ownerId looks like an email, compare with currentUserEmail (case-insensitive)
  if (normalizedOwnerId.includes('@') && currentUserEmail) {
    const normalizedOwnerEmail = normalizedOwnerId.toLowerCase().trim();
    const normalizedCurrentEmail = String(currentUserEmail).toLowerCase().trim();
    if (normalizedOwnerEmail === normalizedCurrentEmail) {
      return true;
    }
  }
  
  // Reverse email match: If currentUserId looks like an email, compare with ownerId
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
function canUserDeleteTask(
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
// AUTH ROUTES (Public)
// ============================================

// POST /api/auth/google - Authenticate with Google
app.post('/api/auth/google', loginLimiter, validate(googleAuthSchema), async (req: Request, res: Response) => {
  try {
    const { credential, clientId } = req.body;

    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
      res.status(400).json({ error: 'Invalid Google credential' });
      return;
    }

    const { email, name, picture } = payload;

    const doc = await getDoc();
    if (!doc) {
      res.status(500).json({ error: 'Failed to connect to database' });
      return;
    }

    let usersSheet = doc.sheetsByTitle['Users'];
    
    // Create Users sheet if it doesn't exist (safety check)
    if (!usersSheet) {
      usersSheet = await doc.addSheet({
        title: 'Users',
        headerValues: USER_HEADERS
      });
    } else {
      // Ensure headers are up-to-date (adds missing columns like lastLogin)
      await usersSheet.loadHeaderRow().catch(() => {});
      const currentHeaders = usersSheet.headerValues || [];
      const missingHeaders = USER_HEADERS.filter(h => !currentHeaders.includes(h));
      if (missingHeaders.length > 0) {
        serverLogger.info('Adding missing Users columns', { context: 'Auth', metadata: { missingHeaders } });
        await usersSheet.setHeaderRow([...currentHeaders, ...missingHeaders]);
        // After updating headers, we need to reload rows to get the new column structure
        serverLogger.debug('Headers updated, will reload rows after header update', { context: 'Auth' });
      }
    }

    // Reload rows after potential header updates to ensure we have the latest structure
    let rows = await usersSheet.getRows();
    let userRow = rows.find((r: GoogleSpreadsheetRow) => r.get('email')?.toLowerCase() === email.toLowerCase());

    if (!userRow) {
      res.status(403).json({ 
        error: "Access Denied",
        message: "You are not authorized to access this application. Please contact your administrator to request access."
      });
      return;
    }

    // Double-check that lastLogin column exists in headers
    await usersSheet.loadHeaderRow().catch(() => {});
    const headers = usersSheet.headerValues || [];
    if (!headers.includes('lastLogin')) {
      serverLogger.info(`lastLogin column missing for ${email}, adding it now`, { context: 'Auth' });
      await usersSheet.setHeaderRow([...headers, 'lastLogin']);
      
      // CRITICAL: Reload header row to refresh the sheet's column structure
      await usersSheet.loadHeaderRow();
      
      // Reload rows to get fresh row objects with the new column structure
      rows = await usersSheet.getRows();
      userRow = rows.find((r: GoogleSpreadsheetRow) => r.get('email')?.toLowerCase() === email.toLowerCase());
      
      if (!userRow) {
        serverLogger.error('Could not find user row after adding lastLogin column', { context: 'Auth' });
        res.status(500).json({ error: 'Failed to update login history' });
        return;
      }
      
      // IMPORTANT: Explicitly initialize the column for this row if it doesn't exist
      // This ensures the row object recognizes the column
      const currentValue = userRow.get('lastLogin');
      if (currentValue === undefined || currentValue === null || currentValue === '') {
        // Set an empty value first to ensure the column is recognized
        userRow.set('lastLogin', '');
        await userRow.save();
        // Reload the row to get the updated structure
        rows = await usersSheet.getRows();
        userRow = rows.find((r: GoogleSpreadsheetRow) => r.get('email')?.toLowerCase() === email.toLowerCase());
        if (!userRow) {
          serverLogger.error('Could not find user row after initializing lastLogin column', { context: 'Auth' });
          res.status(500).json({ error: 'Failed to update login history' });
          return;
        }
      }
    }

    // Update last login timestamp
    const loginTimestamp = new Date().toISOString();
    serverLogger.debug(`Setting lastLogin for ${email}`, { context: 'Auth', metadata: { loginTimestamp } });
    
    // Ensure userRow exists before attempting save operations
    if (!userRow) {
      serverLogger.error(`userRow is null/undefined for ${email} before save attempt`, { context: 'Auth' });
      throw new Error('Failed to retrieve user row before login update');
    }
    
    // Update metadata and lastLogin together
    try {
      if (picture && userRow.get('avatar') !== picture) {
        userRow.set('avatar', picture);
      }
      userRow.set('lastLogin', loginTimestamp);
      serverLogger.debug(`Prepared lastLogin update for ${email}, attempting save...`, { context: 'Auth' });
    } catch (preSaveError) {
      serverLogger.error(`Failed to set lastLogin value for ${email} before save`, { context: 'Auth', error: preSaveError as Error });
      throw new Error(`Failed to prepare login update: ${preSaveError instanceof Error ? preSaveError.message : String(preSaveError)}`);
    }
    
    let savedLastLogin: string | null = loginTimestamp; // Default to what we set
    try {
      await userRow.save();
      serverLogger.debug(`Successfully saved lastLogin for ${email}`, { context: 'Auth', metadata: { loginTimestamp } });
      
      // Try to verify by reloading, but don't fail if verification doesn't work
      try {
        rows = await usersSheet.getRows();
        userRow = rows.find((r: GoogleSpreadsheetRow) => r.get('email')?.toLowerCase() === email.toLowerCase());
        if (userRow) {
          const savedTimestamp = userRow.get('lastLogin');
          if (savedTimestamp) {
            savedLastLogin = savedTimestamp;
            if (savedTimestamp === loginTimestamp) {
              serverLogger.debug(`Verified lastLogin save successful for ${email}`, { context: 'Auth' });
            } else {
              serverLogger.warn(`lastLogin value differs after save for ${email}`, { context: 'Auth', metadata: { expected: loginTimestamp, got: savedTimestamp } });
            }
          } else {
            serverLogger.warn(`lastLogin is empty after save for ${email}, but save() succeeded`, { context: 'Auth' });
          }
        } else {
          serverLogger.warn(`Could not find user row after save for ${email} during verification`, { context: 'Auth' });
        }
      } catch (verifyError) {
        serverLogger.warn(`Could not verify lastLogin save for ${email}, but save() appeared successful`, { context: 'Auth', error: verifyError as Error });
        // Keep savedLastLogin as loginTimestamp since save() succeeded
      }
    } catch (saveError) {
      serverLogger.error(`Failed to save lastLogin for ${email}`, { context: 'Auth', error: saveError as Error });
      
      // Retry the save operation once
      try {
        serverLogger.debug(`Retrying lastLogin save for ${email}...`, { context: 'Auth' });
        // Reload the row to get a fresh reference
        rows = await usersSheet.getRows();
        userRow = rows.find((r: GoogleSpreadsheetRow) => r.get('email')?.toLowerCase() === email.toLowerCase());
        if (userRow) {
          userRow.set('lastLogin', loginTimestamp);
          await userRow.save();
          serverLogger.debug(`Retry successful: Saved lastLogin for ${email}`, { context: 'Auth', metadata: { loginTimestamp } });
          savedLastLogin = loginTimestamp;
          
          // Verify the retry save
          try {
            rows = await usersSheet.getRows();
            userRow = rows.find((r: GoogleSpreadsheetRow) => r.get('email')?.toLowerCase() === email.toLowerCase());
            if (userRow) {
              const retryTimestamp = userRow.get('lastLogin');
              if (retryTimestamp === loginTimestamp) {
                serverLogger.debug(`Verified retry save successful for ${email}`, { context: 'Auth' });
              } else {
                serverLogger.warn(`Retry save value differs for ${email}`, { context: 'Auth', metadata: { expected: loginTimestamp, got: retryTimestamp } });
              }
            }
          } catch (verifyError) {
            serverLogger.warn(`Could not verify retry save for ${email}`, { context: 'Auth', error: verifyError as Error });
          }
        } else {
          serverLogger.error(`Could not find user row for ${email} during retry`, { context: 'Auth' });
          savedLastLogin = null;
        }
      } catch (retryError) {
        serverLogger.error(`Retry save also failed for ${email}`, { context: 'Auth', error: retryError as Error });
        // Try to read existing value as fallback
        try {
          rows = await usersSheet.getRows();
          userRow = rows.find((r: GoogleSpreadsheetRow) => r.get('email')?.toLowerCase() === email.toLowerCase());
          if (userRow) {
            const existingTimestamp = userRow.get('lastLogin');
            if (existingTimestamp) {
              savedLastLogin = existingTimestamp;
              serverLogger.debug(`Using existing lastLogin value for ${email}`, { context: 'Auth', metadata: { existingTimestamp } });
            } else {
              savedLastLogin = null;
              serverLogger.warn(`No existing lastLogin value found for ${email} after retry failure`, { context: 'Auth' });
            }
          } else {
            serverLogger.error(`Could not find user row for ${email} after retry error`, { context: 'Auth' });
            savedLastLogin = null;
          }
        } catch (loadError) {
          serverLogger.error(`Failed to reload rows after retry error for ${email}`, { context: 'Auth', error: loadError as Error });
          savedLastLogin = null;
        }
      }
    }

    if (!userRow) {
      serverLogger.error(`userRow is null/undefined for ${email} after login update attempt`, { context: 'Auth' });
      throw new Error('Failed to retrieve user after login update');
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: userRow.get('id'),
        email: userRow.get('email'),
        name: userRow.get('name'),
        role: userRow.get('role')
      },
      EFFECTIVE_JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      token,
      user: {
        id: userRow.get('id'),
        email: userRow.get('email'),
        name: userRow.get('name'),
        role: userRow.get('role'),
        avatar: userRow.get('avatar'),
        lastLogin: savedLastLogin
      }
    });

  } catch (error) {
    serverLogger.error('Google login error', { context: 'Auth', error: error as Error });
    res.status(401).json({ error: 'Google authentication failed' });
  }
});

// POST /api/auth/login - Authenticate user
app.post('/api/auth/login', loginLimiter, validate(loginSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const doc = await getDoc();
    if (!doc) {
      res.status(500).json({ error: 'Failed to connect to database' });
      return;
    }

    let usersSheet = doc.sheetsByTitle['Users'];
    
    // Create Users sheet if it doesn't exist
    if (!usersSheet) {
      usersSheet = await doc.addSheet({
        title: 'Users',
        headerValues: USER_HEADERS
      });
      
      // Create default admin user
      const defaultPassword = await bcrypt.hash('admin123', 10);
      await usersSheet.addRow({
        id: 'u_as',
        email: 'adar.sobol@pagaya.com',
        passwordHash: defaultPassword,
        name: 'Adar Sobol',
        role: 'Admin',
        avatar: 'https://ui-avatars.com/api/?name=Adar+Sobol&background=10B981&color=fff',
        lastLogin: ''
      });
      serverLogger.info('Created Users sheet with default admin user', { context: 'Auth' });
    } else {
      // Ensure headers are up-to-date (adds missing columns like lastLogin)
      await usersSheet.loadHeaderRow().catch(() => {});
      const currentHeaders = usersSheet.headerValues || [];
      const missingHeaders = USER_HEADERS.filter(h => !currentHeaders.includes(h));
      if (missingHeaders.length > 0) {
        serverLogger.info('Adding missing Users columns', { context: 'Login', metadata: { missingHeaders } });
        await usersSheet.setHeaderRow([...currentHeaders, ...missingHeaders]);
        // After updating headers, we need to reload rows to get the new column structure
        serverLogger.debug('Headers updated, will reload rows after header update', { context: 'Login' });
      }
    }

    // Reload rows after potential header updates to ensure we have the latest structure
    let rows = await usersSheet.getRows();
    let userRow = rows.find((r: GoogleSpreadsheetRow) => r.get('email')?.toLowerCase() === email.toLowerCase());

    if (!userRow) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const passwordHash = userRow.get('passwordHash');
    const isValidPassword = await bcrypt.compare(password, passwordHash);

    if (!isValidPassword) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Double-check that lastLogin column exists in headers
    await usersSheet.loadHeaderRow().catch(() => {});
    const headers = usersSheet.headerValues || [];
    if (!headers.includes('lastLogin')) {
      serverLogger.info(`lastLogin column missing for ${email}, adding it now`, { context: 'Login' });
      await usersSheet.setHeaderRow([...headers, 'lastLogin']);
      
      // CRITICAL: Reload header row to refresh the sheet's column structure
      await usersSheet.loadHeaderRow();
      
      // Reload rows to get fresh row objects with the new column structure
      rows = await usersSheet.getRows();
      userRow = rows.find((r: GoogleSpreadsheetRow) => r.get('email')?.toLowerCase() === email.toLowerCase());
      
      if (!userRow) {
        serverLogger.error('Could not find user row after adding lastLogin column', { context: 'Login' });
        res.status(500).json({ error: 'Failed to update login history' });
        return;
      }
      
      // IMPORTANT: Explicitly initialize the column for this row if it doesn't exist
      // This ensures the row object recognizes the column
      const currentValue = userRow.get('lastLogin');
      if (currentValue === undefined || currentValue === null || currentValue === '') {
        // Set an empty value first to ensure the column is recognized
        userRow.set('lastLogin', '');
        await userRow.save();
        // Reload the row to get the updated structure
        rows = await usersSheet.getRows();
        userRow = rows.find((r: GoogleSpreadsheetRow) => r.get('email')?.toLowerCase() === email.toLowerCase());
        if (!userRow) {
          serverLogger.error('Could not find user row after initializing lastLogin column', { context: 'Login' });
          res.status(500).json({ error: 'Failed to update login history' });
          return;
        }
      }
    }

    // Update last login timestamp
    const loginTimestamp = new Date().toISOString();
    serverLogger.debug(`Setting lastLogin for ${email}`, { context: 'Login', metadata: { loginTimestamp } });
    
    // Set and save lastLogin
    userRow.set('lastLogin', loginTimestamp);
    let savedLastLogin: string | null = loginTimestamp; // Default to what we set
    try {
      await userRow.save();
      serverLogger.debug(`Saved lastLogin for ${email}`, { context: 'Login', metadata: { loginTimestamp } });
      
      // Try to verify by reloading, but don't fail if verification doesn't work
      try {
        rows = await usersSheet.getRows();
        userRow = rows.find((r: GoogleSpreadsheetRow) => r.get('email')?.toLowerCase() === email.toLowerCase());
        if (userRow) {
          const savedTimestamp = userRow.get('lastLogin');
          if (savedTimestamp) {
            savedLastLogin = savedTimestamp;
            if (savedTimestamp === loginTimestamp) {
              serverLogger.debug(`Verified lastLogin save successful for ${email}`, { context: 'Login' });
            } else {
              serverLogger.warn(`lastLogin value differs after save`, { context: 'Login', metadata: { expected: loginTimestamp, got: savedTimestamp } });
            }
          }
        }
      } catch (verifyError) {
        serverLogger.warn(`Could not verify lastLogin save, but save appeared successful`, { context: 'Login', error: verifyError as Error });
        // Keep savedLastLogin as loginTimestamp since save() succeeded
      }
    } catch (saveError) {
      serverLogger.error(`Failed to save lastLogin for ${email}`, { context: 'Login', error: saveError as Error });
      // Try to read existing value as fallback
      try {
        rows = await usersSheet.getRows();
        userRow = rows.find((r: GoogleSpreadsheetRow) => r.get('email')?.toLowerCase() === email.toLowerCase());
        if (userRow) {
          const existingTimestamp = userRow.get('lastLogin');
          if (existingTimestamp) {
            savedLastLogin = existingTimestamp;
          } else {
            savedLastLogin = null;
          }
        }
      } catch (loadError) {
        serverLogger.error(`Failed to reload rows after save error`, { context: 'Login', error: loadError as Error });
        savedLastLogin = null;
      }
    }

    if (!userRow) {
      res.status(500).json({ error: 'Failed to retrieve user after login' });
      return;
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: userRow.get('id'),
        email: userRow.get('email'),
        name: userRow.get('name'),
        role: userRow.get('role')
      },
      EFFECTIVE_JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      token,
      user: {
        id: userRow.get('id'),
        email: userRow.get('email'),
        name: userRow.get('name'),
        role: userRow.get('role'),
        avatar: userRow.get('avatar'),
        lastLogin: savedLastLogin
      }
    });
  } catch (error) {
    serverLogger.error('Login error', { context: 'Login', error: error as Error });
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/register - Register new user (Admin only, requires auth)
app.post('/api/auth/register', authenticateToken, validate(registerUserSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if user is admin
    if (req.user?.role !== 'Admin') {
      res.status(403).json({ error: 'Only admins can register new users' });
      return;
    }

    const { email, password, name, role, avatar, team } = req.body;

    const doc = await getDoc();
    if (!doc) {
      res.status(500).json({ error: 'Failed to connect to database' });
      return;
    }

    let usersSheet = doc.sheetsByTitle['Users'];
    if (!usersSheet) {
      usersSheet = await doc.addSheet({
        title: 'Users',
        headerValues: USER_HEADERS
      });
    }

    const rows = await usersSheet.getRows();
    const existingUser = rows.find((r: GoogleSpreadsheetRow) => r.get('email')?.toLowerCase() === email.toLowerCase());

    if (existingUser) {
      res.status(400).json({ error: 'User with this email already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = `u_${Date.now()}`;
    const userAvatar = avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;

    await usersSheet.addRow({
      id: userId,
      email,
      passwordHash,
      name,
      role,
      avatar: userAvatar,
      lastLogin: '',
      team: team || ''
    });

    res.json({
      success: true,
      user: { id: userId, email, name, role, avatar: userAvatar, team: team || undefined }
    });
  } catch (error) {
    serverLogger.error('Registration error', { context: 'Auth', error: error as Error });
    res.status(500).json({ error: 'Registration failed' });
  }
});

// GET /api/auth/me - Get current user from token
app.get('/api/auth/me', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const doc = await getDoc();
    if (!doc) {
      res.status(500).json({ error: 'Failed to connect to database' });
      return;
    }

    const usersSheet = doc.sheetsByTitle['Users'];
    if (!usersSheet) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const rows = await usersSheet.getRows();
    const userRow = rows.find((r: GoogleSpreadsheetRow) => r.get('email') === req.user?.email);

    if (!userRow) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      user: {
        id: userRow.get('id'),
        email: userRow.get('email'),
        name: userRow.get('name'),
        role: userRow.get('role'),
        avatar: userRow.get('avatar')
      }
    });
  } catch (error) {
    serverLogger.error('Get user error', { context: 'Auth', error: error as Error });
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// POST /api/auth/change-password - Change user password
app.post('/api/auth/change-password', authenticateToken, validate(changePasswordSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const doc = await getDoc();
    if (!doc) {
      res.status(500).json({ error: 'Failed to connect to database' });
      return;
    }

    const usersSheet = doc.sheetsByTitle['Users'];
    if (!usersSheet) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const rows = await usersSheet.getRows();
    const userRow = rows.find((r: GoogleSpreadsheetRow) => r.get('email') === req.user?.email);

    if (!userRow) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const isValidPassword = await bcrypt.compare(currentPassword, userRow.get('passwordHash'));
    if (!isValidPassword) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    userRow.set('passwordHash', newPasswordHash);
    await userRow.save();

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    serverLogger.error('Change password error', { context: 'Auth', error: error as Error });
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// GET /api/auth/users - Get all users (for dropdowns, etc.) - requires auth
app.get('/api/auth/users', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const doc = await getDoc();
    if (!doc) {
      res.status(500).json({ error: 'Failed to connect to database' });
      return;
    }

    const usersSheet = doc.sheetsByTitle['Users'];
    if (!usersSheet) {
      res.json({ users: [] });
      return;
    }

    // Ensure headers are up-to-date (adds missing columns like team)
    await usersSheet.loadHeaderRow().catch(() => {});
    const currentHeaders = usersSheet.headerValues || [];
    const missingHeaders = USER_HEADERS.filter(h => !currentHeaders.includes(h));
    if (missingHeaders.length > 0) {
      serverLogger.info('Adding missing Users columns', { context: 'Users', metadata: { missingHeaders } });
      await usersSheet.setHeaderRow([...currentHeaders, ...missingHeaders]);
    }

    const rows = await usersSheet.getRows();
    const users = rows.map((r: GoogleSpreadsheetRow) => ({
      id: r.get('id'),
      email: r.get('email'),
      name: r.get('name'),
      role: r.get('role'),
      avatar: r.get('avatar'),
      team: r.get('team') || undefined,
      lastLogin: r.get('lastLogin') || null
    }));

    res.json({ users });
  } catch (error) {
    serverLogger.error('Get users error', { context: 'Users', error: error as Error });
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// PUT /api/users/:id - Update user (Admin only)
app.put('/api/users/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if user is admin
    if (req.user?.role !== 'Admin') {
      res.status(403).json({ error: 'Only admins can update users' });
      return;
    }

    const { id } = req.params;
    const { role, team } = req.body;

    // Validate that at least one field is being updated
    if (role === undefined && team === undefined) {
      res.status(400).json({ error: 'At least one field (role or team) must be provided' });
      return;
    }

    const doc = await getDoc();
    if (!doc) {
      res.status(500).json({ error: 'Failed to connect to database' });
      return;
    }

    const usersSheet = doc.sheetsByTitle['Users'];
    if (!usersSheet) {
      res.status(404).json({ error: 'Users sheet not found' });
      return;
    }

    // Ensure headers are up-to-date (adds missing columns like team)
    await usersSheet.loadHeaderRow().catch(() => {});
    const currentHeaders = usersSheet.headerValues || [];
    const missingHeaders = USER_HEADERS.filter(h => !currentHeaders.includes(h));
    if (missingHeaders.length > 0) {
      serverLogger.info('Adding missing Users columns', { context: 'Users', metadata: { missingHeaders } });
      await usersSheet.setHeaderRow([...currentHeaders, ...missingHeaders]);
      // Reload rows after header update to get the new column structure
      await usersSheet.loadHeaderRow().catch(() => {});
    }

    const rows = await usersSheet.getRows();
    const userRow = rows.find((r: GoogleSpreadsheetRow) => r.get('id') === id);

    if (!userRow) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Update fields if provided
    if (role !== undefined) {
      if (!VALID_ROLES.includes(role)) {
        res.status(400).json({ error: `Invalid role "${role}". Valid roles: ${VALID_ROLES.join(', ')}` });
        return;
      }
      userRow.set('role', role);
    }

    if (team !== undefined) {
      userRow.set('team', team || '');
    }

    await userRow.save();

    res.json({
      success: true,
      user: {
        id: userRow.get('id'),
        email: userRow.get('email'),
        name: userRow.get('name'),
        role: userRow.get('role'),
        avatar: userRow.get('avatar'),
        team: userRow.get('team') || undefined
      }
    });
  } catch (error) {
    serverLogger.error('Update user error', { context: 'Users', error: error as Error });
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/users/:id - Delete user (Admin only)
app.delete('/api/users/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if user is admin
    if (req.user?.role !== 'Admin') {
      res.status(403).json({ error: 'Only admins can delete users' });
      return;
    }

    const { id } = req.params;

    // Prevent deleting self
    if (req.user?.id === id) {
      res.status(400).json({ error: 'You cannot delete yourself' });
      return;
    }

    const doc = await getDoc();
    if (!doc) {
      res.status(500).json({ error: 'Failed to connect to database' });
      return;
    }

    const usersSheet = doc.sheetsByTitle['Users'];
    if (!usersSheet) {
      res.status(404).json({ error: 'Users sheet not found' });
      return;
    }

    const rows = await usersSheet.getRows();
    const userRow = rows.find((r: GoogleSpreadsheetRow) => r.get('id') === id);

    if (!userRow) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await userRow.delete();

    res.json({
      success: true,
      id: id,
      message: 'User deleted successfully'
    });
  } catch (error) {
    serverLogger.error('Delete user error', { context: 'Users', error: error as Error });
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ============================================
// BULK IMPORT ENDPOINTS
// ============================================

// Valid role values
const VALID_ROLES = ['Admin', 'Team Lead', 'Group Lead (Director)', 'Portfolio Ops', 'VP'];

// POST /api/users/bulk-import - Bulk import users from Excel/CSV data
app.post('/api/users/bulk-import', authenticateToken, validate(bulkImportUsersSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if user is admin
    if (req.user?.role !== 'Admin') {
      res.status(403).json({ error: 'Only admins can bulk import users' });
      return;
    }

    const { users } = req.body;

    const doc = await getDoc();
    if (!doc) {
      res.status(500).json({ error: 'Failed to connect to database' });
      return;
    }

    let usersSheet = doc.sheetsByTitle['Users'];
    if (!usersSheet) {
      usersSheet = await doc.addSheet({
        title: 'Users',
        headerValues: USER_HEADERS
      });
    }

    // Get existing users to check for duplicates
    const existingRows = await usersSheet.getRows();
    const existingEmails = new Set(
      existingRows.map((r: GoogleSpreadsheetRow) => r.get('email')?.toLowerCase())
    );

    const results = {
      created: 0,
      skipped: 0,
      errors: [] as { row: number; email: string; error: string }[]
    };

    const usersToAdd: Record<string, string>[] = [];

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const rowNum = i + 1;

      // Validate email
      if (!user.email || typeof user.email !== 'string') {
        results.errors.push({ row: rowNum, email: user.email || '', error: 'Email is required' });
        continue;
      }

      const email = user.email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        results.errors.push({ row: rowNum, email: user.email, error: 'Invalid email format' });
        continue;
      }

      // Check for duplicates
      if (existingEmails.has(email)) {
        results.skipped++;
        continue;
      }

      // Validate name
      if (!user.name || typeof user.name !== 'string' || user.name.trim().length === 0) {
        results.errors.push({ row: rowNum, email: user.email, error: 'Name is required' });
        continue;
      }

      // Validate role
      const role = user.role?.trim() || 'Team Lead';
      if (!VALID_ROLES.includes(role)) {
        results.errors.push({ 
          row: rowNum, 
          email: user.email, 
          error: `Invalid role "${role}". Valid roles: ${VALID_ROLES.join(', ')}` 
        });
        continue;
      }

      // Generate user data
      const userId = `u_${Date.now()}_${i}`;
      const name = user.name.trim();
      const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;

      usersToAdd.push({
        id: userId,
        email: email,
        passwordHash: '', // No password - users will login via Google OAuth
        name: name,
        role: role,
        avatar: avatar,
        lastLogin: '',
        team: user.team || ''
      });

      // Add to existing set to prevent duplicates within the same import
      existingEmails.add(email);
      results.created++;
    }

    // Batch add all valid users
    if (usersToAdd.length > 0) {
      await usersSheet.addRows(usersToAdd);
    }

    serverLogger.info(`Bulk imported ${results.created} users`, { context: 'Import', metadata: { created: results.created, skipped: results.skipped, errors: results.errors.length } });
    
    res.json({
      success: true,
      created: results.created,
      skipped: results.skipped,
      errors: results.errors,
      total: users.length
    });

  } catch (error) {
    serverLogger.error('Bulk import users error', { context: 'Import', error: error as Error });
    res.status(500).json({ error: 'Bulk import failed: ' + String(error) });
  }
});

// Valid enum values for initiatives
const VALID_ASSET_CLASSES = ['PL', 'Auto', 'POS', 'Advisory'];
const VALID_STATUSES = ['Not Started', 'In Progress', 'At Risk', 'Done', 'Obsolete'];
const VALID_PRIORITIES = ['P0', 'P1', 'P2'];
const VALID_WORK_TYPES = ['Planned Work', 'Unplanned Work'];

// POST /api/sheets/bulk-import - Bulk import initiatives from Excel/CSV data
app.post('/api/sheets/bulk-import', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if user is admin
    if (req.user?.role !== 'Admin') {
      res.status(403).json({ error: 'Only admins can bulk import initiatives' });
      return;
    }

    const { initiatives } = req.body;

    if (!initiatives || !Array.isArray(initiatives) || initiatives.length === 0) {
      res.status(400).json({ error: 'Initiatives array is required and must not be empty' });
      return;
    }

    const doc = await getDoc();
    if (!doc) {
      res.status(500).json({ error: 'Failed to connect to database' });
      return;
    }

    // Get users sheet to map emails to user IDs
    const usersSheet = doc.sheetsByTitle['Users'];
    const userRows = usersSheet ? await usersSheet.getRows() : [];
    const emailToUserId = new Map<string, string>();
    userRows.forEach((r: GoogleSpreadsheetRow) => {
      const email = r.get('email')?.toLowerCase();
      const id = r.get('id');
      if (email && id) {
        emailToUserId.set(email, id);
      }
    });

    // Get or create initiatives sheet
    let initiativesSheet = doc.sheetsByTitle['Initiatives'];
    if (!initiativesSheet) {
      initiativesSheet = await doc.addSheet({
        title: 'Initiatives',
        headerValues: INITIATIVE_HEADERS,
        gridProperties: { rowCount: 1000, columnCount: 50 }
      });
    }

    // Load existing initiatives to calculate next sequence number
    const existingRows = await initiativesSheet.getRows();
    const existingInitiatives = existingRows.map((r: GoogleSpreadsheetRow) => ({
      id: r.get('id') || '',
      quarter: r.get('quarter') || ''
    }));

    const results = {
      imported: 0,
      skipped: 0,
      errors: [] as { row: number; title: string; error: string }[]
    };

    const initiativesToAdd: Record<string, string>[] = [];
    const today = new Date().toISOString().split('T')[0];
    
    // Track generated initiatives to ensure sequential IDs
    const generatedInitiatives: Array<{ id: string; quarter?: string }> = [...existingInitiatives];

    for (let i = 0; i < initiatives.length; i++) {
      const init = initiatives[i];
      const rowNum = i + 1;
      const title = init.title || init.Title || '';

      // Validate required fields
      if (!title || title.trim().length === 0) {
        results.errors.push({ row: rowNum, title: '', error: 'Title is required' });
        continue;
      }

      // Validate and get owner ID from email
      const ownerEmail = (init.ownerEmail || init['Owner Email'] || init.owner || init.Owner || '').toString().trim().toLowerCase();
      let ownerId = '';
      
      if (ownerEmail) {
        ownerId = emailToUserId.get(ownerEmail) || '';
        if (!ownerId) {
          results.errors.push({ 
            row: rowNum, 
            title, 
            error: `Owner email "${ownerEmail}" not found in users. Please import users first.` 
          });
          continue;
        }
      }

      // Validate asset class
      const assetClass = init.l1_assetClass || init['Asset Class'] || init.assetClass || '';
      if (assetClass && !VALID_ASSET_CLASSES.includes(assetClass)) {
        results.errors.push({ 
          row: rowNum, 
          title, 
          error: `Invalid asset class "${assetClass}". Valid values: ${VALID_ASSET_CLASSES.join(', ')}` 
        });
        continue;
      }

      // Validate status (default to Not Started)
      let status = init.status || init.Status || 'Not Started';
      if (!VALID_STATUSES.includes(status)) {
        results.errors.push({ 
          row: rowNum, 
          title, 
          error: `Invalid status "${status}". Valid values: ${VALID_STATUSES.join(', ')}` 
        });
        continue;
      }

      // Validate priority (default to P1)
      let priority = init.priority || init.Priority || 'P1';
      if (!VALID_PRIORITIES.includes(priority)) {
        results.errors.push({ 
          row: rowNum, 
          title, 
          error: `Invalid priority "${priority}". Valid values: ${VALID_PRIORITIES.join(', ')}` 
        });
        continue;
      }

      // Validate work type (default to Planned Work)
      let workType = init.workType || init['Work Type'] || 'Planned Work';
      if (!VALID_WORK_TYPES.includes(workType)) {
        results.errors.push({ 
          row: rowNum, 
          title, 
          error: `Invalid work type "${workType}". Valid values: ${VALID_WORK_TYPES.join(', ')}` 
        });
        continue;
      }

      // Parse numeric fields
      const estimatedEffort = parseFloat(init.estimatedEffort || init['Estimated Effort'] || init['Estimated Effort (weeks)'] || '0') || 0;
      const actualEffort = parseFloat(init.actualEffort || init['Actual Effort'] || init['Actual Effort (weeks)'] || '0') || 0;

      // Parse dates
      let eta = init.eta || init.ETA || init['ETA'] || '';
      if (eta && typeof eta === 'number') {
        // Excel date serial number conversion
        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + eta * 86400000);
        eta = date.toISOString().split('T')[0];
      }

      // Generate unique ID using Jira-style format (Q425-001)
      const quarter = init.quarter || init.Quarter || '';
      const initiativeId = generateInitiativeId(quarter, generatedInitiatives);

      // Build initiative object
      const initiativeData: Record<string, string> = {
        id: initiativeId,
        l1_assetClass: assetClass,
        l2_pillar: init.l2_pillar || init.Pillar || init.pillar || '',
        l3_responsibility: init.l3_responsibility || init.Responsibility || init.responsibility || '',
        l4_target: init.l4_target || init.Target || init.target || '',
        title: title.trim(),
        ownerId: ownerId,
        secondaryOwner: init.secondaryOwner || init['Secondary Owner'] || '',
        quarter: quarter,
        status: status,
        priority: priority,
        estimatedEffort: String(estimatedEffort),
        originalEstimatedEffort: String(estimatedEffort),
        actualEffort: String(actualEffort),
        eta: eta,
        originalEta: eta,
        lastUpdated: today,
        createdAt: today,
        createdBy: req.user?.id || '',
        dependencies: init.dependencies || init.Dependencies || '',
        workType: workType,
        unplannedTags: '[]',
        riskActionLog: init.riskActionLog || init['Risk Action Log'] || '',
        isAtRisk: status === 'At Risk' ? 'true' : 'false',
        comments: '[]',
        history: '[]'
      };

      // Add to generated list for next iteration
      generatedInitiatives.push({ id: initiativeId, quarter });

      initiativesToAdd.push(initiativeData);
      results.imported++;
    }

    // Deduplicate initiatives before adding (keep first occurrence)
    const seenIds = new Set<string>();
    const deduplicatedToAdd = initiativesToAdd.filter((init: Record<string, string>) => {
      const id = init.id;
      if (!id || seenIds.has(id)) {
        if (id) {
          serverLogger.warn(`Bulk import: Found duplicate initiative ID: ${id}, skipping duplicate`, { context: 'Import' });
        }
        return false;
      }
      seenIds.add(id);
      return true;
    });

    if (initiativesToAdd.length !== deduplicatedToAdd.length) {
      serverLogger.info('Bulk import: Deduplicated initiatives', { context: 'Import', metadata: { before: initiativesToAdd.length, after: deduplicatedToAdd.length } });
      results.imported = deduplicatedToAdd.length;
    }

    // Batch add all valid deduplicated initiatives
    if (deduplicatedToAdd.length > 0) {
      await initiativesSheet.addRows(deduplicatedToAdd);
    }

    serverLogger.info(`Bulk imported ${results.imported} initiatives`, { context: 'Import', metadata: { imported: results.imported, errors: results.errors.length } });
    
    res.json({
      success: true,
      imported: results.imported,
      skipped: results.skipped,
      errors: results.errors,
      total: initiatives.length
    });

  } catch (error) {
    serverLogger.error('Bulk import initiatives error', { context: 'Import', error: error as Error });
    res.status(500).json({ error: 'Bulk import failed: ' + String(error) });
  }
});

// ============================================
// PROTECTED ROUTES (Require Auth)
// ============================================

// Health check (public)
app.get('/api/sheets/health', async (req, res) => {
  const configured = !!(SPREADSHEET_ID && SERVICE_ACCOUNT_EMAIL && SERVICE_ACCOUNT_PRIVATE_KEY);
  
  // If debug query param, try actual connection
  if (req.query.debug === 'true') {
    try {
      const doc = await getDoc();
      if (doc) {
        res.json({
          status: 'ok',
          configured,
          connected: true,
          spreadsheetTitle: doc.title,
          sheetCount: doc.sheetCount,
          sheets: doc.sheetsByIndex.map(s => s.title)
        });
      } else {
        const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '';
        res.json({
          status: 'error',
          configured,
          connected: false,
          error: getLastConnectionError() || 'Unknown error - getDoc returned null',
          keyDebug: {
            rawLength: rawKey.length,
            hasBeginMarker: rawKey.includes('-----BEGIN'),
            hasRealNewlines: rawKey.includes('\n'),
            hasEscapedNewlines: rawKey.includes('\\n'),
            first50: rawKey.substring(0, 50),
            parsedFirst50: SERVICE_ACCOUNT_PRIVATE_KEY?.substring(0, 50)
          }
        });
      }
    } catch (error) {
      res.json({
        status: 'error',
        configured,
        connected: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }
  
  res.json({
    status: 'ok',
    configured
  });
});

// Mutex to prevent concurrent sync operations that could cause race conditions
let syncMutex = false;
const syncMutexQueue: Array<() => void> = [];

async function acquireSyncMutex(): Promise<void> {
  return new Promise((resolve) => {
    if (!syncMutex) {
      syncMutex = true;
      resolve();
    } else {
      syncMutexQueue.push(resolve);
    }
  });
}

function releaseSyncMutex(): void {
  syncMutex = false;
  const next = syncMutexQueue.shift();
  if (next) {
    syncMutex = true;
    next();
  }
}

// POST /api/sheets/initiatives - Upsert initiatives (Protected)
app.post('/api/sheets/initiatives', authenticateToken, validate(initiativesArraySchema), async (req: AuthenticatedRequest, res: Response) => {
  // Acquire mutex to prevent concurrent sync operations
  await acquireSyncMutex();
  
  try {
    const { initiatives } = req.body;

    // Deduplicate incoming initiatives by ID (keep first occurrence)
    const seenIds = new Set<string>();
    const deduplicated = initiatives.filter((init: { id: string }) => {
      if (seenIds.has(init.id)) {
        serverLogger.warn(`Upsert: Found duplicate initiative ID in request: ${init.id}, skipping duplicate`, { context: 'Sync' });
        return false;
      }
      seenIds.add(init.id);
      return true;
    });

    if (initiatives.length !== deduplicated.length) {
      serverLogger.info('Upsert: Deduplicated incoming initiatives', { context: 'Sync', metadata: { before: initiatives.length, after: deduplicated.length } });
    }

    const doc = await getDoc();
    if (!doc) {
      res.status(500).json({ error: 'Failed to connect to Google Sheets' });
      return;
    }

    let sheet = doc.sheetsByTitle['Initiatives'];
    
    if (!sheet) {
      sheet = await doc.addSheet({
        title: 'Initiatives',
        headerValues: INITIATIVE_HEADERS,
        gridProperties: { rowCount: 1000, columnCount: 50 }
      });
    } else {
      // Ensure headers are set if sheet exists but has no headers
      await sheet.loadHeaderRow().catch(async () => {
        serverLogger.info('Initiatives sheet has no headers, setting them now', { context: 'Sheets' });
        await sheet!.setHeaderRow(INITIATIVE_HEADERS);
      });
    }

    // Get all rows from sheet
    // NOTE: We no longer delete "duplicate" rows here because:
    // 1. With concurrent requests, legitimate items can be incorrectly identified as duplicates
    // 2. The upsert logic below already handles duplicates by updating existing rows
    // 3. If true duplicates exist, they should be handled manually or via a separate cleanup process
    const rows = await sheet.getRows();
    
    // Log if duplicates are detected (for monitoring) but don't delete them
    const seenSheetIds = new Set<string>();
    const duplicateIds: string[] = [];
    for (const row of rows) {
      const id = row.get('id');
      if (!id || id.startsWith('_meta_')) continue;
      
      if (seenSheetIds.has(id)) {
        duplicateIds.push(id);
      } else {
        seenSheetIds.add(id);
      }
    }
    
    if (duplicateIds.length > 0) {
      serverLogger.warn(`Upsert: Detected ${duplicateIds.length} duplicate ID(s) in sheet`, { context: 'Sync', metadata: { duplicates: duplicateIds.slice(0, 5) } });
    }

    // Now process deduplicated initiatives
    // Create a map of existing IDs for faster lookup
    const existingIds = new Set(rows.map((r: GoogleSpreadsheetRow) => r.get('id')).filter((id: string) => id && !id.startsWith('_meta_')));
    
    serverLogger.debug(`Processing ${deduplicated.length} initiatives, found ${existingIds.size} existing IDs in sheet`, { 
      context: 'Sync', 
      metadata: { 
        existingIds: Array.from(existingIds).slice(0, 10), // Log first 10 for debugging
        totalRows: rows.length 
      } 
    });
    
    // Track items where server is newer (for client to update their local state)
    const serverNewer: Array<{
      id: string;
      serverData: Record<string, unknown>;
    }> = [];
    let syncedCount = 0;
    
    // Collect all new initiatives to add in batch (like changelog does)
    const newInitiativesToAdd: Array<Record<string, string>> = [];
    
    for (const initiative of deduplicated) {
      serverLogger.debug(`Processing initiative ${initiative.id}`, { context: 'Sync', metadata: { title: initiative.title?.substring(0, 50) } });
      const existing = rows.find((r: GoogleSpreadsheetRow) => {
        const rowId = r.get('id');
        return rowId === initiative.id;
      });
      
      serverLogger.debug(`Row lookup for ${initiative.id}`, { 
        context: 'Sync', 
        metadata: { 
          found: !!existing,
          inExistingIds: existingIds.has(initiative.id),
          rowId: existing?.get('id')
        } 
      });

      if (existing) {
        // Last-write-wins based on lastUpdated timestamp
        const serverLastUpdated = existing.get('lastUpdated') || '';
        const clientLastUpdated = initiative.lastUpdated || '';
        
        // Compare timestamps - if server is newer, skip update and return server data
        if (serverLastUpdated && clientLastUpdated && serverLastUpdated > clientLastUpdated) {
          serverLogger.debug(`Server is newer for ${initiative.id}`, { context: 'Sync', metadata: { serverLastUpdated, clientLastUpdated } });
          serverNewer.push({
            id: initiative.id,
            serverData: {
              id: existing.get('id'),
              title: existing.get('title'),
              status: existing.get('status'),
              eta: existing.get('eta'),
              lastUpdated: existing.get('lastUpdated'),
              version: parseInt(existing.get('version') || '0', 10)
            }
          });
          continue; // Skip - server has newer data
        }
        
        // Client is newer or same - update the row
        serverLogger.debug(`Updating ${initiative.id}: client >= server`, { context: 'Sync' });
        const serverVersion = parseInt(existing.get('version') || '0', 10);
        const newVersion = serverVersion + 1;
        // Preserve createdAt and createdBy from server if not provided by client
        const serverCreatedAt = existing.get('createdAt');
        const serverCreatedBy = existing.get('createdBy');
        Object.keys(initiative).forEach(key => {
          const value = initiative[key];
          existing.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''));
        });
        // Preserve createdAt and createdBy if they exist on server but not in client update
        if (serverCreatedAt && !initiative.createdAt) {
          existing.set('createdAt', serverCreatedAt);
        }
        if (serverCreatedBy && !initiative.createdBy) {
          existing.set('createdBy', serverCreatedBy);
        }
        existing.set('version', String(newVersion));
        await existing.save();
        syncedCount++;
      } else if (!existingIds.has(initiative.id)) {
        // Collect new initiatives to add in batch (more reliable than addRow)
        serverLogger.info(`Queueing NEW initiative for batch add: ${initiative.id} - ${initiative.title}`, { context: 'Sync' });
        const rowData: Record<string, string> = {};
        // Use INITIATIVE_HEADERS to ensure we only include columns that exist in the sheet
        INITIATIVE_HEADERS.forEach(header => {
          const value = initiative[header];
          rowData[header] = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
        });
        // Set initial version for new initiatives
        rowData['version'] = String((parseInt(initiative.version || '0', 10) || 0) + 1);
        newInitiativesToAdd.push(rowData);
        existingIds.add(initiative.id); // Track that we're adding it
      } else {
        serverLogger.warn(`Upsert: Initiative ${initiative.id} already exists, skipping add`, { context: 'Sync' });
      }
    }
    
    // Batch add all new initiatives (like changelog does - more reliable)
    if (newInitiativesToAdd.length > 0) {
      try {
        serverLogger.info(`Batch adding ${newInitiativesToAdd.length} new initiative(s) using addRows`, { context: 'Sync' });
        await sheet.addRows(newInitiativesToAdd);
        serverLogger.info(`Successfully batch-added ${newInitiativesToAdd.length} initiative(s)`, { context: 'Sync' });
        syncedCount += newInitiativesToAdd.length;
        
        // Verify all rows were added
        const verifyRows = await sheet.getRows();
        const addedIds = newInitiativesToAdd.map(r => r.id).filter(Boolean);
        const missingIds: string[] = [];
        for (const id of addedIds) {
          const found = verifyRows.find((r: GoogleSpreadsheetRow) => r.get('id') === id);
          if (!found) {
            missingIds.push(id);
          }
        }
        if (missingIds.length > 0) {
          serverLogger.error(`Batch add succeeded but ${missingIds.length} row(s) not found in sheet`, { 
            context: 'Sync', 
            metadata: { missingIds: missingIds.slice(0, 5) } 
          });
          throw new Error(`Failed to verify ${missingIds.length} initiative(s) were added to sheet`);
        } else {
          serverLogger.info(`Verified all ${newInitiativesToAdd.length} initiative(s) were added to sheet`, { context: 'Sync' });
        }
      } catch (batchAddError) {
        serverLogger.error(`Failed to batch-add initiatives`, { context: 'Sync', error: batchAddError as Error, metadata: { count: newInitiativesToAdd.length } });
        throw batchAddError; // Re-throw to be caught by outer catch
      }
    }

    // Log activity
    const createdCount = deduplicated.filter((init: { id: string }) => !rows.find((r: GoogleSpreadsheetRow) => r.get('id') === init.id)).length;
    const updatedCount = syncedCount - createdCount;
    if (createdCount > 0) {
      logActivity(req, ActivityType.CREATE_INITIATIVE, `Created ${createdCount} initiative(s)`, { count: createdCount });
    }
    if (updatedCount > 0) {
      logActivity(req, ActivityType.UPDATE_INITIATIVE, `Updated ${updatedCount} initiative(s)`, { count: updatedCount });
    }

    if (serverNewer.length > 0) {
      serverLogger.info(`Synced ${syncedCount} initiatives, ${serverNewer.length} had newer server data`, { context: 'Sync' });
      res.json({ 
        success: true, 
        count: syncedCount, 
        serverNewer,
        message: `${serverNewer.length} initiative(s) were skipped - server has newer data`
      });
    } else {
      serverLogger.info(`Synced ${syncedCount} initiatives`, { context: 'Sync' });
      res.json({ success: true, count: syncedCount });
    }
  } catch (error) {
    serverLogger.error('Error syncing initiatives', { context: 'Sync', error: error as Error });
    res.status(500).json({ error: String(error) });
  } finally {
    // CRITICAL: Always release mutex to prevent deadlock
    releaseSyncMutex();
  }
});

// DELETE /api/sheets/initiatives/:id - Soft delete an initiative (Protected)
app.delete('/api/sheets/initiatives/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const doc = await getDoc();
    if (!doc) {
      res.status(500).json({ error: 'Failed to connect to Google Sheets' });
      return;
    }

    let sheet = doc.sheetsByTitle['Initiatives'];
    
    if (!sheet) {
      res.status(404).json({ error: 'Initiatives sheet not found' });
      return;
    }

    const rows = await sheet.getRows();
    const rowToUpdate = rows.find((r: GoogleSpreadsheetRow) => r.get('id') === id);
    
    if (!rowToUpdate) {
      res.status(404).json({ error: 'Initiative not found' });
      return;
    }

    // Soft delete: set status to Deleted and add deletedAt timestamp
    const deletedAt = new Date().toISOString();
    const initiativeTitle = rowToUpdate.get('title') || id;
    rowToUpdate.set('status', 'Deleted');
    rowToUpdate.set('deletedAt', deletedAt);
    await rowToUpdate.save();
    
    // Log activity
    logActivity(req, ActivityType.DELETE_INITIATIVE, `Deleted initiative: ${initiativeTitle}`, { initiativeId: id, initiativeTitle });
    
    serverLogger.info(`Soft deleted initiative ${id}`, { context: 'Delete', metadata: { deletedAt } });
    res.json({ success: true, id, deletedAt });
  } catch (error) {
    serverLogger.error('Error soft deleting initiative', { context: 'Delete', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// DELETE /api/sheets/tasks/:id - Soft delete a task (Protected)
app.delete('/api/sheets/tasks/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;
    
    if (!currentUser) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const doc = await getDoc();
    if (!doc) {
      res.status(500).json({ error: 'Failed to connect to Google Sheets' });
      return;
    }

    // Load app config for permission checking
    const config = await loadAppConfig(doc);
    if (!config) {
      serverLogger.warn('Config not found, proceeding without authorization check', { context: 'DeleteTask' });
      // In production, you might want to deny access if config is missing
      // For now, we'll proceed but log a warning
    }

    let tasksSheet = doc.sheetsByTitle['Tasks'];
    
    if (!tasksSheet) {
      res.status(404).json({ error: 'Tasks sheet not found' });
      return;
    }

    await tasksSheet.loadHeaderRow();
    const rows = await tasksSheet.getRows();
    const rowToUpdate = rows.find((r: GoogleSpreadsheetRow) => r.get('id') === id);
    
    if (!rowToUpdate) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Get task data for authorization check
    const taskOwnerId = rowToUpdate.get('ownerId');
    const parentId = rowToUpdate.get('parentId'); // This is the initiative ID
    
    // Get initiative to check its owner
    let initiativeOwnerId: string | undefined = undefined;
    if (parentId) {
      try {
        const initiativesSheet = doc.sheetsByTitle['Initiatives'];
        if (initiativesSheet) {
          await initiativesSheet.loadHeaderRow();
          const initiativeRows = await initiativesSheet.getRows();
          const initiativeRow = initiativeRows.find((r: GoogleSpreadsheetRow) => r.get('id') === parentId);
          if (initiativeRow) {
            initiativeOwnerId = initiativeRow.get('ownerId');
          }
        }
      } catch (error) {
        serverLogger.error('Error loading initiative for delete check', { context: 'DeleteTask', error: error as Error });
        // Continue without initiative owner check - will rely on task owner only
      }
    }

    // Check authorization if config is available
    if (config) {
      const hasPermission = canUserDeleteTask(
        config,
        currentUser.role,
        taskOwnerId,
        initiativeOwnerId,
        currentUser.id,
        currentUser.email
      );
      
      if (!hasPermission) {
        serverLogger.debug(`Permission denied for user ${currentUser.id} to delete task ${id}`, { 
          context: 'DeleteTask', 
          metadata: { role: currentUser.role, taskOwnerId, initiativeOwnerId }
        });
        res.status(403).json({ 
          error: 'You do not have permission to delete this task',
          details: 'You can only delete tasks that you own or tasks in initiatives you own'
        });
        return;
      }
    } else {
      // If config is not available, fall back to basic check: user must own the task or initiative
      // Using matchesUserId for email matching support
      const ownsTask = matchesUserId(taskOwnerId, currentUser.id, currentUser.email);
      const ownsInitiative = matchesUserId(initiativeOwnerId, currentUser.id, currentUser.email);
      
      if (!ownsTask && !ownsInitiative && currentUser.role !== 'Admin') {
        serverLogger.debug(`Fallback authorization denied for user ${currentUser.id} to delete task ${id}`, { context: 'DeleteTask' });
        res.status(403).json({ 
          error: 'You do not have permission to delete this task',
          details: 'You can only delete tasks that you own or tasks in initiatives you own'
        });
        return;
      }
    }

    // Soft delete: set status to Deleted and add deletedAt timestamp
    const deletedAt = new Date().toISOString();
    rowToUpdate.set('status', 'Deleted');
    rowToUpdate.set('deletedAt', deletedAt);
    await rowToUpdate.save();
    
    serverLogger.info(`Soft deleted task ${id}`, { context: 'DeleteTask', metadata: { deletedAt, userId: currentUser.id } });
    res.json({ success: true, id, deletedAt });
  } catch (error) {
    serverLogger.error('Error soft deleting task', { context: 'DeleteTask', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/sheets/initiatives/:id/restore - Restore a soft-deleted initiative (Protected)
app.post('/api/sheets/initiatives/:id/restore', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const doc = await getDoc();
    if (!doc) {
      res.status(500).json({ error: 'Failed to connect to Google Sheets' });
      return;
    }

    let sheet = doc.sheetsByTitle['Initiatives'];
    
    if (!sheet) {
      res.status(404).json({ error: 'Initiatives sheet not found' });
      return;
    }

    const rows = await sheet.getRows();
    const rowToUpdate = rows.find((r: GoogleSpreadsheetRow) => r.get('id') === id);
    
    if (!rowToUpdate) {
      res.status(404).json({ error: 'Initiative not found' });
      return;
    }

    // Restore: clear deletedAt and set status to Not Started
    rowToUpdate.set('status', 'Not Started');
    rowToUpdate.set('deletedAt', '');
    await rowToUpdate.save();
    
    serverLogger.info(`Restored initiative ${id}`, { context: 'Restore' });
    res.json({ success: true, id });
  } catch (error) {
    serverLogger.error('Error restoring initiative', { context: 'Restore', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/sheets/tasks/:id/restore - Restore a soft-deleted task (Protected)
app.post('/api/sheets/tasks/:id/restore', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const doc = await getDoc();
    if (!doc) {
      res.status(500).json({ error: 'Failed to connect to Google Sheets' });
      return;
    }

    let sheet = doc.sheetsByTitle['Tasks'];
    
    if (!sheet) {
      res.status(404).json({ error: 'Tasks sheet not found' });
      return;
    }

    const rows = await sheet.getRows();
    const rowToUpdate = rows.find((r: GoogleSpreadsheetRow) => r.get('id') === id);
    
    if (!rowToUpdate) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Restore: clear deletedAt and set status to Not Started
    rowToUpdate.set('status', 'Not Started');
    rowToUpdate.set('deletedAt', '');
    await rowToUpdate.save();
    
    serverLogger.info(`Restored task ${id}`, { context: 'Restore' });
    res.json({ success: true, id });
  } catch (error) {
    serverLogger.error('Error restoring task', { context: 'Restore', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/sheets/changelog - Append change records (Protected)
app.post('/api/sheets/changelog', authenticateToken, validate(changelogSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { changes } = req.body;

    const doc = await getDoc();
    if (!doc) {
      res.status(500).json({ error: 'Failed to connect to Google Sheets' });
      return;
    }

    let sheet = doc.sheetsByTitle['ChangeLog'];
    
    if (!sheet) {
      sheet = await doc.addSheet({
        title: 'ChangeLog',
        headerValues: CHANGELOG_HEADERS
      });
    } else {
      // Ensure headers are set if sheet exists but is empty
      await sheet.loadHeaderRow().catch(async () => {
        serverLogger.info('ChangeLog sheet has no headers, setting them now', { context: 'Changelog' });
        await sheet!.setHeaderRow(CHANGELOG_HEADERS);
      });
    }

    await sheet.addRows(changes.map((c: Record<string, unknown>) => ({
      id: String(c.id || ''),
      issueType: String(c.issueType || 'Initiative'),
      parentId: String(c.parentId || c.initiativeId || ''),
      initiativeId: String(c.initiativeId || ''),
      initiativeTitle: String(c.initiativeTitle || ''),
      taskId: String(c.taskId || ''),
      field: String(c.field || ''),
      oldValue: String(c.oldValue ?? ''),
      newValue: String(c.newValue ?? ''),
      changedBy: String(c.changedBy || ''),
      timestamp: String(c.timestamp || '')
    })));

    serverLogger.info(`Appended ${changes.length} change records`, { context: 'Changelog' });
    res.json({ success: true, count: changes.length });
  } catch (error) {
    serverLogger.error('Error appending changelog', { context: 'Changelog', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/sheets/tasks - Sync tasks to separate Tasks sheet (Protected)
app.post('/api/sheets/tasks', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tasks } = req.body;

    if (!tasks || !Array.isArray(tasks)) {
      res.status(400).json({ error: 'Tasks array is required' });
      return;
    }

    const doc = await getDoc();
    if (!doc) {
      res.status(500).json({ error: 'Failed to connect to Google Sheets' });
      return;
    }

    let sheet = doc.sheetsByTitle['Tasks'];
    
    if (!sheet) {
      serverLogger.info('Creating Tasks sheet with headers', { context: 'Tasks' });
      sheet = await doc.addSheet({
        title: 'Tasks',
        headerValues: TASK_HEADERS
      });
    } else {
      // Always set headers first to ensure they're correct
      serverLogger.debug('Setting/resetting Tasks sheet headers', { context: 'Tasks' });
      await sheet.setHeaderRow(TASK_HEADERS);
    }

    // Get existing rows and create a map by task ID
    const rows = await sheet.getRows();
    const existingTaskIds = new Set(rows.map((r: GoogleSpreadsheetRow) => r.get('id')));

    let syncedCount = 0;
    for (const task of tasks) {
      const existing = rows.find((r: GoogleSpreadsheetRow) => r.get('id') === task.id);

      if (existing) {
        // Update existing task
        // Preserve createdAt and createdBy from server if not provided by client
        const serverCreatedAt = existing.get('createdAt');
        const serverCreatedBy = existing.get('createdBy');
        Object.keys(task).forEach(key => {
          const value = task[key];
          existing.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''));
        });
        // Preserve createdAt and createdBy if they exist on server but not in client update
        if (serverCreatedAt && !task.createdAt) {
          existing.set('createdAt', serverCreatedAt);
        }
        if (serverCreatedBy && !task.createdBy) {
          existing.set('createdBy', serverCreatedBy);
        }
        await existing.save();
        syncedCount++;
      } else if (!existingTaskIds.has(task.id)) {
        // Add new task
        const rowData: Record<string, string> = {};
        Object.keys(task).forEach(key => {
          const value = task[key];
          rowData[key] = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
        });
        await sheet.addRow(rowData);
        existingTaskIds.add(task.id);
        syncedCount++;
      }
    }

    serverLogger.info(`Synced ${syncedCount} tasks`, { context: 'Tasks' });
    res.json({ success: true, count: syncedCount });
  } catch (error) {
    serverLogger.error('Error syncing tasks', { context: 'Tasks', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/sheets/snapshot - Create new snapshot tab (Protected)
app.post('/api/sheets/snapshot', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { snapshot } = req.body;

    serverLogger.debug('Snapshot creation request received', { 
      context: 'Snapshot', 
      metadata: { hasSnapshot: !!snapshot, hasData: !!(snapshot && snapshot.data), snapshotId: snapshot?.id }
    });

    if (!snapshot || !snapshot.data) {
      serverLogger.error('Snapshot creation failed: Missing snapshot or snapshot.data', { context: 'Snapshot' });
      res.status(400).json({ error: 'Invalid snapshot data: snapshot or data is missing' });
      return;
    }

    // Validate that data is an array and not empty
    if (!Array.isArray(snapshot.data)) {
      serverLogger.error('Snapshot creation failed: snapshot.data is not an array', { context: 'Snapshot' });
      res.status(400).json({ error: 'Invalid snapshot data: data must be an array' });
      return;
    }

    if (snapshot.data.length === 0) {
      serverLogger.error('Snapshot creation failed: snapshot.data is empty', { context: 'Snapshot' });
      serverLogger.info('Attempting to pull current initiatives from Sheets as fallback...', { context: 'Snapshot' });
      
      // Fallback: Try to pull current initiatives from the Initiatives sheet
      const doc = await getDoc();
      if (!doc) {
        res.status(500).json({ error: 'Failed to connect to Google Sheets' });
        return;
      }

      const initiativesSheet = doc.sheetsByTitle['Initiatives'];
      if (initiativesSheet) {
        const rows = await initiativesSheet.getRows();
        const initiatives = rows
          .filter((row: GoogleSpreadsheetRow) => row.get('id') && !row.get('id').startsWith('_meta_'))
          .map((row: GoogleSpreadsheetRow) => {
            const rowData: Record<string, string> = {};
            INITIATIVE_HEADERS.forEach(header => {
              rowData[header] = row.get(header) || '';
            });
            return rowData;
          });

        if (initiatives.length > 0) {
          serverLogger.info(`Using ${initiatives.length} initiatives from Initiatives sheet as snapshot data`, { context: 'Snapshot' });
          snapshot.data = initiatives;
        } else {
          res.status(400).json({ error: 'Invalid snapshot data: data array is empty and no initiatives found in Sheets. Cannot create snapshot without initiatives.' });
          return;
        }
      } else {
        res.status(400).json({ error: 'Invalid snapshot data: data array is empty. Cannot create snapshot without initiatives.' });
        return;
      }
    }

    serverLogger.info(`Creating snapshot with ${snapshot.data.length} initiatives`, { context: 'Snapshot' });

    const doc = await getDoc();
    if (!doc) {
      res.status(500).json({ error: 'Failed to connect to Google Sheets' });
      return;
    }

    const timestamp = new Date(snapshot.timestamp).toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const safeName = (snapshot.name || 'Snapshot')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .slice(0, 50);
    const tabName = `Snap_${timestamp}_${safeName}`.slice(0, 100);

    serverLogger.debug(`Creating snapshot tab: ${tabName}`, { context: 'Snapshot' });

    // Create sheet with enough columns for all headers (default is 26, we need at least 35)
    const newSheet = await doc.addSheet({
      title: tabName,
      headerValues: INITIATIVE_HEADERS,
      gridProperties: {
        rowCount: 1000,  // Start with 1000 rows for snapshots
        columnCount: Math.max(INITIATIVE_HEADERS.length + 5, 40)  // Add buffer columns
      }
    });

    await newSheet.addRow({
      id: `_meta_${snapshot.id}`,
      title: `Created: ${snapshot.timestamp} by ${snapshot.createdBy}`,
      l1_assetClass: '',
      l2_pillar: '',
      l3_responsibility: '',
      l4_target: ''
    });

    // Map snapshot data to rows, ensuring all required fields are present
    serverLogger.debug(`Mapping ${snapshot.data.length} initiatives to rows...`, { context: 'Snapshot' });
    const rowsToAdd = snapshot.data.map((item: Record<string, unknown>) => {
      const rowData: Record<string, string> = {};
      INITIATIVE_HEADERS.forEach(header => {
        const value = item[header];
        rowData[header] = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
      });
      return rowData;
    });

    if (rowsToAdd.length > 0) {
      serverLogger.debug(`Adding ${rowsToAdd.length} rows to snapshot sheet...`, { context: 'Snapshot' });
      await newSheet.addRows(rowsToAdd);
      serverLogger.success(`Successfully created snapshot tab: ${tabName} with ${rowsToAdd.length} initiatives`);
      
      // Verify rows were added
      const verifyRows = await newSheet.getRows();
      const dataRows = verifyRows.filter((r: GoogleSpreadsheetRow) => !r.get('id')?.startsWith('_meta_'));
      
      if (dataRows.length !== rowsToAdd.length) {
        serverLogger.warn(`Row count mismatch in snapshot`, { context: 'Snapshot', metadata: { expected: rowsToAdd.length, got: dataRows.length } });
      }
    } else {
      serverLogger.error('No rows to add to snapshot after mapping', { context: 'Snapshot' });
      res.status(400).json({ error: 'Failed to map snapshot data to rows' });
      return;
    }

    res.json({ success: true, tabName, count: rowsToAdd.length });
  } catch (error) {
    serverLogger.error('Error creating snapshot', { context: 'Snapshot', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/sheets/pull - Pull all data from Sheets (Protected)
app.get('/api/sheets/pull', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const doc = await getDoc();
    if (!doc) {
      res.status(500).json({ error: 'Failed to connect to Google Sheets' });
      return;
    }

    const sheet = doc.sheetsByTitle['Initiatives'];
    if (!sheet) {
      res.json({ initiatives: [], config: null, users: null });
      return;
    }

    const rows = await sheet.getRows();
    
    const allInitiatives = rows
      .filter((row: GoogleSpreadsheetRow) => row.get('id') && !row.get('id').startsWith('_meta_'))
      .map((row: GoogleSpreadsheetRow) => {
        const parseJson = (val: string | undefined, fallback: unknown) => {
          if (!val) return fallback;
          try {
            return JSON.parse(val);
          } catch {
            return fallback;
          }
        };

        return {
          id: row.get('id') || '',
          initiativeType: row.get('initiativeType') || 'WP',
          l1_assetClass: row.get('l1_assetClass') || '',
          l2_pillar: row.get('l2_pillar') || row.get('Pillar') || row.get('pillar') || '',
          l3_responsibility: row.get('l3_responsibility') || row.get('Responsibility') || row.get('responsibility') || row.get('L3 Responsibility') || '',
          l4_target: row.get('l4_target') || row.get('Target') || row.get('target') || '',
          title: row.get('title') || '',
          ownerId: row.get('ownerId') || '',
          secondaryOwner: row.get('secondaryOwner') || undefined,
          quarter: row.get('quarter') || '',
          status: row.get('status') || 'Planned',
          priority: row.get('priority') || 'P1',
          estimatedEffort: Number(row.get('estimatedEffort')) || 0,
          originalEstimatedEffort: Number(row.get('originalEstimatedEffort')) || 0,
          actualEffort: Number(row.get('actualEffort')) || 0,
          eta: row.get('eta') || '',
          originalEta: row.get('originalEta') || '',
          lastUpdated: row.get('lastUpdated') || '',
          lastWeeklyUpdate: row.get('lastWeeklyUpdate') || undefined,
          dependencies: row.get('dependencies') || undefined,
          workType: row.get('workType') || 'Planned Work',
          unplannedTags: parseJson(row.get('unplannedTags'), []),
          riskActionLog: row.get('riskActionLog') || undefined,
          isAtRisk: row.get('isAtRisk') === 'true',
          definitionOfDone: row.get('definitionOfDone') || undefined,
          tasks: parseJson(row.get('tasks'), []),
          overlookedCount: Number(row.get('overlookedCount')) || 0,
          lastDelayDate: row.get('lastDelayDate') || undefined,
          completionRate: Number(row.get('completionRate')) || 0,
          comments: parseJson(row.get('comments'), []),
          history: parseJson(row.get('history'), []),
          version: Number(row.get('version')) || 0
        };
      });

    // Deduplicate initiatives by ID (keep first occurrence)
    const seenIds = new Set<string>();
    const initiatives = allInitiatives.filter(init => {
      if (seenIds.has(init.id)) {
        serverLogger.warn(`Found duplicate initiative ID: ${init.id}, skipping duplicate`, { context: 'Pull' });
        return false;
      }
      seenIds.add(init.id);
      return true;
    });

    if (allInitiatives.length !== initiatives.length) {
      serverLogger.info('Deduplicated initiatives during pull', { context: 'Pull', metadata: { before: allInitiatives.length, after: initiatives.length } });
    }

    serverLogger.info(`Pulled ${initiatives.length} initiatives from Sheets`, { context: 'Pull' });
    res.json({ initiatives, config: null, users: null });
  } catch (error) {
    serverLogger.error('Error pulling from Sheets', { context: 'Pull', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/sheets/push - Full push (overwrite Initiatives tab) (Protected)
app.post('/api/sheets/push', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  await acquireSyncMutex(); // Prevent concurrent sync operations
  try {
    const { initiatives } = req.body;

    if (!initiatives || !Array.isArray(initiatives)) {
      res.status(400).json({ success: false, error: 'Invalid data' });
      releaseSyncMutex();
      return;
    }

    // Deduplicate initiatives before pushing (keep first occurrence)
    const seenIds = new Set<string>();
    const deduplicated = initiatives.filter((init: { id: string }) => {
      if (seenIds.has(init.id)) {
        serverLogger.warn(`Push: Found duplicate initiative ID: ${init.id}, skipping`, { context: 'Push' });
        return false;
      }
      seenIds.add(init.id);
      return true;
    });

    if (initiatives.length !== deduplicated.length) {
      serverLogger.info('Push: Deduplicated initiatives', { context: 'Push', metadata: { before: initiatives.length, after: deduplicated.length } });
    }

    const doc = await getDoc();
    if (!doc) {
      res.status(500).json({ success: false, error: 'Failed to connect to Google Sheets' });
      releaseSyncMutex();
      return;
    }

    let sheet = doc.sheetsByTitle['Initiatives'];
    
    if (sheet) {
      await sheet.clear();
      await sheet.setHeaderRow(INITIATIVE_HEADERS);
    } else {
      sheet = await doc.addSheet({
        title: 'Initiatives',
        headerValues: INITIATIVE_HEADERS,
        gridProperties: { rowCount: 1000, columnCount: 50 }
      });
    }

    await sheet.addRows(deduplicated.map((item: Record<string, unknown>) => {
      const rowData: Record<string, string> = {};
      INITIATIVE_HEADERS.forEach(header => {
        const value = item[header];
        rowData[header] = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
      });
      return rowData;
    }));

    serverLogger.info(`Pushed ${deduplicated.length} initiatives to Sheets`, { context: 'Push' });
    res.json({ success: true, count: deduplicated.length });
  } catch (error) {
    serverLogger.error('Error pushing to Sheets', { context: 'Push', error: error as Error });
    res.status(500).json({ success: false, error: String(error) });
  } finally {
    // CRITICAL: Always release mutex to prevent deadlock
    releaseSyncMutex();
  }
});

// POST /api/slack/webhook - Proxy Slack webhook requests to avoid CORS (Protected)
app.post('/api/slack/webhook', authenticateToken, validate(slackWebhookSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { webhookUrl, payload } = req.body;

    // Validate webhook URL is a Slack webhook
    if (!webhookUrl.startsWith('https://hooks.slack.com/services/')) {
      res.status(400).json({ error: 'Invalid Slack webhook URL' });
      return;
    }

    // Forward the request to Slack
    const slackResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const responseText = await slackResponse.text();

    if (!slackResponse.ok) {
      serverLogger.error('Slack webhook failed', { context: 'Slack', metadata: { status: slackResponse.status, error: responseText } });
      res.status(slackResponse.status).json({ 
        error: 'Slack webhook failed',
        details: responseText 
      });
      return;
    }

    serverLogger.info('Slack webhook sent successfully', { context: 'Slack' });
    res.json({ success: true, response: responseText });
  } catch (error) {
    serverLogger.error('Error proxying Slack webhook', { context: 'Slack', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/sheets/snapshots - List all snapshot tabs (Protected)
app.get('/api/sheets/snapshots', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const doc = await getDoc();
    if (!doc) {
      res.status(500).json({ error: 'Failed to connect to Google Sheets' });
      return;
    }

    const snapshots = Object.keys(doc.sheetsByTitle)
      .filter(title => title.startsWith('Snap_'))
      .map(title => ({ title }));

    res.json({ snapshots });
  } catch (error) {
    serverLogger.error('Error listing snapshots', { context: 'Snapshot', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/sheets/scheduled-snapshot - Create automated weekly snapshot (Called by Cloud Scheduler)
app.post('/api/sheets/scheduled-snapshot', async (req: Request, res: Response) => {
  // Verify request is from Cloud Scheduler using a secret header
  const schedulerSecret = req.headers['x-scheduler-secret'];
  const expectedSecret = process.env.SCHEDULER_SECRET;
  
  if (!expectedSecret) {
    serverLogger.error('SCHEDULER_SECRET environment variable not set', { context: 'Scheduler' });
    res.status(500).json({ error: 'Scheduler not configured' });
    return;
  }
  
  if (schedulerSecret !== expectedSecret) {
    serverLogger.warn('Unauthorized scheduled snapshot attempt', { context: 'Scheduler' });
    res.status(403).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const doc = await getDoc();
    if (!doc) {
      res.status(500).json({ error: 'Failed to connect to Google Sheets' });
      return;
    }

    // Load current initiatives
    const sheet = doc.sheetsByTitle['Initiatives'];
    if (!sheet) {
      res.status(404).json({ error: 'No initiatives found' });
      return;
    }

    const rows = await sheet.getRows();
    const initiatives = rows
      .filter((row: GoogleSpreadsheetRow) => row.get('id') && !row.get('id').startsWith('_meta_'))
      .map((row: GoogleSpreadsheetRow) => {
        const rowData: Record<string, string> = {};
        INITIATIVE_HEADERS.forEach(header => {
          rowData[header] = row.get(header) || '';
        });
        return rowData;
      });

    // Create snapshot with date-based name
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
    const tabName = `Snap_Weekly_${dateStr}`;

    // Check if snapshot for today already exists
    if (doc.sheetsByTitle[tabName]) {
      serverLogger.info(`Snapshot ${tabName} already exists, skipping`, { context: 'Scheduler' });
      res.json({ success: true, tabName, count: initiatives.length, message: 'Snapshot already exists' });
      return;
    }

    // Create sheet with enough columns for all headers (default is 26, we need 35+)
    const newSheet = await doc.addSheet({
      title: tabName,
      headerValues: INITIATIVE_HEADERS,
      gridProperties: {
        rowCount: 1000,
        columnCount: Math.max(INITIATIVE_HEADERS.length + 5, 40)
      }
    });

    // Add metadata row
    await newSheet.addRow({
      id: '_meta_scheduled',
      title: `Automated weekly snapshot - ${dayName} ${now.toISOString()}`,
      l1_assetClass: '',
      l2_pillar: '',
      l3_responsibility: '',
      l4_target: ''
    });

    // Add all initiatives
    if (initiatives.length > 0) {
      await newSheet.addRows(initiatives);
    }

    serverLogger.success(`Created scheduled snapshot: ${tabName} with ${initiatives.length} initiatives`);
    res.json({ success: true, tabName, count: initiatives.length });
  } catch (error) {
    serverLogger.error('Scheduled snapshot error', { context: 'Scheduler', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// ============================================
// NOTIFICATION ENDPOINTS
// ============================================

// GET /api/notifications/:userId - Get notifications for a user
app.get('/api/notifications/:userId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    
    // Users can only access their own notifications (check by both ID and email)
    const isOwnNotifications = req.user?.id === userId || req.user?.email === userId;
    if (!isOwnNotifications && req.user?.role !== 'Admin') {
      res.status(403).json({ error: 'Cannot access other users notifications' });
      return;
    }

    const gcs = getGCSStorage();
    if (gcs) {
      serverLogger.debug('Fetching notifications', { context: 'Notification', metadata: { userId, requesterId: req.user?.id } });
      
      // Try loading by userId first, then by email if userId is an email
      let notifications = await gcs.loadNotifications(userId);
      
      // If no notifications found and userId looks like an email, try loading by user ID
      if (notifications.length === 0 && userId.includes('@') && req.user?.id) {
        notifications = await gcs.loadNotifications(req.user.id);
      }
      
      // Also try loading by email if we have user email and userId is an ID
      if (notifications.length === 0 && !userId.includes('@') && req.user?.email) {
        notifications = await gcs.loadNotifications(req.user.email);
      }
      
      serverLogger.debug(`Returning ${notifications.length} notifications`, { context: 'Notification' });
      res.json({ notifications });
    } else {
      // Fallback: return empty array if GCS not available
      serverLogger.warn('GCS storage not available for notifications', { context: 'Notification' });
      res.json({ notifications: [] });
    }
  } catch (error) {
    serverLogger.error('Error fetching notifications', { context: 'Notification', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/notifications - Create a new notification
app.post('/api/notifications', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { notification, targetUserId } = req.body;

    if (!notification || !targetUserId) {
      res.status(400).json({ error: 'Notification and targetUserId are required' });
      return;
    }

    const gcs = getGCSStorage();
    if (gcs) {
      const success = await gcs.addNotification(targetUserId, notification);
      if (success) {
        // Emit real-time notification to the target user via Socket.IO
        io.emit('notification:received', { userId: targetUserId, notification });
        res.json({ success: true });
      } else {
        res.status(500).json({ error: 'Failed to save notification' });
      }
    } else {
      // Emit via Socket.IO even without GCS persistence
      io.emit('notification:received', { userId: targetUserId, notification });
      res.json({ success: true, message: 'Notification sent via real-time only (no persistence)' });
    }
  } catch (error) {
    serverLogger.error('Error creating notification', { context: 'Notification', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// PATCH /api/notifications/:notificationId/read - Mark a notification as read
app.patch('/api/notifications/:notificationId/read', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User ID required' });
      return;
    }

    const gcs = getGCSStorage();
    if (gcs) {
      const success = await gcs.markNotificationRead(userId, notificationId);
      res.json({ success });
    } else {
      res.json({ success: true, message: 'No persistence available' });
    }
  } catch (error) {
    serverLogger.error('Error marking notification as read', { context: 'Notification', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/notifications/mark-all-read - Mark all notifications as read for current user
app.post('/api/notifications/mark-all-read', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User ID required' });
      return;
    }

    const gcs = getGCSStorage();
    if (gcs) {
      const success = await gcs.markAllNotificationsRead(userId);
      res.json({ success });
    } else {
      res.json({ success: true, message: 'No persistence available' });
    }
  } catch (error) {
    serverLogger.error('Error marking all notifications as read', { context: 'Notification', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// DELETE /api/notifications - Clear all notifications for current user
app.delete('/api/notifications', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User ID required' });
      return;
    }

    const gcs = getGCSStorage();
    if (gcs) {
      const success = await gcs.clearNotifications(userId);
      res.json({ success });
    } else {
      res.json({ success: true, message: 'No persistence available' });
    }
  } catch (error) {
    serverLogger.error('Error clearing notifications', { context: 'Notification', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// ============================================
// ADMIN: LOGIN TRACKING ENDPOINTS
// ============================================

// GET /api/admin/connected-users - Get live connected users (admin only)
app.get('/api/admin/connected-users', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Only admins can access this endpoint
    if (req.user?.email !== 'adar.sobol@pagaya.com') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const users = Array.from(connectedUsers.values()).map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      currentView: user.currentView,
      editingInitiativeId: user.editingInitiativeId,
      lastActivity: user.lastActivity,
      connectedSince: user.lastActivity // Using lastActivity as proxy for connection time
    }));

    res.json({ 
      connectedUsers: users,
      totalConnected: users.length,
      timestamp: Date.now()
    });
  } catch (error) {
    serverLogger.error('Error fetching connected users', { context: 'Admin', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/admin/login-history - Get login history for all users (admin only)
app.get('/api/admin/login-history', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Only admins can access this endpoint
    if (req.user?.role !== 'Admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const doc = await getDoc();
    if (!doc) {
      res.status(500).json({ error: 'Failed to connect to database' });
      return;
    }

    let usersSheet = doc.sheetsByTitle['Users'];
    if (!usersSheet) {
      res.json({ users: [] });
      return;
    }

    // Ensure headers are up-to-date (adds missing columns like lastLogin)
    await usersSheet.loadHeaderRow().catch(() => {});
    const currentHeaders = usersSheet.headerValues || [];
    const missingHeaders = USER_HEADERS.filter(h => !currentHeaders.includes(h));
    if (missingHeaders.length > 0) {
      serverLogger.info('Adding missing Users columns for login history', { context: 'Admin', metadata: { missingHeaders } });
      await usersSheet.setHeaderRow([...currentHeaders, ...missingHeaders]);
    }

    const rows = await usersSheet.getRows();
    const users = rows.map((r: GoogleSpreadsheetRow) => {
      const lastLoginValue = r.get('lastLogin');
      // Handle empty strings, null, undefined - convert to null
      const lastLogin = (lastLoginValue && lastLoginValue.trim() !== '') ? lastLoginValue : null;
      
      return {
        id: r.get('id'),
        email: r.get('email'),
        name: r.get('name'),
        role: r.get('role'),
        avatar: r.get('avatar'),
        lastLogin: lastLogin
      };
    }).sort((a, b) => {
      // Sort by lastLogin, most recent first, null values at end
      if (!a.lastLogin && !b.lastLogin) return 0;
      if (!a.lastLogin) return 1;
      if (!b.lastLogin) return -1;
      return new Date(b.lastLogin).getTime() - new Date(a.lastLogin).getTime();
    });

    res.json({ users });
  } catch (error) {
    serverLogger.error('Get login history error', { context: 'Admin', error: error as Error });
    res.status(500).json({ error: 'Failed to get login history' });
  }
});

// POST /api/admin/weekly-effort-validation - Get weekly effort validation results for all Team Leads (admin only)
app.post('/api/admin/weekly-effort-validation', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Only admins can access this endpoint
    if (req.user?.role !== 'Admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const doc = await getDoc();
    if (!doc) {
      res.status(500).json({ error: 'Failed to connect to database' });
      return;
    }

    // Get all initiatives
    let initiativesSheet = doc.sheetsByTitle['Initiatives'];
    if (!initiativesSheet) {
      res.json({ results: [], message: 'No initiatives found' });
      return;
    }

    await initiativesSheet.loadHeaderRow();
    const rows = await initiativesSheet.getRows();
    const initiatives = rows.map((r: GoogleSpreadsheetRow) => {
      const row: any = {};
      initiativesSheet.headerValues.forEach((header: string) => {
        row[header] = r.get(header);
      });
      return row;
    });

    // Get config (weeklyEffortValidation settings)
    let configSheet = doc.sheetsByTitle['Config'];
    let config: any = { weeklyEffortValidation: { enabled: true, thresholdPercent: 15 } };
    if (configSheet) {
      await configSheet.loadHeaderRow();
      const configRows = await configSheet.getRows();
      if (configRows.length > 0) {
        const configRow = configRows[0];
        try {
          const configData = configRow.get('config');
          if (configData) {
            config = JSON.parse(configData);
          }
        } catch (e) {
          serverLogger.error('Error parsing config', { context: 'Validation', error: e as Error });
        }
      }
    }

    // Get all Team Lead users
    let usersSheet = doc.sheetsByTitle['Users'];
    if (!usersSheet) {
      res.json({ results: [], message: 'No users found' });
      return;
    }

    await usersSheet.loadHeaderRow();
    const userRows = await usersSheet.getRows();
    const teamLeadIds = userRows
      .map((r: GoogleSpreadsheetRow) => ({
        id: r.get('id'),
        role: r.get('role')
      }))
      .filter((u: any) => u.role === 'Team Lead')
      .map((u: any) => u.id);

    // Calculate validation results for each Team Lead
    const results = teamLeadIds.map((teamLeadId: string) => {
      const teamLeadInitiatives = initiatives.filter((i: any) => i.ownerId === teamLeadId);
      
      if (teamLeadInitiatives.length === 0) {
        return {
          flagged: false,
          deviationPercent: 0,
          averageWeeklyEffort: 0,
          currentWeekEffort: 0,
          teamLeadId,
          quarter: 'Q1 2024'
        };
      }

      // Get quarter from first initiative
      const quarter = teamLeadInitiatives[0].quarter || 'Q1 2024';
      const quarterMatch = quarter.match(/Q(\d)\s+(\d{4})/);
      let quarterStartDate: Date;
      if (quarterMatch) {
        const quarterNum = parseInt(quarterMatch[1], 10);
        const year = parseInt(quarterMatch[2], 10);
        const month = (quarterNum - 1) * 3;
        quarterStartDate = new Date(year, month, 1);
      } else {
        const now = new Date();
        const currentQuarter = Math.floor(now.getMonth() / 3);
        const year = now.getFullYear();
        const month = currentQuarter * 3;
        quarterStartDate = new Date(year, month, 1);
      }

      const now = new Date();
      const daysSinceQuarterStart = Math.floor((now.getTime() - quarterStartDate.getTime()) / (24 * 60 * 60 * 1000));
      const weeksInQuarter = Math.max(1, Math.ceil(daysSinceQuarterStart / 7));

      const totalTeamEffort = teamLeadInitiatives.reduce((sum: number, i: any) => sum + (parseFloat(i.actualEffort) || 0), 0);
      const averageWeeklyEffort = totalTeamEffort / weeksInQuarter;

      const lastThursday = new Date(now);
      lastThursday.setDate(now.getDate() - ((now.getDay() + 3) % 7));
      lastThursday.setHours(23, 59, 59, 999);

      const currentWeekEffort = teamLeadInitiatives
        .filter((i: any) => {
          if (!i.lastWeeklyUpdate) return false;
          const updateDate = new Date(i.lastWeeklyUpdate);
          return updateDate >= lastThursday;
        })
        .reduce((sum: number, i: any) => sum + (parseFloat(i.actualEffort) || 0), 0);

      const deviationPercent = averageWeeklyEffort > 0
        ? Math.abs((currentWeekEffort - averageWeeklyEffort) / averageWeeklyEffort) * 100
        : 0;

      const threshold = config.weeklyEffortValidation?.thresholdPercent || 15;

      return {
        flagged: deviationPercent >= threshold,
        deviationPercent: Math.round(deviationPercent * 10) / 10,
        averageWeeklyEffort: Math.round(averageWeeklyEffort * 10) / 10,
        currentWeekEffort: Math.round(currentWeekEffort * 10) / 10,
        teamLeadId,
        quarter
      };
    });

    // Log validation results
    const flaggedResults = results.filter((r: any) => r.flagged);
    if (flaggedResults.length > 0) {
      serverLogger.info(`${flaggedResults.length} Team Lead(s) exceeded threshold`, { 
        context: 'Validation', 
        metadata: { flagged: flaggedResults.map((r: any) => ({ id: r.teamLeadId, deviation: r.deviationPercent })) }
      });
    }

    res.json({ 
      results,
      timestamp: new Date().toISOString(),
      totalTeamLeads: teamLeadIds.length,
      flaggedCount: flaggedResults.length
    });
  } catch (error) {
    serverLogger.error('Error validating weekly effort', { context: 'Validation', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// ============================================
// VALUE LISTS MANAGEMENT ENDPOINTS (Admin only)
// ============================================

// GET /api/config/value-lists - Get current value lists (all authenticated users can read)
app.get('/api/config/value-lists', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // All authenticated users can read value lists (they need them for dropdowns)
    // Only admins can modify them via PUT endpoint

    const doc = await getDoc();
    if (!doc) {
      res.status(500).json({ error: 'Failed to connect to database' });
      return;
    }

    let configSheet = doc.sheetsByTitle['Config'];
    if (!configSheet) {
      // Return default values if config sheet doesn't exist
      const currentYear = new Date().getFullYear();
      const defaultQuarters: string[] = [];
      for (let year = currentYear - 1; year <= currentYear + 3; year++) {
        for (let q = 1; q <= 4; q++) {
          defaultQuarters.push(`Q${q} ${year}`);
        }
      }
      
      res.json({
        valueLists: {
          assetClasses: ['PL', 'Auto', 'POS', 'Advisory'],
          statuses: ['Not Started', 'In Progress', 'At Risk', 'Done', 'Obsolete', 'Deleted'],
          dependencyTeams: ['R&M - Research', 'R&M - Data', 'R&M - Infra', 'Product', 'Capital Markets', 'Partnerships'],
          priorities: ['P0', 'P1', 'P2'],
          workTypes: ['Planned Work', 'Unplanned Work'],
          unplannedTags: ['Unplanned', 'Risk Item', 'PM Item', 'Both'],
          initiativeTypes: ['WP', 'BAU'],
          quarters: defaultQuarters
        }
      });
      return;
    }

    await configSheet.loadHeaderRow();
    const configRows = await configSheet.getRows();
    if (configRows.length > 0) {
      const configRow = configRows[0];
      try {
        const configData = configRow.get('config');
        if (configData) {
          const config = JSON.parse(configData);
          const valueLists = config.valueLists || {};
          
          // Ensure required UI values are included for data integrity
          // Priority: P0, P1, P2
          if (valueLists.priorities) {
            const requiredPriorities = ['P0', 'P1', 'P2'];
            const mergedPriorities = [...requiredPriorities];
            valueLists.priorities.forEach((p: string) => {
              if (!mergedPriorities.includes(p)) {
                mergedPriorities.push(p);
              }
            });
            valueLists.priorities = mergedPriorities;
          }
          
          // Initiative Types: WP, BAU
          if (valueLists.initiativeTypes) {
            const requiredInitiativeTypes = ['WP', 'BAU'];
            const mergedInitiativeTypes = [...requiredInitiativeTypes];
            valueLists.initiativeTypes.forEach((t: string) => {
              if (!mergedInitiativeTypes.includes(t)) {
                mergedInitiativeTypes.push(t);
              }
            });
            valueLists.initiativeTypes = mergedInitiativeTypes;
          }
          
          // Unplanned Tags: Unplanned, Risk Item, PM Item, Both
          if (valueLists.unplannedTags) {
            const requiredUnplannedTags = ['Unplanned', 'Risk Item', 'PM Item', 'Both'];
            const mergedUnplannedTags = [...requiredUnplannedTags];
            valueLists.unplannedTags.forEach((tag: string) => {
              if (!mergedUnplannedTags.includes(tag)) {
                mergedUnplannedTags.push(tag);
              }
            });
            valueLists.unplannedTags = mergedUnplannedTags;
          }
          
          // Quarters: Ensure default quarters are included
          if (valueLists.quarters) {
            const currentYear = new Date().getFullYear();
            const defaultQuarters: string[] = [];
            for (let year = currentYear - 1; year <= currentYear + 3; year++) {
              for (let q = 1; q <= 4; q++) {
                defaultQuarters.push(`Q${q} ${year}`);
              }
            }
            const mergedQuarters = [...defaultQuarters];
            valueLists.quarters.forEach((q: string) => {
              if (!mergedQuarters.includes(q)) {
                mergedQuarters.push(q);
              }
            });
            valueLists.quarters = mergedQuarters;
          }
          
          res.json({ valueLists });
          return;
        }
      } catch (e) {
        serverLogger.error('Error parsing config', { context: 'Config', error: e as Error });
      }
    }

    res.json({ valueLists: null });
  } catch (error) {
    serverLogger.error('Error getting value lists', { context: 'Config', error: error as Error });
    res.status(500).json({ error: 'Failed to get value lists' });
  }
});

// PUT /api/config/value-lists - Update value lists
app.put('/api/config/value-lists', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Only admins can update value lists
    if (req.user?.role !== 'Admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { valueLists } = req.body;
    
    // Validate value lists structure
    if (!valueLists || typeof valueLists !== 'object') {
      res.status(400).json({ error: 'Invalid value lists data' });
      return;
    }

    if (!Array.isArray(valueLists.assetClasses) || 
        !Array.isArray(valueLists.statuses) || 
        !Array.isArray(valueLists.dependencyTeams) ||
        !Array.isArray(valueLists.priorities) ||
        !Array.isArray(valueLists.workTypes) ||
        !Array.isArray(valueLists.unplannedTags) ||
        !Array.isArray(valueLists.initiativeTypes) ||
        !Array.isArray(valueLists.quarters)) {
      res.status(400).json({ error: 'Value lists must contain all required arrays: assetClasses, statuses, dependencyTeams, priorities, workTypes, unplannedTags, initiativeTypes, quarters' });
      return;
    }
    
    // Hierarchy and dependencyTeamCategories are optional but validated if present
    if (valueLists.hierarchy !== undefined && (typeof valueLists.hierarchy !== 'object' || Array.isArray(valueLists.hierarchy))) {
      res.status(400).json({ error: 'hierarchy must be an object mapping asset classes to pillar arrays' });
      return;
    }
    
    if (valueLists.dependencyTeamCategories !== undefined && !Array.isArray(valueLists.dependencyTeamCategories)) {
      res.status(400).json({ error: 'dependencyTeamCategories must be an array' });
      return;
    }

    const doc = await getDoc();
    if (!doc) {
      res.status(500).json({ error: 'Failed to connect to database' });
      return;
    }

    let configSheet = doc.sheetsByTitle['Config'];
    if (!configSheet) {
      configSheet = await doc.addSheet({
        title: 'Config',
        headerValues: ['config']
      });
    }

    await configSheet.loadHeaderRow();
    const configRows = await configSheet.getRows();
    
    let config: any = {};
    if (configRows.length > 0) {
      const configRow = configRows[0];
      try {
        const configData = configRow.get('config');
        if (configData) {
          config = JSON.parse(configData);
        }
      } catch (e) {
        serverLogger.error('Error parsing existing config', { context: 'Config', error: e as Error });
      }
    }

    // Ensure required UI values are included for data integrity
    // Priority: P0, P1, P2
    const requiredPriorities = ['P0', 'P1', 'P2'];
    if (valueLists.priorities) {
      const mergedPriorities = [...requiredPriorities];
      valueLists.priorities.forEach((p: string) => {
        if (!mergedPriorities.includes(p)) {
          mergedPriorities.push(p);
        }
      });
      valueLists.priorities = mergedPriorities;
    }
    
    // Initiative Types: WP, BAU
    const requiredInitiativeTypes = ['WP', 'BAU'];
    if (valueLists.initiativeTypes) {
      const mergedInitiativeTypes = [...requiredInitiativeTypes];
      valueLists.initiativeTypes.forEach((t: string) => {
        if (!mergedInitiativeTypes.includes(t)) {
          mergedInitiativeTypes.push(t);
        }
      });
      valueLists.initiativeTypes = mergedInitiativeTypes;
    }
    
    // Unplanned Tags: Unplanned, Risk Item, PM Item, Both
    const requiredUnplannedTags = ['Unplanned', 'Risk Item', 'PM Item', 'Both'];
    if (valueLists.unplannedTags) {
      const mergedUnplannedTags = [...requiredUnplannedTags];
      valueLists.unplannedTags.forEach((tag: string) => {
        if (!mergedUnplannedTags.includes(tag)) {
          mergedUnplannedTags.push(tag);
        }
      });
      valueLists.unplannedTags = mergedUnplannedTags;
    }
    
    // Quarters: Ensure default quarters are included
    if (valueLists.quarters) {
      const currentYear = new Date().getFullYear();
      const defaultQuarters: string[] = [];
      for (let year = currentYear - 1; year <= currentYear + 3; year++) {
        for (let q = 1; q <= 4; q++) {
          defaultQuarters.push(`Q${q} ${year}`);
        }
      }
      const mergedQuarters = [...defaultQuarters];
      valueLists.quarters.forEach((q: string) => {
        if (!mergedQuarters.includes(q)) {
          mergedQuarters.push(q);
        }
      });
      valueLists.quarters = mergedQuarters;
    }

    // Update value lists in config
    config.valueLists = valueLists;
    config.valueListsMigrated = true;

    // Save updated config
    const configJson = JSON.stringify(config);
    if (configRows.length > 0) {
      const configRow = configRows[0];
      configRow.set('config', configJson);
      await configRow.save();
    } else {
      await configSheet.addRow({ config: configJson });
    }

    res.json({ success: true, valueLists });
  } catch (error) {
    serverLogger.error('Error updating value lists', { context: 'Config', error: error as Error });
    res.status(500).json({ error: 'Failed to update value lists' });
  }
});

// ============================================
// BACKUP & RESTORE ENDPOINTS (Admin only)
// ============================================

// GET /api/backups - List all available backups
app.get('/api/backups', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Only admins can access backup endpoints
    if (req.user?.role !== 'Admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const backupService = getBackupService();
    if (backupService) {
      // GCS-based backups
      const backups = await backupService.listBackups();
      res.json({ backups, source: 'gcs' });
    } else {
      // Fallback: List Google Sheets snapshots
      const doc = await getDoc();
      if (!doc) {
        res.json({ backups: [], source: 'sheets', message: 'Using Sheets snapshots (GCS not configured)' });
        return;
      }

      const snapshots = Object.keys(doc.sheetsByTitle)
        .filter(title => title.startsWith('Snap_'))
        .map(title => {
          // Parse snapshot info from title (e.g., "Snap_2025-12-25T10-30-00_Name" or "Snap_Weekly_2025-12-25")
          const dateMatch = title.match(/Snap_(?:Weekly_)?(\d{4}-\d{2}-\d{2})/);
          const date = dateMatch ? dateMatch[1] : title;
          return {
            date,
            path: title,
            files: 1,
            totalSize: 0,
            status: 'success' as const,
            timestamp: date + 'T00:00:00Z'
          };
        })
        .sort((a, b) => b.date.localeCompare(a.date));

      res.json({ backups: snapshots, source: 'sheets', message: 'Using Sheets snapshots (GCS not configured)' });
    }
  } catch (error) {
    serverLogger.error('Error listing backups', { context: 'Backup', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/backups/:date - Get backup details for a specific date
app.get('/api/backups/:date', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.role !== 'Admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { date } = req.params;

    const backupService = getBackupService();
    if (backupService) {
      // Validate date format for GCS
      if (!/^\d{4}-\d{2}-\d{2}/.test(date)) {
        res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
        return;
      }

      const backup = await backupService.getBackupDetails(date);
      if (!backup) {
        res.status(404).json({ error: `No backup found for ${date}` });
        return;
      }

      res.json({ backup, source: 'gcs' });
    } else {
      // Fallback: Get Sheets snapshot details
      const doc = await getDoc();
      if (!doc) {
        res.status(500).json({ error: 'Failed to connect to Google Sheets' });
        return;
      }

      // Find matching snapshot (date could be tab name or date string)
      const matchingTab = Object.keys(doc.sheetsByTitle).find(title => 
        title.includes(date) && title.startsWith('Snap_')
      );

      if (!matchingTab) {
        res.status(404).json({ error: `No snapshot found matching ${date}` });
        return;
      }

      const snapshotSheet = doc.sheetsByTitle[matchingTab];
      const rows = await snapshotSheet.getRows();
      const count = rows.filter((r: GoogleSpreadsheetRow) => r.get('id') && !r.get('id').startsWith('_meta_')).length;

      res.json({
        backup: {
          id: matchingTab,
          timestamp: date + 'T00:00:00Z',
          date: date,
          files: [{ name: 'initiatives', path: matchingTab, size: count }],
          totalSize: count,
          duration: 0,
          status: 'success'
        },
        source: 'sheets'
      });
    }
  } catch (error) {
    serverLogger.error('Error getting backup details', { context: 'Backup', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/backups/restore/:date - Restore from a daily backup
app.post('/api/backups/restore/:date', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.role !== 'Admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { date } = req.params;
    const { confirm, files } = req.body;

    if (!confirm) {
      res.status(400).json({ 
        error: 'Confirmation required',
        message: 'Set confirm: true in request body to proceed with restore'
      });
      return;
    }

    serverLogger.info(`Admin ${req.user.email} initiating restore from backup ${date}`, { context: 'Backup' });

    const backupService = getBackupService();
    if (backupService) {
      // GCS-based restore
      const result = await backupService.restoreFromBackup(date, files);
      
      if (result.success) {
        io.emit('data:restored', { 
          date, 
          restoredBy: req.user.email,
          timestamp: result.timestamp 
        });
      }

      res.json({ ...result, source: 'gcs' });
    } else {
      // Fallback: Restore from Sheets snapshot
      const doc = await getDoc();
      if (!doc) {
        res.status(500).json({ error: 'Failed to connect to Google Sheets' });
        return;
      }

      // Find matching snapshot
      const matchingTab = Object.keys(doc.sheetsByTitle).find(title => 
        title.includes(date) && title.startsWith('Snap_')
      );

      if (!matchingTab) {
        res.status(404).json({ error: `No snapshot found matching ${date}` });
        return;
      }

      const snapshotSheet = doc.sheetsByTitle[matchingTab];
      const snapshotRows = await snapshotSheet.getRows();
      
      // Get initiatives from snapshot (excluding metadata rows)
      const initiativesToRestore = snapshotRows
        .filter((row: GoogleSpreadsheetRow) => row.get('id') && !row.get('id').startsWith('_meta_'))
        .map((row: GoogleSpreadsheetRow) => {
          const rowData: Record<string, string> = {};
          INITIATIVE_HEADERS.forEach(header => {
            rowData[header] = row.get(header) || '';
          });
          return rowData;
        });

      if (initiativesToRestore.length === 0) {
        res.status(400).json({ error: 'Snapshot contains no initiatives to restore' });
        return;
      }

      // Get or create main Initiatives sheet
      let sheet = doc.sheetsByTitle['Initiatives'];
      if (sheet) {
        await sheet.clear();
        await sheet.setHeaderRow(INITIATIVE_HEADERS);
      } else {
        sheet = await doc.addSheet({
          title: 'Initiatives',
          headerValues: INITIATIVE_HEADERS,
          gridProperties: { rowCount: 1000, columnCount: 50 }
        });
      }

      // Restore initiatives
      await sheet.addRows(initiativesToRestore);

      serverLogger.success(`Restored ${initiativesToRestore.length} initiatives from snapshot ${matchingTab}`);

      io.emit('data:restored', { 
        date, 
        restoredBy: req.user.email,
        timestamp: new Date().toISOString() 
      });

      res.json({ 
        success: true, 
        filesRestored: initiativesToRestore.length,
        errors: [],
        timestamp: new Date().toISOString(),
        backupDate: date,
        source: 'sheets',
        message: `Restored ${initiativesToRestore.length} initiatives from Sheets snapshot`
      });
    }
  } catch (error) {
    serverLogger.error('Error restoring from backup', { context: 'Backup', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/backups/versions/:file - List object versions for a file
app.get('/api/backups/versions/:file', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.role !== 'Admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { file } = req.params;

    const backupService = getBackupService();
    if (!backupService) {
      res.status(503).json({ error: 'Backup service not available' });
      return;
    }

    const versions = await backupService.listObjectVersions(file);
    res.json({ versions, file });
  } catch (error) {
    serverLogger.error('Error listing object versions', { context: 'Backup', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/backups/restore-version - Restore a specific object version
app.post('/api/backups/restore-version', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.role !== 'Admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { file, versionId, confirm } = req.body;

    if (!file || !versionId) {
      res.status(400).json({ error: 'file and versionId are required' });
      return;
    }

    if (!confirm) {
      res.status(400).json({ 
        error: 'Confirmation required',
        message: 'Set confirm: true in request body to proceed with restore'
      });
      return;
    }

    const backupService = getBackupService();
    if (!backupService) {
      res.status(503).json({ error: 'Backup service not available' });
      return;
    }

    serverLogger.info(`Admin ${req.user.email} restoring ${file} to version ${versionId}`, { context: 'Backup' });
    
    const result = await backupService.restoreObjectVersion(file, versionId);
    
    if (result.success) {
      io.emit('data:restored', { 
        file,
        versionId,
        restoredBy: req.user.email,
        timestamp: result.timestamp 
      });
    }

    res.json(result);
  } catch (error) {
    serverLogger.error('Error restoring object version', { context: 'Backup', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/backups/create - Create a manual backup
app.post('/api/backups/create', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.role !== 'Admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { label } = req.body;

    serverLogger.info(`Admin ${req.user.email} creating manual backup`, { context: 'Backup' });

    const backupService = getBackupService();
    if (backupService) {
      // GCS-based backup
      const manifest = await backupService.createManualBackup(label, req.user.email);
      res.json({ 
        success: manifest.status !== 'failed',
        manifest,
        source: 'gcs'
      });
    } else {
      // Fallback: Create Google Sheets snapshot
      const doc = await getDoc();
      if (!doc) {
        res.status(503).json({ 
          error: 'Cannot create backup - Google Sheets connection unavailable',
          message: 'This may be due to Node.js OpenSSL compatibility. Backups will work in production (Cloud Run).',
          hint: 'Try switching to Node 20 LTS: nvm use 20'
        });
        return;
      }

      // Load current initiatives
      const sheet = doc.sheetsByTitle['Initiatives'];
      if (!sheet) {
        res.status(404).json({ error: 'No initiatives found to backup' });
        return;
      }

      const rows = await sheet.getRows();
      const initiatives = rows
        .filter((row: GoogleSpreadsheetRow) => row.get('id') && !row.get('id').startsWith('_meta_'))
        .map((row: GoogleSpreadsheetRow) => {
          const rowData: Record<string, string> = {};
          INITIATIVE_HEADERS.forEach(header => {
            rowData[header] = row.get(header) || '';
          });
          return rowData;
        });

      // Create snapshot with timestamp
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const safeName = (label || 'Manual').replace(/[^a-zA-Z0-9\s-]/g, '').slice(0, 30);
      const tabName = `Snap_${timestamp}_${safeName}`.slice(0, 100);

const newSheet = await doc.addSheet({
      title: tabName,
      headerValues: INITIATIVE_HEADERS,
      gridProperties: {
        rowCount: 1000,
        columnCount: 50
      }
    });

      // Add metadata row
      await newSheet.addRow({
        id: `_meta_manual`,
        title: `Manual backup by ${req.user.email} - ${now.toISOString()}`,
        l1_assetClass: '',
        l2_pillar: '',
        l3_responsibility: '',
        l4_target: ''
      });

      // Add all initiatives
      if (initiatives.length > 0) {
        await newSheet.addRows(initiatives);
      }

      serverLogger.success(`Created Sheets snapshot: ${tabName} with ${initiatives.length} initiatives`);
      
      res.json({ 
        success: true,
        manifest: {
          id: tabName,
          timestamp: now.toISOString(),
          date: now.toISOString().split('T')[0],
          files: [{ name: 'initiatives', path: tabName, size: initiatives.length }],
          totalSize: initiatives.length,
          duration: 0,
          status: 'success'
        },
        source: 'sheets',
        message: 'Created Google Sheets snapshot (GCS not configured)'
      });
    }
  } catch (error) {
    serverLogger.error('Error creating manual backup', { context: 'Backup', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/backups/:date/verify - Verify backup integrity
app.get('/api/backups/:date/verify', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.role !== 'Admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { date } = req.params;

    const backupService = getBackupService();
    if (!backupService) {
      res.status(503).json({ error: 'Backup service not available' });
      return;
    }

    const result = await backupService.verifyBackup(date);
    res.json(result);
  } catch (error) {
    serverLogger.error('Error verifying backup', { context: 'Backup', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/backups/:date/download - Get download URLs for backup files
app.get('/api/backups/:date/download', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.role !== 'Admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { date } = req.params;

    const backupService = getBackupService();
    if (!backupService) {
      res.status(503).json({ error: 'Backup service not available' });
      return;
    }

    const result = await backupService.getBackupDownloadUrls(date);
    res.json(result);
  } catch (error) {
    serverLogger.error('Error getting download URLs', { context: 'Backup', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// ============================================
// EXPORT ENDPOINTS (Server-side file generation)
// ============================================

// POST /api/export/csv - Generate and download CSV file
app.post('/api/export/csv', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { initiatives, users } = req.body;

    if (!initiatives || !Array.isArray(initiatives)) {
      res.status(400).json({ error: 'Invalid data' });
      return;
    }

    // Transform data to rows
    const getOwnerName = (ownerId: string) => {
      const user = users?.find((u: any) => u.id === ownerId);
      return user?.name || ownerId || '';
    };

    const headers = [
      'ID', 'Title', 'Asset Class', 'Pillar', 'Responsibility', 'Target',
      'Owner', 'Secondary Owner', 'Quarter', 'Status', 'Priority', 'Work Type',
      'Estimated Effort (weeks)', 'Original Estimated Effort (weeks)', 'Actual Effort (weeks)',
      'Effort Variance', 'ETA', 'Original ETA', 'Last Updated', 'At Risk',
      'Risk Action Log', 'Dependencies'
    ];

    const csvRows = [headers.map(h => `"${h}"`).join(',')];

    for (const i of initiatives) {
      const row = [
        i.id || '',
        i.title || '',
        i.l1_assetClass || '',
        i.l2_pillar || '',
        i.l3_responsibility || '',
        i.l4_target || '',
        getOwnerName(i.ownerId),
        i.secondaryOwner || '',
        i.quarter || '',
        i.status || '',
        i.priority || '',
        i.workType || '',
        i.estimatedEffort ?? 0,
        i.originalEstimatedEffort ?? 0,
        i.actualEffort ?? 0,
        (i.estimatedEffort || 0) - (i.originalEstimatedEffort || 0),
        i.eta || '',
        i.originalEta || '',
        i.lastUpdated || '',
        i.status === 'At Risk' ? 'Yes' : 'No',
        i.riskActionLog || '',
        i.dependencies || ''
      ];
      csvRows.push(row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    }

    const csvContent = csvRows.join('\n');
    const filename = `portfolio-initiatives_${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);

  } catch (error) {
    serverLogger.error('CSV export error', { context: 'Export', error: error as Error });
    res.status(500).json({ error: 'Export failed' });
  }
});

// POST /api/export/excel - Generate and download Excel file  
app.post('/api/export/excel', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { initiatives, users } = req.body;

    if (!initiatives || !Array.isArray(initiatives)) {
      res.status(400).json({ error: 'Invalid data' });
      return;
    }

    // Dynamic import xlsx
    const XLSX = await import('xlsx');

    const getOwnerName = (ownerId: string) => {
      const user = users?.find((u: any) => u.id === ownerId);
      return user?.name || ownerId || '';
    };

    // Transform data
    const rows = initiatives.map((i: any) => ({
      'ID': i.id || '',
      'Title': i.title || '',
      'Asset Class': i.l1_assetClass || '',
      'Pillar': i.l2_pillar || '',
      'Responsibility': i.l3_responsibility || '',
      'Target': i.l4_target || '',
      'Owner': getOwnerName(i.ownerId),
      'Secondary Owner': i.secondaryOwner || '',
      'Quarter': i.quarter || '',
      'Status': i.status || '',
      'Priority': i.priority || '',
      'Work Type': i.workType || '',
      'Estimated Effort (weeks)': i.estimatedEffort ?? 0,
      'Original Estimated Effort (weeks)': i.originalEstimatedEffort ?? 0,
      'Actual Effort (weeks)': i.actualEffort ?? 0,
      'Effort Variance': (i.estimatedEffort || 0) - (i.originalEstimatedEffort || 0),
      'ETA': i.eta || '',
      'Original ETA': i.originalEta || '',
      'Last Updated': i.lastUpdated || '',
      'At Risk': i.status === 'At Risk' ? 'Yes' : 'No',
      'Risk Action Log': i.riskActionLog || '',
      'Dependencies': i.dependencies || ''
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Initiatives');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const filename = `portfolio-initiatives_${new Date().toISOString().split('T')[0]}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);

  } catch (error) {
    serverLogger.error('Excel export error', { context: 'Export', error: error as Error });
    res.status(500).json({ error: 'Export failed' });
  }
});

// ============================================
// LOGGING ENDPOINTS (Admin only)
// ============================================

// POST /api/logs/errors - Store error log
app.post('/api/logs/errors', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { message, stack, severity, context, metadata, url, userAgent } = req.body;
    const userId = req.user?.id;
    const userEmail = req.user?.email;

    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    const logStorage = getLogStorage();
    if (!logStorage || !logStorage.isInitialized()) {
      // Fallback: just log using serverLogger
      serverLogger.error(message, { context: context || 'ErrorLog', metadata: { stack, severity, userId, userEmail, ...metadata } });
      res.json({ success: true, stored: false, message: 'Log storage not available, logged to console' });
      return;
    }

    const errorLog = {
      id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      severity: severity || 'error',
      message,
      stack,
      timestamp: new Date().toISOString(),
      userId,
      userEmail,
      context,
      metadata,
      url,
      userAgent,
      sessionId: req.headers['x-session-id'] as string,
      correlationId: req.headers['x-correlation-id'] as string,
      resolved: false,
    };

    const success = await logStorage.storeErrorLog(errorLog);
    res.json({ success, id: errorLog.id });
  } catch (error) {
    serverLogger.error('Error storing error log', { context: 'Logs', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/logs/errors - Get error logs (admin only)
app.get('/api/logs/errors', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Only admins can access logs
    if (req.user?.role !== 'Admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { startDate, endDate, severity, userId } = req.query;
    const logStorage = getLogStorage();

    if (!logStorage || !logStorage.isInitialized()) {
      res.json({ logs: [], message: 'Log storage not available' });
      return;
    }

    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;
    const sev = severity as string | undefined;
    const uid = userId as string | undefined;

    const logs = await logStorage.getErrorLogs(start, end, sev as any, uid);
    res.json({ logs, count: logs.length });
  } catch (error) {
    serverLogger.error('Error getting error logs', { context: 'Logs', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/logs/activity - Store activity log
app.post('/api/logs/activity', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { type, description, metadata, initiativeId, taskId } = req.body;
    const userId = req.user?.id;
    const userEmail = req.user?.email;

    if (!type || !description) {
      res.status(400).json({ error: 'Type and description are required' });
      return;
    }

    const logStorage = getLogStorage();
    if (!logStorage || !logStorage.isInitialized()) {
      // Fallback: just log using serverLogger
      serverLogger.info(description, { context: 'ActivityLog', metadata: { type, userId, userEmail, ...metadata } });
      res.json({ success: true, stored: false, message: 'Log storage not available, logged to console' });
      return;
    }

    const activityLog = {
      id: `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      userId: userId || 'unknown',
      userEmail: userEmail || 'unknown',
      timestamp: new Date().toISOString(),
      description,
      metadata,
      initiativeId,
      taskId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      sessionId: req.headers['x-session-id'] as string,
      correlationId: req.headers['x-correlation-id'] as string,
    };

    const success = await logStorage.storeActivityLog(activityLog);
    res.json({ success, id: activityLog.id });
  } catch (error) {
    serverLogger.error('Error storing activity log', { context: 'Logs', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/logs/activity - Get activity logs (admin only)
app.get('/api/logs/activity', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Only admins can access logs
    if (req.user?.role !== 'Admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { startDate, endDate, type, userId } = req.query;
    const logStorage = getLogStorage();

    if (!logStorage || !logStorage.isInitialized()) {
      res.json({ logs: [], message: 'Log storage not available' });
      return;
    }

    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;
    const activityType = type as string | undefined;
    const uid = userId as string | undefined;

    const logs = await logStorage.getActivityLogs(start, end, activityType as any, uid);
    res.json({ logs, count: logs.length });
  } catch (error) {
    serverLogger.error('Error getting activity logs', { context: 'Logs', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/logs/search - Search logs (admin only)
app.get('/api/logs/search', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Only admins can access logs
    if (req.user?.role !== 'Admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { query, logType, startDate, endDate, severity, userId } = req.query;
    const logStorage = getLogStorage();

    if (!logStorage || !logStorage.isInitialized()) {
      res.json({ logs: [], message: 'Log storage not available' });
      return;
    }

    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;

    let logs: any[] = [];

    if (logType === 'error' || !logType) {
      const errorLogs = await logStorage.getErrorLogs(start, end, severity as any, userId as string);
      logs.push(...errorLogs.map(log => ({ ...log, logType: 'error' })));
    }

    if (logType === 'activity' || !logType) {
      const activityLogs = await logStorage.getActivityLogs(start, end, undefined, userId as string);
      logs.push(...activityLogs.map(log => ({ ...log, logType: 'activity' })));
    }

    // Filter by query if provided
    if (query) {
      const queryStr = (query as string).toLowerCase();
      logs = logs.filter(log => 
        log.message?.toLowerCase().includes(queryStr) ||
        log.description?.toLowerCase().includes(queryStr) ||
        log.userEmail?.toLowerCase().includes(queryStr) ||
        log.context?.toLowerCase().includes(queryStr)
      );
    }

    // Sort by timestamp (newest first)
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({ logs, count: logs.length });
  } catch (error) {
    serverLogger.error('Error searching logs', { context: 'Logs', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// ============================================
// SUPPORT ENDPOINTS
// ============================================

// POST /api/support/tickets - Create support ticket
app.post('/api/support/tickets', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, description, priority } = req.body;
    const userId = req.user?.id;
    const userEmail = req.user?.email;

    if (!title || !description) {
      res.status(400).json({ error: 'Title and description are required' });
      return;
    }

    const supportStorage = getSupportStorage();
    if (!supportStorage || !supportStorage.isInitialized()) {
      // Fallback: store in memory or log
      serverLogger.info('Ticket created (storage not available)', { context: 'Support', metadata: { title, userId, userEmail } });
      res.json({ success: true, stored: false, message: 'Support storage not available' });
      return;
    }

    const ticket = {
      id: `ticket_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title,
      description,
      status: SupportTicketStatus.OPEN,
      priority: priority || SupportTicketPriority.MEDIUM,
      createdBy: userId || 'unknown',
      createdByEmail: userEmail || 'unknown',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {},
      comments: [],
    };

    const success = await supportStorage.createTicket(ticket);
    
    // Log activity
    logActivity(req, ActivityType.CONFIG_CHANGE, `Created support ticket: ${title}`, { ticketId: ticket.id });

    // Create notification for admin (adar.sobol@pagaya.com)
    const ADMIN_EMAIL = 'adar.sobol@pagaya.com';
    
    // Find admin user ID BEFORE creating notification object
    const gcs = getGCSStorage();
    let adminUserId: string | null = null;
    
    serverLogger.debug('Looking up admin user ID for ticket notification', { context: 'Notification', metadata: { ticketId: ticket.id } });
    
    if (gcs) {
      // Find admin user ID by email
      const doc = await getDoc();
      if (doc) {
        const usersSheet = doc.sheetsByTitle['Users'];
        if (usersSheet) {
          const rows = await usersSheet.getRows();
          const adminRow = rows.find((r: GoogleSpreadsheetRow) => r.get('email') === ADMIN_EMAIL);
          if (adminRow) {
            adminUserId = adminRow.get('id');
            serverLogger.debug('Found admin user ID', { context: 'Notification', metadata: { adminUserId, email: ADMIN_EMAIL } });
          } else {
            serverLogger.warn('Admin row not found in Users sheet', { context: 'Notification', metadata: { email: ADMIN_EMAIL } });
          }
        } else {
          serverLogger.warn('Users sheet not found', { context: 'Notification' });
        }
      } else {
        serverLogger.warn('Could not get Google Sheets doc', { context: 'Notification' });
      }
    } else {
      serverLogger.warn('GCS storage not available for notifications', { context: 'Notification' });
    }
    
    // Use actual admin user ID if found, otherwise fall back to email
    const targetUserId = adminUserId || ADMIN_EMAIL;
    
    // Create notification with correct userId from the start
    const adminNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: NotificationType.SupportTicketNew,
      title: 'New Support Ticket',
      message: `${userEmail} submitted: ${title}`,
      initiativeId: ticket.id,
      initiativeTitle: title,
      timestamp: new Date().toISOString(),
      read: false,
      userId: targetUserId,
      metadata: {
        ticketId: ticket.id,
        submittedBy: userEmail,
        priority: ticket.priority,
      },
    };

    // Store and emit notification to admin
    if (gcs) {
      await gcs.addNotification(targetUserId, adminNotification);
      io.emit('notification:received', { userId: targetUserId, notification: adminNotification });
      serverLogger.debug('Stored and emitted notification for admin', { context: 'Notification', metadata: { targetUserId } });
    } else {
      // Emit via Socket.IO even without GCS persistence
      io.emit('notification:received', { userId: targetUserId, notification: adminNotification });
      serverLogger.debug('Emitted Socket.IO notification (no GCS persistence)', { context: 'Notification', metadata: { targetUserId } });
    }

    res.json({ success, ticket });
  } catch (error) {
    serverLogger.error('Error creating support ticket', { context: 'Support', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/support/tickets - Get support tickets (admin only, returns empty if not admin)
app.get('/api/support/tickets', optionalAuthenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    serverLogger.debug('Getting tickets', { context: 'Support', metadata: { user: req.user?.email, role: req.user?.role } });
    
    // Only admins can view all tickets - return empty for non-admins (no error)
    if (req.user?.role !== 'Admin') {
      res.json({ tickets: [], message: 'Admin access required to view tickets' });
      return;
    }

    const { status } = req.query;
    const supportStorage = getSupportStorage();
    let tickets: any[] = [];

    if (supportStorage && supportStorage.isInitialized()) {
      tickets = await supportStorage.getTickets(status as SupportTicketStatus | undefined);
    } else {
      // Use memory fallback
      tickets = memoryStorage.getTickets(status as SupportTicketStatus | undefined);
    }
    
    res.json({ tickets, count: tickets.length });
  } catch (error) {
    serverLogger.error('Error getting support tickets', { context: 'Support', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/support/my-tickets - Get tickets for the current user
app.get('/api/support/my-tickets', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userEmail = req.user?.email;
    const userId = req.user?.id;

    if (!userEmail && !userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const supportStorage = getSupportStorage();
    if (!supportStorage || !supportStorage.isInitialized()) {
      res.json({ tickets: [], message: 'Support storage not available' });
      return;
    }

    // Get all tickets and filter by user
    const allTickets = await supportStorage.getTickets();
    const userTickets = allTickets.filter(ticket => 
      ticket.createdByEmail === userEmail || ticket.createdBy === userId
    );

    res.json({ tickets: userTickets, count: userTickets.length });
  } catch (error) {
    serverLogger.error('Error getting user tickets', { context: 'Support', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// PATCH /api/support/tickets/:id - Update support ticket (admin only)
app.patch('/api/support/tickets/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.role !== 'Admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { id } = req.params;
    const updates = req.body;
    const supportStorage = getSupportStorage();

    if (!supportStorage || !supportStorage.isInitialized()) {
      res.status(503).json({ error: 'Support storage not available' });
      return;
    }

    // Get ticket before update to find the creator
    const tickets = await supportStorage.getTickets();
    const ticket = tickets.find(t => t.id === id);
    
    const success = await supportStorage.updateTicket(id, {
      ...updates,
      resolvedBy: req.user?.id,
      resolvedAt: updates.status === SupportTicketStatus.RESOLVED || updates.status === SupportTicketStatus.CLOSED 
        ? new Date().toISOString() 
        : undefined,
    });

    if (success) {
      logActivity(req, ActivityType.CONFIG_CHANGE, `Updated support ticket: ${id}`, { ticketId: id, updates });
      
      // If status changed, notify the ticket creator
      if (updates.status && ticket && ticket.createdByEmail) {
        const statusNotification = {
          id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: NotificationType.SupportTicketStatusChange,
          title: 'Ticket Status Updated',
          message: `Your ticket "${ticket.title}" status changed to ${updates.status}`,
          initiativeId: id,
          initiativeTitle: ticket.title,
          timestamp: new Date().toISOString(),
          read: false,
          userId: ticket.createdBy,
          metadata: {
            ticketId: id,
            oldStatus: ticket.status,
            newStatus: updates.status,
          },
        };

        const gcs = getGCSStorage();
        if (gcs) {
          await gcs.addNotification(ticket.createdBy, statusNotification);
        }
        io.emit('notification:received', { userId: ticket.createdBy, notification: statusNotification });
      }
    }

    res.json({ success });
  } catch (error) {
    serverLogger.error('Error updating support ticket', { context: 'Support', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/support/tickets/:id - Get a single ticket
app.get('/api/support/tickets/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const supportStorage = getSupportStorage();

    if (!supportStorage || !supportStorage.isInitialized()) {
      res.status(503).json({ error: 'Support storage not available' });
      return;
    }

    const ticket = await supportStorage.getTicketById(id);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    // Check access: admin can see all, users can only see their own
    if (req.user?.role !== 'Admin' && ticket.createdBy !== req.user?.id && ticket.createdByEmail !== req.user?.email) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    res.json({ ticket });
  } catch (error) {
    serverLogger.error('Error getting support ticket', { context: 'Support', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/support/tickets/:id/comments - Add a comment to a ticket
app.post('/api/support/tickets/:id/comments', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user?.id;
    const userEmail = req.user?.email;

    if (!content || content.trim() === '') {
      res.status(400).json({ error: 'Comment content is required' });
      return;
    }

    const supportStorage = getSupportStorage();
    if (!supportStorage || !supportStorage.isInitialized()) {
      res.status(503).json({ error: 'Support storage not available' });
      return;
    }

    // Get the ticket to check access and get creator info
    const ticket = await supportStorage.getTicketById(id);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    // Check access: admin can comment on any ticket, users only on their own
    const isAdmin = req.user?.role === 'Admin';
    const isOwner = ticket.createdBy === userId || ticket.createdByEmail === userEmail;
    if (!isAdmin && !isOwner) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const comment = {
      id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ticketId: id,
      authorId: userId || 'unknown',
      authorEmail: userEmail || 'unknown',
      content: content.trim(),
      timestamp: new Date().toISOString(),
      isInternal: false,
    };

    const success = await supportStorage.addComment(id, comment);

    if (success) {
      logActivity(req, ActivityType.CONFIG_CHANGE, `Added comment to ticket: ${id}`, { ticketId: id });

      // Send notification
      const ADMIN_EMAIL = 'adar.sobol@pagaya.com';
      
      if (isAdmin) {
        // Admin commented - notify ticket creator
        const creatorNotification = {
          id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: NotificationType.SupportTicketReply,
          title: 'New Reply to Your Ticket',
          message: `Admin replied to your ticket: "${ticket.title}"`,
          initiativeId: id,
          initiativeTitle: ticket.title,
          timestamp: new Date().toISOString(),
          read: false,
          userId: ticket.createdBy,
          metadata: {
            ticketId: id,
            commentId: comment.id,
            commentPreview: content.substring(0, 50),
          },
        };

        const gcs = getGCSStorage();
        if (gcs) {
          await gcs.addNotification(ticket.createdBy, creatorNotification);
        }
        // Emit notification - frontend will filter by userId
        io.emit('notification:received', { userId: ticket.createdBy, notification: creatorNotification });
      } else {
        // User commented - notify admin
        // Find admin user ID BEFORE creating notification object
        serverLogger.debug('Looking up admin user ID for comment notification', { context: 'Notification', metadata: { ticketId: id } });
        const gcs = getGCSStorage();
        let adminUserId: string | null = null;
        
        if (gcs) {
          const doc = await getDoc();
          if (doc) {
            const usersSheet = doc.sheetsByTitle['Users'];
            if (usersSheet) {
              const rows = await usersSheet.getRows();
              const adminRow = rows.find((r: GoogleSpreadsheetRow) => r.get('email') === ADMIN_EMAIL);
              if (adminRow) {
                adminUserId = adminRow.get('id');
              }
            }
          }
        }
        
        // Use actual admin user ID if found, otherwise fall back to email
        const targetUserId = adminUserId || ADMIN_EMAIL;
        
        // Create notification with correct userId from the start
        const adminNotification = {
          id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: NotificationType.SupportTicketReply,
          title: 'New Comment on Ticket',
          message: `${userEmail} commented on: "${ticket.title}"`,
          initiativeId: id,
          initiativeTitle: ticket.title,
          timestamp: new Date().toISOString(),
          read: false,
          userId: targetUserId,
          metadata: {
            ticketId: id,
            commentId: comment.id,
            commentPreview: content.substring(0, 50),
          },
        };

        // Store and emit notification
        if (gcs) {
          await gcs.addNotification(targetUserId, adminNotification);
          io.emit('notification:received', { userId: targetUserId, notification: adminNotification });
        } else {
          // Emit via Socket.IO even without GCS persistence
          io.emit('notification:received', { userId: targetUserId, notification: adminNotification });
        }
      }
    }

    res.json({ success, comment });
  } catch (error) {
    serverLogger.error('Error adding comment', { context: 'Support', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/support/feedback - Submit feedback (public endpoint - no auth required)
app.post('/api/support/feedback', async (req: Request, res: Response) => {
  try {
    // Try to get user info from token if provided, but don't require it
    let userId: string | undefined;
    let userEmail: string | undefined;
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token && JWT_SECRET) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded && typeof decoded === 'object' && 'id' in decoded && 'email' in decoded) {
          userId = decoded.id as string;
          userEmail = decoded.email as string;
        }
      } catch (err) {
        // Token invalid/expired, but that's okay - proceed as anonymous
        serverLogger.debug('Token verification failed, proceeding as anonymous', { context: 'Feedback' });
      }
    }

    const { type, title, description, metadata, screenshot } = req.body;

    if (!type || !title || !description) {
      res.status(400).json({ error: 'Type, title, and description are required' });
      return;
    }

    const feedback = {
      id: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      title,
      description,
      submittedBy: userId || 'anonymous',
      submittedByEmail: userEmail || 'anonymous',
      submittedAt: new Date().toISOString(),
      status: 'new' as const,
      metadata: metadata || {},
      screenshot,
    };

    const supportStorage = getSupportStorage();
    let stored = false;
    
    if (supportStorage && supportStorage.isInitialized()) {
      // Use GCS storage
      stored = await supportStorage.createFeedback(feedback);
      if (!stored) {
        serverLogger.error('Failed to store feedback in GCS, using memory fallback', { context: 'Feedback' });
        stored = memoryStorage.createFeedback(feedback);
      }
    } else {
      // Use in-memory fallback
      stored = memoryStorage.createFeedback(feedback);
    }
    
    // Broadcast feedback event via Socket.IO for real-time updates
    io.emit('feedback:submitted', { feedback });
    
    // Create notification for admin (adar.sobol@pagaya.com)
    const ADMIN_EMAIL = 'adar.sobol@pagaya.com';
    
    // Find admin user ID BEFORE creating notification object
    const gcs = getGCSStorage();
    let adminUserId: string | null = null;
    
    serverLogger.debug('Looking up admin user ID for feedback notification', { context: 'Notification', metadata: { feedbackId: feedback.id } });
    
    if (gcs) {
      // Find admin user ID by email
      const doc = await getDoc();
      if (doc) {
        const usersSheet = doc.sheetsByTitle['Users'];
        if (usersSheet) {
          const rows = await usersSheet.getRows();
          const adminRow = rows.find((r: GoogleSpreadsheetRow) => r.get('email') === ADMIN_EMAIL);
          if (adminRow) {
            adminUserId = adminRow.get('id');
          }
        }
      }
    }
    
    // Use actual admin user ID if found, otherwise fall back to email
    const targetUserId = adminUserId || ADMIN_EMAIL;
    
    // Create notification with correct userId from the start
    const adminNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: NotificationType.SupportTicketNew, // Reuse SupportTicketNew type for feedback
      title: 'New Feedback Submitted',
      message: `${feedback.submittedByEmail} submitted ${feedback.type} feedback: ${feedback.title}`,
      initiativeId: feedback.id,
      initiativeTitle: feedback.title,
      timestamp: new Date().toISOString(),
      read: false,
      userId: targetUserId,
      metadata: {
        feedbackId: feedback.id,
        feedbackType: feedback.type,
        submittedBy: feedback.submittedByEmail,
      },
    };

    // Store and emit notification to admin
    if (gcs) {
      await gcs.addNotification(targetUserId, adminNotification);
      io.emit('notification:received', { userId: targetUserId, notification: adminNotification });
    } else {
      // Emit via Socket.IO even without GCS persistence
      io.emit('notification:received', { userId: targetUserId, notification: adminNotification });
    }
    
    res.json({ success: true, stored, feedback });
  } catch (error) {
    serverLogger.error('Error submitting feedback', { context: 'Feedback', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/support/feedback - Get feedback (admins see all, users see their own)
app.get('/api/support/feedback', optionalAuthenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    serverLogger.debug('Getting feedback', { context: 'Feedback', metadata: { user: req.user?.email, role: req.user?.role } });
    
    const supportStorage = getSupportStorage();
    let feedback: any[] = [];
    
    if (supportStorage && supportStorage.isInitialized()) {
      feedback = await supportStorage.getFeedback();
    } else {
      // Use memory fallback
      feedback = memoryStorage.getFeedback();
    }
    
    // Filter feedback based on user role
    if (req.user?.role === 'Admin') {
      // Admins see all feedback
    } else if (req.user?.id || req.user?.email) {
      // Non-admins can only see their own feedback
      const userId = req.user.id;
      const userEmail = req.user.email;
      feedback = feedback.filter(f => 
        f.submittedBy === userId || 
        f.submittedByEmail === userEmail
      );
    } else {
      // No user info - return empty
      feedback = [];
    }
    
    res.json({ feedback, count: feedback.length });
  } catch (error) {
    serverLogger.error('Error getting feedback', { context: 'Feedback', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// PATCH /api/support/feedback/:id - Update feedback status (admin or owner)
app.patch('/api/support/feedback/:id', optionalAuthenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, assignedTo, assignedToEmail } = req.body;

    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const supportStorage = getSupportStorage();
    let feedback: any = null;

    // Get the feedback to check ownership (optimized - don't load all feedback)
    if (supportStorage && supportStorage.isInitialized()) {
      feedback = await supportStorage.getFeedbackById(id);
    } else {
      feedback = memoryStorage.getFeedbackById(id);
    }

    if (!feedback) {
      res.status(404).json({ error: 'Feedback not found' });
      return;
    }

    // Check permissions: admin can update any, users can only update their own
    const isOwner = feedback.submittedBy === req.user.id || feedback.submittedByEmail === req.user.email;
    const isAdmin = req.user.role === 'Admin';

    if (!isAdmin && !isOwner) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Users can only update status to 'resolved' or 'closed', admins can set any status
    const updates: any = { updatedAt: new Date().toISOString() };
    if (status) {
      if (isAdmin || (isOwner && (status === 'resolved' || status === 'closed'))) {
        updates.status = status;
      } else {
        res.status(403).json({ error: 'Users can only mark feedback as resolved or closed' });
        return;
      }
    }
    if (assignedTo && isAdmin) {
      updates.assignedTo = assignedTo;
    }
    if (assignedToEmail && isAdmin) {
      updates.assignedToEmail = assignedToEmail;
    }

    let success = false;
    if (supportStorage && supportStorage.isInitialized()) {
      success = await supportStorage.updateFeedback(id, updates);
    } else {
      success = memoryStorage.updateFeedback(id, updates);
    }

    if (!success) {
      res.status(500).json({ error: 'Failed to update feedback' });
      return;
    }

    res.json({ success: true, feedback: { ...feedback, ...updates } });
  } catch (error) {
    serverLogger.error('Error updating feedback', { context: 'Feedback', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/support/feedback/:id/comments - Add comment to feedback
app.post('/api/support/feedback/:id/comments', optionalAuthenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!content || !content.trim()) {
      res.status(400).json({ error: 'Comment content is required' });
      return;
    }

    const supportStorage = getSupportStorage();
    let feedback: any = null;

    // Get the feedback to check ownership (optimized - don't load all feedback)
    if (supportStorage && supportStorage.isInitialized()) {
      feedback = await supportStorage.getFeedbackById(id);
    } else {
      feedback = memoryStorage.getFeedbackById(id);
    }

    if (!feedback) {
      res.status(404).json({ error: 'Feedback not found' });
      return;
    }

    // Check permissions: admin can comment on any, users can only comment on their own
    const isOwner = feedback.submittedBy === req.user.id || feedback.submittedByEmail === req.user.email;
    const isAdmin = req.user.role === 'Admin';

    if (!isAdmin && !isOwner) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const comment: FeedbackComment = {
      id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content: content.trim(),
      authorId: req.user.id,
      authorEmail: req.user.email,
      timestamp: new Date().toISOString(),
      isAdmin: isAdmin,
    };

    let success = false;
    if (supportStorage && supportStorage.isInitialized()) {
      success = await supportStorage.addFeedbackComment(id, comment);
    } else {
      success = memoryStorage.addFeedbackComment(id, comment);
    }

    if (!success) {
      res.status(500).json({ error: 'Failed to add comment' });
      return;
    }

    res.json({ success: true, comment });
  } catch (error) {
    serverLogger.error('Error adding comment to feedback', { context: 'Feedback', error: error as Error });
    res.status(500).json({ error: String(error) });
  }
});

// ============================================
// JIRA INTEGRATION ENDPOINTS
// ============================================

// Jira configuration from environment
const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_USER_EMAIL = process.env.JIRA_USER_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

const isJiraConfigured = () => !!(JIRA_BASE_URL && JIRA_USER_EMAIL && JIRA_API_TOKEN);

// Helper to make Jira API requests
async function jiraFetch(endpoint: string, options: RequestInit = {}) {
  if (!isJiraConfigured()) {
    throw new Error('Jira is not configured. Please set JIRA_BASE_URL, JIRA_USER_EMAIL, and JIRA_API_TOKEN environment variables.');
  }
  
  const auth = Buffer.from(`${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
  
  const response = await fetch(`${JIRA_BASE_URL}/rest/api/3${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jira API error (${response.status}): ${errorText}`);
  }
  
  return response.json();
}

// GET /api/jira/test - Test Jira connection and fetch sample issues
app.get('/api/jira/test', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    serverLogger.debug('Testing Jira connection...', { context: 'Jira' });
    
    if (!isJiraConfigured()) {
      res.status(400).json({ 
        success: false, 
        error: 'Jira is not configured',
        details: {
          hasBaseUrl: !!JIRA_BASE_URL,
          hasEmail: !!JIRA_USER_EMAIL,
          hasToken: !!JIRA_API_TOKEN,
        }
      });
      return;
    }
    
    // Test with a simple search - get 5 issues from POL project
    // Using the new /search/jql endpoint (the old /search endpoint was deprecated)
    const jql = 'project = POL ORDER BY created DESC';
    const ASSET_CLASS_FIELD = 'customfield_11333'; // Asset Class (Pol)
    
    const result = await jiraFetch(`/search/jql`, {
      method: 'POST',
      body: JSON.stringify({
        jql: jql,
        maxResults: 5,
        fields: ['summary', 'status', 'issuetype', 'assignee', 'duedate', ASSET_CLASS_FIELD]
      })
    }) as { issues?: any[]; total?: number };
    
    serverLogger.debug(`Successfully fetched ${result.issues?.length || 0} issues from Jira`, { context: 'Jira' });
    
    // Map to simplified format
    const issues = (result.issues || []).map((issue: any) => ({
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status?.name,
      issueType: issue.fields.issuetype?.name,
      assetClass: issue.fields[ASSET_CLASS_FIELD]?.value || issue.fields[ASSET_CLASS_FIELD] || null,
      assignee: issue.fields.assignee?.displayName || 'Unassigned',
      dueDate: issue.fields.duedate,
      url: `${JIRA_BASE_URL}/browse/${issue.key}`,
    }));
    
    res.json({
      success: true,
      message: `Connected to Jira. Found ${result.total} total issues in POL project.`,
      sampleIssues: issues,
      config: {
        baseUrl: JIRA_BASE_URL,
        email: JIRA_USER_EMAIL,
        project: 'POL',
      }
    });
  } catch (error) {
    serverLogger.error('Jira test failed', { context: 'Jira', error: error as Error });
    res.status(500).json({ 
      success: false, 
      error: String(error),
      hint: 'Check your JIRA_API_TOKEN and ensure the user has access to the POL project.'
    });
  }
});

// GET /api/jira/fields - Get available custom fields (to find asset class field ID)
app.get('/api/jira/fields', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isJiraConfigured()) {
      res.status(400).json({ success: false, error: 'Jira is not configured' });
      return;
    }
    
    const fields = await jiraFetch('/field') as any[];
    
    // Filter to show custom fields that might be "asset class"
    const assetClassFields = fields.filter((f: any) => 
      f.name.toLowerCase().includes('asset') || 
      f.name.toLowerCase().includes('class') ||
      f.id.startsWith('customfield_')
    );
    
    res.json({
      success: true,
      totalFields: fields.length,
      relevantFields: assetClassFields.map((f: any) => ({
        id: f.id,
        name: f.name,
        custom: f.custom,
        type: f.schema?.type,
      })),
      hint: 'Look for a field named "asset class(pol)" or similar. Use its ID (e.g., customfield_12345) in the configuration.'
    });
  } catch (error) {
    serverLogger.error('Failed to fetch Jira fields', { context: 'Jira', error: error as Error });
    res.status(500).json({ success: false, error: String(error) });
  }
});

// ============================================
// SPA FALLBACK (serve index.html for all non-API routes)
// ============================================
// This must be after all API routes
if (NODE_ENV === 'production' || process.env.SERVE_STATIC === 'true') {
  app.get('*', (req: Request, res: Response) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    
    const indexPath = path.join(distPath, 'index.html');
    try {
      if (fs.existsSync(indexPath)) {
        res.sendFile(path.resolve(indexPath));
      } else {
        res.status(404).send('Frontend not found. Please build the frontend first.');
      }
    } catch (error) {
      res.status(500).send('Error serving frontend');
    }
  });
}

// ============================================
// START SERVER (using httpServer for Socket.IO)
// ============================================
// Start listening IMMEDIATELY to satisfy Cloud Run health checks
// (Binding already happened at the top)

// Handle server errors
httpServer.on('error', (error: NodeJS.ErrnoException) => {
  serverLogger.critical('Server error', { error });
  if (error.code === 'EADDRINUSE') {
    serverLogger.critical(`Port ${PORT} is already in use`);
  }
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  serverLogger.critical('Uncaught Exception', { error });
});

process.on('unhandledRejection', (reason, promise) => {
  serverLogger.critical('Unhandled Rejection', { metadata: { reason: String(reason) } });
});

// Log endpoints after a short delay to keep logs clean during startup
setTimeout(() => {
  serverLogger.info('API endpoints available', { 
    context: 'Startup',
    metadata: { 
      endpoints: 'Auth, Bulk Import, Sheets, Notifications, Backup, Logging, Config, Support, Jira',
      jiraConfigured: isJiraConfigured()
    }
  });
}, 1000);
