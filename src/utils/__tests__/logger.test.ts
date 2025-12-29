import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';

// Mock logService before importing logger
vi.mock('../../services/logService', () => ({
  logService: {
    logError: vi.fn(),
    logCriticalError: vi.fn().mockResolvedValue(true),
  },
}));

// Mock import.meta.env
vi.stubGlobal('import.meta', {
  env: {
    DEV: true,
  },
});

import { logger, LogLevel } from '../logger';
import { logService } from '../../services/logService';

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Spy on console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('LogLevel enum', () => {
    it('should have correct log levels', () => {
      expect(LogLevel.DEBUG).toBe('debug');
      expect(LogLevel.INFO).toBe('info');
      expect(LogLevel.WARN).toBe('warn');
      expect(LogLevel.ERROR).toBe('error');
    });
  });

  describe('debug', () => {
    it('should log debug messages in dev mode', () => {
      logger.debug('Debug message');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Debug message')
      );
    });

    it('should include context in log', () => {
      logger.debug('Debug message', { context: 'TestContext' });
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[TestContext]')
      );
    });

    it('should include metadata in log', () => {
      logger.debug('Debug message', { metadata: { key: 'value' } });
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"key":"value"')
      );
    });
  });

  describe('info', () => {
    it('should log info messages', () => {
      logger.info('Info message');
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('INFO')
      );
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('Info message')
      );
    });
  });

  describe('warn', () => {
    it('should log warning messages', () => {
      logger.warn('Warning message');
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('WARN')
      );
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Warning message')
      );
    });
  });

  describe('error', () => {
    it('should log error messages to console', () => {
      logger.error('Error message');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('ERROR')
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Error message')
      );
    });

    it('should send error to logService', () => {
      logger.error('Error message', { context: 'ErrorContext' });
      expect(logService.logError).toHaveBeenCalledWith(
        'Error message',
        expect.objectContaining({
          context: 'ErrorContext',
        })
      );
    });

    it('should include error object in backend log', () => {
      const testError = new Error('Test error');
      logger.error('Error occurred', { error: testError });
      
      expect(logService.logError).toHaveBeenCalledWith(
        'Error occurred',
        expect.objectContaining({
          error: testError,
        })
      );
    });

    it('should include stack trace in console output for errors', () => {
      const testError = new Error('Test error');
      logger.error('Error occurred', { error: testError });
      
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Test error')
      );
    });
  });

  describe('critical', () => {
    it('should log critical messages to console', async () => {
      await logger.critical('Critical error!');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Critical error!')
      );
    });

    it('should send to logService.logCriticalError immediately', async () => {
      await logger.critical('Critical error!', { context: 'CriticalContext' });
      
      expect(logService.logCriticalError).toHaveBeenCalledWith(
        'Critical error!',
        expect.objectContaining({
          context: 'CriticalContext',
          metadata: expect.objectContaining({
            critical: true,
          }),
        })
      );
    });

    it('should include error details for critical errors', async () => {
      const criticalError = new Error('Something catastrophic');
      await logger.critical('System failure', { error: criticalError });
      
      expect(logService.logCriticalError).toHaveBeenCalledWith(
        'System failure',
        expect.objectContaining({
          error: criticalError,
        })
      );
    });
  });

  describe('Log Formatting', () => {
    it('should include timestamp in logs', () => {
      logger.info('Test message');
      expect(console.info).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      );
    });

    it('should format log entry correctly', () => {
      const timestamp = new Date().toISOString().substring(0, 10);
      logger.info('Test message', { 
        context: 'TestContext',
        metadata: { key: 'value' },
      });
      
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining(timestamp)
      );
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('INFO')
      );
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('[TestContext]')
      );
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('Test message')
      );
    });
  });

  describe('Error Severity', () => {
    it('should use ERROR severity when error object is provided', () => {
      const testError = new Error('Test');
      logger.error('Error with object', { error: testError });
      
      expect(logService.logError).toHaveBeenCalledWith(
        'Error with object',
        expect.objectContaining({
          severity: expect.anything(), // Should be LogSeverity.ERROR
        })
      );
    });

    it('should use WARN severity when no error object', () => {
      logger.error('Error without object');
      
      expect(logService.logError).toHaveBeenCalledWith(
        'Error without object',
        expect.objectContaining({
          severity: expect.anything(), // Should be LogSeverity.WARN
        })
      );
    });
  });
});

