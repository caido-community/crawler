/**
 * Tests for CrawlerStore class
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { crawlerStore } from "./crawlerStore";

// Mock crawler interface
function createMockCrawler(status = "running") {
  return {
    getState: vi.fn().mockReturnValue({ status }),
    getStatistics: vi.fn().mockReturnValue({
      requestsFinished: 10,
      requestsFailed: 1,
      requestsTotal: 20,
    }),
    getAgentStatuses: vi.fn().mockReturnValue([]),
    pause: vi.fn(),
    resume: vi.fn(),
    abort: vi.fn(),
    pauseAgent: vi.fn(),
    resumeAgent: vi.fn(),
    stopAgent: vi.fn(),
  };
}

describe("CrawlerStore", () => {
  beforeEach(() => {
    crawlerStore.clear();
  });

  describe("register", () => {
    it("adds crawler to store", () => {
      const crawler = createMockCrawler();
      crawlerStore.register("job-1", crawler);
      expect(crawlerStore.has("job-1")).toBe(true);
    });

    it("replaces existing crawler with same ID", () => {
      const crawler1 = createMockCrawler("running");
      const crawler2 = createMockCrawler("paused");

      crawlerStore.register("job-1", crawler1);
      crawlerStore.register("job-1", crawler2);

      expect(crawlerStore.get("job-1")).toBe(crawler2);
      expect(crawlerStore.getCount()).toBe(1);
    });
  });

  describe("get", () => {
    it("returns crawler by ID", () => {
      const crawler = createMockCrawler();
      crawlerStore.register("job-1", crawler);
      expect(crawlerStore.get("job-1")).toBe(crawler);
    });

    it("returns undefined for unknown ID", () => {
      expect(crawlerStore.get("unknown")).toBeUndefined();
    });
  });

  describe("getAll", () => {
    it("returns all crawlers as array", () => {
      crawlerStore.register("job-1", createMockCrawler());
      crawlerStore.register("job-2", createMockCrawler());
      crawlerStore.register("job-3", createMockCrawler());

      const all = crawlerStore.getAll();
      expect(all).toHaveLength(3);
    });

    it("returns empty array when no crawlers", () => {
      expect(crawlerStore.getAll()).toEqual([]);
    });
  });

  describe("unregister", () => {
    it("removes crawler from store", () => {
      crawlerStore.register("job-1", createMockCrawler());
      crawlerStore.unregister("job-1");
      expect(crawlerStore.has("job-1")).toBe(false);
    });

    it("does nothing for unknown ID", () => {
      crawlerStore.register("job-1", createMockCrawler());
      crawlerStore.unregister("unknown");
      expect(crawlerStore.getCount()).toBe(1);
    });
  });

  describe("has", () => {
    it("returns true when crawler exists", () => {
      crawlerStore.register("job-1", createMockCrawler());
      expect(crawlerStore.has("job-1")).toBe(true);
    });

    it("returns false when crawler does not exist", () => {
      expect(crawlerStore.has("unknown")).toBe(false);
    });
  });

  describe("clear", () => {
    it("removes all crawlers", () => {
      crawlerStore.register("job-1", createMockCrawler());
      crawlerStore.register("job-2", createMockCrawler());
      crawlerStore.clear();
      expect(crawlerStore.getCount()).toBe(0);
    });
  });

  describe("getCount", () => {
    it("returns number of registered crawlers", () => {
      expect(crawlerStore.getCount()).toBe(0);
      crawlerStore.register("job-1", createMockCrawler());
      expect(crawlerStore.getCount()).toBe(1);
      crawlerStore.register("job-2", createMockCrawler());
      expect(crawlerStore.getCount()).toBe(2);
    });
  });

  describe("crawler operations", () => {
    it("can pause registered crawler", () => {
      const crawler = createMockCrawler();
      crawlerStore.register("job-1", crawler);

      const retrieved = crawlerStore.get("job-1");
      retrieved?.pause();

      expect(crawler.pause).toHaveBeenCalled();
    });

    it("can resume registered crawler", () => {
      const crawler = createMockCrawler();
      crawlerStore.register("job-1", crawler);

      const retrieved = crawlerStore.get("job-1");
      retrieved?.resume();

      expect(crawler.resume).toHaveBeenCalled();
    });

    it("can abort registered crawler", () => {
      const crawler = createMockCrawler();
      crawlerStore.register("job-1", crawler);

      const retrieved = crawlerStore.get("job-1");
      retrieved?.abort();

      expect(crawler.abort).toHaveBeenCalled();
    });

    it("can get state from registered crawler", () => {
      const crawler = createMockCrawler("running");
      crawlerStore.register("job-1", crawler);

      const retrieved = crawlerStore.get("job-1");
      const state = retrieved?.getState();

      expect(state?.status).toBe("running");
    });

    it("can get statistics from registered crawler", () => {
      const crawler = createMockCrawler();
      crawlerStore.register("job-1", crawler);

      const retrieved = crawlerStore.get("job-1");
      const stats = retrieved?.getStatistics();

      expect(stats?.requestsFinished).toBe(10);
      expect(stats?.requestsFailed).toBe(1);
      expect(stats?.requestsTotal).toBe(20);
    });
  });
});
