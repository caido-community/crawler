/**
 * HttpCrawler - Main HTTP-based crawler engine
 */

import { ConcurrencyPool } from "../concurrency/pool";
import { DomainRateLimiter } from "../concurrency/rateLimiter";
import { CompositeExtractor } from "../extractors/baseExtractor";
import { HtmlExtractor } from "../extractors/htmlExtractor";
import { RobotsTxtParser } from "../extractors/robotsTxtParser";
import { SitemapExtractor } from "../extractors/sitemapExtractor";
import {
  HttpClient,
  isSuccessResponse,
  shouldRetryResponse,
} from "../http/httpClient";
import { Request } from "../request";
import { RequestQueue } from "../requestQueue";
import { Router } from "../router/router";
import { type Session } from "../session/session";
import { SessionPool, type SessionPoolOptions } from "../session/sessionPool";
import type {
  CrawlerEventListener,
  CrawlerEventType,
  CrawlerInterface,
  CrawlerOptions,
  CrawlerState,
  CrawlerStatistics,
  CrawlingContext,
  EnqueueLinksOptions,
  ExtractedLink,
  FailedRequestHandler,
  LogInterface,
  PostNavigationHook,
  PreNavigationHook,
  RequestOptions,
  ResponseData,
} from "../types";

// ============================================================================
// Types
// ============================================================================

export interface HttpCrawlerOptions extends CrawlerOptions {
  requestQueue?: RequestQueue;
  requestHandler?: (context: CrawlingContext) => Promise<void>;
  router?: Router;
}

type EventData = {
  requestQueued: Request;
  requestStarted: Request;
  requestCompleted: { request: Request; response: ResponseData };
  requestFailed: { request: Request; error: Error };
  requestRetried: Request;
  sessionCreated: Session;
  sessionRetired: Session;
  crawlerStarted: undefined;
  crawlerPaused: undefined;
  crawlerResumed: undefined;
  crawlerCompleted: CrawlerStatistics;
  crawlerAborted: undefined;
};

// ============================================================================
// HttpCrawler Class
// ============================================================================

export class HttpCrawler implements CrawlerInterface {
  private options: Required<
    Omit<
      HttpCrawlerOptions,
      | "requestQueue"
      | "router"
      | "requestHandler"
      | "preNavigationHooks"
      | "postNavigationHooks"
      | "failedRequestHandler"
      | "sessionPoolOptions"
    >
  > & {
    requestQueue: RequestQueue;
    router: Router;
    requestHandler?: (context: CrawlingContext) => Promise<void>;
    preNavigationHooks: PreNavigationHook[];
    postNavigationHooks: PostNavigationHook[];
    failedRequestHandler?: FailedRequestHandler;
    sessionPoolOptions: CrawlerOptions["sessionPoolOptions"];
  };

  // Core components
  private queue: RequestQueue;
  private httpClient: HttpClient;
  private pool: ConcurrencyPool;
  private rateLimiter: DomainRateLimiter;
  private sessionPool: SessionPool | undefined;
  private router: Router;
  private extractor: CompositeExtractor;

  // Robots.txt cache per domain
  private robotsParsers: Map<string, RobotsTxtParser> = new Map();
  private robotsFetching: Map<string, Promise<void>> = new Map();

  // State
  private state: CrawlerState = {
    status: "idle",
    requestsQueued: 0,
    requestsProcessed: 0,
    requestsFailed: 0,
    requestsRetried: 0,
  };

  // Statistics
  private statistics: CrawlerStatistics = {
    requestsFinished: 0,
    requestsFailed: 0,
    requestsRetried: 0,
    requestsTotal: 0,
    requestsPerMinute: 0,
    requestsPerSecond: 0,
    avgResponseTimeMs: 0,
    maxResponseTimeMs: 0,
    minResponseTimeMs: Infinity,
    totalResponseTimeMs: 0,
    crawlerRuntimeMs: 0,
    requestsWithStatusCode: {},
    errorsPerType: {},
  };

  // Event emitter
  private eventListeners: Map<CrawlerEventType, CrawlerEventListener[]> =
    new Map();

  // Logger
  private log: LogInterface;

  // Collected data
  private dataset: Record<string, unknown>[] = [];

  constructor(options: HttpCrawlerOptions = {}) {
    // Initialize options with defaults
    this.options = {
      maxRequestsPerCrawl: options.maxRequestsPerCrawl ?? Infinity,
      maxRequestsPerMinute: options.maxRequestsPerMinute ?? 120,
      requestHandlerTimeoutMs: options.requestHandlerTimeoutMs ?? 60000,
      navigationTimeoutMs: options.navigationTimeoutMs ?? 30000,
      maxConcurrency: options.maxConcurrency ?? 5,
      minConcurrency: options.minConcurrency ?? 1,
      maxRequestRetries: options.maxRequestRetries ?? 3,
      retryDelayMs: options.retryDelayMs ?? 1000,
      maxRetryDelayMs: options.maxRetryDelayMs ?? 30000,
      useSessionPool: options.useSessionPool ?? false,
      sessionPoolOptions: options.sessionPoolOptions,
      maxDepth: options.maxDepth ?? 10,
      sameDomainOnly: options.sameDomainOnly ?? true,
      respectRobotsTxt: options.respectRobotsTxt ?? true,
      userAgent: options.userAgent ?? "Caido Crawler/1.0",
      defaultHeaders: options.defaultHeaders ?? {},
      preNavigationHooks: options.preNavigationHooks ?? [],
      postNavigationHooks: options.postNavigationHooks ?? [],
      failedRequestHandler: options.failedRequestHandler,
      logLevel: options.logLevel ?? "info",
      requestQueue: options.requestQueue ?? new RequestQueue(),
      router: options.router ?? new Router(),
      requestHandler: options.requestHandler,
    };

    // Initialize components
    this.queue = this.options.requestQueue;
    this.router = this.options.router;

    this.httpClient = new HttpClient({
      userAgent: this.options.userAgent,
      defaultHeaders: this.options.defaultHeaders,
      timeouts: {
        global: this.options.navigationTimeoutMs,
      },
    });

    this.pool = new ConcurrencyPool({
      maxConcurrency: this.options.maxConcurrency,
      minConcurrency: this.options.minConcurrency,
      taskTimeoutMs: this.options.requestHandlerTimeoutMs,
    });

    this.rateLimiter = new DomainRateLimiter({
      maxRequestsPerMinute: this.options.maxRequestsPerMinute,
      maxRequestsPerSecond: Math.ceil(this.options.maxRequestsPerMinute / 60),
    });

    if (this.options.useSessionPool) {
      this.sessionPool = new SessionPool(
        this.options.sessionPoolOptions as SessionPoolOptions | undefined,
      );
    }

    // Set up extractor
    this.extractor = new CompositeExtractor();
    this.extractor.addExtractor(
      new HtmlExtractor({
        baseUrl: "",
        extractForms: true,
        extractEmails: true,
      }),
    );
    this.extractor.addExtractor(new SitemapExtractor({ baseUrl: "" }));

    // Set up logger
    this.log = this.createLogger();
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Adds requests to the queue
   */
  addRequests(requests: (RequestOptions | string)[]): void {
    for (const reqOrUrl of requests) {
      const options: RequestOptions =
        typeof reqOrUrl === "string"
          ? { url: reqOrUrl, maxRetries: this.options.maxRequestRetries }
          : {
              ...reqOrUrl,
              maxRetries: reqOrUrl.maxRetries ?? this.options.maxRequestRetries,
            };
      const request = new Request(options);

      if (this.queue.add(request)) {
        this.state.requestsQueued++;
        this.statistics.requestsTotal++;
        this.emit("requestQueued", request);
      }
    }
  }

  /**
   * Starts the crawler
   */
  async run(): Promise<CrawlerStatistics> {
    if (this.state.status === "running") {
      throw new Error("Crawler is already running");
    }

    this.state.status = "running";
    this.state.startedAt = new Date();
    this.emit("crawlerStarted", undefined);

    this.pool.start();

    try {
      await this.crawlLoop();
    } finally {
      await this.pool.stop();
      this.state.status = "completed";
      this.state.completedAt = new Date();
      this.statistics.crawlerRuntimeMs =
        this.state.completedAt.getTime() - this.state.startedAt.getTime();
      this.emit("crawlerCompleted", this.statistics);
    }

    return this.statistics;
  }

  /**
   * Gets the current state
   */
  getState(): CrawlerState {
    return { ...this.state };
  }

  /**
   * Pauses the crawler
   */
  pause(): void {
    if (this.state.status === "running") {
      this.state.status = "paused";
      this.queue.pause();
      this.pool.pause();
      this.emit("crawlerPaused", undefined);
    }
  }

  /**
   * Resumes the crawler
   */
  resume(): void {
    if (this.state.status === "paused") {
      this.state.status = "running";
      this.queue.resume();
      this.pool.resume();
      this.emit("crawlerResumed", undefined);
    }
  }

  /**
   * Aborts the crawler
   */
  abort(): void {
    this.state.status = "aborted";
    this.queue.clear();
    this.pool.abort();
    this.emit("crawlerAborted", undefined);
  }

  /**
   * Gets statistics
   */
  getStatistics(): CrawlerStatistics {
    return { ...this.statistics };
  }

  /**
   * Gets collected data
   */
  getData(): Record<string, unknown>[] {
    return [...this.dataset];
  }

  /**
   * Adds event listener
   */
  on<T extends CrawlerEventType>(
    event: T,
    listener: CrawlerEventListener<EventData[T]>,
  ): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener as CrawlerEventListener);
  }

  /**
   * Removes event listener
   */
  off<T extends CrawlerEventType>(
    event: T,
    listener: CrawlerEventListener<EventData[T]>,
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners !== undefined) {
      const index = listeners.indexOf(listener as CrawlerEventListener);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Main crawl loop
   */
  private async crawlLoop(): Promise<void> {
    while (
      this.state.status === "running" &&
      (this.queue.hasNextRequest() || this.pool.hasTasks())
    ) {
      // Check if we've hit the max requests limit
      if (this.state.requestsProcessed >= this.options.maxRequestsPerCrawl) {
        break;
      }

      // Get next request
      const request = this.queue.fetchNextRequest();
      if (request === undefined) {
        // Wait a bit before checking again
        await this.delay(100);
        continue;
      }

      // Add task to pool
      this.pool.addTask(async () => {
        await this.processRequest(request);
      });
    }

    // Wait for all tasks to complete
    while (this.pool.hasTasks()) {
      await this.delay(100);
    }
  }

  /**
   * Processes a single request
   */
  private async processRequest(request: Request): Promise<void> {
    const domain = this.getDomain(request.url);

    try {
      // Check robots.txt
      if (this.options.respectRobotsTxt) {
        const isAllowed = await this.checkRobotsTxt(request.url);
        if (!isAllowed) {
          this.log.debug(`Blocked by robots.txt: ${request.url}`);
          this.queue.markRequestHandled(request);
          return;
        }
      }

      // Rate limit
      await this.rateLimiter.acquire(domain);

      // Get session
      const session = this.sessionPool?.getSession();

      // Run pre-navigation hooks
      for (const hook of this.options.preNavigationHooks) {
        await hook({
          request,
          session,
          crawler: this,
        });
      }

      this.emit("requestStarted", request);

      // Make request
      const response = await this.httpClient.send(request);

      // Update statistics
      this.updateStatistics(response);

      // Check if should retry
      if (shouldRetryResponse(response) && request.canRetry()) {
        request.markFailed(`HTTP ${response.statusCode}`);
        this.queue.handleRequestFailure(request, `HTTP ${response.statusCode}`);
        this.state.requestsRetried++;
        this.statistics.requestsRetried++;
        this.emit("requestRetried", request);
        return;
      }

      // Create context
      const context = this.createContext(request, response, session);

      // Run request handler or router
      if (this.options.requestHandler !== undefined) {
        await this.options.requestHandler(context);
      } else {
        await this.router.route(context);
      }

      // Run post-navigation hooks
      for (const hook of this.options.postNavigationHooks) {
        await hook(context);
      }

      // Mark as handled
      this.queue.markRequestHandled(request);
      this.state.requestsProcessed++;
      this.statistics.requestsFinished++;

      // Update session
      if (session !== undefined) {
        const setCookieHeaders = response.headers["set-cookie"];
        if (setCookieHeaders !== undefined) {
          session.setCookiesFromHeader(setCookieHeaders, domain);
        }
        session.recordSuccess();
      }

      this.emit("requestCompleted", { request, response });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.handleRequestError(request, err);
    }
  }

  /**
   * Handles request errors
   */
  private handleRequestError(request: Request, error: Error): void {
    this.log.error(`Request failed: ${request.url}`, { error: error.message });

    // Record error type
    const errorType = error.constructor.name;
    this.statistics.errorsPerType[errorType] =
      (this.statistics.errorsPerType[errorType] ?? 0) + 1;

    // Check if should retry
    if (request.canRetry()) {
      this.queue.handleRequestFailure(request, error.message);
      this.state.requestsRetried++;
      this.statistics.requestsRetried++;
      this.emit("requestRetried", request);
    } else {
      this.queue.handleRequestFailure(request, error.message);
      this.state.requestsFailed++;
      this.statistics.requestsFailed++;

      // Call failed request handler
      if (this.options.failedRequestHandler !== undefined) {
        const result = this.options.failedRequestHandler({
          request,
          error,
          crawler: this,
        });
        if (result instanceof Promise) {
          result.catch((e: unknown) => {
            this.log.error(`Failed request handler error: ${String(e)}`);
          });
        }
      }

      this.emit("requestFailed", { request, error });
    }
  }

  /**
   * Creates a crawling context
   */
  private createContext(
    request: Request,
    response: ResponseData,
    session?: Session,
  ): CrawlingContext {
    return {
      request,
      response,
      session,
      crawler: this,
      log: this.log,

      enqueueLinks: (options: EnqueueLinksOptions = {}): Promise<number> => {
        return Promise.resolve(
          this.enqueueLinksInternal(request, response, options),
        );
      },

      pushData: (data: Record<string, unknown>): void => {
        this.dataset.push(data);
      },
    };
  }

  /**
   * Internal method to enqueue links from a response
   */
  private enqueueLinksInternal(
    request: Request,
    response: ResponseData,
    options: EnqueueLinksOptions,
  ): number {
    if (!isSuccessResponse(response)) {
      return 0;
    }

    // Update extractor base URL
    const htmlExtractor = new HtmlExtractor({
      baseUrl: options.baseUrl ?? request.url,
    });
    const tempExtractor = new CompositeExtractor();
    tempExtractor.addExtractor(htmlExtractor);

    // Extract links
    const result = tempExtractor.extract(response);
    let links = result.links;

    // Filter by strategy
    links = this.filterLinksByStrategy(links, request.url, options.strategy);

    // Transform links
    let added = 0;
    for (const link of links) {
      // Check depth
      if (request.depth >= this.options.maxDepth) {
        continue;
      }

      // Create child request
      let childOptions: RequestOptions = {
        url: link.url,
        label: options.label,
        userData: options.userData,
        priority: options.priority,
      };

      // Apply transform function
      if (options.transformRequestFunction !== undefined) {
        const transformed = options.transformRequestFunction(childOptions);
        if (transformed === undefined) {
          continue;
        }
        childOptions = transformed;
      }

      const childRequest = request.createChildRequest(childOptions);
      if (this.queue.add(childRequest)) {
        this.state.requestsQueued++;
        this.statistics.requestsTotal++;
        this.emit("requestQueued", childRequest);
        added++;
      }
    }

    return added;
  }

  /**
   * Filters links by strategy
   */
  private filterLinksByStrategy(
    links: ExtractedLink[],
    baseUrl: string,
    strategy?: EnqueueLinksOptions["strategy"],
  ): ExtractedLink[] {
    if (strategy === undefined || strategy === "all") {
      if (this.options.sameDomainOnly) {
        return this.filterSameDomain(links, baseUrl);
      }
      return links;
    }

    const baseUrlObj = new URL(baseUrl);

    switch (strategy) {
      case "same-domain":
        return links.filter((link) => {
          try {
            const linkUrl = new URL(link.url);
            const baseDomain = this.getRootDomain(baseUrlObj.hostname);
            const linkDomain = this.getRootDomain(linkUrl.hostname);
            return baseDomain === linkDomain;
          } catch {
            return false;
          }
        });

      case "same-hostname":
        return links.filter((link) => {
          try {
            const linkUrl = new URL(link.url);
            return linkUrl.hostname === baseUrlObj.hostname;
          } catch {
            return false;
          }
        });

      case "same-origin":
        return links.filter((link) => {
          try {
            const linkUrl = new URL(link.url);
            return linkUrl.origin === baseUrlObj.origin;
          } catch {
            return false;
          }
        });

      default:
        return links;
    }
  }

  /**
   * Filters links to same domain
   */
  private filterSameDomain(
    links: ExtractedLink[],
    baseUrl: string,
  ): ExtractedLink[] {
    try {
      const baseUrlObj = new URL(baseUrl);
      const baseDomain = this.getRootDomain(baseUrlObj.hostname);

      return links.filter((link) => {
        try {
          const linkUrl = new URL(link.url);
          const linkDomain = this.getRootDomain(linkUrl.hostname);
          return baseDomain === linkDomain;
        } catch {
          return false;
        }
      });
    } catch {
      return links;
    }
  }

  /**
   * Gets the root domain from a hostname
   */
  private getRootDomain(hostname: string): string {
    const parts = hostname.split(".");
    if (parts.length <= 2) {
      return hostname;
    }
    // Handle common TLDs like .co.uk
    return parts.slice(-2).join(".");
  }

  /**
   * Checks robots.txt for a URL
   */
  private async checkRobotsTxt(url: string): Promise<boolean> {
    const domain = this.getDomain(url);

    // Check if already parsed
    let parser = this.robotsParsers.get(domain);
    if (parser !== undefined) {
      return parser.isAllowed(url);
    }

    // Check if currently fetching
    const fetchingPromise = this.robotsFetching.get(domain);
    if (fetchingPromise !== undefined) {
      await fetchingPromise;
      parser = this.robotsParsers.get(domain);
      return parser?.isAllowed(url) ?? true;
    }

    // Fetch robots.txt
    const fetchPromise = this.fetchRobotsTxt(domain);
    this.robotsFetching.set(domain, fetchPromise);

    try {
      await fetchPromise;
    } finally {
      this.robotsFetching.delete(domain);
    }

    parser = this.robotsParsers.get(domain);
    return parser?.isAllowed(url) ?? true;
  }

  /**
   * Fetches and parses robots.txt for a domain
   */
  private async fetchRobotsTxt(domain: string): Promise<void> {
    const robotsUrl = `https://${domain}/robots.txt`;
    const parser = new RobotsTxtParser({ userAgent: this.options.userAgent });

    try {
      const response = await this.httpClient.get(robotsUrl, {
        saveToHistory: false,
      });

      if (isSuccessResponse(response)) {
        parser.parse(response.body);
      }
    } catch {
      // Ignore errors - assume everything is allowed
    }

    this.robotsParsers.set(domain, parser);
  }

  /**
   * Gets domain from URL
   */
  private getDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  /**
   * Updates statistics from response
   */
  private updateStatistics(response: ResponseData): void {
    const duration = response.timing.durationMs;

    this.statistics.totalResponseTimeMs += duration;
    this.statistics.avgResponseTimeMs =
      this.statistics.totalResponseTimeMs /
      (this.statistics.requestsFinished + 1);

    if (duration > this.statistics.maxResponseTimeMs) {
      this.statistics.maxResponseTimeMs = duration;
    }
    if (duration < this.statistics.minResponseTimeMs) {
      this.statistics.minResponseTimeMs = duration;
    }

    // Track status codes
    const statusCode = response.statusCode;
    this.statistics.requestsWithStatusCode[statusCode] =
      (this.statistics.requestsWithStatusCode[statusCode] ?? 0) + 1;
  }

  /**
   * Creates logger
   */
  private createLogger(): LogInterface {
    const level = this.options.logLevel;

    const shouldLog = (msgLevel: string): boolean => {
      const levels = ["debug", "info", "warn", "error", "silent"];
      return levels.indexOf(msgLevel) >= levels.indexOf(level);
    };

    const formatLog = (
      prefix: string,
      message: string,
      data?: Record<string, unknown>,
    ): string => {
      if (data !== undefined && Object.keys(data).length > 0) {
        return `${prefix} ${message} ${JSON.stringify(data)}`;
      }
      return `${prefix} ${message}`;
    };

    return {
      debug: (message: string, data?: Record<string, unknown>) => {
        if (shouldLog("debug")) {
          console.log(formatLog("[DEBUG]", message, data));
        }
      },
      info: (message: string, data?: Record<string, unknown>) => {
        if (shouldLog("info")) {
          console.log(formatLog("[INFO]", message, data));
        }
      },
      warn: (message: string, data?: Record<string, unknown>) => {
        if (shouldLog("warn")) {
          console.warn(formatLog("[WARN]", message, data));
        }
      },
      error: (message: string, data?: Record<string, unknown>) => {
        if (shouldLog("error")) {
          console.error(formatLog("[ERROR]", message, data));
        }
      },
    };
  }

  /**
   * Emits an event
   */
  private emit<T extends CrawlerEventType>(type: T, data: EventData[T]): void {
    const listeners = this.eventListeners.get(type);
    if (listeners !== undefined) {
      for (const listener of listeners) {
        try {
          listener({ type, data, timestamp: new Date() });
        } catch (error) {
          this.log.error("Event listener error", { error: String(error) });
        }
      }
    }
  }

  /**
   * Delays for milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
