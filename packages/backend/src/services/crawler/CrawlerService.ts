/**
 * CrawlerService - High-level service for managing crawl jobs.
 * Provides start, stop, pause, resume, and job management operations.
 */

import type { CrawlConfig, CrawlJob, CrawlJobStatus, Result } from "shared";

import { configStore } from "../../stores/configStore";
import { crawlerStore } from "../../stores/crawlerStore";
import { jobsStore } from "../../stores/jobsStore";

import { CRAWLER_DEFAULTS } from "./constants";
import { HttpCrawler } from "./HttpCrawler";
import { getHost } from "./linkProcessor";
import type { CrawlerOptions, CrawlStats, StartCrawlCallbacks } from "./types";

/**
 * Generates a unique job ID.
 */
function generateJobId(): string {
  return `crawl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Maps CrawlConfig to CrawlerOptions.
 */
function mapConfigToOptions(
  config: CrawlConfig,
  isManual = false,
): CrawlerOptions {
  // Manual crawls ignore crawlInScopeOnly and crawl all links
  // Auto-crawls respect crawlInScopeOnly setting
  const useScopeFilter = isManual ? false : config.crawlInScopeOnly;

  return {
    maxRequestsPerMinute: Math.floor(60000 / Math.max(config.requestDelay, 1)),
    maxConcurrency: CRAWLER_DEFAULTS.MAX_CONCURRENCY,
    minConcurrency: CRAWLER_DEFAULTS.MIN_CONCURRENCY,
    maxRequestsPerCrawl: config.maxPagesPerDomain,
    maxDepth: config.maxDepth,
    respectRobotsTxt: config.respectRobotsTxt,
    sameDomainOnly: useScopeFilter,
    userAgent: config.userAgent,
    maxRequestRetries: CRAWLER_DEFAULTS.MAX_REQUEST_RETRIES,
    retryDelayMs: CRAWLER_DEFAULTS.RETRY_DELAY_MS,
    maxRetryDelayMs: CRAWLER_DEFAULTS.MAX_RETRY_DELAY_MS,
    requestHandlerTimeoutMs: CRAWLER_DEFAULTS.REQUEST_HANDLER_TIMEOUT_MS,
    navigationTimeoutMs: CRAWLER_DEFAULTS.NAVIGATION_TIMEOUT_MS,
    useSessionPool: false,
    logLevel: CRAWLER_DEFAULTS.LOG_LEVEL,
    requestHandler: async (context) => {
      await context.enqueueLinks({
        strategy: useScopeFilter ? "same-domain" : "all",
      });
    },
  };
}

/**
 * Service class for managing crawl jobs.
 */
class CrawlerServiceClass {
  /**
   * Starts a new crawl job.
   * @param targetUrl - The starting URL to crawl
   * @param callbacks - Optional callbacks for progress, errors, and completion events
   * @param isManual - Whether this is a manual crawl (ignores scope restrictions)
   * @returns Result containing the created job and jobId, or error message
   */
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

    // Set up event handlers
    crawler.on("requestCompleted", (event) => {
      lastActivityAt = new Date();
      const { request, response } = event.data;
      const stats = getStats();
      jobsStore.updateJob(jobId, {
        crawledUrls: stats.crawledUrls,
        discoveredUrls: stats.discoveredUrls,
      });
      callbacks.onUrlCrawled?.(request.url, response.statusCode);
      callbacks.onProgress?.(stats, jobId);
    });

    crawler.on("requestQueued", (event) => {
      const request = event.data;
      callbacks.onUrlDiscovered?.(request.url);
    });

    crawler.on("requestFailed", (event) => {
      lastActivityAt = new Date();
      const { request, error } = event.data;
      callbacks.onError?.(request.url, error.message);
    });

    crawler.on("crawlerCompleted", () => {
      if (status === "running") {
        status = "completed";
        const stats = getStats();
        jobsStore.updateJob(jobId, {
          status: "completed",
          crawledUrls: stats.crawledUrls,
          discoveredUrls: stats.discoveredUrls,
          completedAt: new Date(),
        });
        callbacks.onComplete?.(stats, jobId);
      }
    });

    crawler.on("crawlerAborted", () => {
      status = "completed";
      const stats = getStats();
      jobsStore.updateJob(jobId, {
        status: "completed",
        crawledUrls: stats.crawledUrls,
        discoveredUrls: stats.discoveredUrls,
        completedAt: new Date(),
      });
      callbacks.onComplete?.(stats, jobId);
    });

    // Start the crawl
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

  /**
   * Stops a running crawl job.
   * @param jobId - ID of the job to stop
   * @returns Result containing total URLs crawled, or error message
   */
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

  /**
   * Pauses a running crawl job.
   * @param jobId - ID of the job to pause
   * @returns Result with undefined on success, or error message
   */
  pause(jobId: string): Result<undefined> {
    const crawler = crawlerStore.get(jobId);
    if (crawler === undefined) {
      return { kind: "Error", error: "Job not found or not running." };
    }

    crawler.pause();
    jobsStore.updateJob(jobId, { status: "paused" });

    return { kind: "Ok", value: undefined };
  }

  /**
   * Resumes a paused crawl job.
   * @param jobId - ID of the job to resume
   * @returns Result with undefined on success, or error message
   */
  resume(jobId: string): Result<undefined> {
    const crawler = crawlerStore.get(jobId);
    if (crawler === undefined) {
      return { kind: "Error", error: "Job not found or not running." };
    }

    crawler.resume();
    jobsStore.updateJob(jobId, { status: "running" });

    return { kind: "Ok", value: undefined };
  }

  /**
   * Gets a specific job by ID.
   * @param jobId - ID of the job to retrieve
   * @returns Result containing the CrawlJob, or error message if not found
   */
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

  /**
   * Gets all jobs.
   * @returns Result containing array of all CrawlJobs with updated statistics
   */
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

  /**
   * Deletes a job (aborts if running).
   * @param jobId - ID of the job to delete
   * @returns Result with undefined on success
   */
  delete(jobId: string): Result<undefined> {
    const crawler = crawlerStore.get(jobId);
    if (crawler !== undefined) {
      crawler.abort();
      crawlerStore.unregister(jobId);
    }

    jobsStore.removeJob(jobId);
    return { kind: "Ok", value: undefined };
  }

  /**
   * Clears all completed jobs.
   * @returns Result with undefined on success
   */
  clearCompleted(): Result<undefined> {
    jobsStore.clearCompletedJobs();
    return { kind: "Ok", value: undefined };
  }

  /**
   * Clears all jobs (aborts any running).
   * @returns Result with undefined on success
   */
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
