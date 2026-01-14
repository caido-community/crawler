/**
 * Crawler Engine - A modular, extensible web crawler
 *
 * @example
 * ```typescript
 * import { HttpCrawler, Request, RequestQueue, Router } from "./engine";
 *
 * const queue = new RequestQueue();
 * const router = new Router();
 *
 * router.addDefaultRoute(async (context) => {
 *   const { request, response, enqueueLinks, log } = context;
 *   log.info(`Crawled: ${request.url}`);
 *   await enqueueLinks({ strategy: "same-domain" });
 * });
 *
 * const crawler = new HttpCrawler({
 *   requestQueue: queue,
 *   router: router,
 *   maxConcurrency: 5,
 *   maxDepth: 3,
 *   respectRobotsTxt: true,
 * });
 *
 * await crawler.addRequests(["https://example.com"]);
 * const stats = await crawler.run();
 * ```
 */

// Core
export { Request, createRequests } from "./request";
export {
  RequestQueue,
  type QueueStats,
  type RequestQueueOptions,
} from "./requestQueue";
export * from "./types";

// Extractors
export {
  BaseExtractor,
  CompositeExtractor,
  HtmlExtractor,
  SitemapExtractor,
  RobotsTxtParser,
  parseRobotsTxt,
  type ExtractorOptions,
  type HtmlExtractorOptions,
  type RobotsParserOptions,
} from "./extractors";

// HTTP
export {
  HttpClient,
  isSuccessResponse,
  isRedirectResponse,
  isClientErrorResponse,
  isServerErrorResponse,
  shouldRetryResponse,
  getRedirectLocation,
  type HttpClientOptions,
  type SendOptions,
} from "./http";

// Session
export { Session } from "./session/session";
export { SessionPool, type SessionPoolOptions } from "./session/sessionPool";

// Concurrency
export {
  ConcurrencyPool,
  RateLimiter,
  DomainRateLimiter,
  type ConcurrencyPoolOptions,
  type PoolStats,
  type RateLimiterOptions,
} from "./concurrency";

// Router
export {
  Router,
  CommonPatterns,
  matchesAny,
  isResourceUrl,
  isPageUrl,
  type RouterOptions,
} from "./router";

// Crawlers
export { HttpCrawler, type HttpCrawlerOptions } from "./crawlers";

// Crawler Manager (Job Integration)
export {
  ManagedCrawler,
  getCrawler,
  getAllCrawlers,
  registerCrawler,
  unregisterCrawler,
  generateJobId,
  type CrawlStats,
  type CrawlCallbacks,
} from "./crawlerManager";
