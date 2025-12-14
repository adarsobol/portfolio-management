import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authService } from '../authService';

// Mock fetch globally
global.fetch = vi.fn();

describe('AuthService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('Token Management', () => {
    it('should store and retrieve token', () => {
      const token = 'test-token-123';
      authService.setToken(token);
      expect(authService.getToken()).toBe(token);
    });

    it('should remove token on logout', () => {
      authService.setToken('test-token');
      authService.logout();
      expect(authService.getToken()).toBeNull();
    });

    it('should return null when no token exists', () => {
      expect(authService.getToken()).toBeNull();
    });
  });

  describe('isAuthenticated', () => {
    it('should return false when no token exists', () => {
      expect(authService.isAuthenticated()).toBe(false);
    });

    it('should return false for invalid token', () => {
      authService.setToken('invalid-token');
      expect(authService.isAuthenticated()).toBe(false);
    });

    it('should return true for valid non-expired token', () => {
      // Create a valid JWT token (expires in 1 hour)
      const payload = {
        exp: Math.floor(Date.now() / 1000) + 3600,
        email: 'test@example.com',
      };
      const token = `header.${btoa(JSON.stringify(payload))}.signature`;
      authService.setToken(token);
      expect(authService.isAuthenticated()).toBe(true);
    });

    it('should return false for expired token', () => {
      // Create an expired JWT token
      const payload = {
        exp: Math.floor(Date.now() / 1000) - 3600,
        email: 'test@example.com',
      };
      const token = `header.${btoa(JSON.stringify(payload))}.signature`;
      authService.setToken(token);
      expect(authService.isAuthenticated()).toBe(false);
    });
  });

  describe('getAuthHeader', () => {
    it('should return Authorization header when token exists', () => {
      authService.setToken('test-token');
      const header = authService.getAuthHeader();
      expect(header).toEqual({ Authorization: 'Bearer test-token' });
    });

    it('should return empty object when no token', () => {
      expect(authService.getAuthHeader()).toEqual({});
    });
  });

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      const mockResponse = {
        token: 'jwt-token-123',
        user: {
          id: 'u1',
          email: 'test@example.com',
          name: 'Test User',
          role: 'Admin',
          avatar: 'avatar-url',
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await authService.login('test@example.com', 'password');
      
      expect(result).toEqual(mockResponse);
      expect(authService.getToken()).toBe('jwt-token-123');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/login'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should throw error on failed login', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Invalid credentials' }),
      });

      await expect(
        authService.login('test@example.com', 'wrong-password')
      ).rejects.toThrow('Invalid credentials');
    });
  });
});
