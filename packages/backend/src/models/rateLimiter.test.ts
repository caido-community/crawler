import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DomainRateLimiter, RateLimiter } from "./rateLimiter";

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("uses default options when none provided", () => {
      const limiter = new RateLimiter();
      const options = limiter.getOptions();

      expect(options.maxRequestsPerSecond).toBe(10);
      expect(options.maxRequestsPerMinute).toBe(300);
      expect(options.minDelayMs).toBe(100);
      expect(options.maxDelayMs).toBe(60000);
      expect(options.burstSize).toBe(5);
    });

    it("merges provided options with defaults", () => {
      const limiter = new RateLimiter({
        maxRequestsPerSecond: 20,
        burstSize: 10,
      });
      const options = limiter.getOptions();

      expect(options.maxRequestsPerSecond).toBe(20);
      expect(options.burstSize).toBe(10);
      expect(options.maxRequestsPerMinute).toBe(300); // default
    });
  });

  describe("canProceed", () => {
    it("returns true when tokens available", () => {
      const limiter = new RateLimiter({ burstSize: 5 });
      expect(limiter.canProceed()).toBe(true);
    });

    it("returns false after burst is exhausted", async () => {
      const limiter = new RateLimiter({
        burstSize: 2,
        maxRequestsPerSecond: 1,
      });

      // Consume burst tokens
      await limiter.acquire();
      await limiter.acquire();

      expect(limiter.canProceed()).toBe(false);
    });

    it("returns true after tokens refill", async () => {
      const limiter = new RateLimiter({
        burstSize: 1,
        maxRequestsPerSecond: 10,
      });

      await limiter.acquire();
      expect(limiter.canProceed()).toBe(false);

      // Advance time to refill tokens
      vi.advanceTimersByTime(200);
      expect(limiter.canProceed()).toBe(true);
    });
  });

  describe("getWaitTime", () => {
    it("returns 0 when can proceed immediately", () => {
      const limiter = new RateLimiter({ burstSize: 5 });
      expect(limiter.getWaitTime()).toBe(0);
    });

    it("returns positive value when throttled", async () => {
      const limiter = new RateLimiter({
        burstSize: 1,
        maxRequestsPerSecond: 1,
        minDelayMs: 100,
      });

      await limiter.acquire();
      const waitTime = limiter.getWaitTime();

      expect(waitTime).toBeGreaterThanOrEqual(100);
    });
  });

  describe("acquire", () => {
    it("consumes tokens", async () => {
      const limiter = new RateLimiter({ burstSize: 3 });
      const stats1 = limiter.getStats();

      await limiter.acquire();
      const stats2 = limiter.getStats();

      expect(stats2.availableTokens).toBeLessThan(stats1.availableTokens);
    });

    it("records request for sliding window", async () => {
      const limiter = new RateLimiter();

      await limiter.acquire();
      const stats = limiter.getStats();

      expect(stats.requestsInLastSecond).toBe(1);
      expect(stats.requestsInLastMinute).toBe(1);
    });
  });

  describe("getStats", () => {
    it("returns correct initial stats", () => {
      const limiter = new RateLimiter({ burstSize: 5 });
      const stats = limiter.getStats();

      expect(stats.requestsInLastSecond).toBe(0);
      expect(stats.requestsInLastMinute).toBe(0);
      expect(stats.availableTokens).toBe(5);
      expect(stats.isThrottled).toBe(false);
    });

    it("updates requests in sliding window", async () => {
      const limiter = new RateLimiter({ burstSize: 10 });

      await limiter.acquire();
      await limiter.acquire();
      await limiter.acquire();

      const stats = limiter.getStats();
      expect(stats.requestsInLastSecond).toBe(3);
      expect(stats.requestsInLastMinute).toBe(3);
    });

    it("removes old requests from sliding window", async () => {
      const limiter = new RateLimiter({ burstSize: 10 });

      await limiter.acquire();
      await limiter.acquire();

      vi.advanceTimersByTime(2000); // 2 seconds

      const stats = limiter.getStats();
      expect(stats.requestsInLastSecond).toBe(0);
      expect(stats.requestsInLastMinute).toBe(2);
    });
  });

  describe("reset", () => {
    it("restores full burst capacity", async () => {
      const limiter = new RateLimiter({ burstSize: 5 });

      await limiter.acquire();
      await limiter.acquire();
      await limiter.acquire();

      limiter.reset();
      const stats = limiter.getStats();

      expect(stats.availableTokens).toBe(5);
      expect(stats.requestsInLastMinute).toBe(0);
    });
  });

  describe("setLimits", () => {
    it("updates maxRequestsPerSecond", () => {
      const limiter = new RateLimiter({ maxRequestsPerSecond: 10 });
      limiter.setLimits({ maxRequestsPerSecond: 20 });

      const options = limiter.getOptions();
      expect(options.maxRequestsPerSecond).toBe(20);
    });

    it("updates burstSize and clamps tokens", () => {
      const limiter = new RateLimiter({ burstSize: 10 });
      limiter.setLimits({ burstSize: 3 });

      const stats = limiter.getStats();
      expect(stats.availableTokens).toBeLessThanOrEqual(3);
    });
  });
});

describe("DomainRateLimiter", () => {
  describe("getLimiter", () => {
    it("creates new limiter for unknown domain", () => {
      const domainLimiter = new DomainRateLimiter();
      const limiter = domainLimiter.getLimiter("example.com");

      expect(limiter).toBeInstanceOf(RateLimiter);
    });

    it("returns same limiter for same domain", () => {
      const domainLimiter = new DomainRateLimiter();
      const limiter1 = domainLimiter.getLimiter("example.com");
      const limiter2 = domainLimiter.getLimiter("example.com");

      expect(limiter1).toBe(limiter2);
    });

    it("returns different limiters for different domains", () => {
      const domainLimiter = new DomainRateLimiter();
      const limiter1 = domainLimiter.getLimiter("example.com");
      const limiter2 = domainLimiter.getLimiter("other.com");

      expect(limiter1).not.toBe(limiter2);
    });

    it("uses default options for new limiters", () => {
      const domainLimiter = new DomainRateLimiter({
        maxRequestsPerSecond: 20,
        burstSize: 10,
      });

      const limiter = domainLimiter.getLimiter("example.com");
      const options = limiter.getOptions();

      expect(options.maxRequestsPerSecond).toBe(20);
      expect(options.burstSize).toBe(10);
    });
  });

  describe("canProceed", () => {
    it("delegates to domain limiter", async () => {
      const domainLimiter = new DomainRateLimiter({ burstSize: 1 });

      expect(domainLimiter.canProceed("example.com")).toBe(true);

      await domainLimiter.acquire("example.com");

      expect(domainLimiter.canProceed("example.com")).toBe(false);
      expect(domainLimiter.canProceed("other.com")).toBe(true);
    });
  });

  describe("setDomainLimits", () => {
    it("sets custom limits for specific domain", () => {
      const domainLimiter = new DomainRateLimiter();

      domainLimiter.setDomainLimits("slow-api.com", {
        maxRequestsPerSecond: 1,
        burstSize: 1,
      });

      const limiter = domainLimiter.getLimiter("slow-api.com");
      const options = limiter.getOptions();

      expect(options.maxRequestsPerSecond).toBe(1);
      expect(options.burstSize).toBe(1);
    });
  });

  describe("resetDomain", () => {
    it("removes domain limiter", async () => {
      const domainLimiter = new DomainRateLimiter({ burstSize: 1 });

      await domainLimiter.acquire("example.com");
      expect(domainLimiter.canProceed("example.com")).toBe(false);

      domainLimiter.resetDomain("example.com");
      expect(domainLimiter.canProceed("example.com")).toBe(true);
    });
  });

  describe("resetAll", () => {
    it("removes all domain limiters", async () => {
      const domainLimiter = new DomainRateLimiter({ burstSize: 1 });

      await domainLimiter.acquire("example.com");
      await domainLimiter.acquire("other.com");

      expect(domainLimiter.domainCount()).toBe(2);

      domainLimiter.resetAll();

      expect(domainLimiter.domainCount()).toBe(0);
    });
  });

  describe("getAllStats", () => {
    it("returns stats for all domains", async () => {
      const domainLimiter = new DomainRateLimiter({ burstSize: 5 });

      await domainLimiter.acquire("example.com");
      await domainLimiter.acquire("example.com");
      await domainLimiter.acquire("other.com");

      const allStats = domainLimiter.getAllStats();

      expect(allStats["example.com"]).toBeDefined();
      expect(allStats["other.com"]).toBeDefined();
      expect(allStats["example.com"]?.requestsInLastMinute).toBe(2);
      expect(allStats["other.com"]?.requestsInLastMinute).toBe(1);
    });
  });

  describe("getDomain", () => {
    it("extracts hostname from URL", () => {
      expect(DomainRateLimiter.getDomain("https://example.com/path")).toBe(
        "example.com",
      );
      expect(DomainRateLimiter.getDomain("http://sub.example.com:8080")).toBe(
        "sub.example.com",
      );
    });

    it("returns input for invalid URL", () => {
      expect(DomainRateLimiter.getDomain("not-a-url")).toBe("not-a-url");
    });
  });
});
