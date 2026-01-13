/**
 * User Management Routes
 * Handles user CRUD operations (Admin only)
 */
import { Router } from 'express';
import { serverLogger } from '../logger.js';
import { authenticateToken } from '../middleware.js';
import { getDoc, USER_HEADERS } from '../database.js';
import { validate, bulkImportUsersSchema } from '../validation.js';
const router = Router();
// Valid role values
const VALID_ROLES = ['Admin', 'Team Lead', 'Group Lead (Director)', 'Portfolio Ops', 'VP'];
// ============================================
// PUT /api/users/:id - Update user (Admin only)
// ============================================
router.put('/:id', authenticateToken, async (req, res) => {
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
        // Ensure headers are up-to-date
        await usersSheet.loadHeaderRow().catch(() => { });
        const currentHeaders = usersSheet.headerValues || [];
        const missingHeaders = USER_HEADERS.filter(h => !currentHeaders.includes(h));
        if (missingHeaders.length > 0) {
            serverLogger.info('Adding missing Users columns', { context: 'Users', metadata: { missingHeaders } });
            await usersSheet.setHeaderRow([...currentHeaders, ...missingHeaders]);
            await usersSheet.loadHeaderRow().catch(() => { });
        }
        const rows = await usersSheet.getRows();
        const userRow = rows.find((r) => r.get('id') === id);
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
    }
    catch (error) {
        serverLogger.error('Update user error', { context: 'Users', error: error });
        res.status(500).json({ error: 'Failed to update user' });
    }
});
// ============================================
// DELETE /api/users/:id - Delete user (Admin only)
// ============================================
router.delete('/:id', authenticateToken, async (req, res) => {
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
        const userRow = rows.find((r) => r.get('id') === id);
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
    }
    catch (error) {
        serverLogger.error('Delete user error', { context: 'Users', error: error });
        res.status(500).json({ error: 'Failed to delete user' });
    }
});
// ============================================
// POST /api/users/bulk-import - Bulk import users
// ============================================
router.post('/bulk-import', authenticateToken, validate(bulkImportUsersSchema), async (req, res) => {
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
        const existingEmails = new Set(existingRows.map((r) => r.get('email')?.toLowerCase()));
        const results = {
            created: 0,
            skipped: 0,
            errors: []
        };
        const usersToAdd = [];
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
        serverLogger.info(`Bulk imported ${results.created} users`, {
            context: 'Import',
            metadata: { created: results.created, skipped: results.skipped, errors: results.errors.length }
        });
        res.json({
            success: true,
            created: results.created,
            skipped: results.skipped,
            errors: results.errors,
            total: users.length
        });
    }
    catch (error) {
        serverLogger.error('Bulk import users error', { context: 'Import', error: error });
        res.status(500).json({ error: 'Bulk import failed: ' + String(error) });
    }
});
export default router;
