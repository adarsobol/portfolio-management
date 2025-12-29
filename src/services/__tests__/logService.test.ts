import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LogSeverity } from '../../types';

// We need to mock dependencies before importing logService
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock navigator.onLine
let isOnline = true;
Object.defineProperty(global.navigator, 'onLine', {
  get: () => isOnline,
  configurable: true,
});

// Mock window.location
Object.defineProperty(global, 'window', {
  value: {
    location: { href: 'http://localhost:3000/test' },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
  configurable: true,
});

// Import after mocks are set up
import { logService } from '../logService';

describe('LogService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    isOnline = true;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('logError', () => {
    it('should batch error logs and send after delay', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      logService.logError('Test error message', {
        context: 'TestContext',
        severity: LogSeverity.ERROR,
      });

      // Should not have sent yet (batched)
      expect(mockFetch).not.toHaveBeenCalled();

      // Fast-forward past the batch delay (2 seconds)
      await vi.advanceTimersByTimeAsync(2500);

      // Now it should have been sent
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/logs/errors'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should include error details in the log', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const testError = new Error('Test error');
      logService.logError('Error occurred', {
        error: testError,
        context: 'TestContext',
        metadata: { customField: 'value' },
      });

      await vi.advanceTimersByTimeAsync(2500);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.message).toBe('Error occurred');
      expect(callBody.context).toBe('TestContext');
      expect(callBody.stack).toBe(testError.stack);
      expect(callBody.metadata.customField).toBe('value');
      expect(callBody.metadata.errorMessage).toBe('Test error');
    });

    it('should flush immediately when batch is full', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      // Add 10 logs (max batch size)
      for (let i = 0; i < 10; i++) {
        logService.logError(`Error ${i}`);
      }

      // Should have flushed immediately without waiting for timeout
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('logCriticalError', () => {
    it('should send critical errors immediately without batching', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await logService.logCriticalError('Critical error!', {
        context: 'CriticalContext',
        error: new Error('Something terrible happened'),
      });

      // Should have sent immediately
      expect(mockFetch).toHaveBeenCalledTimes(1);
      
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.message).toBe('Critical error!');
      expect(callBody.severity).toBe(LogSeverity.CRITICAL);
      expect(callBody.metadata.critical).toBe(true);
    });

    it('should return true on successful send', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await logService.logCriticalError('Test critical');
      expect(result).toBe(true);
    });

    it('should return false on failed send after retries', async () => {
      // Mock multiple failures
      mockFetch.mockRejectedValue(new Error('Network error'));

      const promise = logService.logCriticalError('Test critical');
      
      // Advance timers for all retries (1s + 2s + 4s + margin)
      await vi.advanceTimersByTimeAsync(10000);
      
      const result = await promise;
      
      // Should have tried 4 times (initial + 3 retries)
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(1);
      expect(result).toBe(false);
    });
  });

  describe('Retry Mechanism', () => {
    it('should retry on failure with exponential backoff', async () => {
      // First 2 calls fail, third succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: true });

      const promise = logService.logCriticalError('Test error');

      // Wait for retries (1s + 2s + margin)
      await vi.advanceTimersByTimeAsync(4000);
      
      const result = await promise;
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should stop retrying after max retries', async () => {
      mockFetch.mockRejectedValue(new Error('Persistent failure'));

      const promise = logService.logCriticalError('Test error');

      // Wait for all retries (1s + 2s + 4s + margin)
      await vi.advanceTimersByTimeAsync(10000);
      
      const result = await promise;
      expect(result).toBe(false);
      // Should have tried initial + 3 retries = 4 times
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });

  describe('Offline Queue', () => {
    it('should queue logs when offline', async () => {
      // First make the fetch fail to simulate offline behavior
      mockFetch.mockRejectedValue(new Error('Network error'));
      
      const promise = logService.logCriticalError('Offline error');
      
      // Advance timers for all retries
      await vi.advanceTimersByTimeAsync(10000);
      await promise;

      // After max retries, logs should be queued in localStorage
      const setItemCalls = localStorageMock.setItem.mock.calls;
      const queueCall = setItemCalls.find(
        (call: string[]) => call[0] === 'portfolio-offline-log-queue'
      );
      expect(queueCall).toBeDefined();
      
      if (!queueCall) {
        throw new Error('queueCall should be defined');
      }
      
      const queue = JSON.parse(queueCall[1]);
      expect(queue.length).toBeGreaterThanOrEqual(1);
      expect(queue[0].data.message).toBe('Offline error');
    });

    it('should report offline queue count', () => {
      // Set up some queued logs
      const queuedLogs = [
        { type: 'error', data: { message: 'Error 1' }, retryCount: 0, timestamp: new Date().toISOString() },
        { type: 'error', data: { message: 'Error 2' }, retryCount: 0, timestamp: new Date().toISOString() },
      ];
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(queuedLogs));

      expect(logService.getOfflineQueueCount()).toBe(2);
    });

    it('should clear offline queue', () => {
      logService.clearOfflineQueue();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('portfolio-offline-log-queue');
    });
  });

  describe('forceFlush', () => {
    it('should immediately flush pending logs', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      logService.logError('Error 1');
      logService.logError('Error 2');

      // Force flush before batch timeout
      logService.forceFlush();

      // Should have sent immediately
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('getErrorLogs', () => {
    it('should fetch error logs with filters', async () => {
      const mockLogs = [
        { id: '1', message: 'Error 1', severity: LogSeverity.ERROR },
        { id: '2', message: 'Error 2', severity: LogSeverity.WARN },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ logs: mockLogs }),
      });

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');
      
      const result = await logService.getErrorLogs({
        startDate,
        endDate,
        severity: LogSeverity.ERROR,
      });

      expect(result).toEqual(mockLogs);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('startDate='),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('endDate='),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('severity=error'),
        expect.any(Object)
      );
    });

    it('should return empty array on fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await logService.getErrorLogs();
      expect(result).toEqual([]);
    });
  });

  describe('getActivityLogs', () => {
    it('should fetch activity logs', async () => {
      const mockLogs = [
        { id: '1', type: 'TASK_CREATED', description: 'Created task' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ logs: mockLogs }),
      });

      const result = await logService.getActivityLogs();
      expect(result).toEqual(mockLogs);
    });
  });

  describe('searchLogs', () => {
    it('should search logs with query', async () => {
      const mockLogs = [{ id: '1', message: 'Found log' }];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ logs: mockLogs }),
      });

      const result = await logService.searchLogs({
        query: 'test query',
        logType: 'error',
      });

      expect(result).toEqual(mockLogs);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('query=test'),
        expect.any(Object)
      );
    });
  });
});

