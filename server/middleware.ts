/**
 * Authentication and Authorization Middleware
 * Shared middleware for all API routes
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { serverLogger } from './logger.js';

// ============================================
// TYPES
// ============================================
export interface AuthenticatedRequest extends Request {
  user?: {
    email: string;
    name: string;
    role: string;
    id: string;
  };
}

// ============================================
// ENVIRONMENT CONFIG
// ============================================
const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  if (NODE_ENV === 'production') {
    serverLogger.error('WARNING: JWT_SECRET environment variable is not set in production.');
  } else {
    serverLogger.warn('WARNING: JWT_SECRET not set. Using insecure default for development only.');
  }
}

export const EFFECTIVE_JWT_SECRET = JWT_SECRET || 'production-fallback-please-set-jwt-secret';
export const JWT_EXPIRES_IN = '7d';

// ============================================
// RATE LIMITERS
// ============================================

// Rate limiter for login endpoints (5 requests per minute)
export const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per window
  message: { error: 'Too many login attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => {
    return NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true';
  },
});

// General API rate limiter (100 requests per minute per IP)
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per window
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => {
    return NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true';
  },
});

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

/**
 * JWT Authentication Middleware - requires valid token
 */
export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // DEVELOPMENT MODE: Allow bypass when JWT_SECRET is not set
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
    const decoded = jwt.verify(token, EFFECTIVE_JWT_SECRET) as {
      email: string;
      name: string;
      role: string;
      id: string;
    };
    req.user = decoded;
    next();
  } catch {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
};

/**
 * Optional authentication - doesn't fail, just proceeds without user if invalid
 */
export const optionalAuthenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // DEVELOPMENT MODE: Allow bypass when JWT_SECRET is not set
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
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // No token - proceed without user
    next();
    return;
  }

  try {
    const decoded = jwt.verify(token, EFFECTIVE_JWT_SECRET) as {
      email: string;
      name: string;
      role: string;
      id: string;
    };
    req.user = decoded;
    next();
  } catch {
    // Invalid token - proceed without user
    next();
  }
};

/**
 * Admin-only middleware - requires Admin role
 */
export const requireAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user || req.user.role !== 'Admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
};
