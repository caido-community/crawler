/**
 * CrawlerStore - Manages active crawler instances
 *
 * Note: Uses interface to avoid importing the class from services.
 * This maintains proper architectural layering where stores don't depend on services.
 */

import type { ICrawlerStore, IStoredCrawler } from "./interfaces";

class CrawlerStoreClass implements ICrawlerStore {
  private activeCrawlers: Map<string, IStoredCrawler> = new Map();

  get(jobId: string): IStoredCrawler | undefined {
    return this.activeCrawlers.get(jobId);
  }

  getAll(): IStoredCrawler[] {
    return Array.from(this.activeCrawlers.values());
  }

  register(jobId: string, crawler: IStoredCrawler): void {
    this.activeCrawlers.set(jobId, crawler);
  }

  unregister(jobId: string): void {
    this.activeCrawlers.delete(jobId);
  }

  has(jobId: string): boolean {
    return this.activeCrawlers.has(jobId);
  }

  clear(): void {
    this.activeCrawlers.clear();
  }

  getCount(): number {
    return this.activeCrawlers.size;
  }
}

export const crawlerStore = new CrawlerStoreClass();
