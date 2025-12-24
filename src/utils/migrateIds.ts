import { Initiative } from '../types';
import { generateInitiativeId, isJiraStyleId } from './idGenerator';
import { logger } from './logger';

/**
 * Migrate initiative IDs from UUID format to Jira-style format (Q425-001)
 * 
 * This function:
 * 1. Identifies initiatives with UUID format (not matching Q425-001 pattern)
 * 2. For each UUID initiative, extracts quarter from initiative.quarter field
 * 3. Generates new ID using the new format
 * 4. Returns migrated initiatives with updated IDs
 * 
 * Migration is idempotent - safe to run multiple times.
 * 
 * @param initiatives - Array of initiatives (may have UUIDs or new format IDs)
 * @returns Migrated initiatives with updated IDs
 */
export function migrateInitiativeIds(initiatives: Initiative[]): Initiative[] {
  if (!initiatives || initiatives.length === 0) {
    return initiatives;
  }

  // Separate initiatives that need migration from those that don't
  const needsMigration: Initiative[] = [];
  const alreadyMigrated: Initiative[] = [];
  
  for (const initiative of initiatives) {
    if (isJiraStyleId(initiative.id)) {
      alreadyMigrated.push(initiative);
    } else {
      needsMigration.push(initiative);
    }
  }

  // If no migration needed, return as-is
  if (needsMigration.length === 0) {
    return initiatives;
  }

  logger.info('Starting ID migration', {
    context: 'migrateIds',
    metadata: {
      total: initiatives.length,
      needsMigration: needsMigration.length,
      alreadyMigrated: alreadyMigrated.length
    }
  });

  // Create a map of old ID to new ID for reference updates
  const idMap = new Map<string, string>();
  
  // Get all existing initiatives (including already migrated ones) for sequence calculation
  const allExistingInitiatives = [...alreadyMigrated];
  
  // Migrate each initiative
  const migrated: Initiative[] = [];
  
  for (const initiative of needsMigration) {
    try {
      // Use initiative's quarter field, or fallback to current quarter
      const quarter = initiative.quarter || undefined;
      
      // Generate new ID (pass all existing initiatives including already migrated ones)
      const newId = generateInitiativeId(quarter, allExistingInitiatives);
      
      // Store mapping
      idMap.set(initiative.id, newId);
      
      // Create migrated initiative with new ID
      const migratedInitiative: Initiative = {
        ...initiative,
        id: newId
      };
      
      migrated.push(migratedInitiative);
      allExistingInitiatives.push(migratedInitiative);
      
      logger.debug('Migrated initiative ID', {
        context: 'migrateIds',
        metadata: {
          oldId: initiative.id,
          newId,
          title: initiative.title,
          quarter: initiative.quarter
        }
      });
    } catch (error) {
      logger.error('Failed to migrate initiative ID', {
        context: 'migrateIds',
        error: error instanceof Error ? error : new Error(String(error)),
        metadata: {
          initiativeId: initiative.id,
          title: initiative.title
        }
      });
      // Keep original initiative if migration fails
      migrated.push(initiative);
    }
  }

  // Update references in comments, history, etc. within initiatives
  const updatedInitiatives = [...alreadyMigrated, ...migrated].map(initiative => {
    // Update comment IDs if they reference the initiative (though comments have their own IDs)
    // Update history records that reference initiative IDs
    if (initiative.history && initiative.history.length > 0) {
      const updatedHistory = initiative.history.map(record => {
        if (idMap.has(record.initiativeId)) {
          return {
            ...record,
            initiativeId: idMap.get(record.initiativeId)!
          };
        }
        return record;
      });
      
      if (updatedHistory.some((record, idx) => record.initiativeId !== initiative.history![idx].initiativeId)) {
        return {
          ...initiative,
          history: updatedHistory
        };
      }
    }
    
    return initiative;
  });

  logger.info('Completed ID migration', {
    context: 'migrateIds',
    metadata: {
      total: initiatives.length,
      migrated: needsMigration.length,
      idMappings: idMap.size
    }
  });

  return updatedInitiatives;
}

/**
 * Update references to initiative IDs in other data structures
 * This can be used to update ChangeRecord, Notification, TradeOffAction, etc.
 * 
 * @param idMap - Map of old ID to new ID
 * @param data - Data structure that may contain initiative ID references
 * @returns Updated data structure
 */
export function updateInitiativeIdReferences<T extends { initiativeId?: string }>(
  idMap: Map<string, string>,
  data: T
): T {
  if (!data.initiativeId || !idMap.has(data.initiativeId)) {
    return data;
  }
  
  return {
    ...data,
    initiativeId: idMap.get(data.initiativeId)!
  };
}

