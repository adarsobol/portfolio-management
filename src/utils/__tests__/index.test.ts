import { describe, it, expect } from 'vitest';
import { generateId, formatDate, getRelativeDate, checkOutdated, getOwnerName } from '../index';
import { User, Role } from '@/types';

describe('Utils', () => {
  describe('generateId', () => {
    it('should generate a unique ID', () => {
      const id1 = generateId();
      const id2 = generateId();
      
      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
    });

    it('should generate IDs with consistent format', () => {
      const id = generateId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });
  });

  describe('formatDate', () => {
    it('should format date to YYYY-MM-DD', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const formatted = formatDate(date);
      expect(formatted).toBe('2024-01-15');
    });

    it('should handle different dates correctly', () => {
      const date = new Date('2024-12-31T23:59:59Z');
      const formatted = formatDate(date);
      expect(formatted).toBe('2024-12-31');
    });
  });

  describe('getRelativeDate', () => {
    it('should get date 7 days from today', () => {
      const today = new Date();
      const expectedDate = new Date(today);
      expectedDate.setDate(today.getDate() + 7);
      
      const result = getRelativeDate(7);
      const resultDate = new Date(result);
      
      expect(resultDate.getDate()).toBe(expectedDate.getDate());
    });

    it('should get date in the past', () => {
      const today = new Date();
      const expectedDate = new Date(today);
      expectedDate.setDate(today.getDate() - 14);
      
      const result = getRelativeDate(-14);
      const resultDate = new Date(result);
      
      expect(resultDate.getDate()).toBe(expectedDate.getDate());
    });
  });

  describe('checkOutdated', () => {
    it('should return true for dates older than 14 days', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 15);
      const dateStr = oldDate.toISOString().split('T')[0];
      
      expect(checkOutdated(dateStr)).toBe(true);
    });

    it('should return false for recent dates', () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 5);
      const dateStr = recentDate.toISOString().split('T')[0];
      
      expect(checkOutdated(dateStr)).toBe(false);
    });

    it('should return false for today', () => {
      const today = new Date().toISOString().split('T')[0];
      expect(checkOutdated(today)).toBe(false);
    });
  });

  describe('getOwnerName', () => {
    const mockUsers: User[] = [
      { id: 'u1', email: 'user1@example.com', name: 'User One', role: Role.Admin, avatar: '' },
      { id: 'u2', email: 'user2@example.com', name: 'User Two', role: Role.TeamLead, avatar: '' },
    ];

    it('should return owner name when user exists', () => {
      expect(getOwnerName(mockUsers, 'u1')).toBe('User One');
      expect(getOwnerName(mockUsers, 'u2')).toBe('User Two');
    });

    it('should return "Unknown" when user not found', () => {
      expect(getOwnerName(mockUsers, 'u999')).toBe('Unknown');
    });

    it('should return "Unknown" when id is undefined', () => {
      expect(getOwnerName(mockUsers, undefined)).toBe('Unknown');
    });
  });
});
