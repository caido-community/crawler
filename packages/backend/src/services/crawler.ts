import type { CrawlConfig, CrawlJob, CrawlJobStatus, Result } from "shared";

import {
  ConcurrencyPool,
  type CrawlerState,
  type CrawlerStatistics,
  type CrawlingContext,
  DomainRateLimiter,
  type EnqueueLinksOptions,
  type ExtractedLink,
  type FailedRequestHandler,
  type LogInterface,
  type PostNavigationHook,
  type PreNavigationHook,
  Request,
  type RequestOptions,
  RequestQueue,
  type ResponseData,
  Router,
  SessionPool,
  type SessionPoolOptions,
} from "../models";
import type { Session } from "../models/session";
import { CompositeExtractor, HtmlExtractor, RobotsTxtParser } from "../parsers";
import {
  HttpClient,
  isSuccessResponse,
  shouldRetryResponse,
} from "../repositories";
import { configStore } from "../stores/configStore";
import { crawlerStore } from "../stores/crawlerStore";
import { jobsStore } from "../stores/jobsStore";

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
  logLevel?: "debug" | "info" | "warn" | "error" | "silent";
  requestQueue?: RequestQueue;
  requestHandler?: (context: CrawlingContext) => Promise<void>;
  router?: Router;
};

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

type CrawlerEventType = keyof EventData;
type CrawlerEventListener<T = unknown> = (event: {
  type: CrawlerEventType;
  data: T;
  timestamp: Date;
}) => void;

export class HttpCrawler {
  private options: Required<
    Omit<
      CrawlerOptions,
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

  private queue: RequestQueue;
  private httpClient: HttpClient;
  private pool: ConcurrencyPool;
  private rateLimiter: DomainRateLimiter;
  private sessionPool: SessionPool | undefined;
  private router: Router;
  private extractor: CompositeExtractor;
  private robotsParsers: Map<string, RobotsTxtParser> = new Map();
  private robotsFetching: Map<string, Promise<void>> = new Map();

  private state: CrawlerState = {
    status: "idle",
    requestsQueued: 0,
    requestsProcessed: 0,
    requestsFailed: 0,
    requestsRetried: 0,
  };

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

  private eventListeners: Map<CrawlerEventType, CrawlerEventListener[]> =
    new Map();
  private log: LogInterface;
  private dataset: Record<string, unknown>[] = [];

  constructor(options: CrawlerOptions = {}) {
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
      respectRobotsTxt: options.respectRobotsTxt ?? false, 
      userAgent: options.userAgent ?? "Caido-Crawler",
      defaultHeaders: options.defaultHeaders ?? {},
      preNavigationHooks: options.preNavigationHooks ?? [],
      postNavigationHooks: options.postNavigationHooks ?? [],
      failedRequestHandler: options.failedRequestHandler,
      logLevel: options.logLevel ?? "info",
      requestQueue: options.requestQueue ?? new RequestQueue(),
      router: options.router ?? new Router(),
      requestHandler: options.requestHandler,
    };

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
      this.sessionPool = new SessionPool(this.options.sessionPoolOptions);
    }

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

  getState(): CrawlerState {
    return { ...this.state };
  }

  pause(): void {
    if (this.state.status === "running") {
      this.state.status = "paused";
      this.queue.pause();
      this.pool.pause();
      this.emit("crawlerPaused", undefined);
    }
  }

  resume(): void {
    if (this.state.status === "paused") {
      this.state.status = "running";
      this.queue.resume();
      this.pool.resume();
      this.emit("crawlerResumed", undefined);
    }
  }

  abort(): void {
    this.state.status = "aborted";
    this.queue.clear();
    this.pool.abort();
    this.emit("crawlerAborted", undefined);
  }

  getStatistics(): CrawlerStatistics {
    return { ...this.statistics };
  }

  getData(): Record<string, unknown>[] {
    return [...this.dataset];
  }

  on<T extends CrawlerEventType>(
    event: T,
    listener: CrawlerEventListener<EventData[T]>,
  ): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener as CrawlerEventListener);
  }

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
          await this.delay(50);
          continue;
        }

        this.pool.addTask(async () => {
          await this.processRequest(request);
        });
      }

      while (this.pool.hasTasks()) {
        await this.delay(50);
      }

      if (this.queue.hasNextRequest()) {
        continue;
      }

      continueLoop = false;
    }
  }

  private async processRequest(request: Request): Promise<void> {
    const domain = this.getDomain(request.url);

    try {
      if (this.options.respectRobotsTxt) {
        const isAllowed = await this.checkRobotsTxt(request.url);
        if (!isAllowed) {
          this.queue.markRequestHandled(request);
          return;
        }
      }

      await this.rateLimiter.acquire(domain);

      const session = this.sessionPool?.getSession();

      for (const hook of this.options.preNavigationHooks) {
        await hook({
          request,
          session,
          crawler: this,
        });
      }

      this.emit("requestStarted", request);

      const response = await this.httpClient.send(request);

      this.updateStatistics(response);

      if (shouldRetryResponse(response) && request.canRetry()) {
        request.markFailed(`HTTP ${response.statusCode}`);
        this.queue.handleRequestFailure(request, `HTTP ${response.statusCode}`);
        this.state.requestsRetried++;
        this.statistics.requestsRetried++;
        this.emit("requestRetried", request);
        return;
      }

      const context = this.createContext(request, response, session);

      if (this.options.requestHandler !== undefined) {
        await this.options.requestHandler(context);
      } else {
        await this.router.route(context);
      }

      for (const hook of this.options.postNavigationHooks) {
        await hook(context);
      }

      this.queue.markRequestHandled(request);
      this.state.requestsProcessed++;
      this.statistics.requestsFinished++;

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

  private handleRequestError(request: Request, error: Error): void {
    this.log.error(`Request failed: ${request.url}`, { error: error.message });

    const errorType = error.constructor.name;
    this.statistics.errorsPerType[errorType] =
      (this.statistics.errorsPerType[errorType] ?? 0) + 1;

    if (request.canRetry()) {
      this.queue.handleRequestFailure(request, error.message);
      this.state.requestsRetried++;
      this.statistics.requestsRetried++;
      this.emit("requestRetried", request);
    } else {
      this.queue.handleRequestFailure(request, error.message);
      this.state.requestsFailed++;
      this.statistics.requestsFailed++;

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

  private enqueueLinksInternal(
    request: Request,
    response: ResponseData,
    options: EnqueueLinksOptions,
  ): number {
    if (!isSuccessResponse(response)) {
      return 0;
    }

    const htmlExtractor = new HtmlExtractor({
      baseUrl: options.baseUrl ?? request.url,
    });
    const tempExtractor = new CompositeExtractor();
    tempExtractor.addExtractor(htmlExtractor);

    const result = tempExtractor.extract(response);
    let links = result.links;

    links = this.filterLinksByStrategy(links, request.url, options.strategy);

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
        this.statistics.requestsTotal++;
        this.emit("requestQueued", childRequest);
        added++;
      }
    }

    return added;
  }

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

  private getRootDomain(hostname: string): string {
    const parts = hostname.split(".");
    if (parts.length <= 2) {
      return hostname;
    }
    return parts.slice(-2).join(".");
  }

  private async checkRobotsTxt(url: string): Promise<boolean> {
    const domain = this.getDomain(url);

    let parser = this.robotsParsers.get(domain);
    if (parser !== undefined) {
      return parser.isAllowed(url);
    }

    const fetchingPromise = this.robotsFetching.get(domain);
    if (fetchingPromise !== undefined) {
      await fetchingPromise;
      parser = this.robotsParsers.get(domain);
      return parser?.isAllowed(url) ?? true;
    }

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
      /* empty */
    }

    this.robotsParsers.set(domain, parser);
  }

  private getDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

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

    const statusCode = response.statusCode;
    this.statistics.requestsWithStatusCode[statusCode] =
      (this.statistics.requestsWithStatusCode[statusCode] ?? 0) + 1;
  }

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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function getHost(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function generateJobId(): string {
  return `crawl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function mapConfigToOptions(
  config: CrawlConfig,
  isManual = false,
): CrawlerOptions {
  // Manual crawls ignore crawlInScopeOnly and crawl all links
  // Auto-crawls respect crawlInScopeOnly setting
  const useScopeFilter = isManual ? false : config.crawlInScopeOnly;

  return {
    maxRequestsPerMinute: Math.floor(60000 / Math.max(config.requestDelay, 1)),
    maxConcurrency: 5,
    minConcurrency: 1,
    maxRequestsPerCrawl: config.maxPagesPerDomain,
    maxDepth: config.maxDepth,
    respectRobotsTxt: config.respectRobotsTxt,
    sameDomainOnly: useScopeFilter,
    userAgent: config.userAgent,
    maxRequestRetries: 3,
    retryDelayMs: 1000,
    maxRetryDelayMs: 30000,
    requestHandlerTimeoutMs: 60000,
    navigationTimeoutMs: 30000,
    useSessionPool: false,
    logLevel: "info",
    requestHandler: async (context) => {
      await context.enqueueLinks({
        strategy: useScopeFilter ? "same-domain" : "all",
      });
    },
  };
}

export type CrawlStats = {
  crawledUrls: number;
  discoveredUrls: number;
  queuedUrls: number;
  failedUrls: number;
  startedAt: Date;
  lastActivityAt: Date;
};

export type StartCrawlCallbacks = {
  onProgress?: (stats: CrawlStats, jobId: string) => void;
  onUrlCrawled?: (url: string, statusCode: number) => void;
  onUrlDiscovered?: (url: string) => void;
  onError?: (url: string, error: string) => void;
  onComplete?: (stats: CrawlStats, jobId: string) => void;
};

class CrawlerServiceClass {
  start(
    targetUrl: string,
    callbacks: StartCrawlCallbacks = {},
    isManual = false,
  ): Result<{ job: CrawlJob; jobId: string }> {
    const host = getHost(targetUrl);
    if (host === undefined) {
      return { kind: "Error", error: "Invalid URL provided." };
    }

    const existingJob = jobsStore.getJobByHost(host);
    if (existingJob !== undefined) {
      return {
        kind: "Error",
        error: `A crawl job is already running for ${host}.`,
      };
    }

    const config = configStore.getConfig();
    const jobId = generateJobId();
    const options = mapConfigToOptions(config, isManual);

    const crawler = new HttpCrawler(options);
    const startedAt = new Date();
    let lastActivityAt = new Date();
    let status: CrawlJobStatus = "running";

    const getStats = (): CrawlStats => {
      const state = crawler.getState();
      const statistics = crawler.getStatistics();
      return {
        crawledUrls: statistics.requestsFinished,
        discoveredUrls: statistics.requestsTotal,
        queuedUrls: state.requestsQueued - state.requestsProcessed,
        failedUrls: statistics.requestsFailed,
        startedAt,
        lastActivityAt,
      };
    };

    crawler.on("requestCompleted", (event) => {
      lastActivityAt = new Date();
      const { request, response } = event.data as {
        request: Request;
        response: { statusCode: number };
      };
      callbacks.onUrlCrawled?.(request.url, response.statusCode);
      callbacks.onProgress?.(getStats(), jobId);
    });

    crawler.on("requestQueued", (event) => {
      const request = event.data;
      callbacks.onUrlDiscovered?.(request.url);
    });

    crawler.on("requestFailed", (event) => {
      lastActivityAt = new Date();
      const { request, error } = event.data as {
        request: Request;
        error: Error;
      };
      callbacks.onError?.(request.url, error.message);
    });

    crawler.on("crawlerCompleted", () => {
      if (status === "running") {
        status = "completed";
        callbacks.onComplete?.(getStats(), jobId);
      }
    });

    crawler.on("crawlerAborted", () => {
      status = "completed";
      callbacks.onComplete?.(getStats(), jobId);
    });

    crawler.addRequests([targetUrl]);
    crawlerStore.register(jobId, crawler);

    const job: CrawlJob = {
      id: jobId,
      targetUrl,
      host,
      status: "running",
      depth: config.maxDepth,
      discoveredUrls: 0,
      crawledUrls: 0,
      startedAt,
      completedAt: undefined,
    };

    jobsStore.addJob(job);

    crawler
      .run()
      .then(() => {
        if (status === "running") {
          status = "completed";
        }
      })
      .catch(() => {
        status = "failed";
      });

    return { kind: "Ok", value: { job, jobId } };
  }

  stop(jobId: string): Result<{ totalUrls: number }> {
    const crawler = crawlerStore.get(jobId);
    if (crawler === undefined) {
      const job = jobsStore.getJob(jobId);
      if (job !== undefined) {
        jobsStore.updateJob(jobId, {
          status: "completed",
          completedAt: new Date(),
        });
        return { kind: "Ok", value: { totalUrls: job.crawledUrls } };
      }
      return { kind: "Error", error: "Job not found." };
    }

    crawler.abort();
    const stats = crawler.getStatistics();

    jobsStore.updateJob(jobId, {
      status: "completed",
      completedAt: new Date(),
    });
    crawlerStore.unregister(jobId);

    return { kind: "Ok", value: { totalUrls: stats.requestsFinished } };
  }

  pause(jobId: string): Result<undefined> {
    const crawler = crawlerStore.get(jobId);
    if (crawler === undefined) {
      return { kind: "Error", error: "Job not found or not running." };
    }

    crawler.pause();
    jobsStore.updateJob(jobId, { status: "paused" });

    return { kind: "Ok", value: undefined };
  }

  resume(jobId: string): Result<undefined> {
    const crawler = crawlerStore.get(jobId);
    if (crawler === undefined) {
      return { kind: "Error", error: "Job not found or not running." };
    }

    crawler.resume();
    jobsStore.updateJob(jobId, { status: "running" });

    return { kind: "Ok", value: undefined };
  }

  getJob(jobId: string): Result<CrawlJob> {
    const crawler = crawlerStore.get(jobId);
    if (crawler !== undefined) {
      const stats = crawler.getStatistics();
      const storedJob = jobsStore.getJob(jobId);

      if (storedJob !== undefined) {
        return {
          kind: "Ok",
          value: {
            ...storedJob,
            crawledUrls: stats.requestsFinished,
            discoveredUrls: stats.requestsTotal,
          },
        };
      }
    }

    const job = jobsStore.getJob(jobId);
    if (job === undefined) {
      return { kind: "Error", error: "Job not found." };
    }

    return { kind: "Ok", value: job };
  }

  getJobs(): Result<CrawlJob[]> {
    const storedJobs = jobsStore.getJobs();

    const updatedJobs = storedJobs.map((job) => {
      const crawler = crawlerStore.get(job.id);
      if (crawler !== undefined) {
        const stats = crawler.getStatistics();
        return {
          ...job,
          crawledUrls: stats.requestsFinished,
          discoveredUrls: stats.requestsTotal,
        };
      }
      return job;
    });

    return { kind: "Ok", value: updatedJobs };
  }

  delete(jobId: string): Result<undefined> {
    const crawler = crawlerStore.get(jobId);
    if (crawler !== undefined) {
      crawler.abort();
      crawlerStore.unregister(jobId);
    }

    jobsStore.removeJob(jobId);
    return { kind: "Ok", value: undefined };
  }

  clearCompleted(): Result<undefined> {
    jobsStore.clearCompletedJobs();
    return { kind: "Ok", value: undefined };
  }

  clearAll(): Result<undefined> {
    const crawlers = crawlerStore.getAll();
    for (const crawler of crawlers) {
      crawler.abort();
    }
    crawlerStore.clear();
    jobsStore.clearAllJobs();
    return { kind: "Ok", value: undefined };
  }
}

export const CrawlerService = new CrawlerServiceClass();
