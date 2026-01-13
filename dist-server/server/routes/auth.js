/**
 * Authentication Routes
 * Handles user login, registration, and authentication
 */
import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { serverLogger } from '../logger.js';
import { authenticateToken, loginLimiter, EFFECTIVE_JWT_SECRET, JWT_EXPIRES_IN } from '../middleware.js';
import { getDoc, USER_HEADERS } from '../database.js';
import { validate, loginSchema, googleAuthSchema, registerUserSchema, changePasswordSchema, } from '../validation.js';
const router = Router();
// ============================================
// POST /api/auth/google - Authenticate with Google
// ============================================
router.post('/google', loginLimiter, validate(googleAuthSchema), async (req, res) => {
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
        // Create Users sheet if it doesn't exist
        if (!usersSheet) {
            usersSheet = await doc.addSheet({
                title: 'Users',
                headerValues: USER_HEADERS
            });
        }
        else {
            // Ensure headers are up-to-date
            await usersSheet.loadHeaderRow().catch(() => { });
            const currentHeaders = usersSheet.headerValues || [];
            const missingHeaders = USER_HEADERS.filter(h => !currentHeaders.includes(h));
            if (missingHeaders.length > 0) {
                serverLogger.info('Adding missing Users columns', { context: 'Auth', metadata: { missingHeaders } });
                await usersSheet.setHeaderRow([...currentHeaders, ...missingHeaders]);
            }
        }
        let rows = await usersSheet.getRows();
        let userRow = rows.find((r) => r.get('email')?.toLowerCase() === email.toLowerCase());
        if (!userRow) {
            res.status(403).json({
                error: "Access Denied",
                message: "You are not authorized to access this application. Please contact your administrator to request access."
            });
            return;
        }
        // Ensure lastLogin column exists
        await usersSheet.loadHeaderRow().catch(() => { });
        const headers = usersSheet.headerValues || [];
        if (!headers.includes('lastLogin')) {
            serverLogger.info(`lastLogin column missing for ${email}, adding it now`, { context: 'Auth' });
            await usersSheet.setHeaderRow([...headers, 'lastLogin']);
            await usersSheet.loadHeaderRow();
            rows = await usersSheet.getRows();
            userRow = rows.find((r) => r.get('email')?.toLowerCase() === email.toLowerCase());
            if (!userRow) {
                serverLogger.error('Could not find user row after adding lastLogin column', { context: 'Auth' });
                res.status(500).json({ error: 'Failed to update login history' });
                return;
            }
        }
        // Update last login timestamp
        const loginTimestamp = new Date().toISOString();
        serverLogger.debug(`Setting lastLogin for ${email}`, { context: 'Auth', metadata: { loginTimestamp } });
        if (!userRow) {
            serverLogger.error(`userRow is null/undefined for ${email} before save attempt`, { context: 'Auth' });
            throw new Error('Failed to retrieve user row before login update');
        }
        // Update metadata and lastLogin
        try {
            if (picture && userRow.get('avatar') !== picture) {
                userRow.set('avatar', picture);
            }
            userRow.set('lastLogin', loginTimestamp);
        }
        catch (preSaveError) {
            serverLogger.error(`Failed to set lastLogin value for ${email} before save`, { context: 'Auth', error: preSaveError });
            throw new Error(`Failed to prepare login update: ${preSaveError instanceof Error ? preSaveError.message : String(preSaveError)}`);
        }
        let savedLastLogin = loginTimestamp;
        try {
            await userRow.save();
            serverLogger.debug(`Successfully saved lastLogin for ${email}`, { context: 'Auth', metadata: { loginTimestamp } });
        }
        catch (saveError) {
            serverLogger.error(`Failed to save lastLogin for ${email}`, { context: 'Auth', error: saveError });
            // Continue with login even if lastLogin save fails
        }
        if (!userRow) {
            serverLogger.error(`userRow is null/undefined for ${email} after login update attempt`, { context: 'Auth' });
            throw new Error('Failed to retrieve user after login update');
        }
        // Generate JWT token
        const token = jwt.sign({
            id: userRow.get('id'),
            email: userRow.get('email'),
            name: userRow.get('name'),
            role: userRow.get('role')
        }, EFFECTIVE_JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
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
    }
    catch (error) {
        serverLogger.error('Google login error', { context: 'Auth', error: error });
        res.status(401).json({ error: 'Google authentication failed' });
    }
});
// ============================================
// POST /api/auth/login - Authenticate with email/password
// ============================================
router.post('/login', loginLimiter, validate(loginSchema), async (req, res) => {
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
        }
        const rows = await usersSheet.getRows();
        const userRow = rows.find((r) => r.get('email')?.toLowerCase() === email.toLowerCase());
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
        // Update last login timestamp
        const loginTimestamp = new Date().toISOString();
        userRow.set('lastLogin', loginTimestamp);
        try {
            await userRow.save();
            serverLogger.debug(`Saved lastLogin for ${email}`, { context: 'Login', metadata: { loginTimestamp } });
        }
        catch (saveError) {
            serverLogger.error(`Failed to save lastLogin for ${email}`, { context: 'Login', error: saveError });
            // Continue with login even if lastLogin save fails
        }
        // Generate JWT token
        const token = jwt.sign({
            id: userRow.get('id'),
            email: userRow.get('email'),
            name: userRow.get('name'),
            role: userRow.get('role')
        }, EFFECTIVE_JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        res.json({
            token,
            user: {
                id: userRow.get('id'),
                email: userRow.get('email'),
                name: userRow.get('name'),
                role: userRow.get('role'),
                avatar: userRow.get('avatar'),
                lastLogin: loginTimestamp
            }
        });
    }
    catch (error) {
        serverLogger.error('Login error', { context: 'Login', error: error });
        res.status(500).json({ error: 'Login failed' });
    }
});
// ============================================
// POST /api/auth/register - Register new user (Admin only)
// ============================================
router.post('/register', authenticateToken, validate(registerUserSchema), async (req, res) => {
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
        const existingUser = rows.find((r) => r.get('email')?.toLowerCase() === email.toLowerCase());
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
    }
    catch (error) {
        serverLogger.error('Registration error', { context: 'Auth', error: error });
        res.status(500).json({ error: 'Registration failed' });
    }
});
// ============================================
// GET /api/auth/me - Get current user from token
// ============================================
router.get('/me', authenticateToken, async (req, res) => {
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
        const userRow = rows.find((r) => r.get('email') === req.user?.email);
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
    }
    catch (error) {
        serverLogger.error('Get user error', { context: 'Auth', error: error });
        res.status(500).json({ error: 'Failed to get user' });
    }
});
// ============================================
// POST /api/auth/change-password - Change user password
// ============================================
router.post('/change-password', authenticateToken, validate(changePasswordSchema), async (req, res) => {
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
        const userRow = rows.find((r) => r.get('email') === req.user?.email);
        if (!userRow) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const passwordHash = userRow.get('passwordHash');
        const isValidPassword = await bcrypt.compare(currentPassword, passwordHash);
        if (!isValidPassword) {
            res.status(401).json({ error: 'Current password is incorrect' });
            return;
        }
        const newPasswordHash = await bcrypt.hash(newPassword, 10);
        userRow.set('passwordHash', newPasswordHash);
        await userRow.save();
        res.json({ success: true, message: 'Password changed successfully' });
    }
    catch (error) {
        serverLogger.error('Change password error', { context: 'Auth', error: error });
        res.status(500).json({ error: 'Failed to change password' });
    }
});
// ============================================
// GET /api/auth/users - Get all users (for dropdowns, etc.)
// ============================================
router.get('/users', authenticateToken, async (req, res) => {
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
        const users = rows.map((r) => ({
            id: r.get('id'),
            email: r.get('email'),
            name: r.get('name'),
            role: r.get('role'),
            avatar: r.get('avatar'),
            team: r.get('team') || undefined
        }));
        res.json({ users });
    }
    catch (error) {
        serverLogger.error('Get users error', { context: 'Auth', error: error });
        res.status(500).json({ error: 'Failed to get users' });
    }
});
export default router;
