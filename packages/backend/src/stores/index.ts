/**
 * Store exports
 * Re-exports all stores and their interfaces
 */

// Interfaces (for dependency injection)
export type {
  IConfigStore,
  ICrawlerStore,
  IJobsStore,
  IStoredCrawler,
} from "./interfaces";

// Concrete implementations
export { configStore } from "./configStore";
export { crawlerStore } from "./crawlerStore";
export { jobsStore } from "./jobsStore";
