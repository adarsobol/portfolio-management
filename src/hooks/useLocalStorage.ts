import { useState, useEffect, useCallback } from 'react';
import { logger } from '../utils/logger';

/**
 * Custom hook for persisting state in localStorage
 * @param key - The localStorage key to use
 * @param initialValue - The initial value if nothing is stored
 * @returns [storedValue, setValue] - Similar to useState
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  // Get initial value from localStorage or use provided initial value
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      logger.error('Error reading localStorage key', { context: 'useLocalStorage.read', metadata: { key }, error: error instanceof Error ? error : undefined });
      return initialValue;
    }
  });

  // Update localStorage when value changes
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch (error) {
      logger.error('Error setting localStorage key', { context: 'useLocalStorage.set', metadata: { key }, error: error instanceof Error ? error : undefined });
    }
  }, [key, storedValue]);

  // Wrapper function to handle both direct values and updater functions
  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setStoredValue(prev => {
      const newValue = value instanceof Function ? value(prev) : value;
      return newValue;
    });
  }, []);

  return [storedValue, setValue];
}

