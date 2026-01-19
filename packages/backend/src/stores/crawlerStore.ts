/**
 * CrawlerStore - Manages active crawler instances
 *
 * Note: Uses interface to avoid importing the class from services.
 * This maintains proper architectural layering where stores don't depend on services.
 */

/**
 * Interface for crawler instances stored in the store.
 * Matches the HttpCrawler class from services/crawler.ts
 */
interface StoredCrawler {
  getState(): { status: string };
  getStatistics(): {
    requestsFinished: number;
    requestsFailed: number;
    requestsTotal: number;
  };
  pause(): void;
  resume(): void;
  abort(): void;
}

class CrawlerStoreClass {
  private activeCrawlers: Map<string, StoredCrawler> = new Map();

  get(jobId: string): StoredCrawler | undefined {
    return this.activeCrawlers.get(jobId);
  }

  getAll(): StoredCrawler[] {
    return Array.from(this.activeCrawlers.values());
  }

  register(jobId: string, crawler: StoredCrawler): void {
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
