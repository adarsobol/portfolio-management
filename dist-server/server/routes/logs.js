/**
 * Logging Routes
 * Handles error and activity log storage and retrieval
 */
import { Router } from 'express';
import { serverLogger } from '../logger.js';
import { authenticateToken } from '../middleware.js';
import { getLogStorage } from '../logStorage.js';
const router = Router();
// ============================================
// POST /api/logs/errors - Store error log
// ============================================
router.post('/errors', authenticateToken, async (req, res) => {
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
            sessionId: req.headers['x-session-id'],
            correlationId: req.headers['x-correlation-id'],
            resolved: false,
        };
        const success = await logStorage.storeErrorLog(errorLog);
        res.json({ success, id: errorLog.id });
    }
    catch (error) {
        serverLogger.error('Error storing error log', { context: 'Logs', error: error });
        res.status(500).json({ error: String(error) });
    }
});
// ============================================
// GET /api/logs/errors - Get error logs (admin only)
// ============================================
router.get('/errors', authenticateToken, async (req, res) => {
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
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        const sev = severity;
        const uid = userId;
        const logs = await logStorage.getErrorLogs(start, end, sev, uid);
        res.json({ logs, count: logs.length });
    }
    catch (error) {
        serverLogger.error('Error getting error logs', { context: 'Logs', error: error });
        res.status(500).json({ error: String(error) });
    }
});
// ============================================
// POST /api/logs/activity - Store activity log
// ============================================
router.post('/activity', authenticateToken, async (req, res) => {
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
            sessionId: req.headers['x-session-id'],
            correlationId: req.headers['x-correlation-id'],
        };
        const success = await logStorage.storeActivityLog(activityLog);
        res.json({ success, id: activityLog.id });
    }
    catch (error) {
        serverLogger.error('Error storing activity log', { context: 'Logs', error: error });
        res.status(500).json({ error: String(error) });
    }
});
// ============================================
// GET /api/logs/activity - Get activity logs (admin only)
// ============================================
router.get('/activity', authenticateToken, async (req, res) => {
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
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        const activityType = type;
        const uid = userId;
        const logs = await logStorage.getActivityLogs(start, end, activityType, uid);
        res.json({ logs, count: logs.length });
    }
    catch (error) {
        serverLogger.error('Error getting activity logs', { context: 'Logs', error: error });
        res.status(500).json({ error: String(error) });
    }
});
// ============================================
// GET /api/logs/search - Search logs (admin only)
// ============================================
router.get('/search', authenticateToken, async (req, res) => {
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
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        let logs = [];
        if (logType === 'error' || !logType) {
            const errorLogs = await logStorage.getErrorLogs(start, end, severity, userId);
            logs.push(...errorLogs.map(log => ({ ...log, logType: 'error' })));
        }
        if (logType === 'activity' || !logType) {
            const activityLogs = await logStorage.getActivityLogs(start, end, undefined, userId);
            logs.push(...activityLogs.map(log => ({ ...log, logType: 'activity' })));
        }
        // Filter by query if provided
        if (query) {
            const queryStr = query.toLowerCase();
            logs = logs.filter(log => log.message?.toLowerCase().includes(queryStr) ||
                log.description?.toLowerCase().includes(queryStr) ||
                log.userEmail?.toLowerCase().includes(queryStr) ||
                log.context?.toLowerCase().includes(queryStr));
        }
        // Sort by timestamp (newest first)
        logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        res.json({ logs, count: logs.length });
    }
    catch (error) {
        serverLogger.error('Error searching logs', { context: 'Logs', error: error });
        res.status(500).json({ error: String(error) });
    }
});
export default router;
