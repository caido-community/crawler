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

export type ResponseData = {
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
};

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

export type ExtractedLink = {
  url: string;
  source: UrlSource;
  text?: string;
  attributes?: Record<string, string>;
};

export type ExtractionResult = {
  links: ExtractedLink[];
  forms: ExtractedForm[];
  emails: string[];
  metadata: PageMetadata;
};

export type ExtractedForm = {
  action: string;
  method: RequestMethod;
  inputs: FormInput[];
  id?: string;
  name?: string;
};

export type FormInput = {
  name: string;
  type: string;
  value?: string;
  required: boolean;
  options?: string[];
};

export type PageMetadata = {
  title?: string;
  description?: string;
  keywords?: string[];
  canonical?: string;
  language?: string;
  robotsMeta?: string;
};

export type SitemapUrl = {
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
};

export type Sitemap = {
  urls: SitemapUrl[];
  sitemaps: string[];
};

export type RobotsTxt = {
  rules: RobotsRule[];
  sitemaps: string[];
  crawlDelay?: number;
};

export type RobotsRule = {
  userAgent: string;
  allow: string[];
  disallow: string[];
};

export type SessionData = {
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
};

export type Cookie = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
};

export type PoolOptions = {
  maxConcurrency: number;
  minConcurrency: number;
  desiredConcurrency: number;
  scaleUpStepRatio: number;
  scaleDownStepRatio: number;
  maybeRunIntervalMs: number;
};

export type RouteHandler = (context: CrawlingContext) => Promise<void>;

export type Route = {
  pattern: string | RegExp;
  handler: RouteHandler;
  label?: string;
};

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
