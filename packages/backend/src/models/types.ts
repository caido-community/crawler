import type { SessionData } from "./session";

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

export type RequestPriority = number;

export type RequestOptions = {
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
  id?: string;
  createdAt?: Date;
};

export type RequestData = {
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
};

export type ResponseTiming = {
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
};

export type ResponseDataInit = {
  url: string;
  statusCode: number;
  headers: Record<string, string[]>;
  body: string;
  contentType: string;
  isHtml: boolean;
  isJson: boolean;
  isXml: boolean;
  redirectChain: string[];
  timing: ResponseTiming;
};

export class ResponseData {
  readonly url: string;
  readonly statusCode: number;
  readonly headers: Record<string, string[]>;
  readonly body: string;
  readonly contentType: string;
  readonly isHtml: boolean;
  readonly isJson: boolean;
  readonly isXml: boolean;
  readonly redirectChain: string[];
  readonly timing: ResponseTiming;

  constructor(data: ResponseDataInit) {
    this.url = data.url;
    this.statusCode = data.statusCode;
    this.headers = data.headers;
    this.body = data.body;
    this.contentType = data.contentType;
    this.isHtml = data.isHtml;
    this.isJson = data.isJson;
    this.isXml = data.isXml;
    this.redirectChain = data.redirectChain;
    this.timing = data.timing;
  }

  /**
   * Checks if the response indicates success (2xx status code)
   */
  isSuccess(): boolean {
    return this.statusCode >= 200 && this.statusCode < 300;
  }

  /**
   * Checks if the response should trigger a retry (5xx, 429, 408)
   */
  shouldRetry(): boolean {
    return (
      this.statusCode >= 500 ||
      this.statusCode === 429 ||
      this.statusCode === 408
    );
  }
}

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
  sessionPoolOptions?: unknown;
  maxDepth?: number;
  sameDomainOnly?: boolean;
  respectRobotsTxt?: boolean;
  userAgent?: string;
  defaultHeaders?: Record<string, string>;
  preNavigationHooks?: PreNavigationHook[];
  postNavigationHooks?: PostNavigationHook[];
  failedRequestHandler?: FailedRequestHandler;
  logLevel?: "debug" | "info" | "warn" | "error" | "silent";
};

export type CrawlingContext = {
  request: RequestData;
  response: ResponseData;
  session?: SessionData;
  crawler: CrawlerInterface;
  enqueueLinks: (options?: EnqueueLinksOptions) => Promise<number>;
  pushData: (data: Record<string, unknown>) => void;
  log: LogInterface;
};

export type EnqueueLinksOptions = {
  selector?: string;
  baseUrl?: string;
  strategy?: "all" | "same-domain" | "same-hostname" | "same-origin";
  transformRequestFunction?: (
    request: RequestOptions,
  ) => RequestOptions | undefined;
  label?: string;
  userData?: Record<string, unknown>;
  priority?: number;
};

export type CrawlerInterface = {
  addRequests: (requests: RequestOptions[]) => void;
  getState: () => CrawlerState;
  pause: () => void;
  resume: () => void;
  abort: () => void;
};

export type CrawlerState = {
  status: "idle" | "running" | "paused" | "completed" | "aborted";
  requestsQueued: number;
  requestsProcessed: number;
  requestsFailed: number;
  requestsRetried: number;
  startedAt?: Date;
  completedAt?: Date;
};

export type PreNavigationHook = (
  context: PreNavigationContext,
) => Promise<void> | void;

export type PostNavigationHook = (
  context: CrawlingContext,
) => Promise<void> | void;

export type FailedRequestHandler = (
  context: FailedRequestContext,
) => Promise<void> | void;

export type PreNavigationContext = {
  request: RequestData;
  session?: SessionData;
  crawler: CrawlerInterface;
};

export type FailedRequestContext = {
  request: RequestData;
  error: Error;
  session?: SessionData;
  crawler: CrawlerInterface;
};

export type LogInterface = {
  debug: (message: string, data?: Record<string, unknown>) => void;
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
};

export type CrawlerStatistics = {
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
};

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

export type CrawlerEvent<T = unknown> = {
  type: CrawlerEventType;
  data: T;
  timestamp: Date;
};

export type CrawlerEventListener<T = unknown> = (
  event: CrawlerEvent<T>,
) => void;
