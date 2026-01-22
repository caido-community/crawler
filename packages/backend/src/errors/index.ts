/**
 * Custom Error Classes for the Crawler Backend
 *
 * These provide:
 * - Type-safe error handling with instanceof checks
 * - Consistent error messages
 * - Additional context (e.g., jobId, url)
 * - Better debugging and logging
 */

/**
 * Base class for all crawler errors
 */
export class CrawlerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrawlerError";
  }
}

/**
 * Thrown when the SDK has not been initialized
 */
export class SDKNotInitializedError extends CrawlerError {
  constructor() {
    super("SDK not initialized. Call init() first.");
    this.name = "SDKNotInitializedError";
  }
}

/**
 * Thrown when a requested job is not found
 */
export class JobNotFoundError extends CrawlerError {
  constructor(public readonly jobId: string) {
    super(`Job not found: ${jobId}`);
    this.name = "JobNotFoundError";
  }
}

/**
 * Thrown when a crawler for a job is not found
 */
export class CrawlerNotFoundError extends CrawlerError {
  constructor(public readonly jobId: string) {
    super(`No active crawler found for job: ${jobId}`);
    this.name = "CrawlerNotFoundError";
  }
}

/**
 * Thrown when trying to start a crawler that is already running
 */
export class CrawlerAlreadyRunningError extends CrawlerError {
  constructor(public readonly jobId?: string) {
    super(
      jobId !== undefined
        ? `Crawler for job ${jobId} is already running`
        : "Crawler is already running",
    );
    this.name = "CrawlerAlreadyRunningError";
  }
}

/**
 * Thrown when a URL is invalid
 */
export class InvalidUrlError extends CrawlerError {
  constructor(
    public readonly url: string,
    reason?: string,
  ) {
    super(
      reason !== undefined
        ? `Invalid URL '${url}': ${reason}`
        : `Invalid URL: ${url}`,
    );
    this.name = "InvalidUrlError";
  }
}

/**
 * Thrown when configuration validation fails
 */
export class InvalidConfigError extends CrawlerError {
  constructor(
    public readonly field?: string,
    reason?: string,
  ) {
    const fieldPart = field !== undefined ? ` for field '${field}'` : "";
    const reasonPart = reason !== undefined ? `: ${reason}` : "";
    super(`Invalid configuration${fieldPart}${reasonPart}`);
    this.name = "InvalidConfigError";
  }
}

/**
 * Thrown when an HTTP request fails
 */
export class RequestFailedError extends CrawlerError {
  constructor(
    public readonly url: string,
    public readonly statusCode: number,
    reason?: string,
  ) {
    super(
      reason !== undefined
        ? `Request to ${url} failed (${statusCode}): ${reason}`
        : `Request to ${url} failed with status ${statusCode}`,
    );
    this.name = "RequestFailedError";
  }
}

/**
 * Thrown when max retries are exceeded
 */
export class MaxRetriesExceededError extends CrawlerError {
  constructor(
    public readonly url: string,
    public readonly attempts: number,
  ) {
    super(`Max retries (${attempts}) exceeded for URL: ${url}`);
    this.name = "MaxRetriesExceededError";
  }
}

/**
 * Thrown when robots.txt disallows crawling
 */
export class RobotsDisallowedError extends CrawlerError {
  constructor(public readonly url: string) {
    super(`Robots.txt disallows crawling: ${url}`);
    this.name = "RobotsDisallowedError";
  }
}

/**
 * Thrown when a request timeout occurs
 */
export class RequestTimeoutError extends CrawlerError {
  constructor(
    public readonly url: string,
    public readonly timeoutMs: number,
  ) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = "RequestTimeoutError";
  }
}

/**
 * Type guard to check if an error is a CrawlerError
 */
export function isCrawlerError(error: unknown): error is CrawlerError {
  return error instanceof CrawlerError;
}

/**
 * Safely get error message from any thrown value
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
