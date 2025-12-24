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
import { isGCSEnabled, getGCSConfig, initializeGCSStorage, getGCSStorage } from './gcsStorage';
import { generateInitiativeId } from './idGenerator';
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
} from './validation';

dotenv.config();

// ============================================
// STORAGE BACKEND INITIALIZATION
// ============================================
const STORAGE_BACKEND = isGCSEnabled() ? 'gcs' : 'sheets';
console.log(`Storage backend: ${STORAGE_BACKEND}`);

// Initialize GCS if enabled
if (STORAGE_BACKEND === 'gcs') {
  const gcsConfig = getGCSConfig();
  if (gcsConfig) {
    initializeGCSStorage(gcsConfig).then(storage => {
      if (storage) {
        console.log('GCS Storage initialized successfully');
      } else {
        console.error('Failed to initialize GCS Storage, falling back to Sheets');
      }
    });
  }
}

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;

// ============================================
// SOCKET.IO SETUP FOR REAL-TIME COLLABORATION
// ============================================
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://localhost:3000'],
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
  console.log('🔌 User connected:', socket.id);

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
    console.log(`👤 ${userData.name} joined (${connectedUsers.size} users online)`);
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
      console.log(`👋 ${user.name} disconnected`);
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
      console.log(`⏰ ${user.name} timed out due to inactivity`);
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
    console.error('FATAL: JWT_SECRET environment variable is required in production');
    process.exit(1);
  } else {
    console.warn('WARNING: JWT_SECRET not set. Using insecure default for development only.');
  }
}
const EFFECTIVE_JWT_SECRET = JWT_SECRET || 'dev-only-insecure-secret-do-not-use-in-prod';

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
// MIDDLEWARE
// ============================================

// Configure CORS based on environment
const getAllowedOrigins = (): string[] => {
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
      console.log(`📁 Serving static files from ${distPath}`);
    }
  } catch (error) {
    console.warn('Could not serve static files:', error);
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
    console.warn('⚠️ DEVELOPMENT MODE: Authentication bypassed. Set JWT_SECRET to enable auth.');
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
    console.error(lastConnectionError);
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
    console.error('Failed to connect to Google Sheets:', lastConnectionError);
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
  'id', 'l1_assetClass', 'l2_pillar', 'l3_responsibility', 'l4_target',
  'title', 'ownerId', 'secondaryOwner', 'quarter', 'status', 'priority',
  'estimatedEffort', 'originalEstimatedEffort', 'actualEffort',
  'eta', 'originalEta', 'lastUpdated', 'dependencies', 'workType',
  'unplannedTags', 'riskActionLog', 'isAtRisk', 'comments', 'history'
];

const CHANGELOG_HEADERS = [
  'id', 'initiativeId', 'initiativeTitle', 'field',
  'oldValue', 'newValue', 'changedBy', 'timestamp'
];

const USER_HEADERS = ['id', 'email', 'passwordHash', 'name', 'role', 'avatar', 'lastLogin'];

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
    }

    const rows = await usersSheet.getRows();
    let userRow = rows.find((r: GoogleSpreadsheetRow) => r.get('email')?.toLowerCase() === email.toLowerCase());

    if (!userRow) {
      res.status(403).json({ error: "this user doesn't have access to this app" });
      return;
    } else {
      // Update metadata
      if (picture && userRow.get('avatar') !== picture) userRow.set('avatar', picture);
      userRow.set('lastLogin', new Date().toISOString());
      await userRow.save();
    }

    if (!userRow) throw new Error('Failed to retrieve user after creation');

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
        avatar: userRow.get('avatar')
      }
    });

  } catch (error) {
    console.error('Google login error:', error);
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
      console.log('Created Users sheet with default admin user');
    }

    const rows = await usersSheet.getRows();
    const userRow = rows.find((r: GoogleSpreadsheetRow) => r.get('email')?.toLowerCase() === email.toLowerCase());

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

    // Update last login
    userRow.set('lastLogin', new Date().toISOString());
    await userRow.save();

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
        avatar: userRow.get('avatar')
      }
    });
  } catch (error) {
    console.error('Login error:', error);
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

    const { email, password, name, role, avatar } = req.body;

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
      lastLogin: ''
    });

    res.json({
      success: true,
      user: { id: userId, email, name, role, avatar: userAvatar }
    });
  } catch (error) {
    console.error('Registration error:', error);
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
    console.error('Get user error:', error);
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
    console.error('Change password error:', error);
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

    const rows = await usersSheet.getRows();
    const users = rows.map((r: GoogleSpreadsheetRow) => ({
      id: r.get('id'),
      email: r.get('email'),
      name: r.get('name'),
      role: r.get('role'),
      avatar: r.get('avatar')
    }));

    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
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
        lastLogin: ''
      });

      // Add to existing set to prevent duplicates within the same import
      existingEmails.add(email);
      results.created++;
    }

    // Batch add all valid users
    if (usersToAdd.length > 0) {
      await usersSheet.addRows(usersToAdd);
    }

    console.log(`Bulk imported ${results.created} users, skipped ${results.skipped}, errors: ${results.errors.length}`);
    
    res.json({
      success: true,
      created: results.created,
      skipped: results.skipped,
      errors: results.errors,
      total: users.length
    });

  } catch (error) {
    console.error('Bulk import users error:', error);
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
          console.warn(`[SERVER] Bulk import: Found duplicate initiative ID: ${id}, skipping duplicate`);
        }
        return false;
      }
      seenIds.add(id);
      return true;
    });

    if (initiativesToAdd.length !== deduplicatedToAdd.length) {
      console.log(`[SERVER] Bulk import: Deduplicated initiatives: ${initiativesToAdd.length} -> ${deduplicatedToAdd.length} (removed ${initiativesToAdd.length - deduplicatedToAdd.length} duplicates)`);
      results.imported = deduplicatedToAdd.length;
    }

    // Batch add all valid deduplicated initiatives
    if (deduplicatedToAdd.length > 0) {
      await initiativesSheet.addRows(deduplicatedToAdd);
    }

    console.log(`Bulk imported ${results.imported} initiatives, errors: ${results.errors.length}`);
    
    res.json({
      success: true,
      imported: results.imported,
      skipped: results.skipped,
      errors: results.errors,
      total: initiatives.length
    });

  } catch (error) {
    console.error('Bulk import initiatives error:', error);
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

// POST /api/sheets/initiatives - Upsert initiatives (Protected)
app.post('/api/sheets/initiatives', authenticateToken, validate(initiativesArraySchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { initiatives } = req.body;

    // Deduplicate incoming initiatives by ID (keep first occurrence)
    const seenIds = new Set<string>();
    const deduplicated = initiatives.filter((init: { id: string }) => {
      if (seenIds.has(init.id)) {
        console.warn(`[SERVER] Upsert: Found duplicate initiative ID in request: ${init.id}, skipping duplicate`);
        return false;
      }
      seenIds.add(init.id);
      return true;
    });

    if (initiatives.length !== deduplicated.length) {
      console.log(`[SERVER] Upsert: Deduplicated incoming initiatives: ${initiatives.length} -> ${deduplicated.length} (removed ${initiatives.length - deduplicated.length} duplicates)`);
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
        headerValues: INITIATIVE_HEADERS
      });
    }

    // Get all rows and remove duplicates from sheet first
    const rows = await sheet.getRows();
    const seenSheetIds = new Set<string>();
    const rowsToDelete: GoogleSpreadsheetRow[] = [];
    
    // Identify duplicate rows in the sheet (keep first occurrence, mark others for deletion)
    for (const row of rows) {
      const id = row.get('id');
      if (!id || id.startsWith('_meta_')) continue;
      
      if (seenSheetIds.has(id)) {
        rowsToDelete.push(row);
      } else {
        seenSheetIds.add(id);
      }
    }

    // Delete duplicate rows from sheet
    if (rowsToDelete.length > 0) {
      console.log(`[SERVER] Upsert: Removing ${rowsToDelete.length} duplicate rows from sheet`);
      for (const row of rowsToDelete) {
        await row.delete();
      }
      // Reload rows after deletion
      const updatedRows = await sheet.getRows();
      rows.length = 0;
      rows.push(...updatedRows);
    }

    // Now process deduplicated initiatives
    // Create a map of existing IDs for faster lookup
    const existingIds = new Set(rows.map((r: GoogleSpreadsheetRow) => r.get('id')).filter((id: string) => id && !id.startsWith('_meta_')));
    
    for (const initiative of deduplicated) {
      const existing = rows.find((r: GoogleSpreadsheetRow) => r.get('id') === initiative.id);

      if (existing) {
        // Update existing row
        Object.keys(initiative).forEach(key => {
          const value = initiative[key];
          existing.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''));
        });
        await existing.save();
      } else if (!existingIds.has(initiative.id)) {
        // Only add if it doesn't exist (double-check to prevent duplicates)
        const rowData: Record<string, string> = {};
        Object.keys(initiative).forEach(key => {
          const value = initiative[key];
          rowData[key] = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
        });
        await sheet.addRow(rowData);
        existingIds.add(initiative.id); // Track that we added it
      } else {
        console.warn(`[SERVER] Upsert: Initiative ${initiative.id} already exists, skipping add`);
      }
    }

    console.log(`Synced ${deduplicated.length} initiatives`);
    res.json({ success: true, count: deduplicated.length });
  } catch (error) {
    console.error('Error syncing initiatives:', error);
    res.status(500).json({ error: String(error) });
  }
});

// DELETE /api/sheets/initiatives/:id - Delete an initiative (Protected)
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
    const rowToDelete = rows.find((r: GoogleSpreadsheetRow) => r.get('id') === id);
    
    if (!rowToDelete) {
      res.status(404).json({ error: 'Initiative not found' });
      return;
    }

    await rowToDelete.delete();
    console.log(`Deleted initiative ${id}`);
    res.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting initiative:', error);
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
    }

    await sheet.addRows(changes.map((c: Record<string, unknown>) => ({
      id: String(c.id || ''),
      initiativeId: String(c.initiativeId || ''),
      initiativeTitle: String(c.initiativeTitle || ''),
      field: String(c.field || ''),
      oldValue: String(c.oldValue ?? ''),
      newValue: String(c.newValue ?? ''),
      changedBy: String(c.changedBy || ''),
      timestamp: String(c.timestamp || '')
    })));

    console.log(`Appended ${changes.length} change records`);
    res.json({ success: true, count: changes.length });
  } catch (error) {
    console.error('Error appending changelog:', error);
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/sheets/snapshot - Create new snapshot tab (Protected)
app.post('/api/sheets/snapshot', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { snapshot } = req.body;

    if (!snapshot || !snapshot.data) {
      res.status(400).json({ error: 'Invalid snapshot data' });
      return;
    }

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

    const newSheet = await doc.addSheet({
      title: tabName,
      headerValues: INITIATIVE_HEADERS
    });

    await newSheet.addRow({
      id: `_meta_${snapshot.id}`,
      title: `Created: ${snapshot.timestamp} by ${snapshot.createdBy}`,
      l1_assetClass: '',
      l2_pillar: '',
      l3_responsibility: '',
      l4_target: ''
    });

    await newSheet.addRows(snapshot.data.map((item: Record<string, unknown>) => {
      const rowData: Record<string, string> = {};
      INITIATIVE_HEADERS.forEach(header => {
        const value = item[header];
        rowData[header] = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
      });
      return rowData;
    }));

    console.log(`Created snapshot tab: ${tabName} with ${snapshot.data.length} items`);
    res.json({ success: true, tabName });
  } catch (error) {
    console.error('Error creating snapshot:', error);
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
          l1_assetClass: row.get('l1_assetClass') || '',
          l2_pillar: row.get('l2_pillar') || '',
          l3_responsibility: row.get('l3_responsibility') || '',
          l4_target: row.get('l4_target') || '',
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
          dependencies: row.get('dependencies') || undefined,
          workType: row.get('workType') || 'Planned Work',
          unplannedTags: parseJson(row.get('unplannedTags'), []),
          riskActionLog: row.get('riskActionLog') || undefined,
          isAtRisk: row.get('isAtRisk') === 'true',
          comments: parseJson(row.get('comments'), []),
          history: parseJson(row.get('history'), [])
        };
      });

    // Deduplicate initiatives by ID (keep first occurrence)
    const seenIds = new Set<string>();
    const initiatives = allInitiatives.filter(init => {
      if (seenIds.has(init.id)) {
        console.warn(`[SERVER] Found duplicate initiative ID: ${init.id}, skipping duplicate`);
        return false;
      }
      seenIds.add(init.id);
      return true;
    });

    if (allInitiatives.length !== initiatives.length) {
      console.log(`[SERVER] Deduplicated initiatives: ${allInitiatives.length} -> ${initiatives.length} (removed ${allInitiatives.length - initiatives.length} duplicates)`);
    }

    console.log(`Pulled ${initiatives.length} initiatives from Sheets`);
    res.json({ initiatives, config: null, users: null });
  } catch (error) {
    console.error('Error pulling from Sheets:', error);
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/sheets/push - Full push (overwrite Initiatives tab) (Protected)
app.post('/api/sheets/push', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { initiatives } = req.body;

    if (!initiatives || !Array.isArray(initiatives)) {
      res.status(400).json({ error: 'Invalid data' });
      return;
    }

    // Deduplicate initiatives before pushing (keep first occurrence)
    const seenIds = new Set<string>();
    const deduplicated = initiatives.filter((init: { id: string }) => {
      if (seenIds.has(init.id)) {
        console.warn(`[SERVER] Push: Found duplicate initiative ID: ${init.id}, skipping duplicate`);
        return false;
      }
      seenIds.add(init.id);
      return true;
    });

    if (initiatives.length !== deduplicated.length) {
      console.log(`[SERVER] Push: Deduplicated initiatives: ${initiatives.length} -> ${deduplicated.length} (removed ${initiatives.length - deduplicated.length} duplicates)`);
    }

    const doc = await getDoc();
    if (!doc) {
      res.status(500).json({ error: 'Failed to connect to Google Sheets' });
      return;
    }

    let sheet = doc.sheetsByTitle['Initiatives'];
    
    if (sheet) {
      await sheet.clear();
      await sheet.setHeaderRow(INITIATIVE_HEADERS);
    } else {
      sheet = await doc.addSheet({
        title: 'Initiatives',
        headerValues: INITIATIVE_HEADERS
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

    console.log(`Pushed ${deduplicated.length} initiatives to Sheets`);
    res.json({ success: true, count: deduplicated.length });
  } catch (error) {
    console.error('Error pushing to Sheets:', error);
    res.status(500).json({ error: String(error) });
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
      console.error('Slack webhook failed:', {
        status: slackResponse.status,
        statusText: slackResponse.statusText,
        error: responseText
      });
      res.status(slackResponse.status).json({ 
        error: 'Slack webhook failed',
        details: responseText 
      });
      return;
    }

    console.log('Slack webhook sent successfully');
    res.json({ success: true, response: responseText });
  } catch (error) {
    console.error('Error proxying Slack webhook:', error);
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
    console.error('Error listing snapshots:', error);
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
    console.error('CSV export error:', error);
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
    console.error('Excel export error:', error);
    res.status(500).json({ error: 'Export failed' });
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
httpServer.listen(PORT, () => {
  console.log(`\n🚀 Portfolio Manager API Server running on http://localhost:${PORT}`);
  console.log(`🔌 Socket.IO real-time collaboration enabled`);
  console.log(`\nAuth Endpoints:`);
  console.log(`  POST /api/auth/login          - Authenticate user`);
  console.log(`  POST /api/auth/register       - Register new user (admin only)`);
  console.log(`  GET  /api/auth/me             - Get current user`);
  console.log(`  POST /api/auth/change-password - Change password`);
  console.log(`  GET  /api/auth/users          - List all users`);
  console.log(`\nBulk Import Endpoints (Admin only):`);
  console.log(`  POST /api/users/bulk-import   - Bulk import users from Excel/CSV`);
  console.log(`  POST /api/sheets/bulk-import  - Bulk import initiatives from Excel/CSV`);
  console.log(`\nSheets Endpoints (Protected):`);
  console.log(`  GET  /api/sheets/health       - Check connection`);
  console.log(`  POST /api/sheets/initiatives  - Upsert initiatives`);
  console.log(`  POST /api/sheets/changelog    - Append change records`);
  console.log(`  POST /api/sheets/snapshot     - Create snapshot tab`);
  console.log(`  GET  /api/sheets/pull         - Pull all data`);
  console.log(`  POST /api/sheets/push         - Push all data`);
  console.log(`  GET  /api/sheets/snapshots    - List snapshot tabs`);
  console.log(`\nReal-time Collaboration (Socket.IO):`);
  console.log(`  - User presence tracking`);
  console.log(`  - Live initiative updates`);
  console.log(`  - Collaborative editing indicators`);
  console.log(`\nDefault admin credentials:`);
  console.log(`  Email: adar.sobol@pagaya.com`);
  console.log(`  Password: admin123`);
});
