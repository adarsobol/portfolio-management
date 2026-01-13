import { useEffect } from 'react';
import { logger } from '../utils/logger';

const BUILD_HASH_KEY = 'portfolio-app-build-hash';

/**
 * Hook to check for app updates and auto-refresh
 * Compares current build hash with stored hash
 * 
 * Behavior:
 * - On first load: Stores the current build hash
 * - On subsequent loads: Compares stored hash with current hash
 * - If different: Stores new hash and refreshes page silently
 * - If same: Does nothing
 * 
 * Edge cases handled:
 * - No meta tag found (dev mode): Skip check gracefully
 * - localStorage unavailable: Skip check gracefully
 * - First load: Store hash and continue
 */
export function useVersionCheck() {
  useEffect(() => {
    // Skip version check in development mode to prevent HMR-induced reload loops
    if (import.meta.env.DEV) {
      return;
    }
    
    // Get current build hash from meta tag
    const getCurrentBuildHash = (): string | null => {
      const metaTag = document.querySelector('meta[name="app-build-hash"]');
      return metaTag?.getAttribute('content') || null;
    };

    // Get stored build hash from localStorage
    const getStoredBuildHash = (): string | null => {
      try {
        return localStorage.getItem(BUILD_HASH_KEY);
      } catch (error) {
        // localStorage unavailable (private mode, disabled, etc.)
        logger.warn('localStorage unavailable, skipping version check', { context: 'useVersionCheck.getStoredHash' });
        return null;
      }
    };

    // Store current build hash
    const storeBuildHash = (hash: string): void => {
      try {
        localStorage.setItem(BUILD_HASH_KEY, hash);
      } catch (error) {
        // localStorage unavailable - skip silently
        logger.warn('Failed to store build hash', { context: 'useVersionCheck.storeHash' });
      }
    };

    // Check for updates
    const currentHash = getCurrentBuildHash();
    
    // If no build hash found, skip check (dev mode or build issue)
    if (!currentHash) {
      return;
    }

    const storedHash = getStoredBuildHash();

    if (!storedHash) {
      // First time loading - store the hash
      storeBuildHash(currentHash);
      return;
    }

    if (currentHash !== storedHash) {
      // New version detected!
      logger.info('New version detected. Refreshing...', { context: 'useVersionCheck' });
      
      // Store new hash before refresh
      storeBuildHash(currentHash);
      
      // Silent refresh (no notification)
      window.location.reload();
    }
  }, []); // Run only once on mount
}

