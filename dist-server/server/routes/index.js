/**
 * Routes Index
 * Exports all route modules for use in the main server
 *
 * MODULARIZATION STATUS:
 * ✅ auth.ts - Authentication routes (login, register, etc.)
 * ✅ users.ts - User management routes (CRUD, bulk import)
 * ✅ notifications.ts - Notification routes (with Socket.IO factory)
 * ✅ logs.ts - Error and activity logging routes
 *
 * REMAINING (still in server/index.ts):
 * - sheets.ts - Data/sheets routes (15+ endpoints)
 * - admin.ts - Admin routes
 * - backups.ts - Backup routes
 * - support.ts - Support ticket routes
 * - export.ts - CSV/Excel export routes
 * - config.ts - Configuration routes
 * - slack.ts - Slack webhook routes
 */
export { default as authRoutes } from './auth.js';
export { default as userRoutes } from './users.js';
export { createNotificationRoutes } from './notifications.js';
export { default as logsRoutes } from './logs.js';
