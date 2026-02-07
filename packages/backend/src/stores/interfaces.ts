/**
 * Store Interfaces for Dependency Injection
 *
 * These interfaces enable:
 * - Testability: Services can be tested with mock implementations
 * - Flexibility: Stores can be swapped without changing service code
 * - Decoupling: Services depend on abstractions, not concrete implementations
 */

import type { CrawlConfig, CrawlJob } from "shared";

import type { AgentStatus } from "../models";

/**
 * Interface for crawler instances stored in the crawler store.
 * Matches the HttpCrawler class API.
 */
export interface IStoredCrawler {
  getState(): { status: string };
  getStatistics(): {
    requestsFinished: number;
    requestsFailed: number;
    requestsTotal: number;
  };
  getAgentStatuses(): AgentStatus[];
  pause(): void;
  resume(): void;
  abort(): void;
  pauseAgent(agentId: number): void;
  resumeAgent(agentId: number): void;
  stopAgent(agentId: number): void;
}

/**
 * Jobs Store Interface
 * Manages crawl job persistence and retrieval
 */
export interface IJobsStore {
  /** Get all jobs */
  getJobs(): CrawlJob[];

  /** Get a specific job by ID */
  getJob(jobId: string): CrawlJob | undefined;

  /** Add or update a job */
  addJob(job: CrawlJob): void;

  /** Update specific fields of a job */
  updateJob(jobId: string, updates: Partial<CrawlJob>): void;

  /** Remove a job by ID */
  removeJob(jobId: string): void;

  /** Clear all completed and failed jobs */
  clearCompletedJobs(): void;

  /** Clear all jobs */
  clearAllJobs(): void;

  /** Get jobs that are running or pending */
  getActiveJobs(): CrawlJob[];

  /** Find a job by its target host */
  getJobByHost(host: string): CrawlJob | undefined;
}

/**
 * Crawler Store Interface
 * Manages active crawler instances in memory
 */
export interface ICrawlerStore {
  /** Get a crawler by job ID */
  get(jobId: string): IStoredCrawler | undefined;

  /** Get all active crawlers */
  getAll(): IStoredCrawler[];

  /** Register a crawler for a job */
  register(jobId: string, crawler: IStoredCrawler): void;

  /** Unregister a crawler */
  unregister(jobId: string): void;

  /** Check if a crawler exists for a job */
  has(jobId: string): boolean;

  /** Clear all crawlers */
  clear(): void;

  /** Get total number of active crawlers */
  getCount(): number;
}

/**
 * Config Store Interface
 * Manages crawler configuration
 */
export interface IConfigStore {
  /** Get the current configuration */
  getConfig(): CrawlConfig;

  /** Update configuration with partial values */
  updateConfig(newConfig: Partial<CrawlConfig>): void;
}
