import { describe, it, expect } from 'vitest';
import { migrateInitiativeIds } from '../migrateIds';
import { Initiative } from '@/types';

describe('migrateInitiativeIds', () => {
  it('should migrate UUIDs to Jira-style format', () => {
    const initiatives: Initiative[] = [
      {
        id: 'uuid-1234-5678',
        quarter: 'Q4 2025',
        title: 'Test Initiative 1',
        l1_assetClass: 'PL',
        l2_pillar: 'Test',
        l3_responsibility: 'Test',
        l4_target: 'Test',
        ownerId: 'user1',
        status: 'Not Started',
        priority: 'P1',
        workType: 'Planned Work',
        lastUpdated: '2025-01-01'
      } as Initiative,
      {
        id: 'uuid-9876-5432',
        quarter: 'Q1 2026',
        title: 'Test Initiative 2',
        l1_assetClass: 'PL',
        l2_pillar: 'Test',
        l3_responsibility: 'Test',
        l4_target: 'Test',
        ownerId: 'user1',
        status: 'Not Started',
        priority: 'P1',
        workType: 'Planned Work',
        lastUpdated: '2025-01-01'
      } as Initiative,
    ];

    const migrated = migrateInitiativeIds(initiatives);

    expect(migrated.length).toBe(2);
    expect(migrated[0].id).toMatch(/^Q4\d{2}-\d{3}$/);
    expect(migrated[1].id).toMatch(/^Q1\d{2}-\d{3}$/);
    expect(migrated[0].id).not.toBe(migrated[1].id);
    expect(migrated[0].title).toBe('Test Initiative 1');
    expect(migrated[1].title).toBe('Test Initiative 2');
  });

  it('should skip already migrated initiatives', () => {
    const initiatives: Initiative[] = [
      {
        id: 'Q425-001',
        quarter: 'Q4 2025',
        title: 'Already Migrated',
        l1_assetClass: 'PL',
        l2_pillar: 'Test',
        l3_responsibility: 'Test',
        l4_target: 'Test',
        ownerId: 'user1',
        status: 'Not Started',
        priority: 'P1',
        workType: 'Planned Work',
        lastUpdated: '2025-01-01'
      } as Initiative,
      {
        id: 'uuid-1234-5678',
        quarter: 'Q4 2025',
        title: 'Needs Migration',
        l1_assetClass: 'PL',
        l2_pillar: 'Test',
        l3_responsibility: 'Test',
        l4_target: 'Test',
        ownerId: 'user1',
        status: 'Not Started',
        priority: 'P1',
        workType: 'Planned Work',
        lastUpdated: '2025-01-01'
      } as Initiative,
    ];

    const migrated = migrateInitiativeIds(initiatives);

    expect(migrated.length).toBe(2);
    expect(migrated[0].id).toBe('Q425-001'); // Unchanged
    expect(migrated[1].id).toMatch(/^Q4\d{2}-\d{3}$/); // Migrated
    expect(migrated[1].id).not.toBe('uuid-1234-5678');
  });

  it('should handle empty array', () => {
    const migrated = migrateInitiativeIds([]);
    expect(migrated).toEqual([]);
  });

  it('should handle initiatives without quarter field', () => {
    const initiatives: Initiative[] = [
      {
        id: 'uuid-1234-5678',
        title: 'No Quarter',
        l1_assetClass: 'PL',
        l2_pillar: 'Test',
        l3_responsibility: 'Test',
        l4_target: 'Test',
        ownerId: 'user1',
        status: 'Not Started',
        priority: 'P1',
        workType: 'Planned Work',
        lastUpdated: '2025-01-01'
      } as Initiative,
    ];

    const migrated = migrateInitiativeIds(initiatives);

    expect(migrated.length).toBe(1);
    expect(migrated[0].id).toMatch(/^Q\d{3}-\d{3}$/); // Should use current quarter
  });

  it('should generate sequential IDs for initiatives with same quarter', () => {
    const initiatives: Initiative[] = [
      {
        id: 'uuid-1',
        quarter: 'Q4 2025',
        title: 'First',
        l1_assetClass: 'PL',
        l2_pillar: 'Test',
        l3_responsibility: 'Test',
        l4_target: 'Test',
        ownerId: 'user1',
        status: 'Not Started',
        priority: 'P1',
        workType: 'Planned Work',
        lastUpdated: '2025-01-01'
      } as Initiative,
      {
        id: 'uuid-2',
        quarter: 'Q4 2025',
        title: 'Second',
        l1_assetClass: 'PL',
        l2_pillar: 'Test',
        l3_responsibility: 'Test',
        l4_target: 'Test',
        ownerId: 'user1',
        status: 'Not Started',
        priority: 'P1',
        workType: 'Planned Work',
        lastUpdated: '2025-01-01'
      } as Initiative,
    ];

    const migrated = migrateInitiativeIds(initiatives);

    expect(migrated[0].id).toMatch(/^Q425-\d{3}$/);
    expect(migrated[1].id).toMatch(/^Q425-\d{3}$/);
    // IDs should be sequential
    const seq1 = parseInt(migrated[0].id.split('-')[1]);
    const seq2 = parseInt(migrated[1].id.split('-')[1]);
    expect(seq2).toBe(seq1 + 1);
  });

  it('should be idempotent - safe to run multiple times', () => {
    const initiatives: Initiative[] = [
      {
        id: 'Q425-001',
        quarter: 'Q4 2025',
        title: 'Already Migrated',
        l1_assetClass: 'PL',
        l2_pillar: 'Test',
        l3_responsibility: 'Test',
        l4_target: 'Test',
        ownerId: 'user1',
        status: 'Not Started',
        priority: 'P1',
        workType: 'Planned Work',
        lastUpdated: '2025-01-01'
      } as Initiative,
    ];

    const migrated1 = migrateInitiativeIds(initiatives);
    const migrated2 = migrateInitiativeIds(migrated1);

    expect(migrated1[0].id).toBe('Q425-001');
    expect(migrated2[0].id).toBe('Q425-001');
  });
});

