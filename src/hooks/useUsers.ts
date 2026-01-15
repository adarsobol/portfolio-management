import { useState, useEffect } from 'react';
import { User, AppConfig } from '../types';
import { USERS } from '../constants';
import { logger } from '../utils';

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
 * 
 * NOTE: Automatic capacity sync has been disabled for full manual control.
 * Team capacities are managed entirely through the Admin Panel.
 */
export function useUsers({ 
  isAuthenticated, 
  setConfig: _setConfig // Kept for API compatibility, no longer used for capacity sync
}: UseUsersOptions): UseUsersReturn {
  void _setConfig; // Suppress unused variable warning
  
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
            // Use only API users - no fallback merge to prevent deleted users from reappearing
            setUsers(data.users);
          }
        }
      } catch (error) {
        logger.error('Failed to load users from API', { 
          context: 'useUsers.loadUsers', 
          error: error instanceof Error ? error : new Error(String(error)) 
        });
        // Keep using USERS as fallback only when API completely fails
      } finally {
        setUsersLoaded(true);
      }
    };

    loadUsers();
  }, [isAuthenticated, usersLoaded]);

  // NOTE: Capacity sync removed - all capacity management is manual via Admin Panel

  return {
    users,
    setUsers,
    usersLoaded,
  };
}
