import { useState, useEffect } from 'react';
import { User, AppConfig } from '../types';
import { USERS } from '../constants';
import { logger, syncCapacitiesWithUsers } from '../utils';

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || '';

interface UseUsersOptions {
  isAuthenticated: boolean;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
}

interface UseUsersReturn {
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  usersLoaded: boolean;
}

/**
 * Custom hook for managing users state.
 * Handles:
 * - Loading users from API with hardcoded fallback
 * - Syncing capacity planning with Team Lead users
 */
export function useUsers({ 
  isAuthenticated, 
  setConfig 
}: UseUsersOptions): UseUsersReturn {
  // State for Users - start with hardcoded as fallback, load from API
  const [users, setUsers] = useState<User[]>(USERS);
  const [usersLoaded, setUsersLoaded] = useState(false);

  // Load users from API
  useEffect(() => {
    if (!isAuthenticated || usersLoaded) return;

    const loadUsers = async () => {
      try {
        const response = await fetch(`${API_ENDPOINT}/api/auth/users`);
        if (response.ok) {
          const data = await response.json();
          if (data.users && data.users.length > 0) {
            // Merge API users with any missing hardcoded users (as fallback)
            const apiUserEmails = new Set(data.users.map((u: User) => u.email.toLowerCase()));
            const fallbackUsers = USERS.filter(u => !apiUserEmails.has(u.email.toLowerCase()));
            setUsers([...data.users, ...fallbackUsers]);
          }
        }
      } catch (error) {
        logger.error('Failed to load users from API', { 
          context: 'useUsers.loadUsers', 
          error: error instanceof Error ? error : new Error(String(error)) 
        });
        // Keep using USERS as fallback
      } finally {
        setUsersLoaded(true);
      }
    };

    loadUsers();
  }, [isAuthenticated, usersLoaded]);

  // Sync capacity planning with Team Lead users whenever users array changes
  useEffect(() => {
    if (!usersLoaded || users.length === 0) return;
    
    // Sync capacities with current Team Lead users
    // Use functional update to always get latest config state
    setConfig(prev => {
      const syncedConfig = syncCapacitiesWithUsers(prev, users);
      
      // Only update if there are actual changes (to avoid infinite loops)
      const hasChanges = 
        JSON.stringify(syncedConfig.teamCapacities) !== JSON.stringify(prev.teamCapacities) ||
        JSON.stringify(syncedConfig.teamCapacityAdjustments) !== JSON.stringify(prev.teamCapacityAdjustments || {}) ||
        JSON.stringify(syncedConfig.teamBuffers) !== JSON.stringify(prev.teamBuffers || {});
      
      if (hasChanges) {
        return { ...prev, ...syncedConfig };
      }
      
      return prev; // No changes, return same object reference
    });
  }, [users, usersLoaded, setConfig]);

  return {
    users,
    setUsers,
    usersLoaded,
  };
}
