import { User, Role, PermissionKey, TabAccessLevel, TaskManagementScope, PermissionValue, AppConfig } from '../types';
import { logger } from './logger';

/**
 * Generate a unique ID for entities
 */
export const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
};

/**
 * Get owner name from user ID
 */
export const getOwnerName = (users: User[], id?: string): string => {
  return users.find(u => u.id === id)?.name || 'Unknown';
};

/**
 * Check if a user role can be assigned as an owner
 */
export const canBeOwner = (role: Role): boolean => {
  return role === Role.TeamLead || 
         role === Role.Admin || 
         role === Role.DirectorGroup || 
         role === Role.DirectorDepartment;
};

/**
 * Filter users to get only those who can be assigned as owners
 */
export const getEligibleOwners = (users: User[]): User[] => {
  return users.filter(u => canBeOwner(u.role));
};

/**
 * Sync capacity planning entries (teamCapacities, teamCapacityAdjustments, teamBuffers)
 * with the current list of Team Lead users. This ensures that:
 * - Removed Team Leads are cleaned up from capacity entries
 * - Existing capacity values are preserved for current Team Leads
 * - New Team Leads do NOT get auto-assigned capacity (must be set manually)
 * 
 * @param config - Current app configuration
 * @param users - Current list of users
 * @returns Partial AppConfig with updated capacity-related fields
 */
export const syncCapacitiesWithUsers = (
  config: AppConfig,
  users: User[]
): Partial<AppConfig> => {
  // Get all Team Lead user IDs
  const teamLeadIds = new Set(
    users.filter(u => u.role === Role.TeamLead).map(u => u.id)
  );
  
  // Build new teamCapacities: keep existing entries for valid TLs only (no auto-assignment)
  const newCapacities: Record<string, number> = {};
  const newAdjustments: Record<string, number> = {};
  const newBuffers: Record<string, number> = {};
  
  for (const userId of teamLeadIds) {
    // Only preserve existing capacity - do NOT auto-assign default values
    if (config.teamCapacities[userId] !== undefined) {
      newCapacities[userId] = config.teamCapacities[userId];
    }
    
    // Preserve existing adjustments if they exist
    if (config.teamCapacityAdjustments?.[userId] !== undefined) {
      newAdjustments[userId] = config.teamCapacityAdjustments[userId];
    }
    
    // Preserve existing buffers if they exist
    if (config.teamBuffers?.[userId] !== undefined) {
      newBuffers[userId] = config.teamBuffers[userId];
    }
  }
  
  return {
    teamCapacities: newCapacities,
    teamCapacityAdjustments: newAdjustments,
    teamBuffers: newBuffers
  };
};

/**
 * Format a date object to ISO date string (YYYY-MM-DD)
 */
export const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

/**
 * Get relative date from today
 */
export const getRelativeDate = (daysFromToday: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return formatDate(date);
};

/**
 * Check if a date string is outdated (more than 14 days ago)
 */
export const checkOutdated = (dateStr: string): boolean => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 14;
};

/**
 * Get days until/since a date (negative if overdue)
 */
export const getDaysUntil = (dateStr: string): number => {
  if (!dateStr) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(dateStr);
  targetDate.setHours(0, 0, 0, 0);
  const diffTime = targetDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * Check if a date is overdue (in the past)
 */
export const isOverdue = (dateStr: string): boolean => {
  if (!dateStr) return false;
  return getDaysUntil(dateStr) < 0;
};

/**
 * Get date status category
 */
export const getDateStatus = (dateStr: string): 'overdue' | 'due-soon' | 'on-time' | 'future' => {
  if (!dateStr) return 'future';
  const daysUntil = getDaysUntil(dateStr);
  if (daysUntil < 0) return 'overdue';
  if (daysUntil <= 3) return 'due-soon';
  if (daysUntil <= 7) return 'on-time';
  return 'future';
};

/**
 * Format date for display (human-readable or relative)
 */
export const formatDateDisplay = (dateStr: string): string => {
  if (!dateStr) return '—';
  
  const daysUntil = getDaysUntil(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(dateStr);
  targetDate.setHours(0, 0, 0, 0);
  
  // Yesterday
  if (daysUntil === -1) return 'Yesterday';
  
  // Today
  if (daysUntil === 0) return 'Today';
  
  // Tomorrow
  if (daysUntil === 1) return 'Tomorrow';
  
  // Overdue
  if (daysUntil < 0) {
    const daysOverdue = Math.abs(daysUntil);
    return `Overdue by ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''}`;
  }
  
  // Within 7 days - show relative
  if (daysUntil <= 7) {
    return `In ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`;
  }
  
  // Beyond 7 days - show formatted date
  return targetDate.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
};

/**
 * Calculate completion rate from actual and estimated effort
 * Returns percentage (0-100), or 0 if estimated effort is 0 or undefined
 */
export const calculateCompletionRate = (actualEffort?: number, estimatedEffort?: number): number => {
  const actual = actualEffort || 0;
  const estimated = estimatedEffort || 0;
  if (estimated === 0) return 0;
  return Math.min(100, Math.max(0, Math.round((actual / estimated) * 100)));
};

// Export mention parser utilities
export { parseMentions, getMentionedUsers } from './mentionParser';

// Export utilities
export { exportToCSV, exportToExcel, exportFilteredData, exportToClipboard, exportUnplannedToNotionClipboard } from './exportUtils';

// Export error handling utilities
export { logger } from './logger';
export { getErrorMessage, formatErrorForUser, isNetworkError, isOfflineError } from './errorUtils';

// Export rules extractor utilities
export { getSystemRules, markSystemWorkflows } from './rulesExtractor';

// Export ID generation utilities
export { generateInitiativeId, parseQuarter, isJiraStyleId } from './idGenerator';

// Export migration utilities
export { migrateInitiativeIds, updateInitiativeIdReferences } from './migrateIds';

// Export metrics cache utilities
export { metricsCache } from './metricsCache';

// Export pagination utilities
export { paginate } from './pagination';
export type { PaginationState, PaginationResult } from './pagination';

/**
 * Permission helper functions for checking access levels
 */

/**
 * Check if a tab access level includes view permission
 */
export const hasViewAccess = (level: TabAccessLevel): boolean => {
  return level === 'view' || level === 'edit';
};

/**
 * Check if a tab access level includes edit permission (edit = full access)
 */
export const hasEditAccess = (level: TabAccessLevel): boolean => {
  return level === 'edit';
};

/**
 * Normalize role string to match Role enum values
 * Handles potential mismatches between API role strings and enum values
 */
const normalizeRole = (role: Role | string): Role | null => {
  const roleStr = String(role).trim();
  // Try exact match first
  if (Object.values(Role).includes(roleStr as Role)) {
    return roleStr as Role;
  }
  // Try case-insensitive match
  const normalized = Object.values(Role).find(
    r => r.toLowerCase() === roleStr.toLowerCase()
  );
  if (normalized) {
    return normalized;
  }
  return null;
};

/**
 * Normalize user ID for comparison (handles empty strings, whitespace, undefined)
 * @param userId - User ID to normalize
 * @returns Normalized user ID string or null if invalid/empty
 */
const normalizeUserId = (userId: string | undefined | null): string | null => {
  if (!userId) return null;
  const trimmed = String(userId).trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Check if two user identifiers match, handling both userId and email formats
 * @param ownerId - The owner ID (may be userId or email)
 * @param currentUserId - Current user's ID (userId format)
 * @param currentUserEmail - Current user's email (optional, for email matching)
 * @returns true if the IDs match
 */
const matchesUserId = (ownerId: string | null | undefined, currentUserId: string, currentUserEmail?: string): boolean => {
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
  
  // Reverse email match: If currentUserId looks like an email, compare with ownerId (unlikely but handle for completeness)
  if (normalizedCurrentUserId.includes('@') && normalizedOwnerId) {
    const normalizedCurrentEmail = normalizedCurrentUserId.toLowerCase().trim();
    const normalizedOwnerEmail = normalizedOwnerId.toLowerCase().trim();
    if (normalizedCurrentEmail === normalizedOwnerEmail) {
      return true;
    }
  }
  
  return false;
};

/**
 * Get permission value for a role, with fallback to default
 */
export const getPermission = (config: AppConfig, role: Role, key: PermissionKey): PermissionValue => {
  // Normalize role to ensure it matches enum values
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) {
    logger.warn('Invalid role for permission check', { context: 'utils.getPermission', metadata: { role, availableRoles: Object.values(Role) } });
    // Return default based on permission type
    if (key.startsWith('access')) {
      return 'none';
    }
    return 'no';
  }

  const perms = config.rolePermissions[normalizedRole];
  
  // Debug logging for delete permission checks
  if (key === 'deleteTasks') {
    logger.debug('Delete permission check', {
      context: 'utils.getPermission',
      metadata: { role, normalizedRole, key, hasConfig: !!config, hasRolePermissions: !!config?.rolePermissions, hasPermsForRole: !!perms, permValue: perms?.[key], allRoleKeys: Object.keys(config.rolePermissions || {}) }
    });
  }
  
  if (!perms) {
    // Return default based on permission type
    if (key.startsWith('access')) {
      return 'none';
    }
    return 'no';
  }
  return perms[key] ?? (key.startsWith('access') ? 'none' : 'no');
};

/**
 * Check if user can view a specific tab/view
 */
export const canViewTab = (config: AppConfig, role: Role, tabKey: PermissionKey): boolean => {
  const value = getPermission(config, role, tabKey);
  if (typeof value === 'string') {
    return hasViewAccess(value as TabAccessLevel);
  }
  return false;
};

/**
 * Check if user can edit in a specific tab/view
 */
export const canEditTab = (config: AppConfig, role: Role, tabKey: PermissionKey): boolean => {
  const value = getPermission(config, role, tabKey);
  if (typeof value === 'string') {
    return hasEditAccess(value as TabAccessLevel);
  }
  return false;
};

/**
 * Get task management scope for a permission
 */
export const getTaskManagementScope = (config: AppConfig, role: Role, key: PermissionKey): TaskManagementScope => {
  const value = getPermission(config, role, key);
  if (typeof value === 'string' && (value === 'no' || value === 'yes' || value === 'own')) {
    return value as TaskManagementScope;
  }
  return 'no';
};

/**
 * Check if user has a task management permission (yes or own)
 */
export const hasTaskPermission = (config: AppConfig, role: Role, key: PermissionKey): boolean => {
  const scope = getTaskManagementScope(config, role, key);
  return scope === 'yes' || scope === 'own';
};

/**
 * Check if user can create tasks
 */
export const canCreateTasks = (config: AppConfig, role: Role): boolean => {
  return hasTaskPermission(config, role, 'createNewTasks');
};

/**
 * Get edit tasks scope for a role
 */
export const getEditTasksScope = (config: AppConfig, role: Role): TaskManagementScope => {
  return getTaskManagementScope(config, role, 'editTasks');
};

/**
 * Check if user can edit all tasks
 */
export const canEditAllTasks = (config: AppConfig, role: Role): boolean => {
  return getEditTasksScope(config, role) === 'yes';
};

/**
 * Check if user can edit own tasks
 */
export const canEditOwnTasks = (config: AppConfig, role: Role): boolean => {
  const scope = getEditTasksScope(config, role);
  return scope === 'own' || scope === 'yes';
};

/**
 * Check if user can delete tasks
 */
export const canDeleteTasks = (config: AppConfig, role: Role): boolean => {
  return hasTaskPermission(config, role, 'deleteTasks');
};

/**
 * Check if user can edit a specific task item
 * @param config - App configuration
 * @param role - User's role
 * @param taskOwnerId - ID of the task owner (optional, may not be set)
 * @param initiativeOwnerId - ID of the initiative owner
 * @param currentUserId - ID of the current user
 * @param currentUserEmail - Email of the current user (optional, for email matching)
 * @returns true if user can edit the task
 */
export const canEditTaskItem = (config: AppConfig, role: Role, taskOwnerId: string | undefined, initiativeOwnerId: string, currentUserId: string, currentUserEmail?: string): boolean => {
  const editScope = getTaskManagementScope(config, role, 'editTasks');
  
  if (editScope === 'yes') {
    // Can edit any task
    return true;
  } else if (editScope === 'own') {
    // Can edit only own tasks
    // Priority: Check task owner first, then fall back to initiative owner if task has no owner
    if (taskOwnerId) {
      // Task has an owner - must match current user
      return matchesUserId(taskOwnerId, currentUserId, currentUserEmail);
    }
    // Task has no owner - check if user owns the initiative
    return matchesUserId(initiativeOwnerId, currentUserId, currentUserEmail);
  }
  
  // Cannot edit
  return false;
};

/**
 * Check if user can delete a specific task item
 * @param config - App configuration
 * @param role - User's role
 * @param taskOwnerId - ID of the task owner (optional, may not be set)
 * @param initiativeOwnerId - ID of the initiative owner
 * @param currentUserId - ID of the current user
 * @param currentUserEmail - Email of the current user (optional, for email matching)
 * @returns true if user can delete the task
 */
export const canDeleteTaskItem = (config: AppConfig, role: Role, taskOwnerId: string | undefined, initiativeOwnerId: string, currentUserId: string, currentUserEmail?: string): boolean => {
  const deleteScope = getTaskManagementScope(config, role, 'deleteTasks');
  
  if (deleteScope === 'yes') {
    // Can delete any task
    return true;
  } else if (deleteScope === 'own') {
    // Can delete only own tasks
    // Priority: Check task owner first, then fall back to initiative owner if task has no owner
    if (taskOwnerId) {
      // Task has an owner - must match current user
      return matchesUserId(taskOwnerId, currentUserId, currentUserEmail);
    }
    // Task has no owner - check if user owns the initiative
    return matchesUserId(initiativeOwnerId, currentUserId, currentUserEmail);
  }
  
  // Cannot delete
  return false;
};

/**
 * Check if user can delete a specific initiative
 * @param config - App configuration
 * @param role - User's role
 * @param initiativeOwnerId - ID of the initiative owner
 * @param currentUserId - ID of the current user
 * @param currentUserEmail - Email of the current user (optional, for email matching)
 * @returns true if user can delete the initiative
 */
export const canDeleteInitiative = (config: AppConfig, role: Role, initiativeOwnerId: string, currentUserId: string, currentUserEmail?: string): boolean => {
  const deleteScope = getTaskManagementScope(config, role, 'deleteTasks');
  
  logger.debug('Checking delete initiative permission', {
    context: 'utils.canDeleteInitiative',
    metadata: { role, deleteScope, initiativeOwnerId, currentUserId, currentUserEmail, hasConfig: !!config }
  });
  
  if (deleteScope === 'yes') {
    // Can delete any initiative
    logger.debug('Permission granted - can delete all', { context: 'utils.canDeleteInitiative' });
    return true;
  } else if (deleteScope === 'own') {
    // Can delete only own initiatives
    const canDelete = matchesUserId(initiativeOwnerId, currentUserId, currentUserEmail);
    logger.debug('Own scope check result', { context: 'utils.canDeleteInitiative', metadata: { canDelete } });
    return canDelete;
  }
  
  // Cannot delete
  logger.debug('Permission denied', { context: 'utils.canDeleteInitiative', metadata: { deleteScope } });
  return false;
};

/**
 * Check if user can access admin panel
 */
export const canAccessAdmin = (config: AppConfig, role: Role): boolean => {
  return getTaskManagementScope(config, role, 'accessAdmin') === 'yes';
};

/**
 * Check if user can manage workflows
 */
export const canManageWorkflows = (config: AppConfig, role: Role): boolean => {
  return getTaskManagementScope(config, role, 'manageWorkflows') === 'yes';
};


