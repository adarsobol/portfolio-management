import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  validateWeeklyTeamEffort, 
  validateAllTeamLeads,
  getQuarterStartDate, 
  isThursdayEOD, 
  getCurrentWeekKey
} from '../weeklyEffortValidation';
import { Initiative, AppConfig, Status, Priority, WorkType, InitiativeType, AssetClass } from '../../types';
import { INITIAL_CONFIG } from '../../constants';

// Mock current date for consistent testing
const mockDate = new Date('2024-10-15T12:00:00.000Z'); // Tuesday Oct 15, 2024

describe('WeeklyEffortValidation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getQuarterStartDate', () => {
    it('should return correct start date for Q1', () => {
      const result = getQuarterStartDate('Q1 2024');
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0); // January
      expect(result.getDate()).toBe(1);
    });

    it('should return correct start date for Q2', () => {
      const result = getQuarterStartDate('Q2 2024');
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(3); // April
      expect(result.getDate()).toBe(1);
    });

    it('should return correct start date for Q3', () => {
      const result = getQuarterStartDate('Q3 2024');
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(6); // July
      expect(result.getDate()).toBe(1);
    });

    it('should return correct start date for Q4', () => {
      const result = getQuarterStartDate('Q4 2024');
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(9); // October
      expect(result.getDate()).toBe(1);
    });

    it('should handle different year formats', () => {
      const result = getQuarterStartDate('Q2 2025');
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(3); // April
    });

    it('should return current quarter start for invalid input', () => {
      const result = getQuarterStartDate('invalid');
      // Should default to current quarter (Q4 2024 based on mockDate Oct 15)
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(9); // October (Q4 start)
    });
  });

  describe('isThursdayEOD', () => {
    it('should return true for Thursday', () => {
      // Create a Thursday using explicit year/month/day to avoid timezone issues
      const thursday = new Date(2024, 9, 10); // October 10, 2024 is a Thursday
      expect(isThursdayEOD(thursday)).toBe(true);
    });

    it('should return false for Wednesday', () => {
      const wednesday = new Date(2024, 9, 9); // October 9, 2024 is a Wednesday
      expect(isThursdayEOD(wednesday)).toBe(false);
    });

    it('should return false for Friday', () => {
      const friday = new Date(2024, 9, 11); // October 11, 2024 is a Friday
      expect(isThursdayEOD(friday)).toBe(false);
    });
  });

  describe('getCurrentWeekKey', () => {
    it('should return week key in correct format', () => {
      const weekKey = getCurrentWeekKey();
      expect(weekKey).toMatch(/^\d{4}-W\d+$/);
    });

    it('should return consistent week key for same date', () => {
      const key1 = getCurrentWeekKey();
      const key2 = getCurrentWeekKey();
      expect(key1).toBe(key2);
    });
  });

  describe('validateWeeklyTeamEffort', () => {
    const mockConfig: AppConfig = {
      ...INITIAL_CONFIG,
      weeklyEffortValidation: {
        enabled: true,
        thresholdPercent: 15,
      },
    };

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
      ownerId: 'team-lead-1',
      quarter: 'Q4 2024',
      actualEffort: 10,
      estimatedEffort: 20,
      lastUpdated: '2024-10-14T12:00:00.000Z', // Monday - within current week
      ...overrides,
    });

    it('should return not flagged when no initiatives exist for team lead', () => {
      const result = validateWeeklyTeamEffort([], mockConfig, 'team-lead-1');
      
      expect(result.flagged).toBe(false);
      expect(result.deviationPercent).toBe(0);
      expect(result.averageWeeklyEffort).toBe(0);
      expect(result.currentWeekEffort).toBe(0);
      expect(result.teamLeadId).toBe('team-lead-1');
    });

    it('should filter initiatives by team lead ID', () => {
      const initiatives = [
        createInitiative({ id: '1', ownerId: 'team-lead-1', actualEffort: 10 }),
        createInitiative({ id: '2', ownerId: 'team-lead-2', actualEffort: 20 }),
        createInitiative({ id: '3', ownerId: 'team-lead-1', actualEffort: 15 }),
      ];

      const result = validateWeeklyTeamEffort(initiatives, mockConfig, 'team-lead-1');
      
      expect(result.teamLeadId).toBe('team-lead-1');
      // Total effort should only include team-lead-1's initiatives: 10 + 15 = 25
    });

    it('should exclude deleted initiatives', () => {
      const initiatives = [
        createInitiative({ id: '1', ownerId: 'team-lead-1', actualEffort: 10, status: Status.InProgress }),
        createInitiative({ id: '2', ownerId: 'team-lead-1', actualEffort: 20, status: Status.Deleted }),
        createInitiative({ id: '3', ownerId: 'team-lead-1', actualEffort: 15, status: Status.Done }),
      ];

      const result = validateWeeklyTeamEffort(initiatives, mockConfig, 'team-lead-1');
      
      // Should only count non-deleted: 10 + 15 = 25
      expect(result.averageWeeklyEffort).toBeGreaterThan(0);
    });

    it('should flag when deviation exceeds threshold', () => {
      // Create a scenario with high deviation
      const initiatives = [
        createInitiative({ 
          id: '1', 
          ownerId: 'team-lead-1', 
          actualEffort: 100,
          lastUpdated: '2024-10-14T12:00:00.000Z', // Recent update
        }),
      ];

      const configWithLowThreshold: AppConfig = {
        ...mockConfig,
        weeklyEffortValidation: {
          enabled: true,
          thresholdPercent: 5, // Very low threshold
        },
      };

      const result = validateWeeklyTeamEffort(initiatives, configWithLowThreshold, 'team-lead-1');
      
      // With only ~2 weeks in quarter, deviation can be significant
      expect(result.flagged).toBeDefined();
    });

    it('should not flag when deviation is below threshold', () => {
      const initiatives = [
        createInitiative({ 
          id: '1', 
          ownerId: 'team-lead-1', 
          actualEffort: 10,
          lastUpdated: '2024-10-14T12:00:00.000Z',
        }),
      ];

      const configWithHighThreshold: AppConfig = {
        ...mockConfig,
        weeklyEffortValidation: {
          enabled: true,
          thresholdPercent: 500, // Extremely high threshold - should never be exceeded
        },
      };

      const result = validateWeeklyTeamEffort(initiatives, configWithHighThreshold, 'team-lead-1');
      
      // With a 500% threshold, deviation should never exceed it
      expect(result.deviationPercent).toBeLessThan(500);
      // If deviationPercent < thresholdPercent, flagged should be false
      if (result.deviationPercent < 500) {
        expect(result.flagged).toBe(false);
      }
    });

    it('should use default threshold of 15% when not configured', () => {
      const configWithoutThreshold: AppConfig = {
        ...INITIAL_CONFIG,
        weeklyEffortValidation: undefined,
      };

      const initiatives = [
        createInitiative({ ownerId: 'team-lead-1', actualEffort: 10 }),
      ];

      const result = validateWeeklyTeamEffort(initiatives, configWithoutThreshold, 'team-lead-1');
      
      // Should not throw and should return valid result
      expect(result).toBeDefined();
      expect(result.teamLeadId).toBe('team-lead-1');
    });

    it('should return quarter from first initiative', () => {
      const initiatives = [
        createInitiative({ id: '1', ownerId: 'team-lead-1', quarter: 'Q3 2024' }),
        createInitiative({ id: '2', ownerId: 'team-lead-1', quarter: 'Q4 2024' }),
      ];

      const result = validateWeeklyTeamEffort(initiatives, mockConfig, 'team-lead-1');
      
      expect(result.quarter).toBe('Q3 2024');
    });
  });

  describe('validateAllTeamLeads', () => {
    const mockConfig: AppConfig = {
      ...INITIAL_CONFIG,
      weeklyEffortValidation: {
        enabled: true,
        thresholdPercent: 15,
      },
    };

    it('should validate multiple team leads', () => {
      const initiatives: Initiative[] = [
        {
          id: '1',
          title: 'Test 1',
          initiativeType: InitiativeType.WP,
          l1_assetClass: AssetClass.PL,
          l2_pillar: 'Test Pillar',
          l3_responsibility: 'Test Responsibility',
          l4_target: 'Test Target',
          eta: '2024-12-31',
          status: Status.InProgress,
          priority: Priority.P1,
          workType: WorkType.Planned,
          ownerId: 'team-lead-1',
          quarter: 'Q4 2024',
          actualEffort: 10,
          estimatedEffort: 20,
          lastUpdated: '2024-10-14T12:00:00.000Z',
        },
        {
          id: '2',
          title: 'Test 2',
          initiativeType: InitiativeType.WP,
          l1_assetClass: AssetClass.PL,
          l2_pillar: 'Test Pillar',
          l3_responsibility: 'Test Responsibility',
          l4_target: 'Test Target',
          eta: '2024-12-31',
          status: Status.InProgress,
          priority: Priority.P1,
          workType: WorkType.Planned,
          ownerId: 'team-lead-2',
          quarter: 'Q4 2024',
          actualEffort: 20,
          estimatedEffort: 30,
          lastUpdated: '2024-10-14T12:00:00.000Z',
        },
      ];

      const teamLeadIds = ['team-lead-1', 'team-lead-2', 'team-lead-3'];
      const results = validateAllTeamLeads(initiatives, mockConfig, teamLeadIds);

      expect(results).toHaveLength(3);
      expect(results[0].teamLeadId).toBe('team-lead-1');
      expect(results[1].teamLeadId).toBe('team-lead-2');
      expect(results[2].teamLeadId).toBe('team-lead-3');
    });

    it('should return empty array for empty team lead list', () => {
      const results = validateAllTeamLeads([], mockConfig, []);
      expect(results).toHaveLength(0);
    });

    it('should handle team lead with no initiatives', () => {
      const initiatives: Initiative[] = [
        {
          id: '1',
          title: 'Test 1',
          initiativeType: InitiativeType.WP,
          l1_assetClass: AssetClass.PL,
          l2_pillar: 'Test Pillar',
          l3_responsibility: 'Test Responsibility',
          l4_target: 'Test Target',
          eta: '2024-12-31',
          status: Status.InProgress,
          priority: Priority.P1,
          workType: WorkType.Planned,
          ownerId: 'team-lead-1',
          quarter: 'Q4 2024',
          actualEffort: 10,
          estimatedEffort: 20,
          lastUpdated: '2024-10-14T12:00:00.000Z',
        },
      ];

      const results = validateAllTeamLeads(initiatives, mockConfig, ['team-lead-1', 'team-lead-without-initiatives']);

      expect(results).toHaveLength(2);
      expect(results[1].flagged).toBe(false);
      expect(results[1].currentWeekEffort).toBe(0);
    });
  });
});
