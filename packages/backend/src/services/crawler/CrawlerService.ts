/**
 * CrawlerService - High-level service for managing crawl jobs.
 * Provides start, stop, pause, resume, and job management operations.
 */

import type {
  CrawlConfig,
  CrawlJob,
  CrawlJobAgent,
  CrawlJobAgentStatus,
  CrawlJobStatus,
  Result,
} from "shared";

import { getSeedUrlsFromHistory } from "../../repositories";
import { requireSDK } from "../../sdk";
import { configStore } from "../../stores/configStore";
import { crawlerStore } from "../../stores/crawlerStore";
import { jobLogsStore } from "../../stores/jobLogsStore";
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
  const useScopeFilter = isManual ? false : config.crawlInScopeOnly;
  const concurrency = isManual
    ? config.manualCrawlAgents
    : CRAWLER_DEFAULTS.MAX_CONCURRENCY;

  return {
    maxRequestsPerMinute: Math.floor(60000 / Math.max(config.requestDelay, 1)),
    maxConcurrency: concurrency,
    minConcurrency: isManual ? 1 : CRAWLER_DEFAULTS.MIN_CONCURRENCY,
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
  async start(
    targetUrl: string,
    callbacks: StartCrawlCallbacks = {},
    isManual = false,
  ): Promise<Result<{ job: CrawlJob; jobId: string }>> {
    const host = getHost(targetUrl);
    if (host === undefined) {
      return { kind: "Error", error: "Invalid URL provided." };
    }

    const config = configStore.getConfig();
    const jobId = generateJobId();
    const options = mapConfigToOptions(config, isManual);

    let seedUrls: string[];
    if (isManual) {
      const unique = new Set<string>([targetUrl]);
      const skipHistory =
        config.devMode === true && config.devModeDisableHttpHistory === true;
      if (!skipHistory) {
        const fromHistory = await getSeedUrlsFromHistory(requireSDK(), host);
        for (const u of fromHistory) {
          unique.add(u);
        }
      }
      seedUrls = Array.from(unique);
    } else {
      seedUrls = [targetUrl];
    }

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
      const { request, response, slotId } = event.data;
      const stats = getStats();
      jobsStore.updateJob(jobId, {
        crawledUrls: stats.crawledUrls,
        discoveredUrls: stats.discoveredUrls,
      });
      logLine(`Crawled ${response.statusCode} ${request.url}`, slotId, "info");
      callbacks.onUrlCrawled?.(request.url, response.statusCode);
      callbacks.onProgress?.(stats, jobId);
    });

    crawler.on("requestQueued", (event) => {
      const request = event.data;
      callbacks.onUrlDiscovered?.(request.url);
    });

    crawler.on("requestFailed", (event) => {
      lastActivityAt = new Date();
      const { request, error, slotId } = event.data;
      logLine(`Failed ${request.url}: ${error.message}`, slotId, "error");
      callbacks.onError?.(request.url, error.message);
    });

    crawler.on("agentStarted", (event) => {
      const { slotId } = event.data;
      logLine(`Crawl Agent ${slotId} has started.`, slotId, "info");
    });

    crawler.on("crawlerCompleted", () => {
      if (status === "running") {
        status = "completed";
        const stats = getStats();
        const job = jobsStore.getJob(jobId);
        const agentCount = job?.agentCount ?? 0;
        for (let agentId = 1; agentId <= agentCount; agentId++) {
          logLine(`Crawl Agent ${agentId} has finished.`, agentId, "success");
        }
        logLine("All agents have finished.", undefined, "success");
        logLine(
          `Crawl completed. ${stats.crawledUrls} URLs crawled.`,
          undefined,
          "success",
        );
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
      const stats = getStats();
      logLine(
        `Crawl stopped. ${stats.crawledUrls} URLs crawled.`,
        undefined,
        "warning",
      );
      const job = jobsStore.getJob(jobId);
      if (job?.status !== "cancelled") {
        status = "completed";
        jobsStore.updateJob(jobId, {
          status: "completed",
          crawledUrls: stats.crawledUrls,
          discoveredUrls: stats.discoveredUrls,
          completedAt: new Date(),
        });
      }
      callbacks.onComplete?.(stats, jobId);
    });

    crawler.addRequests(seedUrls);
    crawlerStore.register(jobId, crawler);

    const agentCount = isManual
      ? config.manualCrawlAgents
      : CRAWLER_DEFAULTS.MAX_CONCURRENCY;
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
      agentCount,
    };

    const sdk = requireSDK();
    const logLine = (
      line: string,
      agentId?: number,
      level: string = "info",
    ): void => {
      jobLogsStore.append(jobId, line, agentId, level);
      sdk.api.send("crawl:log", { jobId, line, agentId, level });
    };
    logLine(`Crawl started for ${host} with ${seedUrls.length} seed URL(s).`);

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
          status: "cancelled",
          completedAt: new Date(),
        });
        return { kind: "Ok", value: { totalUrls: job.crawledUrls } };
      }
      return { kind: "Error", error: "Job not found." };
    }

    crawler.abort();
    const stats = crawler.getStatistics();

    jobsStore.updateJob(jobId, {
      status: "cancelled",
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
   * Gets per-agent status for a job (running jobs only; completed jobs return all completed).
   */
  getJobAgents(jobId: string): Result<CrawlJobAgent[]> {
    const job = jobsStore.getJob(jobId);
    if (job === undefined) {
      return { kind: "Error", error: "Job not found." };
    }

    const count = job.agentCount ?? 0;
    if (count === 0) {
      return { kind: "Ok", value: [] };
    }

    const crawler = crawlerStore.get(jobId);
    if (crawler === undefined) {
      const status: CrawlJobAgentStatus = "completed";
      return {
        kind: "Ok",
        value: Array.from({ length: count }, (_, i) => ({
          agentId: i + 1,
          status,
        })),
      };
    }

    if (job.status === "paused") {
      return {
        kind: "Ok",
        value: Array.from({ length: count }, (_, i) => ({
          agentId: i + 1,
          status: "paused" as CrawlJobAgentStatus,
        })),
      };
    }

    const statuses = crawler.getAgentStatuses();
    const agents: CrawlJobAgent[] = statuses
      .slice(0, count)
      .map((a: { slotId: number; status: string }) => ({
        agentId: a.slotId,
        status: a.status as CrawlJobAgentStatus,
      }));
    return { kind: "Ok", value: agents };
  }

  /**
   * Pauses a single agent (slot) for a running job.
   */
  pauseAgent(jobId: string, agentId: number): Result<undefined> {
    const crawler = crawlerStore.get(jobId);
    if (crawler === undefined) {
      return { kind: "Error", error: "Job not found or not running." };
    }
    crawler.pauseAgent(agentId);
    return { kind: "Ok", value: undefined };
  }

  /**
   * Resumes a single agent (slot) for a running job.
   */
  resumeAgent(jobId: string, agentId: number): Result<undefined> {
    const crawler = crawlerStore.get(jobId);
    if (crawler === undefined) {
      return { kind: "Error", error: "Job not found or not running." };
    }
    crawler.resumeAgent(agentId);
    return { kind: "Ok", value: undefined };
  }

  /**
   * Stops a single agent (slot) for a running job; it will not receive more tasks.
   */
  stopAgent(jobId: string, agentId: number): Result<undefined> {
    const crawler = crawlerStore.get(jobId);
    if (crawler === undefined) {
      return { kind: "Error", error: "Job not found or not running." };
    }
    crawler.stopAgent(agentId);
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
   * Updates a job's metadata (e.g. title for display).
   * @param jobId - ID of the job to update
   * @param updates - Partial updates (title only)
   * @returns Result with updated job or error
   */
  updateJob(jobId: string, updates: { title?: string }): Result<CrawlJob> {
    const job = jobsStore.getJob(jobId);
    if (job === undefined) {
      return { kind: "Error", error: "Job not found." };
    }
    jobsStore.updateJob(jobId, updates);
    const updated = jobsStore.getJob(jobId);
    return updated !== undefined
      ? { kind: "Ok", value: updated }
      : { kind: "Error", error: "Job not found." };
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
