import { describe, it, expect } from 'vitest';
import {
  filterBySearch,
  filterByAssetClass,
  filterByOwners,
  filterByWorkType,
  filterByQuarter,
  filterByPriority,
  filterByStatus,
  applyFilters,
  sortInitiatives,
  calculateMetrics,
  deduplicateInitiatives,
  getUniqueFilterValues,
  SortConfig,
  FilterConfig,
} from '../initiativeFilters';
import { Initiative, Status, Priority, WorkType, InitiativeType, AssetClass } from '../../types';

// Helper to create test initiatives
const createInitiative = (overrides: Partial<Initiative> = {}): Initiative => ({
  id: 'init-1',
  title: 'Test Initiative',
  initiativeType: InitiativeType.WP,
  l1_assetClass: AssetClass.PL,
  l2_pillar: 'Test Pillar',
  l3_responsibility: 'Test Responsibility',
  l4_target: 'Test Target',
  eta: '2024-12-31',
  status: Status.InProgress,
  priority: Priority.P1,
  workType: WorkType.Planned,
  ownerId: 'owner-1',
  quarter: 'Q4 2024',
  actualEffort: 10,
  estimatedEffort: 20,
  lastUpdated: '2024-10-14T12:00:00.000Z',
  ...overrides,
});

describe('Initiative Filters', () => {
  describe('filterBySearch', () => {
    const initiatives = [
      createInitiative({ id: '1', title: 'Payment Integration' }),
      createInitiative({ id: '2', title: 'User Authentication', ownerId: 'john' }),
      createInitiative({ id: '3', title: 'Dashboard Redesign', assignee: 'Jane Doe' }),
      createInitiative({ id: '4', title: 'API Optimization', l2_pillar: 'Backend' }),
    ];

    it('should return all initiatives when search query is empty', () => {
      expect(filterBySearch(initiatives, '')).toHaveLength(4);
    });

    it('should filter by title', () => {
      const result = filterBySearch(initiatives, 'payment');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should filter by owner ID', () => {
      const result = filterBySearch(initiatives, 'john');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });

    it('should filter by assignee', () => {
      const result = filterBySearch(initiatives, 'jane');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('3');
    });

    it('should filter by pillar', () => {
      const result = filterBySearch(initiatives, 'backend');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('4');
    });

    it('should be case insensitive', () => {
      expect(filterBySearch(initiatives, 'PAYMENT')).toHaveLength(1);
      expect(filterBySearch(initiatives, 'Payment')).toHaveLength(1);
    });

    it('should return empty array when no match', () => {
      expect(filterBySearch(initiatives, 'xyz123')).toHaveLength(0);
    });
  });

  describe('filterByAssetClass', () => {
    const initiatives = [
      createInitiative({ id: '1', l1_assetClass: AssetClass.PL }),
      createInitiative({ id: '2', l1_assetClass: AssetClass.Auto }),
      createInitiative({ id: '3', l1_assetClass: AssetClass.PL }),
    ];

    it('should return all when asset class is empty', () => {
      expect(filterByAssetClass(initiatives, '')).toHaveLength(3);
    });

    it('should filter by asset class', () => {
      const result = filterByAssetClass(initiatives, AssetClass.PL);
      expect(result).toHaveLength(2);
    });

    it('should return empty when no match', () => {
      expect(filterByAssetClass(initiatives, AssetClass.POS)).toHaveLength(0);
    });
  });

  describe('filterByOwners', () => {
    const initiatives = [
      createInitiative({ id: '1', ownerId: 'owner-1' }),
      createInitiative({ id: '2', ownerId: 'owner-2' }),
      createInitiative({ id: '3', ownerId: 'owner-1' }),
      createInitiative({ id: '4', ownerId: 'owner-3' }),
    ];

    it('should return all when owners array is empty', () => {
      expect(filterByOwners(initiatives, [])).toHaveLength(4);
    });

    it('should filter by single owner', () => {
      const result = filterByOwners(initiatives, ['owner-1']);
      expect(result).toHaveLength(2);
    });

    it('should filter by multiple owners', () => {
      const result = filterByOwners(initiatives, ['owner-1', 'owner-2']);
      expect(result).toHaveLength(3);
    });
  });

  describe('filterByWorkType', () => {
    const initiatives = [
      createInitiative({ id: '1', workType: WorkType.Planned }),
      createInitiative({ id: '2', workType: WorkType.Unplanned }),
      createInitiative({ id: '3', workType: WorkType.Planned }),
    ];

    it('should filter by work type', () => {
      expect(filterByWorkType(initiatives, [WorkType.Planned])).toHaveLength(2);
      expect(filterByWorkType(initiatives, [WorkType.Unplanned])).toHaveLength(1);
    });
  });

  describe('filterByQuarter', () => {
    const initiatives = [
      createInitiative({ id: '1', quarter: 'Q4 2024' }),
      createInitiative({ id: '2', quarter: 'Q1 2025' }),
      createInitiative({ id: '3', quarter: 'Q4 2024' }),
    ];

    it('should filter by quarter', () => {
      expect(filterByQuarter(initiatives, ['Q4 2024'])).toHaveLength(2);
      expect(filterByQuarter(initiatives, ['Q1 2025'])).toHaveLength(1);
    });

    it('should filter by multiple quarters', () => {
      expect(filterByQuarter(initiatives, ['Q4 2024', 'Q1 2025'])).toHaveLength(3);
    });
  });

  describe('filterByPriority', () => {
    const initiatives = [
      createInitiative({ id: '1', priority: Priority.P0 }),
      createInitiative({ id: '2', priority: Priority.P1 }),
      createInitiative({ id: '3', priority: Priority.P2 }),
    ];

    it('should filter by priority', () => {
      expect(filterByPriority(initiatives, [Priority.P0])).toHaveLength(1);
      expect(filterByPriority(initiatives, [Priority.P1, Priority.P2])).toHaveLength(2);
    });
  });

  describe('filterByStatus', () => {
    const initiatives = [
      createInitiative({ id: '1', status: Status.InProgress }),
      createInitiative({ id: '2', status: Status.Done }),
      createInitiative({ id: '3', status: Status.AtRisk }),
      createInitiative({ id: '4', status: Status.InProgress }),
    ];

    it('should filter by status', () => {
      expect(filterByStatus(initiatives, [Status.InProgress])).toHaveLength(2);
      expect(filterByStatus(initiatives, [Status.Done])).toHaveLength(1);
    });
  });

  describe('applyFilters', () => {
    const initiatives = [
      createInitiative({ id: '1', title: 'Payment', status: Status.InProgress, priority: Priority.P0 }),
      createInitiative({ id: '2', title: 'Auth', status: Status.Done, priority: Priority.P1 }),
      createInitiative({ id: '3', title: 'Dashboard', status: Status.Deleted, priority: Priority.P2 }),
    ];

    it('should exclude deleted by default', () => {
      const result = applyFilters(initiatives, {});
      expect(result).toHaveLength(2);
      expect(result.find(i => i.id === '3')).toBeUndefined();
    });

    it('should include deleted when specified', () => {
      const result = applyFilters(initiatives, {}, false);
      expect(result).toHaveLength(3);
    });

    it('should apply multiple filters', () => {
      const config: FilterConfig = {
        status: [Status.InProgress],
        priority: [Priority.P0],
      };
      const result = applyFilters(initiatives, config);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should combine search with other filters', () => {
      const config: FilterConfig = {
        searchQuery: 'pay',
        status: [Status.InProgress],
      };
      const result = applyFilters(initiatives, config);
      expect(result).toHaveLength(1);
    });
  });
});

describe('Initiative Sorting', () => {
  const initiatives = [
    createInitiative({ id: '1', title: 'Zebra', priority: Priority.P2, eta: '2024-12-01' }),
    createInitiative({ id: '2', title: 'Alpha', priority: Priority.P0, eta: '2024-11-01' }),
    createInitiative({ id: '3', title: 'Beta', priority: Priority.P1, eta: '2024-10-01' }),
  ];

  it('should return unsorted when sortConfig is null', () => {
    const result = sortInitiatives(initiatives, null);
    expect(result[0].id).toBe('1');
  });

  it('should sort by title ascending', () => {
    const config: SortConfig = { key: 'title', direction: 'asc' };
    const result = sortInitiatives(initiatives, config);
    expect(result[0].title).toBe('Alpha');
    expect(result[1].title).toBe('Beta');
    expect(result[2].title).toBe('Zebra');
  });

  it('should sort by title descending', () => {
    const config: SortConfig = { key: 'title', direction: 'desc' };
    const result = sortInitiatives(initiatives, config);
    expect(result[0].title).toBe('Zebra');
  });

  it('should sort by priority', () => {
    const config: SortConfig = { key: 'priority', direction: 'asc' };
    const result = sortInitiatives(initiatives, config);
    expect(result[0].priority).toBe(Priority.P0);
  });

  it('should sort by ETA', () => {
    const config: SortConfig = { key: 'eta', direction: 'asc' };
    const result = sortInitiatives(initiatives, config);
    expect(result[0].eta).toBe('2024-10-01');
  });

  it('should sort by owner using custom name resolver', () => {
    const initiativesWithOwners = [
      createInitiative({ id: '1', ownerId: 'u2' }),
      createInitiative({ id: '2', ownerId: 'u1' }),
    ];
    const getOwnerName = (id: string) => id === 'u1' ? 'Alice' : 'Bob';
    
    const config: SortConfig = { key: 'owner', direction: 'asc' };
    const result = sortInitiatives(initiativesWithOwners, config, getOwnerName);
    expect(result[0].ownerId).toBe('u1'); // Alice comes first
  });

  it('should not mutate original array', () => {
    const original = [...initiatives];
    const config: SortConfig = { key: 'title', direction: 'asc' };
    sortInitiatives(initiatives, config);
    expect(initiatives).toEqual(original);
  });
});

describe('Metrics Calculation', () => {
  const initiatives = [
    createInitiative({ id: '1', status: Status.NotStarted, estimatedEffort: 10, actualEffort: 0 }),
    createInitiative({ id: '2', status: Status.InProgress, estimatedEffort: 20, actualEffort: 15 }),
    createInitiative({ id: '3', status: Status.Done, estimatedEffort: 15, actualEffort: 18 }),
    createInitiative({ id: '4', status: Status.AtRisk, estimatedEffort: 25, actualEffort: 30 }),
    createInitiative({ id: '5', status: Status.Obsolete, estimatedEffort: 5, actualEffort: 2 }),
  ];

  it('should calculate total estimated effort', () => {
    const metrics = calculateMetrics(initiatives);
    expect(metrics.totalEstimated).toBe(75);
  });

  it('should calculate total actual effort', () => {
    const metrics = calculateMetrics(initiatives);
    expect(metrics.totalActual).toBe(65);
  });

  it('should count by status', () => {
    const metrics = calculateMetrics(initiatives);
    expect(metrics.byStatus.notStarted).toBe(1);
    expect(metrics.byStatus.inProgress).toBe(1);
    expect(metrics.byStatus.done).toBe(1);
    expect(metrics.byStatus.atRisk).toBe(1);
    expect(metrics.byStatus.obsolete).toBe(1);
  });

  it('should calculate completion rate', () => {
    const metrics = calculateMetrics(initiatives);
    expect(metrics.completionRate).toBe(20); // 1 out of 5 = 20%
  });

  it('should handle empty array', () => {
    const metrics = calculateMetrics([]);
    expect(metrics.total).toBe(0);
    expect(metrics.completionRate).toBe(0);
  });
});

describe('Deduplication', () => {
  it('should remove duplicate initiatives by ID', () => {
    const initiatives = [
      createInitiative({ id: '1', title: 'First' }),
      createInitiative({ id: '2', title: 'Second' }),
      createInitiative({ id: '1', title: 'Duplicate' }),
    ];
    
    const result = deduplicateInitiatives(initiatives);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('First'); // Keeps first occurrence
  });

  it('should preserve order', () => {
    const initiatives = [
      createInitiative({ id: '3' }),
      createInitiative({ id: '1' }),
      createInitiative({ id: '2' }),
    ];
    
    const result = deduplicateInitiatives(initiatives);
    expect(result.map(i => i.id)).toEqual(['3', '1', '2']);
  });
});

describe('Unique Filter Values', () => {
  const initiatives = [
    createInitiative({ id: '1', l1_assetClass: AssetClass.PL, ownerId: 'u1', quarter: 'Q4 2024' }),
    createInitiative({ id: '2', l1_assetClass: AssetClass.Auto, ownerId: 'u2', quarter: 'Q1 2025' }),
    createInitiative({ id: '3', l1_assetClass: AssetClass.PL, ownerId: 'u1', quarter: 'Q4 2024' }),
  ];

  it('should get unique asset classes', () => {
    const values = getUniqueFilterValues(initiatives);
    expect(values.assetClasses).toHaveLength(2);
    expect(values.assetClasses).toContain(AssetClass.PL);
    expect(values.assetClasses).toContain(AssetClass.Auto);
  });

  it('should get unique owners', () => {
    const values = getUniqueFilterValues(initiatives);
    expect(values.owners).toHaveLength(2);
  });

  it('should get unique quarters', () => {
    const values = getUniqueFilterValues(initiatives);
    expect(values.quarters).toHaveLength(2);
  });
});
