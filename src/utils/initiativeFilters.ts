/**
 * Pure functions for filtering and sorting initiatives.
 * Extracted from App.tsx for testability.
 */

import { Initiative, Status } from '../types';

export interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

export interface FilterConfig {
  searchQuery?: string;
  assetClass?: string;
  owners?: string[];
  workType?: string[];
  quarter?: string[];
  priority?: string[];
  status?: string[];
}

/**
 * Filter initiatives by search query
 */
export function filterBySearch(initiatives: Initiative[], searchQuery: string): Initiative[] {
  if (!searchQuery) return initiatives;
  
  const q = searchQuery.toLowerCase();
  return initiatives.filter(i => 
    i.title.toLowerCase().includes(q) || 
    i.ownerId.toLowerCase().includes(q) ||
    (i.assignee && i.assignee.toLowerCase().includes(q)) ||
    i.l2_pillar.toLowerCase().includes(q)
  );
}

/**
 * Filter initiatives by asset class
 */
export function filterByAssetClass(initiatives: Initiative[], assetClass: string): Initiative[] {
  if (!assetClass) return initiatives;
  return initiatives.filter(i => i.l1_assetClass === assetClass);
}

/**
 * Filter initiatives by owners
 */
export function filterByOwners(initiatives: Initiative[], ownerIds: string[]): Initiative[] {
  if (!ownerIds || ownerIds.length === 0) return initiatives;
  return initiatives.filter(i => ownerIds.includes(i.ownerId));
}

/**
 * Filter initiatives by work type
 */
export function filterByWorkType(initiatives: Initiative[], workTypes: string[]): Initiative[] {
  if (!workTypes || workTypes.length === 0) return initiatives;
  return initiatives.filter(i => workTypes.includes(i.workType));
}

/**
 * Filter initiatives by quarter
 */
export function filterByQuarter(initiatives: Initiative[], quarters: string[]): Initiative[] {
  if (!quarters || quarters.length === 0) return initiatives;
  return initiatives.filter(i => quarters.includes(i.quarter));
}

/**
 * Filter initiatives by priority
 */
export function filterByPriority(initiatives: Initiative[], priorities: string[]): Initiative[] {
  if (!priorities || priorities.length === 0) return initiatives;
  return initiatives.filter(i => priorities.includes(i.priority));
}

/**
 * Filter initiatives by status
 */
export function filterByStatus(initiatives: Initiative[], statuses: string[]): Initiative[] {
  if (!statuses || statuses.length === 0) return initiatives;
  return initiatives.filter(i => statuses.includes(i.status));
}

/**
 * Apply all filters to initiatives
 */
export function applyFilters(
  initiatives: Initiative[], 
  config: FilterConfig,
  excludeDeleted: boolean = true
): Initiative[] {
  let filtered = [...initiatives];
  
  // Exclude deleted by default
  if (excludeDeleted) {
    filtered = filtered.filter(i => i.status !== Status.Deleted);
  }
  
  if (config.assetClass) {
    filtered = filterByAssetClass(filtered, config.assetClass);
  }
  
  if (config.owners && config.owners.length > 0) {
    filtered = filterByOwners(filtered, config.owners);
  }
  
  if (config.workType && config.workType.length > 0) {
    filtered = filterByWorkType(filtered, config.workType);
  }
  
  if (config.quarter && config.quarter.length > 0) {
    filtered = filterByQuarter(filtered, config.quarter);
  }
  
  if (config.priority && config.priority.length > 0) {
    filtered = filterByPriority(filtered, config.priority);
  }
  
  if (config.status && config.status.length > 0) {
    filtered = filterByStatus(filtered, config.status);
  }
  
  if (config.searchQuery) {
    filtered = filterBySearch(filtered, config.searchQuery);
  }
  
  return filtered;
}

/**
 * Sort initiatives by a given field
 */
export function sortInitiatives(
  initiatives: Initiative[],
  sortConfig: SortConfig | null,
  getOwnerName: (ownerId: string) => string = (id) => id
): Initiative[] {
  if (!sortConfig) return initiatives;
  
  const sorted = [...initiatives];
  
  sorted.sort((a, b) => {
    let aValue: string | number | undefined = '';
    let bValue: string | number | undefined = '';

    switch (sortConfig.key) {
      case 'owner':
        aValue = getOwnerName(a.ownerId).toLowerCase();
        bValue = getOwnerName(b.ownerId).toLowerCase();
        break;
      case 'priority':
        aValue = a.priority;
        bValue = b.priority;
        break;
      case 'status':
        aValue = a.status;
        bValue = b.status;
        break;
      case 'title':
        aValue = a.title.toLowerCase();
        bValue = b.title.toLowerCase();
        break;
      case 'eta':
        aValue = a.eta || '';
        bValue = b.eta || '';
        break;
      case 'quarter':
        aValue = a.quarter;
        bValue = b.quarter;
        break;
      case 'estimatedEffort':
        aValue = a.estimatedEffort || 0;
        bValue = b.estimatedEffort || 0;
        break;
      case 'actualEffort':
        aValue = a.actualEffort || 0;
        bValue = b.actualEffort || 0;
        break;
      default:
        aValue = (a as unknown as Record<string, string | number | undefined>)[sortConfig.key];
        bValue = (b as unknown as Record<string, string | number | undefined>)[sortConfig.key];
    }

    if (aValue === undefined) aValue = '';
    if (bValue === undefined) bValue = '';

    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });
  
  return sorted;
}

/**
 * Calculate metrics from initiatives
 */
export function calculateMetrics(initiatives: Initiative[]) {
  const totalEstimated = initiatives.reduce((sum, i) => sum + (i.estimatedEffort || 0), 0);
  const totalActual = initiatives.reduce((sum, i) => sum + (i.actualEffort || 0), 0);
  
  const byStatus = {
    notStarted: initiatives.filter(i => i.status === Status.NotStarted).length,
    inProgress: initiatives.filter(i => i.status === Status.InProgress).length,
    atRisk: initiatives.filter(i => i.status === Status.AtRisk).length,
    done: initiatives.filter(i => i.status === Status.Done).length,
    obsolete: initiatives.filter(i => i.status === Status.Obsolete).length,
  };
  
  const total = initiatives.length;
  const completionRate = total > 0 ? (byStatus.done / total) * 100 : 0;
  
  return {
    totalEstimated,
    totalActual,
    byStatus,
    total,
    completionRate,
  };
}

/**
 * Deduplicate initiatives by ID (keeps first occurrence)
 */
export function deduplicateInitiatives(initiatives: Initiative[]): Initiative[] {
  const seenIds = new Set<string>();
  return initiatives.filter(init => {
    if (seenIds.has(init.id)) {
      return false;
    }
    seenIds.add(init.id);
    return true;
  });
}

/**
 * Get unique values from initiatives for filter dropdowns
 */
export function getUniqueFilterValues(initiatives: Initiative[]) {
  return {
    assetClasses: [...new Set(initiatives.map(i => i.l1_assetClass))],
    owners: [...new Set(initiatives.map(i => i.ownerId))],
    quarters: [...new Set(initiatives.map(i => i.quarter))],
    priorities: [...new Set(initiatives.map(i => i.priority))],
    statuses: [...new Set(initiatives.map(i => i.status))],
    workTypes: [...new Set(initiatives.map(i => i.workType))],
  };
}
