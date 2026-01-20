/**
 * Default values and constants for the crawler.
 * Centralizes magic numbers for maintainability.
 */

import type { LogLevel } from "./types";

/**
 * Default configuration values for HttpCrawler.
 */
export const CRAWLER_DEFAULTS = {
  /** Maximum number of requests before stopping the crawl */
  MAX_REQUESTS_PER_CRAWL: Infinity,

  /** Rate limit: requests per minute */
  MAX_REQUESTS_PER_MINUTE: 120,

  /** Timeout for request handler execution (ms) */
  REQUEST_HANDLER_TIMEOUT_MS: 60_000,

  /** Timeout for navigation/fetch operations (ms) */
  NAVIGATION_TIMEOUT_MS: 30_000,

  /** Maximum concurrent requests */
  MAX_CONCURRENCY: 5,

  /** Minimum concurrent requests */
  MIN_CONCURRENCY: 1,

  /** Maximum retry attempts for failed requests */
  MAX_REQUEST_RETRIES: 3,

  /** Base delay between retries (ms) */
  RETRY_DELAY_MS: 1_000,

  /** Maximum delay between retries (ms) */
  MAX_RETRY_DELAY_MS: 30_000,

  /** Maximum crawl depth from starting URL */
  MAX_DEPTH: 10,

  /** Default User-Agent header */
  USER_AGENT: "Caido-Crawler",

  /** Default log level */
  LOG_LEVEL: "info" as LogLevel,

  /** Delay between crawl loop iterations (ms) */
  CRAWL_LOOP_DELAY_MS: 50,
} as const;
