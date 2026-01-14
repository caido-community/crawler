/**
 * Core types for the Crawler Engine
 */

// ============================================================================
// Request Types
// ============================================================================

export type RequestMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "HEAD"
  | "OPTIONS";

export type RequestState =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "retrying";

export type RequestPriority = number; // Higher = more priority

export interface RequestOptions {
  url: string;
  method?: RequestMethod;
  headers?: Record<string, string>;
  body?: string;
  userData?: Record<string, unknown>;
  label?: string;
  uniqueKey?: string;
  priority?: RequestPriority;
  maxRetries?: number;
  noRetry?: boolean;
  skipNavigation?: boolean;
}

export interface RequestData {
  id: string;
  url: string;
  method: RequestMethod;
  headers: Record<string, string>;
  body?: string;
  userData: Record<string, unknown>;
  label?: string;
  uniqueKey: string;
  priority: RequestPriority;
  retryCount: number;
  maxRetries: number;
  noRetry: boolean;
  state: RequestState;
  errorMessages: string[];
  depth: number;
  parentRequestId?: string;
  createdAt: Date;
  processedAt?: Date;
}

// ============================================================================
// Response Types
// ============================================================================

export interface ResponseData {
  url: string;
  statusCode: number;
  headers: Record<string, string[]>;
  body: string;
  contentType: string;
  isHtml: boolean;
  isJson: boolean;
  isXml: boolean;
  redirectChain: string[];
  timing: {
    startedAt: Date;
    completedAt: Date;
    durationMs: number;
  };
}

// ============================================================================
// Extractor Types
// ============================================================================

export type UrlSource =
  | "anchor"
  | "form"
  | "script"
  | "link"
  | "image"
  | "iframe"
  | "css"
  | "meta"
  | "sitemap"
  | "robots"
  | "json"
  | "javascript";

export interface ExtractedLink {
  url: string;
  source: UrlSource;
  text?: string;
  attributes?: Record<string, string>;
}

export interface ExtractionResult {
  links: ExtractedLink[];
  forms: ExtractedForm[];
  emails: string[];
  metadata: PageMetadata;
}

export interface ExtractedForm {
  action: string;
  method: RequestMethod;
  inputs: FormInput[];
  id?: string;
  name?: string;
}

export interface FormInput {
  name: string;
  type: string;
  value?: string;
  required: boolean;
  options?: string[]; // For select inputs
}

export interface PageMetadata {
  title?: string;
  description?: string;
  keywords?: string[];
  canonical?: string;
  language?: string;
  robotsMeta?: string;
}

// ============================================================================
// Sitemap Types
// ============================================================================

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority?: number;
}

export interface Sitemap {
  urls: SitemapUrl[];
  sitemaps: string[]; // Nested sitemap references
}

// ============================================================================
// Robots.txt Types
// ============================================================================

export interface RobotsTxt {
  rules: RobotsRule[];
  sitemaps: string[];
  crawlDelay?: number;
}

export interface RobotsRule {
  userAgent: string;
  allow: string[];
  disallow: string[];
}

// ============================================================================
// Session Types
// ============================================================================

export interface SessionData {
  id: string;
  cookies: Cookie[];
  headers: Record<string, string>;
  userData: Record<string, unknown>;
  createdAt: Date;
  lastUsedAt: Date;
  usageCount: number;
  maxUsageCount: number;
  isBlocked: boolean;
  errorScore: number;
}

export interface Cookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

// ============================================================================
// Concurrency Types
// ============================================================================

export interface PoolOptions {
  maxConcurrency: number;
  minConcurrency: number;
  desiredConcurrency: number;
  scaleUpStepRatio: number;
  scaleDownStepRatio: number;
  maybeRunIntervalMs: number;
}

// RateLimiterOptions is defined in concurrency/rateLimiter.ts

// ============================================================================
// Router Types
// ============================================================================

export type RouteHandler = (context: CrawlingContext) => Promise<void>;

export interface Route {
  pattern: string | RegExp;
  handler: RouteHandler;
  label?: string;
}

// ============================================================================
// Crawler Types
// ============================================================================

export interface CrawlerOptions {
  // Request handling
  maxRequestsPerCrawl?: number;
  maxRequestsPerMinute?: number;
  requestHandlerTimeoutMs?: number;
  navigationTimeoutMs?: number;

  // Concurrency
  maxConcurrency?: number;
  minConcurrency?: number;

  // Retries
  maxRequestRetries?: number;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;

  // Session
  useSessionPool?: boolean;
  // sessionPoolOptions is typed as unknown here to avoid circular deps
  // The actual type is SessionPoolOptions from session/sessionPool.ts
  sessionPoolOptions?: unknown;

  // Crawling behavior
  maxDepth?: number;
  sameDomainOnly?: boolean;
  respectRobotsTxt?: boolean;

  // Headers
  userAgent?: string;
  defaultHeaders?: Record<string, string>;

  // Hooks
  preNavigationHooks?: PreNavigationHook[];
  postNavigationHooks?: PostNavigationHook[];
  failedRequestHandler?: FailedRequestHandler;

  // Logging
  logLevel?: "debug" | "info" | "warn" | "error" | "silent";
}

// SessionPoolOptions is defined in session/sessionPool.ts to avoid circular deps

export interface CrawlingContext {
  request: RequestData;
  response: ResponseData;
  session?: SessionData;
  crawler: CrawlerInterface;

  // Helper methods
  enqueueLinks: (options?: EnqueueLinksOptions) => Promise<number>;
  pushData: (data: Record<string, unknown>) => void;
  log: LogInterface;
}

export interface EnqueueLinksOptions {
  selector?: string;
  baseUrl?: string;
  strategy?: "all" | "same-domain" | "same-hostname" | "same-origin";
  transformRequestFunction?: (
    request: RequestOptions,
  ) => RequestOptions | undefined;
  label?: string;
  userData?: Record<string, unknown>;
  priority?: number;
}

export interface CrawlerInterface {
  addRequests: (requests: RequestOptions[]) => void;
  getState: () => CrawlerState;
  pause: () => void;
  resume: () => void;
  abort: () => void;
}

export interface CrawlerState {
  status: "idle" | "running" | "paused" | "completed" | "aborted";
  requestsQueued: number;
  requestsProcessed: number;
  requestsFailed: number;
  requestsRetried: number;
  startedAt?: Date;
  completedAt?: Date;
}

// ============================================================================
// Hook Types
// ============================================================================

export type PreNavigationHook = (
  context: PreNavigationContext,
) => Promise<void> | void;

export type PostNavigationHook = (
  context: CrawlingContext,
) => Promise<void> | void;

export type FailedRequestHandler = (
  context: FailedRequestContext,
) => Promise<void> | void;

export interface PreNavigationContext {
  request: RequestData;
  session?: SessionData;
  crawler: CrawlerInterface;
}

export interface FailedRequestContext {
  request: RequestData;
  error: Error;
  session?: SessionData;
  crawler: CrawlerInterface;
}

// ============================================================================
// Log Interface
// ============================================================================

export interface LogInterface {
  debug: (message: string, data?: Record<string, unknown>) => void;
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
}

// ============================================================================
// Statistics Types
// ============================================================================

export interface CrawlerStatistics {
  requestsFinished: number;
  requestsFailed: number;
  requestsRetried: number;
  requestsTotal: number;
  requestsPerMinute: number;
  requestsPerSecond: number;
  avgResponseTimeMs: number;
  maxResponseTimeMs: number;
  minResponseTimeMs: number;
  totalResponseTimeMs: number;
  crawlerRuntimeMs: number;
  requestsWithStatusCode: Record<number, number>;
  errorsPerType: Record<string, number>;
}

// ============================================================================
// Event Types
// ============================================================================

export type CrawlerEventType =
  | "requestQueued"
  | "requestStarted"
  | "requestCompleted"
  | "requestFailed"
  | "requestRetried"
  | "sessionCreated"
  | "sessionRetired"
  | "crawlerStarted"
  | "crawlerPaused"
  | "crawlerResumed"
  | "crawlerCompleted"
  | "crawlerAborted";

export interface CrawlerEvent<T = unknown> {
  type: CrawlerEventType;
  data: T;
  timestamp: Date;
}

export type CrawlerEventListener<T = unknown> = (
  event: CrawlerEvent<T>,
) => void;
