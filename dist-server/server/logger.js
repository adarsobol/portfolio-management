/**
 * Structured logging utility for the backend server
 * Replaces console.log/error throughout the server for consistent formatting
 * and production-ready log management
 */
export var LogLevel;
(function (LogLevel) {
    LogLevel["DEBUG"] = "debug";
    LogLevel["INFO"] = "info";
    LogLevel["WARN"] = "warn";
    LogLevel["ERROR"] = "error";
})(LogLevel || (LogLevel = {}));
class ServerLogger {
    logLevel;
    constructor() {
        // In production, only show INFO and above; in development, show DEBUG
        this.logLevel = process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG;
    }
    formatTimestamp() {
        return new Date().toISOString();
    }
    formatLog(entry) {
        const { level, message, timestamp, context, metadata, error } = entry;
        const contextStr = context ? `[${context}]` : '';
        const metaStr = metadata && Object.keys(metadata).length > 0
            ? ` ${JSON.stringify(metadata)}`
            : '';
        const errorStr = error ? `\n${error.stack || error.message}` : '';
        return `[${timestamp}] ${level.toUpperCase()} ${contextStr} ${message}${metaStr}${errorStr}`;
    }
    shouldLog(level) {
        const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
        return levels.indexOf(level) >= levels.indexOf(this.logLevel);
    }
    log(level, message, options) {
        if (!this.shouldLog(level)) {
            return;
        }
        const entry = {
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
    debug(message, options) {
        this.log(LogLevel.DEBUG, message, options);
    }
    /**
     * Log informational messages
     */
    info(message, options) {
        this.log(LogLevel.INFO, message, options);
    }
    /**
     * Log warning messages
     */
    warn(message, options) {
        this.log(LogLevel.WARN, message, options);
    }
    /**
     * Log error messages
     */
    error(message, options) {
        this.log(LogLevel.ERROR, message, options);
    }
    /**
     * Log a startup message with emoji for visibility
     */
    startup(message, options) {
        // Startup messages always use INFO level but with special formatting
        const entry = {
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
    success(message, options) {
        const entry = {
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
    critical(message, options) {
        const entry = {
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
    setLevel(level) {
        this.logLevel = level;
    }
    /**
     * Get current log level
     */
    getLevel() {
        return this.logLevel;
    }
}
export const serverLogger = new ServerLogger();
