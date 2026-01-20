/**
 * StatsTracker - Tracks crawl statistics.
 * Centralized statistics management for the HttpCrawler.
 */

import type { CrawlerStatistics, ResponseData } from "../../models";

/**
 * Tracks and calculates crawl statistics.
 */
export class StatsTracker {
  private stats: CrawlerStatistics = {
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

  /**
   * Records a request being added to the queue.
   */
  recordRequestQueued(): void {
    this.stats.requestsTotal++;
  }

  /**
   * Records a successfully completed request.
   */
  recordRequestFinished(): void {
    this.stats.requestsFinished++;
  }

  /**
   * Records a failed request.
   */
  recordRequestFailed(): void {
    this.stats.requestsFailed++;
  }

  /**
   * Records a retried request.
   */
  recordRequestRetried(): void {
    this.stats.requestsRetried++;
  }

  /**
   * Records an error by type.
   */
  recordError(errorType: string): void {
    this.stats.errorsPerType[errorType] =
      (this.stats.errorsPerType[errorType] ?? 0) + 1;
  }

  /**
   * Records response timing data.
   */
  recordResponseTiming(response: ResponseData): void {
    const duration = response.timing.durationMs;

    this.stats.totalResponseTimeMs += duration;
    this.stats.avgResponseTimeMs =
      this.stats.totalResponseTimeMs / (this.stats.requestsFinished + 1);

    if (duration > this.stats.maxResponseTimeMs) {
      this.stats.maxResponseTimeMs = duration;
    }
    if (duration < this.stats.minResponseTimeMs) {
      this.stats.minResponseTimeMs = duration;
    }

    const statusCode = response.statusCode;
    this.stats.requestsWithStatusCode[statusCode] =
      (this.stats.requestsWithStatusCode[statusCode] ?? 0) + 1;
  }

  /**
   * Sets the total crawler runtime.
   */
  setRuntimeMs(runtimeMs: number): void {
    this.stats.crawlerRuntimeMs = runtimeMs;

    // Calculate requests per minute/second
    if (runtimeMs > 0) {
      const runtimeMinutes = runtimeMs / 60000;
      const runtimeSeconds = runtimeMs / 1000;
      this.stats.requestsPerMinute =
        this.stats.requestsFinished / runtimeMinutes;
      this.stats.requestsPerSecond =
        this.stats.requestsFinished / runtimeSeconds;
    }
  }

  /**
   * Returns a copy of current statistics.
   */
  getStats(): CrawlerStatistics {
    return { ...this.stats };
  }

  /**
   * Resets all statistics.
   */
  reset(): void {
    this.stats = {
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
  }
}
