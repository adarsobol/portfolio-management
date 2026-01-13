/**
 * Structured logging utility for the backend server
 * Replaces console.log/error throughout the server for consistent formatting
 * and production-ready log management
 */

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

interface LogOptions {
  context?: string;
  metadata?: Record<string, unknown>;
  error?: Error;
}

class ServerLogger {
  private logLevel: LogLevel;

  constructor() {
    // In production, only show INFO and above; in development, show DEBUG
    this.logLevel = process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG;
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private formatLog(entry: LogEntry): string {
    const { level, message, timestamp, context, metadata, error } = entry;
    const contextStr = context ? `[${context}]` : '';
    const metaStr = metadata && Object.keys(metadata).length > 0 
      ? ` ${JSON.stringify(metadata)}` 
      : '';
    const errorStr = error ? `\n${error.stack || error.message}` : '';
    
    return `[${timestamp}] ${level.toUpperCase()} ${contextStr} ${message}${metaStr}${errorStr}`;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  private log(level: LogLevel, message: string, options?: LogOptions): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: this.formatTimestamp(),
      ...options
    };

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
  }

  /**
   * Log debug messages - only shown in development
   */
  debug(message: string, options?: LogOptions): void {
    this.log(LogLevel.DEBUG, message, options);
  }

  /**
   * Log informational messages
   */
  info(message: string, options?: LogOptions): void {
    this.log(LogLevel.INFO, message, options);
  }

  /**
   * Log warning messages
   */
  warn(message: string, options?: LogOptions): void {
    this.log(LogLevel.WARN, message, options);
  }

  /**
   * Log error messages
   */
  error(message: string, options?: LogOptions): void {
    this.log(LogLevel.ERROR, message, options);
  }

  /**
   * Log a startup message with emoji for visibility
   */
  startup(message: string, options?: LogOptions): void {
    // Startup messages always use INFO level but with special formatting
    const entry: LogEntry = {
      level: LogLevel.INFO,
      message: `🚀 ${message}`,
      timestamp: this.formatTimestamp(),
      ...options
    };
    console.log(this.formatLog(entry));
  }

  /**
   * Log a success message with emoji
   */
  success(message: string, options?: LogOptions): void {
    const entry: LogEntry = {
      level: LogLevel.INFO,
      message: `✅ ${message}`,
      timestamp: this.formatTimestamp(),
      ...options
    };
    console.log(this.formatLog(entry));
  }

  /**
   * Log a critical error (always logged, for fatal errors)
   */
  critical(message: string, options?: LogOptions): void {
    const entry: LogEntry = {
      level: LogLevel.ERROR,
      message: `🔴 CRITICAL: ${message}`,
      timestamp: this.formatTimestamp(),
      ...options
    };
    console.error(this.formatLog(entry));
  }

  /**
   * Set log level dynamically
   */
  setLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.logLevel;
  }
}

export const serverLogger = new ServerLogger();
