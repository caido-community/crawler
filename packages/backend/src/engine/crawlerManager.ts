/**
 * CrawlerManager - Bridge between HttpCrawler engine and job management
 * Provides a compatible interface for the existing job API
 */

import type { CrawlConfig, CrawlJob, CrawlJobStatus } from "shared";

import { HttpCrawler, type HttpCrawlerOptions } from "./crawlers/httpCrawler";
import { type Request } from "./request";
import type { CrawlerState, CrawlerStatistics } from "./types";

// ============================================================================
// Types
// ============================================================================

export interface CrawlStats {
  crawledUrls: number;
  discoveredUrls: number;
  queuedUrls: number;
  failedUrls: number;
  startedAt: Date;
  lastActivityAt: Date;
}

export interface CrawlCallbacks {
  onProgress?: (stats: CrawlStats) => void;
  onUrlCrawled?: (url: string, statusCode: number) => void;
  onUrlDiscovered?: (url: string) => void;
  onError?: (url: string, error: string) => void;
  onComplete?: (stats: CrawlStats) => void;
}

// ============================================================================
// Config Mapping
// ============================================================================

function mapConfigToOptions(
  config: CrawlConfig,
  targetUrl: string,
): HttpCrawlerOptions {
  return {
    // Rate limiting & concurrency
    maxRequestsPerMinute: Math.floor(60000 / Math.max(config.requestDelay, 1)),
    maxConcurrency: 5,
    minConcurrency: 1,

    // Limits
    maxRequestsPerCrawl: config.maxPagesPerDomain,
    maxDepth: config.maxDepth,

    // Behavior
    respectRobotsTxt: config.respectRobotsTxt,
    sameDomainOnly: config.crawlInScopeOnly,
    userAgent: config.userAgent,

    // Retries
    maxRequestRetries: 3,
    retryDelayMs: 1000,
    maxRetryDelayMs: 30000,

    // Timeouts
    requestHandlerTimeoutMs: 60000,
    navigationTimeoutMs: 30000,

    // Session
    useSessionPool: false,

    // Logging
    logLevel: "info",

    // Request handler - auto-crawl by default
    requestHandler: async (context) => {
      // Extract and enqueue links from the page
      await context.enqueueLinks({
        strategy: config.crawlInScopeOnly ? "same-domain" : "all",
      });
    },
  };
}

function getHost(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

// ============================================================================
// ManagedCrawler Class
// ============================================================================

/**
 * ManagedCrawler wraps HttpCrawler to provide job management interface
 */
export class ManagedCrawler {
  private jobId: string;
  private targetUrl: string;
  private host: string;
  private config: CrawlConfig;
  private crawler: HttpCrawler;
  private callbacks: CrawlCallbacks;
  private status: CrawlJobStatus = "pending";
  private startedAt: Date = new Date();
  private lastActivityAt: Date = new Date();
  private runPromise: Promise<CrawlerStatistics> | undefined;

  constructor(
    jobId: string,
    targetUrl: string,
    config: CrawlConfig,
    callbacks: CrawlCallbacks = {},
  ) {
    this.jobId = jobId;
    this.targetUrl = targetUrl;
    this.host = getHost(targetUrl) ?? "unknown";
    this.config = config;
    this.callbacks = callbacks;

    // Create the HttpCrawler with mapped options
    const options = mapConfigToOptions(config, targetUrl);
    this.crawler = new HttpCrawler(options);

    // Set up event handlers
    this.setupEventHandlers();

    // Add initial URL
    this.crawler.addRequests([targetUrl]);
  }

  private setupEventHandlers(): void {
    // Progress events
    this.crawler.on("requestCompleted", (event) => {
      this.lastActivityAt = new Date();

      const { request, response } = event.data as {
        request: Request;
        response: { statusCode: number };
      };
      this.callbacks.onUrlCrawled?.(request.url, response.statusCode);
      this.callbacks.onProgress?.(this.getStats());
    });

    this.crawler.on("requestQueued", (event) => {
      const request = event.data;
      this.callbacks.onUrlDiscovered?.(request.url);
    });

    this.crawler.on("requestFailed", (event) => {
      this.lastActivityAt = new Date();

      const { request, error } = event.data as {
        request: Request;
        error: Error;
      };
      this.callbacks.onError?.(request.url, error.message);
    });

    // Completion events
    this.crawler.on("crawlerCompleted", () => {
      if (this.status === "running") {
        this.status = "completed";
        this.callbacks.onComplete?.(this.getStats());
      }
    });

    this.crawler.on("crawlerAborted", () => {
      this.status = "completed";
      this.callbacks.onComplete?.(this.getStats());
    });
  }

  getJobId(): string {
    return this.jobId;
  }

  getHost(): string {
    return this.host;
  }

  getStatus(): CrawlJobStatus {
    return this.status;
  }

  getStats(): CrawlStats {
    const state = this.crawler.getState();
    const statistics = this.crawler.getStatistics();

    return {
      crawledUrls: statistics.requestsFinished,
      discoveredUrls: statistics.requestsTotal,
      queuedUrls: state.requestsQueued - state.requestsProcessed,
      failedUrls: statistics.requestsFailed,
      startedAt: this.startedAt,
      lastActivityAt: this.lastActivityAt,
    };
  }

  getJob(): CrawlJob {
    const stats = this.getStats();
    return {
      id: this.jobId,
      targetUrl: this.targetUrl,
      host: this.host,
      status: this.status,
      depth: this.config.maxDepth,
      discoveredUrls: stats.discoveredUrls,
      crawledUrls: stats.crawledUrls,
      startedAt: this.startedAt,
      completedAt:
        this.status === "completed" || this.status === "failed"
          ? this.lastActivityAt
          : undefined,
    };
  }

  getCrawlerState(): CrawlerState {
    return this.crawler.getState();
  }

  getCrawlerStatistics(): CrawlerStatistics {
    return this.crawler.getStatistics();
  }

  start(): Promise<void> {
    if (this.status === "running") {
      return Promise.resolve();
    }

    this.status = "running";
    this.startedAt = new Date();
    this.lastActivityAt = new Date();

    // Store the promise and return it for error handling
    this.runPromise = this.crawler.run();

    // Return a promise that the caller can catch
    return this.runPromise
      .then(() => {
        if (this.status === "running") {
          this.status = "completed";
        }
      })
      .catch((error) => {
        this.status = "failed";
        throw error; // Re-throw for caller to catch
      });
  }

  pause(): void {
    if (this.status === "running") {
      this.crawler.pause();
      this.status = "paused";
    }
  }

  resume(): void {
    if (this.status === "paused") {
      this.crawler.resume();
      this.status = "running";
    }
  }

  stop(): void {
    this.crawler.abort();
    this.status = "completed";
    this.callbacks.onComplete?.(this.getStats());
  }
}

// ============================================================================
// Registry (replaces activeCrawlers map)
// ============================================================================

const activeCrawlers = new Map<string, ManagedCrawler>();

export function getCrawler(jobId: string): ManagedCrawler | undefined {
  return activeCrawlers.get(jobId);
}

export function getAllCrawlers(): ManagedCrawler[] {
  return Array.from(activeCrawlers.values());
}

export function registerCrawler(crawler: ManagedCrawler): void {
  activeCrawlers.set(crawler.getJobId(), crawler);
}

export function unregisterCrawler(jobId: string): void {
  activeCrawlers.delete(jobId);
}

export function generateJobId(): string {
  return `crawl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
