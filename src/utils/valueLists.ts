import { AppConfig, AssetClass, Status, DependencyTeam, Initiative, Priority, WorkType, UnplannedTag, InitiativeType, HierarchyNode } from '../types';
import { HIERARCHY, DEPENDENCY_TEAM_CATEGORIES } from '../constants';

/**
 * Get asset classes from config or fall back to enum
 */
export function getAssetClasses(config: AppConfig): string[] {
  if (config.valueLists?.assetClasses && config.valueLists.assetClasses.length > 0) {
    return config.valueLists.assetClasses;
  }
  return Object.values(AssetClass);
}

/**
 * Get statuses from config or fall back to enum
 */
export function getStatuses(config: AppConfig): string[] {
  if (config.valueLists?.statuses && config.valueLists.statuses.length > 0) {
    return config.valueLists.statuses;
  }
  return Object.values(Status);
}

/**
 * Get dependency teams from config or fall back to enum
 */
export function getDependencyTeams(config: AppConfig): string[] {
  if (config.valueLists?.dependencyTeams && config.valueLists.dependencyTeams.length > 0) {
    return config.valueLists.dependencyTeams;
  }
  return Object.values(DependencyTeam);
}

/**
 * Get priorities from config or fall back to enum
 */
export function getPriorities(config: AppConfig): string[] {
  if (config.valueLists?.priorities && config.valueLists.priorities.length > 0) {
    return config.valueLists.priorities;
  }
  return Object.values(Priority);
}

/**
 * Get work types from config or fall back to enum
 */
export function getWorkTypes(config: AppConfig): string[] {
  if (config.valueLists?.workTypes && config.valueLists.workTypes.length > 0) {
    return config.valueLists.workTypes;
  }
  return Object.values(WorkType);
}

/**
 * Get unplanned tags from config or fall back to enum
 */
export function getUnplannedTags(config: AppConfig): string[] {
  if (config.valueLists?.unplannedTags && config.valueLists.unplannedTags.length > 0) {
    return config.valueLists.unplannedTags;
  }
  return Object.values(UnplannedTag);
}

/**
 * Get initiative types from config or fall back to enum
 */
export function getInitiativeTypes(config: AppConfig): string[] {
  if (config.valueLists?.initiativeTypes && config.valueLists.initiativeTypes.length > 0) {
    return config.valueLists.initiativeTypes;
  }
  return Object.values(InitiativeType);
}

/**
 * Get quarters from config or fall back to constant
 */
export function getQuarters(config: AppConfig): string[] {
  if (config.valueLists?.quarters && config.valueLists.quarters.length > 0) {
    return config.valueLists.quarters;
  }
  // Default quarters - generate from current year
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

