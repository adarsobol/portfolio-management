import { AppConfig, AssetClass, Status, DependencyTeam, Initiative, Priority, WorkType, UnplannedTag, InitiativeType, HierarchyNode } from '../types';
import { HIERARCHY, DEPENDENCY_TEAM_CATEGORIES } from '../constants';

/**
 * Get asset classes from config or fall back to enum
 * Ensures all enum values are always included for data integrity
 */
export function getAssetClasses(config: AppConfig): string[] {
  const requiredValues = Object.values(AssetClass);
  if (config.valueLists?.assetClasses && config.valueLists.assetClasses.length > 0) {
    return ensureRequiredValues(config.valueLists.assetClasses, requiredValues);
  }
  return requiredValues;
}

/**
 * Get statuses from config or fall back to enum
 * Ensures all enum values are always included for data integrity
 */
export function getStatuses(config: AppConfig): string[] {
  const requiredValues = Object.values(Status);
  if (config.valueLists?.statuses && config.valueLists.statuses.length > 0) {
    return ensureRequiredValues(config.valueLists.statuses, requiredValues);
  }
  return requiredValues;
}

/**
 * Get dependency teams from config or fall back to enum
 * Ensures all enum values are always included for data integrity
 */
export function getDependencyTeams(config: AppConfig): string[] {
  const requiredValues = Object.values(DependencyTeam);
  if (config.valueLists?.dependencyTeams && config.valueLists.dependencyTeams.length > 0) {
    return ensureRequiredValues(config.valueLists.dependencyTeams, requiredValues);
  }
  return requiredValues;
}

/**
 * Ensure value list includes all required UI values (for data integrity)
 * Merges existing values with required enum values, ensuring required values are always present
 */
function ensureRequiredValues(existingValues: string[] | undefined, requiredValues: string[]): string[] {
  if (!existingValues || existingValues.length === 0) {
    return requiredValues;
  }
  
  // Merge: start with required values, then add any additional existing values
  const merged = [...requiredValues];
  existingValues.forEach(val => {
    if (!merged.includes(val)) {
      merged.push(val);
    }
  });
  
  return merged;
}

/**
 * Get priorities from config or fall back to enum
 * Ensures all enum values (P0, P1, P2) are always included for data integrity
 */
export function getPriorities(config: AppConfig): string[] {
  const requiredValues = Object.values(Priority);
  if (config.valueLists?.priorities && config.valueLists.priorities.length > 0) {
    return ensureRequiredValues(config.valueLists.priorities, requiredValues);
  }
  return requiredValues;
}

/**
 * Get work types from config or fall back to enum
 * Ensures all enum values (Planned Work, Unplanned Work) are always included for data integrity
 */
export function getWorkTypes(config: AppConfig): string[] {
  const requiredValues = Object.values(WorkType);
  if (config.valueLists?.workTypes && config.valueLists.workTypes.length > 0) {
    return ensureRequiredValues(config.valueLists.workTypes, requiredValues);
  }
  return requiredValues;
}

/**
 * Get unplanned tags from config or fall back to enum
 * Ensures all enum values (Unplanned, Risk Item, PM Item, Both) are always included for data integrity
 */
export function getUnplannedTags(config: AppConfig): string[] {
  const requiredValues = Object.values(UnplannedTag);
  if (config.valueLists?.unplannedTags && config.valueLists.unplannedTags.length > 0) {
    return ensureRequiredValues(config.valueLists.unplannedTags, requiredValues);
  }
  return requiredValues;
}

/**
 * Get initiative types from config or fall back to enum
 * Ensures all enum values (WP, BAU) are always included for data integrity
 */
export function getInitiativeTypes(config: AppConfig): string[] {
  const requiredValues = Object.values(InitiativeType);
  if (config.valueLists?.initiativeTypes && config.valueLists.initiativeTypes.length > 0) {
    return ensureRequiredValues(config.valueLists.initiativeTypes, requiredValues);
  }
  return requiredValues;
}

/**
 * Generate default quarters (current year -1 to current year +3)
 */
function generateDefaultQuarters(): string[] {
  const currentYear = new Date().getFullYear();
  const quarters: string[] = [];
  for (let year = currentYear - 1; year <= currentYear + 3; year++) {
    for (let q = 1; q <= 4; q++) {
      quarters.push(`Q${q} ${year}`);
    }
  }
  return quarters;
}

/**
 * Get quarters from config or fall back to constant
 * Ensures default quarters are always included for data integrity
 */
export function getQuarters(config: AppConfig): string[] {
  const requiredQuarters = generateDefaultQuarters();
  if (config.valueLists?.quarters && config.valueLists.quarters.length > 0) {
    // Merge: ensure all default quarters are present, then add any additional custom quarters
    const merged = [...requiredQuarters];
    config.valueLists.quarters.forEach(q => {
      if (!merged.includes(q)) {
        merged.push(q);
      }
    });
    return merged;
  }
  return requiredQuarters;
}

/**
 * Get hierarchy from config or fall back to constant
 */
export function getHierarchy(config: AppConfig): Record<string, HierarchyNode[]> {
  if (config.valueLists?.hierarchy && Object.keys(config.valueLists.hierarchy).length > 0) {
    return config.valueLists.hierarchy;
  }
  return HIERARCHY;
}

/**
 * Get dependency team categories from config or fall back to constant
 */
export function getDependencyTeamCategories(config: AppConfig): { name: string; color: string; teams: string[] }[] {
  if (config.valueLists?.dependencyTeamCategories && config.valueLists.dependencyTeamCategories.length > 0) {
    return config.valueLists.dependencyTeamCategories;
  }
  // Convert DependencyTeam enum values to strings for consistency
  return DEPENDENCY_TEAM_CATEGORIES.map(cat => ({
    name: cat.name,
    color: cat.color,
    teams: cat.teams.map(team => team as string)
  }));
}

/**
 * Migrate enum values to config value lists (one-time migration)
 */
export function migrateEnumsToConfig(config: AppConfig): AppConfig {
  // If already migrated, don't do it again
  if (config.valueListsMigrated) {
    return config;
  }

  // If value lists already exist, mark as migrated
  if (config.valueLists) {
    return {
      ...config,
      valueListsMigrated: true
    };
  }

  // Migrate enum values to config
  const currentYear = new Date().getFullYear();
  const defaultQuarters: string[] = [];
  for (let year = currentYear - 1; year <= currentYear + 3; year++) {
    for (let q = 1; q <= 4; q++) {
      defaultQuarters.push(`Q${q} ${year}`);
    }
  }

  return {
    ...config,
    valueLists: {
      assetClasses: Object.values(AssetClass),
      statuses: Object.values(Status),
      dependencyTeams: Object.values(DependencyTeam),
      priorities: Object.values(Priority),
      workTypes: Object.values(WorkType),
      unplannedTags: Object.values(UnplannedTag),
      initiativeTypes: Object.values(InitiativeType),
      quarters: defaultQuarters,
      hierarchy: HIERARCHY,
      dependencyTeamCategories: DEPENDENCY_TEAM_CATEGORIES.map(cat => ({
        name: cat.name,
        color: cat.color,
        teams: cat.teams.map(team => team as string)
      }))
    },
    valueListsMigrated: true
  };
}

/**
 * Validate a value list entry
 */
export function validateValueList(value: string, list: string[]): { valid: boolean; error?: string } {
  if (!value || value.trim().length === 0) {
    return { valid: false, error: 'Value cannot be empty' };
  }

  const trimmedValue = value.trim();
  if (list.includes(trimmedValue)) {
    return { valid: false, error: 'Value already exists' };
  }

  return { valid: true };
}

/**
 * Count how many initiatives use a specific value
 */
export function getValueUsageCount(
  value: string,
  initiatives: Initiative[],
  field: 'assetClass' | 'status' | 'dependencyTeam' | 'priority' | 'workType' | 'unplannedTag' | 'initiativeType' | 'quarter'
): number {
  let count = 0;

  switch (field) {
    case 'assetClass':
      count = initiatives.filter(i => i.l1_assetClass === value).length;
      break;
    case 'status':
      count = initiatives.filter(i => i.status === value).length;
      // Also count tasks
      initiatives.forEach(init => {
        if (init.tasks) {
          count += init.tasks.filter(t => t.status === value).length;
        }
      });
      break;
    case 'dependencyTeam':
      initiatives.forEach(init => {
        if (init.dependencies) {
          count += init.dependencies.filter(d => d.team === value).length;
        }
      });
      break;
    case 'priority':
      count = initiatives.filter(i => i.priority === value).length;
      break;
    case 'workType':
      count = initiatives.filter(i => i.workType === value).length;
      break;
    case 'unplannedTag':
      // Check both initiatives and tasks
      initiatives.forEach(init => {
        if (init.unplannedTags?.includes(value as any)) {
          count++;
        }
        if (init.tasks) {
          init.tasks.forEach(task => {
            if (task.tags?.includes(value as any)) {
              count++;
            }
          });
        }
      });
      break;
    case 'initiativeType':
      count = initiatives.filter(i => i.initiativeType === value).length;
      break;
    case 'quarter':
      count = initiatives.filter(i => i.quarter === value).length;
      break;
  }

  return count;
}

/**
 * Get default value lists from enums
 */
export function getDefaultValueLists() {
  const currentYear = new Date().getFullYear();
  const defaultQuarters: string[] = [];
  for (let year = currentYear - 1; year <= currentYear + 3; year++) {
    for (let q = 1; q <= 4; q++) {
      defaultQuarters.push(`Q${q} ${year}`);
    }
  }

  return {
    assetClasses: Object.values(AssetClass),
    statuses: Object.values(Status),
    dependencyTeams: Object.values(DependencyTeam),
    priorities: Object.values(Priority),
    workTypes: Object.values(WorkType),
    unplannedTags: Object.values(UnplannedTag),
    initiativeTypes: Object.values(InitiativeType),
    quarters: defaultQuarters,
    hierarchy: HIERARCHY,
    dependencyTeamCategories: DEPENDENCY_TEAM_CATEGORIES.map(cat => ({
      name: cat.name,
      color: cat.color,
      teams: cat.teams.map(team => team as string)
    }))
  };
}

/**
 * Ensure all required enum values are present in the config value lists
 * This is a one-time function to ensure data integrity
 */
export function ensureRequiredValuesInConfig(config: AppConfig): AppConfig {
  const currentValueLists = config.valueLists;
  
  // Ensure required values for each list
  const updatedValueLists = {
    assetClasses: ensureRequiredValues(
      currentValueLists?.assetClasses,
      Object.values(AssetClass)
    ),
    statuses: ensureRequiredValues(
      currentValueLists?.statuses,
      Object.values(Status)
    ),
    dependencyTeams: ensureRequiredValues(
      currentValueLists?.dependencyTeams,
      Object.values(DependencyTeam)
    ),
    priorities: ensureRequiredValues(
      currentValueLists?.priorities,
      Object.values(Priority)
    ),
    workTypes: ensureRequiredValues(
      currentValueLists?.workTypes,
      Object.values(WorkType)
    ),
    unplannedTags: ensureRequiredValues(
      currentValueLists?.unplannedTags,
      Object.values(UnplannedTag)
    ),
    initiativeTypes: ensureRequiredValues(
      currentValueLists?.initiativeTypes,
      Object.values(InitiativeType)
    ),
    quarters: (() => {
      const requiredQuarters = generateDefaultQuarters();
      if (currentValueLists?.quarters && currentValueLists.quarters.length > 0) {
        const merged = [...requiredQuarters];
        currentValueLists.quarters.forEach((q: string) => {
          if (!merged.includes(q)) {
            merged.push(q);
          }
        });
        return merged;
      }
      return requiredQuarters;
    })(),
    // Preserve optional fields
    hierarchy: currentValueLists?.hierarchy,
    dependencyTeamCategories: currentValueLists?.dependencyTeamCategories
  };

  return {
    ...config,
    valueLists: updatedValueLists,
    valueListsMigrated: true
  };
}

