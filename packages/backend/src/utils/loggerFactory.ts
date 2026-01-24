/**
 * Logger Factory - Creates and manages logger instances
 *
 * Provides a centralized way to create loggers with consistent configuration.
 * Supports per-component configuration and global log level settings.
 */

import {
  DefaultLogger,
  type Logger,
  type LogLevel,
  NullLogger,
} from "./logger";

/**
 * Configuration for the logger factory
 */
interface LoggerFactoryConfig {
  /** Default log level for all loggers */
  defaultLevel: LogLevel;
  /** Whether logging is enabled globally */
  enabled: boolean;
  /** Per-component log level overrides */
  componentLevels: Record<string, LogLevel>;
}

/**
 * Logger factory for creating component-specific loggers
 */
class LoggerFactoryClass {
  private config: LoggerFactoryConfig = {
    defaultLevel: "info",
    enabled: true,
    componentLevels: {},
  };

  /**
   * Updates the factory configuration
   * @param config - Partial configuration to merge
   */
  configure(config: Partial<LoggerFactoryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Sets the global default log level
   * @param level - Log level to set
   */
  setDefaultLevel(level: LogLevel): void {
    this.config.defaultLevel = level;
  }

  /**
   * Sets the log level for a specific component
   * @param component - Component name
   * @param level - Log level to set
   */
  setComponentLevel(component: string, level: LogLevel): void {
    this.config.componentLevels[component] = level;
  }

  /**
   * Enables or disables logging globally
   * @param enabled - Whether to enable logging
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Creates a logger for a specific component
   * @param component - Component name (e.g., 'Crawler', 'HttpClient')
   * @returns Logger instance configured for the component
   */
  createLogger(component: string): Logger {
    if (!this.config.enabled) {
      return new NullLogger();
    }

    const level =
      this.config.componentLevels[component] ?? this.config.defaultLevel;
    return new DefaultLogger(component, level);
  }

  /**
   * Gets the current configuration
   * @returns Current factory configuration
   */
  getConfig(): LoggerFactoryConfig {
    return { ...this.config };
  }

  /**
   * Resets the factory to default configuration
   */
  reset(): void {
    this.config = {
      defaultLevel: "info",
      enabled: true,
      componentLevels: {},
    };
  }
}

/**
 * Singleton instance of the logger factory
 */
export const LoggerFactory = new LoggerFactoryClass();

/**
 * Convenience function to create a logger
 * @param component - Component name
 * @returns Logger instance
 */
export function createLogger(component: string): Logger {
  return LoggerFactory.createLogger(component);
}
