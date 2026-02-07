/**
 * Type definitions for the crawler module
 */

import type {
  CrawlerStatistics,
  EnqueueLinksOptions,
  ExtractedLink,
  FailedRequestHandler,
  LogInterface,
  PostNavigationHook,
  PreNavigationHook,
  RequestOptions,
  ResponseData,
  SessionPoolOptions,
} from "../../models";
import type { Request } from "../../models/request";
import type { RequestQueue } from "../../models/requestQueue";
import type { Router } from "../../models/router";
import type { Session } from "../../models/session";

/**
 * Options for creating an HttpCrawler instance.
 * All fields are optional and have sensible defaults.
 */
export type CrawlerOptions = {
  maxRequestsPerCrawl?: number;
  maxRequestsPerMinute?: number;
  requestHandlerTimeoutMs?: number;
  navigationTimeoutMs?: number;
  maxConcurrency?: number;
  minConcurrency?: number;
  maxRequestRetries?: number;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
  useSessionPool?: boolean;
  sessionPoolOptions?: SessionPoolOptions;
  maxDepth?: number;
  sameDomainOnly?: boolean;
  respectRobotsTxt?: boolean;
  userAgent?: string;
  defaultHeaders?: Record<string, string>;
  preNavigationHooks?: PreNavigationHook[];
  postNavigationHooks?: PostNavigationHook[];
  failedRequestHandler?: FailedRequestHandler;
  logLevel?: LogLevel;
  requestQueue?: RequestQueue;
  requestHandler?: (context: CrawlingContext) => Promise<void>;
  router?: Router;
};

/**
 * Internal options type with required primitive fields.
 * Used internally by HttpCrawler after merging with defaults.
 */
export type HttpCrawlerInternalOptions = {
  maxRequestsPerCrawl: number;
  maxRequestsPerMinute: number;
  requestHandlerTimeoutMs: number;
  navigationTimeoutMs: number;
  maxConcurrency: number;
  minConcurrency: number;
  maxRequestRetries: number;
  retryDelayMs: number;
  maxRetryDelayMs: number;
  useSessionPool: boolean;
  maxDepth: number;
  sameDomainOnly: boolean;
  respectRobotsTxt: boolean;
  userAgent: string;
  defaultHeaders: Record<string, string>;
  logLevel: LogLevel;
  requestQueue: RequestQueue;
  router: Router;
  preNavigationHooks: PreNavigationHook[];
  postNavigationHooks: PostNavigationHook[];
  requestHandler?: (context: CrawlingContext) => Promise<void>;
  failedRequestHandler?: FailedRequestHandler;
  sessionPoolOptions?: SessionPoolOptions;
};

/**
 * Log level for the crawler's internal logger.
 */
export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

/**
 * Event types emitted by the HttpCrawler.
 */
export type EventData = {
  agentStarted: { slotId: number };
  requestQueued: Request;
  requestStarted: Request;
  requestCompleted: {
    request: Request;
    response: ResponseData;
    slotId: number;
  };
  requestFailed: { request: Request; error: Error; slotId: number };
  requestRetried: Request;
  sessionCreated: Session;
  sessionRetired: Session;
  crawlerStarted: undefined;
  crawlerPaused: undefined;
  crawlerResumed: undefined;
  crawlerCompleted: CrawlerStatistics;
  crawlerAborted: undefined;
};

/**
 * String literal type for crawler event names.
 */
export type CrawlerEventType = keyof EventData;

/**
 * Listener function for crawler events.
 */
export type CrawlerEventListener<T = unknown> = (event: {
  type: CrawlerEventType;
  data: T;
  timestamp: Date;
}) => void;

/**
 * Statistics about a crawl job's progress.
 */
export type CrawlStats = {
  crawledUrls: number;
  discoveredUrls: number;
  queuedUrls: number;
  failedUrls: number;
  startedAt: Date;
  lastActivityAt: Date;
};

/**
 * Callbacks for monitoring crawl progress.
 */
export type StartCrawlCallbacks = {
  onProgress?: (stats: CrawlStats, jobId: string) => void;
  onUrlCrawled?: (url: string, statusCode: number) => void;
  onUrlDiscovered?: (url: string) => void;
  onError?: (url: string, error: string) => void;
  onComplete?: (stats: CrawlStats, jobId: string) => void;
};

/**
 * Context provided to request handlers.
 */
export type CrawlingContext = {
  request: Request;
  response: ResponseData;
  session?: Session;
  crawler: CrawlerInterface;
  enqueueLinks: (options?: EnqueueLinksOptions) => Promise<number>;
  pushData: (data: Record<string, unknown>) => void;
  log: LogInterface;
};

/**
 * Public interface for the crawler (used in contexts).
 */
export interface CrawlerInterface {
  addRequests(requests: (RequestOptions | string)[]): void;
  getState(): {
    status: "idle" | "running" | "paused" | "completed" | "aborted";
    requestsQueued: number;
    requestsProcessed: number;
    requestsFailed: number;
    requestsRetried: number;
  };
  getStatistics(): CrawlerStatistics;
  pause(): void;
  resume(): void;
  abort(): void;
}

/**
 * Link filtering strategy for enqueueLinks.
 */
export type LinkStrategy =
  | "all"
  | "same-domain"
  | "same-hostname"
  | "same-origin";

/**
 * Extracted link with optional text content.
 */
export type { ExtractedLink };
