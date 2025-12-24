import { describe, it, expect } from 'vitest';
import { generateInitiativeId, parseQuarter, isJiraStyleId } from '../idGenerator';
import { Initiative } from '@/types';

describe('ID Generator', () => {
  describe('parseQuarter', () => {
    it('should parse "Q4 2025" format', () => {
      const result = parseQuarter('Q4 2025');
      expect(result.quarter).toBe(4);
      expect(result.year).toBe(2025);
    });

    it('should parse "Q1 2024" format', () => {
      const result = parseQuarter('Q1 2024');
      expect(result.quarter).toBe(1);
      expect(result.year).toBe(2024);
    });

    it('should parse "Q4-2025" format', () => {
      const result = parseQuarter('Q4-2025');
      expect(result.quarter).toBe(4);
      expect(result.year).toBe(2025);
    });

    it('should parse "Q4/2025" format', () => {
      const result = parseQuarter('Q4/2025');
      expect(result.quarter).toBe(4);
      expect(result.year).toBe(2025);
    });

    it('should parse "4Q 2025" format', () => {
      const result = parseQuarter('4Q 2025');
      expect(result.quarter).toBe(4);
      expect(result.year).toBe(2025);
    });

    it('should parse 2-digit year "Q4 25"', () => {
      const result = parseQuarter('Q4 25');
      expect(result.quarter).toBe(4);
      expect(result.year).toBe(2025);
    });

    it('should default to current quarter/year for invalid input', () => {
      const result = parseQuarter('invalid');
      expect(result.quarter).toBeGreaterThanOrEqual(1);
      expect(result.quarter).toBeLessThanOrEqual(4);
      expect(result.year).toBeGreaterThanOrEqual(2020);
    });

    it('should handle empty string', () => {
      const result = parseQuarter('');
      expect(result.quarter).toBeGreaterThanOrEqual(1);
      expect(result.quarter).toBeLessThanOrEqual(4);
    });
  });

  describe('isJiraStyleId', () => {
    it('should return true for valid Jira-style IDs', () => {
      expect(isJiraStyleId('Q425-001')).toBe(true);
      expect(isJiraStyleId('Q126-999')).toBe(true);
      expect(isJiraStyleId('Q301-042')).toBe(true);
    });

    it('should return false for invalid IDs', () => {
      expect(isJiraStyleId('Q425-0001')).toBe(false); // 4-digit sequence
      expect(isJiraStyleId('Q425-01')).toBe(false); // 2-digit sequence
      expect(isJiraStyleId('Q525-001')).toBe(false); // Invalid quarter (5)
      expect(isJiraStyleId('Q425001')).toBe(false); // Missing dash
      expect(isJiraStyleId('Q4-25-001')).toBe(false); // Wrong format
      expect(isJiraStyleId('')).toBe(false);
      expect(isJiraStyleId('uuid-1234-5678')).toBe(false);
    });
  });

  describe('generateInitiativeId', () => {
    it('should generate ID in correct format', () => {
      const id = generateInitiativeId('Q4 2025', []);
      expect(isJiraStyleId(id)).toBe(true);
      expect(id).toMatch(/^Q4\d{2}-\d{3}$/);
    });

    it('should generate sequential IDs', () => {
      const existing: Initiative[] = [
        { id: 'Q425-001', quarter: 'Q4 2025' } as Initiative,
        { id: 'Q425-002', quarter: 'Q4 2025' } as Initiative,
      ];
      
      const newId = generateInitiativeId('Q4 2025', existing);
      expect(newId).toBe('Q425-003');
    });

    it('should find max sequence across all quarters', () => {
      const existing: Initiative[] = [
        { id: 'Q425-001', quarter: 'Q4 2025' } as Initiative,
        { id: 'Q126-999', quarter: 'Q1 2026' } as Initiative,
        { id: 'Q225-050', quarter: 'Q2 2025' } as Initiative,
      ];
      
      const newId = generateInitiativeId('Q4 2025', existing);
      expect(newId).toBe('Q425-1000');
    });

    it('should handle empty existing initiatives', () => {
      const id = generateInitiativeId('Q4 2025', []);
      expect(id).toBe('Q425-001');
    });

    it('should use current quarter if quarter not provided', () => {
      const id = generateInitiativeId(undefined, []);
      expect(isJiraStyleId(id)).toBe(true);
      const now = new Date();
      const expectedQuarter = Math.floor(now.getMonth() / 3) + 1;
      expect(id.startsWith(`Q${expectedQuarter}`)).toBe(true);
    });

    it('should ignore non-Jira-style IDs when calculating sequence', () => {
      const existing: Initiative[] = [
        { id: 'uuid-1234-5678', quarter: 'Q4 2025' } as Initiative,
        { id: 'Q425-005', quarter: 'Q4 2025' } as Initiative,
      ];
      
      const newId = generateInitiativeId('Q4 2025', existing);
      expect(newId).toBe('Q425-006');
    });

    it('should handle multiple initiatives with same quarter', () => {
      const existing: Initiative[] = Array.from({ length: 10 }, (_, i) => ({
        id: `Q425-${String(i + 1).padStart(3, '0')}`,
        quarter: 'Q4 2025'
      } as Initiative));
      
      const newId = generateInitiativeId('Q4 2025', existing);
      expect(newId).toBe('Q425-011');
    });
  });
});

