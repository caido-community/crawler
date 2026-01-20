/**
 * Tests for RequestQueue class
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Request } from "./request";
import { RequestQueue } from "./requestQueue";

describe("RequestQueue", () => {
  let queue: RequestQueue;

  beforeEach(() => {
    queue = new RequestQueue();
  });

  describe("constructor", () => {
    it("creates queue with default options", () => {
      expect(queue.pendingCount()).toBe(0);
      expect(queue.getMaxSize()).toBe(Infinity);
    });

    it("creates queue with custom maxSize", () => {
      const limitedQueue = new RequestQueue({ maxSize: 100 });
      expect(limitedQueue.getMaxSize()).toBe(100);
    });
  });

  describe("add", () => {
    it("adds a request to the queue", () => {
      const result = queue.add(new Request({ url: "https://example.com" }));
      expect(result).toBe(true);
      expect(queue.pendingCount()).toBe(1);
    });

    it("adds a request from URL string", () => {
      const result = queue.add("https://example.com");
      expect(result).toBe(true);
      expect(queue.pendingCount()).toBe(1);
    });

    it("adds a request from options object", () => {
      const result = queue.add({ url: "https://example.com" });
      expect(result).toBe(true);
      expect(queue.pendingCount()).toBe(1);
    });

    it("rejects duplicate requests by uniqueKey", () => {
      queue.add(new Request({ url: "https://example.com" }));
      const result = queue.add(new Request({ url: "https://example.com" }));
      expect(result).toBe(false);
      expect(queue.pendingCount()).toBe(1);
    });

    it("respects maxSize limit", () => {
      const limitedQueue = new RequestQueue({ maxSize: 2 });
      limitedQueue.add("https://example.com/1");
      limitedQueue.add("https://example.com/2");
      const result = limitedQueue.add("https://example.com/3");
      expect(result).toBe(false);
      expect(limitedQueue.pendingCount()).toBe(2);
    });
  });

  describe("addRequests", () => {
    it("adds multiple requests", () => {
      const count = queue.addRequests([
        "https://example.com/1",
        "https://example.com/2",
        "https://example.com/3",
      ]);
      expect(count).toBe(3);
      expect(queue.pendingCount()).toBe(3);
    });

    it("returns count of actually added (skips duplicates)", () => {
      const count = queue.addRequests([
        "https://example.com/1",
        "https://example.com/1",
        "https://example.com/2",
      ]);
      expect(count).toBe(2);
    });
  });

  describe("priority ordering", () => {
    it("returns higher priority requests first", () => {
      queue.add(new Request({ url: "https://example.com/low", priority: 1 }));
      queue.add(new Request({ url: "https://example.com/high", priority: 10 }));
      queue.add(
        new Request({ url: "https://example.com/medium", priority: 5 }),
      );

      const first = queue.fetchNextRequest();
      expect(first?.url).toBe("https://example.com/high");

      const second = queue.fetchNextRequest();
      expect(second?.url).toBe("https://example.com/medium");

      const third = queue.fetchNextRequest();
      expect(third?.url).toBe("https://example.com/low");
    });
  });

  describe("fetchNextRequest", () => {
    it("returns undefined for empty queue", () => {
      expect(queue.fetchNextRequest()).toBeUndefined();
    });

    it("returns and removes the next request", () => {
      queue.add("https://example.com");
      const request = queue.fetchNextRequest();
      expect(request?.url).toBe("https://example.com");
      expect(queue.pendingCount()).toBe(0);
    });

    it("moves request to inProgress", () => {
      queue.add("https://example.com");
      queue.fetchNextRequest();
      expect(queue.inProgressCount()).toBe(1);
    });

    it("returns undefined when paused", () => {
      queue.add("https://example.com");
      queue.pause();
      expect(queue.fetchNextRequest()).toBeUndefined();
    });
  });

  describe("markRequestHandled", () => {
    it("removes request from inProgress", () => {
      queue.add("https://example.com");
      const request = queue.fetchNextRequest()!;
      queue.markRequestHandled(request);
      expect(queue.inProgressCount()).toBe(0);
    });

    it("marks URL as completed", () => {
      queue.add("https://example.com");
      const request = queue.fetchNextRequest()!;
      queue.markRequestHandled(request);
      expect(queue.isCompleted(request.uniqueKey)).toBe(true);
    });
  });

  describe("handleRequestFailure", () => {
    it("moves request to retry queue if can retry", () => {
      queue.add(new Request({ url: "https://example.com", maxRetries: 3 }));
      const request = queue.fetchNextRequest()!;
      queue.handleRequestFailure(request, "error");

      // Should be able to fetch it again
      expect(queue.hasNextRequest()).toBe(true);
    });

    it("marks request as failed when max retries exceeded", () => {
      queue.add(new Request({ url: "https://example.com", maxRetries: 1 }));
      const request = queue.fetchNextRequest()!;
      request.markFailed("error");
      queue.handleRequestFailure(request, "error");
      queue.handleRequestFailure(request, "error");

      expect(queue.getFailedRequests().length).toBeGreaterThan(0);
    });
  });

  describe("reclaimRequest", () => {
    it("moves inProgress request back to pending", () => {
      queue.add("https://example.com");
      const request = queue.fetchNextRequest()!;
      queue.reclaimRequest(request);

      expect(queue.inProgressCount()).toBe(0);
      expect(queue.pendingCount()).toBe(1);
    });
  });

  describe("reclaimAllInProgress", () => {
    it("moves all inProgress requests back to pending", () => {
      queue.add("https://example.com/1");
      queue.add("https://example.com/2");
      queue.fetchNextRequest();
      queue.fetchNextRequest();

      queue.reclaimAllInProgress();

      expect(queue.inProgressCount()).toBe(0);
      expect(queue.pendingCount()).toBe(2);
    });
  });

  describe("isHandled", () => {
    it("returns true for queued URLs", () => {
      const request = new Request({ url: "https://example.com" });
      queue.add(request);
      expect(queue.isHandled(request.uniqueKey)).toBe(true);
    });

    it("returns true for completed URLs", () => {
      queue.add("https://example.com");
      const request = queue.fetchNextRequest()!;
      queue.markRequestHandled(request);
      expect(queue.isHandled(request.uniqueKey)).toBe(true);
    });

    it("returns false for unknown URLs", () => {
      expect(queue.isHandled("unknown")).toBe(false);
    });
  });

  describe("isEmpty", () => {
    it("returns true for empty queue", () => {
      expect(queue.isEmpty()).toBe(true);
    });

    it("returns false when pending requests exist", () => {
      queue.add("https://example.com");
      expect(queue.isEmpty()).toBe(false);
    });

    it("returns false when inProgress requests exist", () => {
      queue.add("https://example.com");
      queue.fetchNextRequest();
      expect(queue.isEmpty()).toBe(false);
    });
  });

  describe("hasNextRequest", () => {
    it("returns false for empty queue", () => {
      expect(queue.hasNextRequest()).toBe(false);
    });

    it("returns true when pending requests exist", () => {
      queue.add("https://example.com");
      expect(queue.hasNextRequest()).toBe(true);
    });

    it("returns false when paused", () => {
      queue.add("https://example.com");
      queue.pause();
      expect(queue.hasNextRequest()).toBe(false);
    });
  });

  describe("pause/resume", () => {
    it("pauses the queue", () => {
      queue.pause();
      expect(queue.isPausedState()).toBe(true);
    });

    it("resumes the queue", () => {
      queue.pause();
      queue.resume();
      expect(queue.isPausedState()).toBe(false);
    });
  });

  describe("clear", () => {
    it("removes all requests", () => {
      queue.add("https://example.com/1");
      queue.add("https://example.com/2");
      queue.fetchNextRequest();
      queue.clear();

      expect(queue.pendingCount()).toBe(0);
      expect(queue.inProgressCount()).toBe(0);
    });
  });

  describe("getStats", () => {
    it("returns correct statistics", () => {
      queue.add("https://example.com/1");
      queue.add("https://example.com/2");
      const request = queue.fetchNextRequest()!;
      queue.markRequestHandled(request);

      const stats = queue.getStats();
      expect(stats.pending).toBe(1);
      expect(stats.inProgress).toBe(0);
      expect(stats.completed).toBe(1);
      expect(stats.total).toBe(2);
    });
  });

  describe("drop", () => {
    it("removes a pending request by ID", () => {
      const request = new Request({ url: "https://example.com" });
      queue.add(request);

      const result = queue.drop(request.id);
      expect(result).toBe(true);
      expect(queue.pendingCount()).toBe(0);
    });

    it("returns false for unknown ID", () => {
      expect(queue.drop("unknown")).toBe(false);
    });
  });

  describe("getters", () => {
    it("getPendingRequests returns pending requests", () => {
      queue.add("https://example.com");
      expect(queue.getPendingRequests()).toHaveLength(1);
    });

    it("getInProgressRequests returns in-progress requests", () => {
      queue.add("https://example.com");
      queue.fetchNextRequest();
      expect(queue.getInProgressRequests()).toHaveLength(1);
    });

    it("getFailedRequests returns failed requests", () => {
      queue.add(new Request({ url: "https://example.com", maxRetries: 0 }));
      const request = queue.fetchNextRequest()!;
      queue.handleRequestFailure(request, "error");
      expect(queue.getFailedRequests()).toHaveLength(1);
    });
  });

  describe("setMaxSize", () => {
    it("updates maxSize limit", () => {
      queue.setMaxSize(50);
      expect(queue.getMaxSize()).toBe(50);
    });
  });
});
