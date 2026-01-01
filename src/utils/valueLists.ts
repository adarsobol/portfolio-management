import { AppConfig, AssetClass, Status, DependencyTeam, Initiative } from '../types';

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
  return {
    ...config,
    valueLists: {
      assetClasses: Object.values(AssetClass),
      statuses: Object.values(Status),
      dependencyTeams: Object.values(DependencyTeam)
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
  field: 'assetClass' | 'status' | 'dependencyTeam'
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
  }

  return count;
}

/**
 * Get default value lists from enums
 */
export function getDefaultValueLists() {
  return {
    assetClasses: Object.values(AssetClass),
    statuses: Object.values(Status),
    dependencyTeams: Object.values(DependencyTeam)
  };
}

