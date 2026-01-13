import { useState, useEffect, useRef, useCallback } from 'react';
import { Initiative, User } from '../types';
import { logger } from '../utils/logger';
import { sheetsSync, realtimeService } from '../services';

interface UseInitiativesOptions {
  isAuthenticated: boolean;
  currentUser: User | null;
}

interface UseInitiativesReturn {
  initiatives: Initiative[];
  setInitiatives: React.Dispatch<React.SetStateAction<Initiative[]>>;
  initiativesRef: React.MutableRefObject<Initiative[]>;
  isLoading: boolean;
  deduplicateInitiatives: (initiatives: Initiative[]) => Initiative[];
}

/**
 * Custom hook for managing initiatives state, loading, and real-time synchronization.
 * Handles:
 * - Loading initiatives from Google Sheets with localStorage fallback
 * - Deduplication of initiatives by ID
 * - Real-time updates via Socket.IO
 * - Automatic sync with initiativesRef for workflow execution
 */
export function useInitiatives({ 
  isAuthenticated, 
  currentUser 
}: UseInitiativesOptions): UseInitiativesReturn {
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Ref to track latest initiatives for workflow execution (prevents race conditions)
  const initiativesRef = useRef<Initiative[]>([]);

  /**
   * Helper function to deduplicate initiatives by ID (keeps first occurrence)
   */
  const deduplicateInitiatives = useCallback((initList: Initiative[]): Initiative[] => {
    const seenIds = new Set<string>();
    const duplicates: string[] = [];
    const deduplicated = initList.filter(init => {
      if (seenIds.has(init.id)) {
        duplicates.push(init.id);
        return false;
      }
      seenIds.add(init.id);
      return true;
    });
    if (duplicates.length > 0) {
      logger.warn(`Found ${duplicates.length} duplicate initiative IDs`, { 
        context: 'useInitiatives.deduplicateInitiatives', 
        metadata: { duplicates } 
      });
    }
    return deduplicated;
  }, []);

  // Keep ref in sync with state and detect duplicates
  useEffect(() => {
    initiativesRef.current = initiatives;
    
    // Safety check: if duplicates are detected in state, deduplicate immediately
    const duplicateIds = initiatives.map(i => i.id).filter((id, idx, arr) => arr.indexOf(id) !== idx);
    if (duplicateIds.length > 0) {
      logger.error('CRITICAL: Duplicates detected in state! Deduplicating...', { 
        context: 'useInitiatives', 
        metadata: { duplicateIds: [...new Set(duplicateIds)] } 
      });
      const deduplicated = deduplicateInitiatives(initiatives);
      // Only update if the deduplicated array is different (prevents infinite loop)
      if (deduplicated.length !== initiatives.length) {
        setInitiatives(deduplicated);
      }
    }
  }, [initiatives, deduplicateInitiatives]);

  // Load initiatives from Google Sheets on startup (with localStorage fallback)
  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const loadData = async () => {
      setIsLoading(true);
      try {
        // Use sheetsSync which fetches from Google Sheets with localStorage fallback
        const loadedInitiatives = await sheetsSync.loadInitiatives();
        
        if (!isMounted) return;
        
        // Deduplicate by ID (keep first occurrence)
        const deduplicatedInitiatives = deduplicateInitiatives(loadedInitiatives);
        
        const duplicatesRemoved = loadedInitiatives.length - deduplicatedInitiatives.length;
        if (duplicatesRemoved > 0) {
          logger.debug('loadData: Setting initiatives after deduplication', { 
            context: 'useInitiatives.loadData', 
            metadata: { count: deduplicatedInitiatives.length, duplicatesRemoved } 
          });
        }
        
        setInitiatives(deduplicatedInitiatives);
      } catch (error) {
        logger.error('Failed to load initiatives', { 
          context: 'useInitiatives.loadData', 
          error: error instanceof Error ? error : new Error(String(error)) 
        });
        if (isMounted) {
          setInitiatives([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadData();
    
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, deduplicateInitiatives]);

  // Connect to real-time collaboration service
  useEffect(() => {
    if (isAuthenticated && currentUser) {
      realtimeService.connect(currentUser);

      // Subscribe to real-time initiative updates
      const unsubUpdate = realtimeService.onInitiativeUpdate(({ initiative }) => {
        setInitiatives(prev => {
          return prev.map(i => i.id === initiative.id ? initiative : i);
        });
      });

      const unsubCreate = realtimeService.onInitiativeCreate(({ initiative }) => {
        setInitiatives(prev => {
          const existing = prev.find(i => i.id === initiative.id);
          if (existing) {
            logger.warn('realtime create: Initiative already exists, skipping duplicate', { 
              context: 'useInitiatives.onInitiativeCreate', 
              metadata: { initiativeId: initiative.id } 
            });
            return prev;
          }
          logger.debug('realtime create: Adding new initiative', { 
            context: 'useInitiatives.onInitiativeCreate', 
            metadata: { initiativeId: initiative.id } 
          });
          return [...prev, initiative];
        });
      });

      const unsubComment = realtimeService.onCommentAdded(({ initiativeId, comment }) => {
        setInitiatives(prev => prev.map(i => {
          if (i.id === initiativeId) {
            const existingComments = i.comments || [];
            if (existingComments.find(c => c.id === comment.id)) return i;
            return { ...i, comments: [...existingComments, comment] };
          }
          return i;
        }));
      });

      return () => {
        unsubUpdate();
        unsubCreate();
        unsubComment();
        // Note: Don't disconnect here - let the parent handle that for notifications
      };
    }
  }, [isAuthenticated, currentUser]);

  return {
    initiatives,
    setInitiatives,
    initiativesRef,
    isLoading,
    deduplicateInitiatives,
  };
}
