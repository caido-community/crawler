/**
 * Logger - Centralized logging system for the crawler backend
 *
 * Provides structured logging with log levels, timestamps, and context.
 * Can be configured per-component for granular control.
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  component: string;
  message: string;
  data?: Record<string, unknown>;
}

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

/**
 * Default logger implementation
 */
export class DefaultLogger implements Logger {
  constructor(
    private readonly component: string,
    private readonly minLevel: LogLevel = "info",
  ) {}

  /**
   * Checks if a log level should be output
   * @param level - Level to check
   * @returns true if level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  /**
   * Formats a log entry for output
   * @param entry - Log entry to format
   * @returns Formatted log string
   */
  private formatEntry(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const level = entry.level.toUpperCase().padEnd(5);
    const data =
      entry.data !== undefined ? ` ${JSON.stringify(entry.data)}` : "";
    return `[${timestamp}] [${level}] [${entry.component}] ${entry.message}${data}`;
  }

  /**
   * Creates and optionally outputs a log entry
   * @param level - Log level
   * @param message - Log message
   * @param data - Optional structured data
   */
  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      component: this.component,
      message,
      data,
    };

    const formatted = this.formatEntry(entry);

    switch (level) {
      case "debug":
      case "info":
        console.log(formatted);
        break;
      case "warn":
        console.warn(formatted);
        break;
      case "error":
        console.error(formatted);
        break;
      case "silent":
        // No output for silent level
        break;
    }
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log("debug", message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log("info", message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log("warn", message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log("error", message, data);
  }
}

/**
 * No-op logger for testing or when logging is disabled
 */
export class NullLogger implements Logger {
  debug(): void {
    /* no-op */
  }
  info(): void {
    /* no-op */
  }
  warn(): void {
    /* no-op */
  }
  error(): void {
    /* no-op */
  }
}
