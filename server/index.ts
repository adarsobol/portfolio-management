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

serverLogger.info('Starting Portfolio Manager Server...');
serverLogger.info('Server configuration', { 
  metadata: { 
    environment: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 8080 
  }
});

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';

// Start listening IMMEDIATELY to satisfy Cloud Run health checks
httpServer.listen(Number(PORT), HOST, () => {
  serverLogger.info(`Portfolio Manager API Server running on http://${HOST}:${PORT}`);
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
        serverLogger.info('GCS Storage initialized successfully');
        // Initialize backup service
        if (isBackupServiceEnabled()) {
          initializeBackupService(gcsConfig.bucketName, gcsConfig.projectId);
          serverLogger.info('Backup Service initialized');
        }
        // Initialize log storage
        initializeLogStorage({
          bucketName: gcsConfig.bucketName,
          projectId: gcsConfig.projectId,
          keyFilename: gcsConfig.keyFilename,
        });
        serverLogger.info('Log Storage initialized');
        // Initialize support storage
        initializeSupportStorage({
          bucketName: gcsConfig.bucketName,
          projectId: gcsConfig.projectId,
          keyFilename: gcsConfig.keyFilename,
        });
        serverLogger.info('Support Storage initialized with GCS');
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
serverLogger.debug('Checking if GCS is enabled for support storage...', { context: 'Init' });
serverLogger.debug('isGCSEnabled check', { context: 'Init', metadata: { enabled: isGCSEnabled() } });

if (isGCSEnabled()) {
  const gcsConfig = getGCSConfig();
  serverLogger.debug('GCS config loaded', { 
    context: 'Init', 
    metadata: gcsConfig ? {
      bucketName: gcsConfig.bucketName,
      hasProjectId: !!gcsConfig.projectId,
      hasKeyFilename: !!gcsConfig.keyFilename
    } : { config: 'null' }
  });
  
  if (gcsConfig) {
    try {
      serverLogger.debug('Calling initializeSupportStorage...', { context: 'Init' });
      const storage = initializeSupportStorage({
        bucketName: gcsConfig.bucketName,
        projectId: gcsConfig.projectId,
        keyFilename: gcsConfig.keyFilename,
      });
      serverLogger.info('Support Storage initialized with GCS (independent of main storage backend)', { 
        context: 'Init', 
        metadata: { isInitialized: storage.isInitialized() }
      });
    } catch (error) {
      serverLogger.error('Failed to initialize Support Storage with GCS', { context: 'Init', error: error as Error });
      serverLogger.info('Support Storage will use in-memory fallback', { context: 'Init' });
    }
  } else {
    serverLogger.info('GCS config is null, Support Storage will use in-memory fallback', { context: 'Init' });
  }
} else {
  serverLogger.info('GCS not enabled, Support Storage will use in-memory fallback', { context: 'Init' });
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
  serverLogger.debug('User connected', { context: 'SocketIO', metadata: { socketId: socket.id } });

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
    serverLogger.info(`${userData.name} joined`, { context: 'SocketIO', metadata: { usersOnline: connectedUsers.size } });
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
      serverLogger.info(`${user.name} disconnected`, { context: 'SocketIO' });
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
      serverLogger.debug(`${user.name} timed out due to inactivity`, { context: 'SocketIO' });
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
    serverLogger.error('JWT_SECRET environment variable is not set in production. Using fallback (not recommended for security).', { context: 'Config' });
    serverLogger.error('Please set JWT_SECRET via Secret Manager or environment variables.', { context: 'Config' });
  } else {
    serverLogger.warn('JWT_SECRET not set. Using insecure default for development only.', { context: 'Config' });
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
    serverLogger.error('Failed to store activity log', { context: 'ActivityLog', error: err as Error });
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
      serverLogger.info(`Serving static files from ${distPath}`, { context: 'Static' });
    }
  } catch (error) {
    serverLogger.warn('Could not serve static files', { context: 'Static', error: error as Error });
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
  serverLogger.debug('Authorization header check', { 
    context: 'Auth', 
    metadata: { 
      headerPresent: !!authHeader,
      headerPreview: authHeader ? `${authHeader.substring(0, 30)}...` : 'none'
    }
  });
  
  const token = authHeader && authHeader.split(' ')[1];
  serverLogger.debug('Token extraction', { 
    context: 'Auth', 
    metadata: { 
      tokenExtracted: !!token,
      tokenPreview: token ? `${token.substring(0, 20)}...` : 'none'
    }
  });

  if (!token) {
    // No token - proceed without user (will return empty data for protected resources)
    serverLogger.debug('No token provided, proceeding without user', { context: 'Auth' });
    next();
    return;
  }

  try {
    const decoded = jwt.verify(token, EFFECTIVE_JWT_SECRET) as { email: string; name: string; role: string; id: string };
    req.user = decoded;
    serverLogger.debug('Token verified successfully', { context: 'Auth', metadata: { email: decoded.email, role: decoded.role } });
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
    serverLogger.error('Last connection error', { context: 'Connection', error: lastConnectionError as Error });
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
    serverLogger.error('Failed to connect to Google Sheets', { context: 'Sheets', metadata: { error: lastConnectionError } });
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
    serverLogger.error('Error loading config', { context: 'Config', error: error as Error });
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
    serverLogger.warn('Config or rolePermissions missing', { context: 'Authorization' });
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
        serverLogger.info('Adding missing Users columns', { context: 'Server', metadata: { missingHeaders } });
        await usersSheet.setHeaderRow([...currentHeaders, ...missingHeaders]);
        // After updating headers, we need to reload rows to get the new column structure
        serverLogger.debug('Headers updated, will reload rows after header update', { context: 'Server' });
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
      serverLogger.debug(`lastLogin column missing for ${email}, adding it now`, { context: 'Server' });
      await usersSheet.setHeaderRow([...headers, 'lastLogin']);
      
      // CRITICAL: Reload header row to refresh the sheet's column structure
      await usersSheet.loadHeaderRow();
      
      // Reload rows to get fresh row objects with the new column structure
      rows = await usersSheet.getRows();
      userRow = rows.find((r: GoogleSpreadsheetRow) => r.get('email')?.toLowerCase() === email.toLowerCase());
      
      if (!userRow) {
        serverLogger.error('Could not find user row after adding lastLogin column', { context: 'Server' });
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
          serverLogger.error('Could not find user row after initializing lastLogin column', { context: 'Server' });
          res.status(500).json({ error: 'Failed to update login history' });
          return;
        }
      }
    }

    // Update last login timestamp
    const loginTimestamp = new Date().toISOString();
    serverLogger.debug(`Setting lastLogin for ${email}`, { context: 'Server', metadata: { timestamp: loginTimestamp } });
    
    // Ensure userRow exists before attempting save operations
    if (!userRow) {
      serverLogger.error(`userRow is null/undefined for ${email} before save attempt`, { context: 'Server' });
      throw new Error('Failed to retrieve user row before login update');
    }
    
    // Update metadata and lastLogin together
    try {
      if (picture && userRow.get('avatar') !== picture) {
        userRow.set('avatar', picture);
      }
      userRow.set('lastLogin', loginTimestamp);
      serverLogger.debug(`Prepared lastLogin update for ${email}, attempting save...`, { context: 'Server' });
    } catch (preSaveError) {
      serverLogger.error(`Failed to set lastLogin value for ${email} before save`, { context: 'Server', error: preSaveError as Error });
      throw new Error(`Failed to prepare login update: ${preSaveError instanceof Error ? preSaveError.message : String(preSaveError)}`);
    }
    
    let savedLastLogin: string | null = loginTimestamp; // Default to what we set
    try {
      await userRow.save();
      serverLogger.debug(`Successfully saved lastLogin for ${email}`, { context: 'Server', metadata: { timestamp: loginTimestamp } });
      
      // Try to verify by reloading, but don't fail if verification doesn't work
      try {
        rows = await usersSheet.getRows();
        userRow = rows.find((r: GoogleSpreadsheetRow) => r.get('email')?.toLowerCase() === email.toLowerCase());
        if (userRow) {
          const savedTimestamp = userRow.get('lastLogin');
          if (savedTimestamp) {
            savedLastLogin = savedTimestamp;
            if (savedTimestamp === loginTimestamp) {
              serverLogger.debug(`Verified lastLogin save successful for ${email}`, { context: 'Server' });
            } else {
              serverLogger.warn(`lastLogin value differs after save for ${email}`, { context: 'Server', metadata: { expected: loginTimestamp, got: savedTimestamp } });
            }
          } else {
            serverLogger.warn(`lastLogin is empty after save for ${email}, but save() succeeded`, { context: 'Server' });
          }
        } else {
          serverLogger.warn(`Could not find user row after save for ${email} during verification`, { context: 'Server' });
        }
      } catch (verifyError) {
        serverLogger.warn(`Could not verify lastLogin save for ${email}, but save() appeared successful`, { context: 'Server', error: verifyError as Error });
        // Keep savedLastLogin as loginTimestamp since save() succeeded
      }
    } catch (saveError) {
      serverLogger.error(`Failed to save lastLogin for ${email}`, { context: 'Server', error: saveError as Error });
      serverLogger.error(`Save error details for ${email}`, { 
        context: 'Server', 
        metadata: { 
          errorType: saveError instanceof Error ? saveError.constructor.name : typeof saveError 
        },
        error: saveError as Error
      });
      
      // Retry the save operation once
      try {
        serverLogger.debug(`Retrying lastLogin save for ${email}...`, { context: 'Server' });
        // Reload the row to get a fresh reference
        rows = await usersSheet.getRows();
        userRow = rows.find((r: GoogleSpreadsheetRow) => r.get('email')?.toLowerCase() === email.toLowerCase());
        if (userRow) {
          userRow.set('lastLogin', loginTimestamp);
          await userRow.save();
          serverLogger.info(`Retry successful: Saved lastLogin for ${email}`, { context: 'Server', metadata: { timestamp: loginTimestamp } });
          savedLastLogin = loginTimestamp;
          
          // Verify the retry save
          try {
            rows = await usersSheet.getRows();
            userRow = rows.find((r: GoogleSpreadsheetRow) => r.get('email')?.toLowerCase() === email.toLowerCase());
            if (userRow) {
              const retryTimestamp = userRow.get('lastLogin');
              if (retryTimestamp === loginTimestamp) {
                serverLogger.debug(`Verified retry save successful for ${email}`, { context: 'Server' });
              } else {
                serverLogger.warn(`Retry save value differs for ${email}`, { context: 'Server', metadata: { expected: loginTimestamp, got: retryTimestamp } });
              }
            }
          } catch (verifyError) {
            serverLogger.warn(`Could not verify retry save for ${email}`, { context: 'Server', error: verifyError as Error });
          }
        } else {
          serverLogger.error(`Could not find user row for ${email} during retry`, { context: 'Server' });
          savedLastLogin = null;
        }
      } catch (retryError) {
        serverLogger.error(`Retry save also failed for ${email}`, { context: 'Server', error: retryError as Error });
        // Try to read existing value as fallback
        try {
          rows = await usersSheet.getRows();
          userRow = rows.find((r: GoogleSpreadsheetRow) => r.get('email')?.toLowerCase() === email.toLowerCase());
          if (userRow) {
            const existingTimestamp = userRow.get('lastLogin');
            if (existingTimestamp) {
              savedLastLogin = existingTimestamp;
              serverLogger.debug(`Using existing lastLogin value for ${email}`, { context: 'Server', metadata: { timestamp: existingTimestamp } });
            } else {
              savedLastLogin = null;
              serverLogger.warn(`No existing lastLogin value found for ${email} after retry failure`, { context: 'Server' });
            }
          } else {
            serverLogger.error(`Could not find user row for ${email} after retry error`, { context: 'Server' });
            savedLastLogin = null;
          }
        } catch (loadError) {
          serverLogger.error(`Failed to reload rows after retry error for ${email}`, { context: 'Server', error: loadError as Error });
          savedLastLogin = null;
        }
      }
    }

    if (!userRow) {
      serverLogger.error(`userRow is null/undefined for ${email} after login update attempt`, { context: 'Server' });
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
      serverLogger.info('Created Users sheet with default admin user', { context: 'Server' });
    } else {
      // Ensure headers are up-to-date (adds missing columns like lastLogin)
      await usersSheet.loadHeaderRow().catch(() => {});
      const currentHeaders = usersSheet.headerValues || [];
      const missingHeaders = USER_HEADERS.filter(h => !currentHeaders.includes(h));
      if (missingHeaders.length > 0) {
        serverLogger.info('Adding missing Users columns', { context: 'Server', metadata: { missingHeaders } });
        await usersSheet.setHeaderRow([...currentHeaders, ...missingHeaders]);
        // After updating headers, we need to reload rows to get the new column structure
        serverLogger.debug('Headers updated, will reload rows after header update', { context: 'Server' });
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
      serverLogger.debug(`lastLogin column missing for ${email}, adding it now`, { context: 'Server' });
      await usersSheet.setHeaderRow([...headers, 'lastLogin']);
      
      // CRITICAL: Reload header row to refresh the sheet's column structure
      await usersSheet.loadHeaderRow();
      
      // Reload rows to get fresh row objects with the new column structure
      rows = await usersSheet.getRows();
      userRow = rows.find((r: GoogleSpreadsheetRow) => r.get('email')?.toLowerCase() === email.toLowerCase());
      
      if (!userRow) {
        serverLogger.error('Could not find user row after adding lastLogin column', { context: 'Server' });
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
          serverLogger.error('Could not find user row after initializing lastLogin column', { context: 'Server' });
          res.status(500).json({ error: 'Failed to update login history' });
          return;
        }
      }
    }

    // Update last login timestamp
    const loginTimestamp = new Date().toISOString();
    serverLogger.debug(`Setting lastLogin for ${email}`, { context: 'Server', metadata: { timestamp: loginTimestamp } });
    
    // Set and save lastLogin
    userRow.set('lastLogin', loginTimestamp);
    let savedLastLogin: string | null = loginTimestamp; // Default to what we set
    try {
      await userRow.save();
      serverLogger.debug(`Saved lastLogin for user`, { context: 'Auth', metadata: { email, loginTimestamp } });
      
      // Try to verify by reloading, but don't fail if verification doesn't work
      try {
        rows = await usersSheet.getRows();
        userRow = rows.find((r: GoogleSpreadsheetRow) => r.get('email')?.toLowerCase() === email.toLowerCase());
        if (userRow) {
          const savedTimestamp = userRow.get('lastLogin');
          if (savedTimestamp) {
            savedLastLogin = savedTimestamp;
            if (savedTimestamp === loginTimestamp) {
              serverLogger.debug(`Verified lastLogin save successful for ${email}`, { context: 'Server' });
            } else {
              serverLogger.warn(`lastLogin value differs after save`, { context: 'Auth', metadata: { expected: loginTimestamp, got: savedTimestamp } });
            }
          }
        }
      } catch (verifyError) {
        serverLogger.warn(`Could not verify lastLogin save, but save appeared successful`, { context: 'Auth', error: verifyError as Error });
        // Keep savedLastLogin as loginTimestamp since save() succeeded
      }
    } catch (saveError) {
      serverLogger.error(`Failed to save lastLogin for user`, { context: 'Auth', metadata: { email }, error: saveError as Error });
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
        serverLogger.error(`Failed to reload rows after save error`, { context: 'Auth', error: loadError as Error });
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
    serverLogger.error('Login error', { context: 'Auth', error: error as Error });
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
      serverLogger.info('Adding missing Users columns', { context: 'Server', metadata: { missingHeaders } });
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
      serverLogger.info('Adding missing Users columns', { context: 'Server', metadata: { missingHeaders } });
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

    serverLogger.info(`Bulk imported users`, { context: 'Users', metadata: { created: results.created, skipped: results.skipped, errors: results.errors.length } });
    
    res.json({
      success: true,
      created: results.created,
      skipped: results.skipped,
      errors: results.errors,
      total: users.length
    });

  } catch (error) {
    serverLogger.error('Bulk import users error', { context: 'Users', error: error as Error });
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
        headerValues: INITIATIVE_HEADERS
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
