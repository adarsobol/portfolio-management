/**
 * Structured logging utility to replace console.log/error throughout the app
 * Formats logs consistently for easier debugging and production monitoring
 * Sends errors to backend for persistence and analysis
 */

import { logService } from '../services/logService';
import { LogSeverity } from '../types';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: string;
  metadata?: Record<string, unknown>;
  error?: Error;
}

class Logger {
  private logLevel: LogLevel = import.meta.env.DEV ? LogLevel.DEBUG : LogLevel.INFO;

  private formatLog(entry: LogEntry): string {
    const { level, message, timestamp, context, metadata, error } = entry;
    const contextStr = context ? `[${context}]` : '';
    const metaStr = metadata ? ` ${JSON.stringify(metadata)}` : '';
    const errorStr = error ? `\n${error.stack || error.message}` : '';
    
    return `[${timestamp}] ${level.toUpperCase()} ${contextStr} ${message}${metaStr}${errorStr}`;
  }

  private log(level: LogLevel, message: string, options?: {
    context?: string;
    metadata?: Record<string, unknown>;
    error?: Error;
  }): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...options
    };

    // Only log if level is >= current log level
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    if (levels.indexOf(level) >= levels.indexOf(this.logLevel)) {
      const formatted = this.formatLog(entry);
      
      switch (level) {
        case LogLevel.ERROR:
          console.error(formatted);
          break;
        case LogLevel.WARN:
          console.warn(formatted);
          break;
        case LogLevel.INFO:
          console.info(formatted);
          break;
        default:
          console.log(formatted);
      }

      // Send errors to backend for persistence
      if (level === LogLevel.ERROR) {
        const severity = options?.error ? LogSeverity.ERROR : LogSeverity.WARN;
        logService.logError(message, {
          error: options?.error,
          context: options?.context,
          metadata: options?.metadata,
          severity,
        });
      }
    }
  }

  debug(message: string, options?: { context?: string; metadata?: Record<string, unknown> }): void {
    this.log(LogLevel.DEBUG, message, options);
  }

  info(message: string, options?: { context?: string; metadata?: Record<string, unknown> }): void {
    this.log(LogLevel.INFO, message, options);
  }

  warn(message: string, options?: { context?: string; metadata?: Record<string, unknown> }): void {
    this.log(LogLevel.WARN, message, options);
  }

  error(message: string, options?: { context?: string; metadata?: Record<string, unknown>; error?: Error }): void {
    this.log(LogLevel.ERROR, message, options);
  }

  /**
   * Log a critical error that is sent immediately (not batched)
   * Use this for unrecoverable errors like ErrorBoundary catches
   */
  async critical(message: string, options?: { 
    context?: string; 
    metadata?: Record<string, unknown>; 
    error?: Error 
  }): Promise<void> {
    const entry: LogEntry = {
      level: LogLevel.ERROR,
      message,
      timestamp: new Date().toISOString(),
      ...options
    };

    // Always log critical errors to console
    console.error(this.formatLog(entry));

    // Send immediately to backend (no batching)
    await logService.logCriticalError(message, {
      error: options?.error,
      context: options?.context,
      metadata: {
        ...options?.metadata,
        critical: true,
      },
    });
  }
}

export const logger = new Logger();
