/**
 * CrawlerStore - Manages active crawler instances
 */

import type { HttpCrawler } from "../services/crawler";

class CrawlerStoreClass {
  private activeCrawlers: Map<string, HttpCrawler> = new Map();

  get(jobId: string): HttpCrawler | undefined {
    return this.activeCrawlers.get(jobId);
  }

  getAll(): HttpCrawler[] {
    return Array.from(this.activeCrawlers.values());
  }

  register(jobId: string, crawler: HttpCrawler): void {
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
