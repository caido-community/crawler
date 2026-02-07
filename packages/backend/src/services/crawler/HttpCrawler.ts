/**
 * HttpCrawler - Core web crawling engine.
 * Handles request processing, rate limiting, session management, and link extraction.
 */

import {
  type AgentStatus,
  ConcurrencyPool,
  type CrawlerState,
  type CrawlerStatistics,
  DomainRateLimiter,
  type EnqueueLinksOptions,
  type LogInterface,
  Request,
  type RequestOptions,
  RequestQueue,
  type ResponseData,
  Router,
  SessionPool,
} from "../../models";
import type { Session } from "../../models/session";
import { CompositeExtractor, HtmlExtractor } from "../../parsers";
import { HttpClient } from "../../repositories";

import { CRAWLER_DEFAULTS } from "./constants";
import { filterLinksByStrategy, getDomain } from "./linkProcessor";
import { RobotsHandler } from "./robotsHandler";
import { StatsTracker } from "./statsTracker";
import type {
  CrawlerEventListener,
  CrawlerEventType,
  CrawlerInterface,
  CrawlerOptions,
  CrawlingContext,
  EventData,
  HttpCrawlerInternalOptions,
  LinkStrategy,
} from "./types";

/**
 * HTTP-based web crawler with support for:
 * - Concurrent request handling with configurable limits
 * - Per-domain rate limiting
 * - robots.txt compliance
 * - Session management with cookies
 * - Automatic link extraction and enqueuing
 * - Pre/post navigation hooks
 * - Event-based progress tracking
 */
export class HttpCrawler implements CrawlerInterface {
  private options: HttpCrawlerInternalOptions;
  private queue: RequestQueue;
  private httpClient: HttpClient;
  private pool: ConcurrencyPool;
  private rateLimiter: DomainRateLimiter;
  private sessionPool: SessionPool | undefined;
  private router: Router;
  private extractor: CompositeExtractor;
  private robotsHandler: RobotsHandler;
  private statsTracker: StatsTracker;

  private state: CrawlerState = {
    status: "idle",
    requestsQueued: 0,
    requestsProcessed: 0,
    requestsFailed: 0,
    requestsRetried: 0,
  };

  private eventListeners: Map<CrawlerEventType, CrawlerEventListener[]> =
    new Map();
  private log: LogInterface;
  private dataset: Record<string, unknown>[] = [];

  constructor(options: CrawlerOptions = {}) {
    this.options = this.mergeOptions(options);

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
      desiredConcurrency: this.options.maxConcurrency,
      taskTimeoutMs: this.options.requestHandlerTimeoutMs,
    });

    this.rateLimiter = new DomainRateLimiter({
      maxRequestsPerMinute: this.options.maxRequestsPerMinute,
      maxRequestsPerSecond: Math.ceil(this.options.maxRequestsPerMinute / 60),
    });

    if (this.options.useSessionPool) {
      this.sessionPool = new SessionPool(this.options.sessionPoolOptions);
    }

    this.robotsHandler = new RobotsHandler(
      this.httpClient,
      this.options.userAgent,
    );
    this.statsTracker = new StatsTracker();

    this.extractor = new CompositeExtractor();
    this.extractor.addExtractor(
      new HtmlExtractor({
        baseUrl: "",
        extractForms: true,
        extractEmails: true,
      }),
    );

    this.log = this.createLogger();
  }

  /**
   * Merges user options with defaults.
   */
  private mergeOptions(options: CrawlerOptions): HttpCrawlerInternalOptions {
    return {
      maxRequestsPerCrawl:
        options.maxRequestsPerCrawl ?? CRAWLER_DEFAULTS.MAX_REQUESTS_PER_CRAWL,
      maxRequestsPerMinute:
        options.maxRequestsPerMinute ??
        CRAWLER_DEFAULTS.MAX_REQUESTS_PER_MINUTE,
      requestHandlerTimeoutMs:
        options.requestHandlerTimeoutMs ??
        CRAWLER_DEFAULTS.REQUEST_HANDLER_TIMEOUT_MS,
      navigationTimeoutMs:
        options.navigationTimeoutMs ?? CRAWLER_DEFAULTS.NAVIGATION_TIMEOUT_MS,
      maxConcurrency:
        options.maxConcurrency ?? CRAWLER_DEFAULTS.MAX_CONCURRENCY,
      minConcurrency:
        options.minConcurrency ?? CRAWLER_DEFAULTS.MIN_CONCURRENCY,
      maxRequestRetries:
        options.maxRequestRetries ?? CRAWLER_DEFAULTS.MAX_REQUEST_RETRIES,
      retryDelayMs: options.retryDelayMs ?? CRAWLER_DEFAULTS.RETRY_DELAY_MS,
      maxRetryDelayMs:
        options.maxRetryDelayMs ?? CRAWLER_DEFAULTS.MAX_RETRY_DELAY_MS,
      useSessionPool: options.useSessionPool ?? false,
      sessionPoolOptions: options.sessionPoolOptions,
      maxDepth: options.maxDepth ?? CRAWLER_DEFAULTS.MAX_DEPTH,
      sameDomainOnly: options.sameDomainOnly ?? true,
      respectRobotsTxt: options.respectRobotsTxt ?? false,
      userAgent: options.userAgent ?? CRAWLER_DEFAULTS.USER_AGENT,
      defaultHeaders: options.defaultHeaders ?? {},
      preNavigationHooks: options.preNavigationHooks ?? [],
      postNavigationHooks: options.postNavigationHooks ?? [],
      failedRequestHandler: options.failedRequestHandler,
      logLevel: options.logLevel ?? CRAWLER_DEFAULTS.LOG_LEVEL,
      requestQueue: options.requestQueue ?? new RequestQueue(),
      router: options.router ?? new Router(),
      requestHandler: options.requestHandler,
    };
  }

  /**
   * Adds requests to the crawl queue.
   * @param requests - Array of URLs or request options to add to the queue
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
        this.statsTracker.recordRequestQueued();
        this.emit("requestQueued", request);
      }
    }
  }

  /**
   * Starts the crawler and processes all queued requests.
   * @returns Promise resolving to final crawl statistics when complete
   * @throws Error if crawler is already running
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
      this.statsTracker.setRuntimeMs(
        this.state.completedAt.getTime() - this.state.startedAt.getTime(),
      );
      this.emit("crawlerCompleted", this.statsTracker.getStats());
    }

    return this.statsTracker.getStats();
  }

  /**
   * Returns the current crawler state.
   * @returns Copy of the current crawler state object
   */
  getState(): CrawlerState {
    return { ...this.state };
  }

  /**
   * Pauses the crawler.
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
   * Resumes a paused crawler.
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
   * Aborts the crawler immediately.
   */
  abort(): void {
    this.state.status = "aborted";
    this.queue.clear();
    this.pool.abort();
    this.emit("crawlerAborted", undefined);
  }

  /**
   * Returns crawl statistics.
   * @returns Current crawl statistics including requests processed, failed, and timing
   */
  getStatistics(): CrawlerStatistics {
    return this.statsTracker.getStats();
  }

  /**
   * Returns collected data from pushData calls.
   * @returns Array of data objects collected during crawl
   */
  getData(): Record<string, unknown>[] {
    return [...this.dataset];
  }

  pauseAgent(agentId: number): void {
    this.pool.pauseSlot(agentId);
  }

  resumeAgent(agentId: number): void {
    this.pool.resumeSlot(agentId);
  }

  stopAgent(agentId: number): void {
    this.pool.stopSlot(agentId);
  }

  getAgentStatuses(): AgentStatus[] {
    return this.pool.getAgentStatuses();
  }

  /**
   * Registers an event listener.
   * @param event - Event type to listen for (e.g., 'requestCompleted', 'crawlerStarted')
   * @param listener - Callback function to invoke when event occurs
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
   * Removes an event listener.
   * @param event - Event type to stop listening for
   * @param listener - Previously registered callback function to remove
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

  /**
   * Main crawl loop - processes requests until queue is empty.
   */
  private async crawlLoop(): Promise<void> {
    let continueLoop = true;
    while (continueLoop && this.state.status === "running") {
      if (this.state.requestsProcessed >= this.options.maxRequestsPerCrawl) {
        break;
      }

      while (
        this.state.status === "running" &&
        this.state.requestsProcessed < this.options.maxRequestsPerCrawl &&
        (this.queue.hasNextRequest() || this.pool.hasTasks())
      ) {
        const request = this.queue.fetchNextRequest();
        if (request === undefined) {
          await this.delay(CRAWLER_DEFAULTS.CRAWL_LOOP_DELAY_MS);
          continue;
        }

        this.pool.addTask(async (slotId) => {
          await this.processRequest(request, slotId);
        });
      }

      while (this.pool.hasTasks()) {
        await this.delay(CRAWLER_DEFAULTS.CRAWL_LOOP_DELAY_MS);
      }

      if (this.queue.hasNextRequest()) {
        continue;
      }

      continueLoop = false;
    }
  }

  /**
   * Processes a single request.
   */
  private async processRequest(
    request: Request,
    slotId: number,
  ): Promise<void> {
    const domain = getDomain(request.url);

    try {
      // Check robots.txt if enabled
      if (this.options.respectRobotsTxt) {
        const isAllowed = await this.robotsHandler.isAllowed(request.url);
        if (!isAllowed) {
          this.queue.markRequestHandled(request);
          return;
        }
      }

      // Apply rate limiting
      await this.rateLimiter.acquire(domain);

      // Get session if using session pool
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

      // Send the request
      const response = await this.httpClient.send(request);

      this.statsTracker.recordResponseTiming(response);

      // Handle retryable responses
      if (response.shouldRetry() && request.canRetry()) {
        request.markFailed(`HTTP ${response.statusCode}`);
        this.queue.handleRequestFailure(request, `HTTP ${response.statusCode}`);
        this.state.requestsRetried++;
        this.statsTracker.recordRequestRetried();
        this.emit("requestRetried", request);
        return;
      }

      // Create context and run handler
      const context = this.createContext(request, response, session);

      if (this.options.requestHandler !== undefined) {
        await this.options.requestHandler(context);
      } else {
        await this.router.route(context);
      }

      // Run post-navigation hooks
      for (const hook of this.options.postNavigationHooks) {
        await hook(context);
      }

      this.queue.markRequestHandled(request);
      this.state.requestsProcessed++;
      this.statsTracker.recordRequestFinished();

      // Update session with cookies
      if (session !== undefined) {
        const setCookieHeaders = response.headers["set-cookie"];
        if (setCookieHeaders !== undefined) {
          session.setCookiesFromHeader(setCookieHeaders, domain);
        }
        session.recordSuccess();
      }

      this.emit("requestCompleted", { request, response, slotId });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.handleRequestError(request, err, slotId);
    }
  }

  /**
   * Handles a failed request.
   */
  private handleRequestError(
    request: Request,
    error: Error,
    slotId: number,
  ): void {
    this.log.error(`Request failed: ${request.url}`, { error: error.message });

    const errorType = error.constructor.name;
    this.statsTracker.recordError(errorType);

    if (request.canRetry()) {
      this.queue.handleRequestFailure(request, error.message);
      this.state.requestsRetried++;
      this.statsTracker.recordRequestRetried();
      this.emit("requestRetried", request);
    } else {
      this.queue.handleRequestFailure(request, error.message);
      this.state.requestsFailed++;
      this.statsTracker.recordRequestFailed();

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

      this.emit("requestFailed", { request, error, slotId });
    }
  }

  /**
   * Creates a crawling context for request handlers.
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
   * Extracts and enqueues links from a response.
   */
  private enqueueLinksInternal(
    request: Request,
    response: ResponseData,
    options: EnqueueLinksOptions,
  ): number {
    if (!response.isSuccess()) {
      return 0;
    }

    const htmlExtractor = new HtmlExtractor({
      baseUrl: options.baseUrl ?? response.url,
    });
    const tempExtractor = new CompositeExtractor();
    tempExtractor.addExtractor(htmlExtractor);

    const result = tempExtractor.extract(response);
    let links = result.links;

    // Filter links based on strategy
    links = filterLinksByStrategy(
      links,
      response.url,
      options.strategy as LinkStrategy | undefined,
      this.options.sameDomainOnly,
    );

    let added = 0;
    for (const link of links) {
      if (request.depth >= this.options.maxDepth) {
        continue;
      }

      let childOptions: RequestOptions = {
        url: link.url,
        label: options.label,
        userData: options.userData,
        priority: options.priority,
      };

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
        this.statsTracker.recordRequestQueued();
        this.emit("requestQueued", childRequest);
        added++;
      }
    }

    return added;
  }

  /**
   * Creates a logger based on configured log level.
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
   * Emits an event to all registered listeners.
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
   * Utility delay function.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
