import { beforeEach, describe, expect, it } from "vitest";

import { createRequests, Request } from "./request";

describe("Request", () => {
  describe("constructor", () => {
    it("creates request with URL string", () => {
      const request = new Request("https://example.com");

      expect(request.url).toBe("https://example.com");
      expect(request.method).toBe("GET");
      expect(request.state).toBe("pending");
      expect(request.depth).toBe(0);
      expect(request.retryCount).toBe(0);
    });

    it("creates request with options object", () => {
      const request = new Request({
        url: "https://example.com/api",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"test": true}',
        label: "api-request",
        priority: 5,
      });

      expect(request.url).toBe("https://example.com/api");
      expect(request.method).toBe("POST");
      expect(request.headers).toEqual({ "Content-Type": "application/json" });
      expect(request.body).toBe('{"test": true}');
      expect(request.label).toBe("api-request");
      expect(request.priority).toBe(5);
    });

    it("uses provided id and createdAt", () => {
      const createdAt = new Date("2024-01-01");
      const request = new Request({
        url: "https://example.com",
        id: "custom-id-123",
        createdAt,
      });

      expect(request.id).toBe("custom-id-123");
      expect(request.createdAt).toEqual(createdAt);
    });

    it("generates unique id if not provided", () => {
      const request1 = new Request("https://example.com");
      const request2 = new Request("https://example.com");

      expect(request1.id).toBeTruthy();
      expect(request2.id).toBeTruthy();
      expect(request1.id).not.toBe(request2.id);
    });

    it("creates child request with correct depth", () => {
      const parent = new Request("https://example.com");
      const child = parent.createChildRequest({
        url: "https://example.com/page",
      });

      expect(child.depth).toBe(1);
      expect(child.parentRequestId).toBe(parent.id);
    });

    it("computes unique key for deduplication", () => {
      const request1 = new Request("https://example.com/page?b=2&a=1");
      const request2 = new Request("https://example.com/page?a=1&b=2");

      expect(request1.uniqueKey).toBe(request2.uniqueKey);
    });
  });

  describe("state transitions", () => {
    let request: Request;

    beforeEach(() => {
      request = new Request("https://example.com");
    });

    it("starts in pending state", () => {
      expect(request.state).toBe("pending");
    });

    it("transitions to processing", () => {
      request.markProcessing();
      expect(request.state).toBe("processing");
    });

    it("transitions to completed", () => {
      request.markProcessing();
      request.markCompleted();

      expect(request.state).toBe("completed");
      expect(request.processedAt).toBeInstanceOf(Date);
    });

    it("transitions to retrying when can retry", () => {
      request.markFailed("Error 1");

      expect(request.state).toBe("retrying");
      expect(request.retryCount).toBe(1);
      expect(request.errorMessages).toContain("Error 1");
    });

    it("transitions to failed when cannot retry", () => {
      const noRetryRequest = new Request({
        url: "https://example.com",
        noRetry: true,
      });

      noRetryRequest.markFailed("Error");

      expect(noRetryRequest.state).toBe("failed");
      expect(noRetryRequest.processedAt).toBeInstanceOf(Date);
    });

    it("transitions to failed after max retries", () => {
      const request = new Request({
        url: "https://example.com",
        maxRetries: 2,
      });

      request.markFailed("Error 1");
      request.resetForRetry();
      request.markFailed("Error 2");
      request.resetForRetry();
      request.markFailed("Error 3");

      expect(request.state).toBe("failed");
      expect(request.retryCount).toBe(2);
    });

    it("resetForRetry returns to pending state", () => {
      request.markFailed("Error");
      request.resetForRetry();

      expect(request.state).toBe("pending");
    });
  });

  describe("retry logic", () => {
    it("canRetry returns true when retries available", () => {
      const request = new Request({
        url: "https://example.com",
        maxRetries: 3,
      });

      expect(request.canRetry()).toBe(true);
    });

    it("canRetry returns false when noRetry is true", () => {
      const request = new Request({
        url: "https://example.com",
        noRetry: true,
      });

      expect(request.canRetry()).toBe(false);
    });

    it("canRetry returns false after max retries", () => {
      const request = new Request({
        url: "https://example.com",
        maxRetries: 1,
      });

      request.markFailed("Error 1");
      request.resetForRetry();

      expect(request.canRetry()).toBe(false);
    });

    it("getRemainingRetries returns correct count", () => {
      const request = new Request({
        url: "https://example.com",
        maxRetries: 3,
      });

      expect(request.getRemainingRetries()).toBe(3);

      request.markFailed("Error 1");
      expect(request.getRemainingRetries()).toBe(2);

      request.resetForRetry();
      request.markFailed("Error 2");
      expect(request.getRemainingRetries()).toBe(1);
    });

    it("getRetryDelay implements exponential backoff", () => {
      const request = new Request("https://example.com");

      const delay0 = request.getRetryDelay(1000, 30000);
      expect(delay0).toBeGreaterThanOrEqual(1000);
      expect(delay0).toBeLessThanOrEqual(1300); // 1000 + 30% jitter

      request.markFailed("Error 1");
      const delay1 = request.getRetryDelay(1000, 30000);
      expect(delay1).toBeGreaterThanOrEqual(2000);
      expect(delay1).toBeLessThanOrEqual(2600); // 2000 + 30% jitter
    });

    it("getRetryDelay respects maxDelayMs", () => {
      const request = new Request({
        url: "https://example.com",
        maxRetries: 10,
      });

      // Simulate many retries
      for (let i = 0; i < 8; i++) {
        request.markFailed(`Error ${i}`);
        request.resetForRetry();
      }

      const delay = request.getRetryDelay(1000, 5000);
      expect(delay).toBeLessThanOrEqual(5000);
    });
  });

  describe("serialization", () => {
    it("toJSON returns correct structure", () => {
      const request = new Request({
        url: "https://example.com",
        method: "POST",
        headers: { Authorization: "Bearer token" },
        body: "test",
        label: "test-label",
        priority: 10,
      });

      const json = request.toJSON();

      expect(json.url).toBe("https://example.com");
      expect(json.method).toBe("POST");
      expect(json.headers).toEqual({ Authorization: "Bearer token" });
      expect(json.body).toBe("test");
      expect(json.label).toBe("test-label");
      expect(json.priority).toBe(10);
      expect(json.state).toBe("pending");
      expect(json.retryCount).toBe(0);
      expect(json.errorMessages).toEqual([]);
    });

    it("fromJSON restores request correctly", () => {
      const original = new Request({
        url: "https://example.com",
        method: "POST",
        headers: { "X-Test": "value" },
        label: "test",
        maxRetries: 5,
      });

      original.markFailed("Error 1");
      original.depth = 2;

      const json = original.toJSON();
      const restored = Request.fromJSON(json);

      expect(restored.url).toBe(original.url);
      expect(restored.method).toBe(original.method);
      expect(restored.headers).toEqual(original.headers);
      expect(restored.label).toBe(original.label);
      expect(restored.maxRetries).toBe(original.maxRetries);
      expect(restored.state).toBe(original.state);
      expect(restored.retryCount).toBe(original.retryCount);
      expect(restored.errorMessages).toEqual(original.errorMessages);
      expect(restored.depth).toBe(original.depth);
    });
  });

  describe("clone", () => {
    it("creates independent copy", () => {
      const original = new Request({
        url: "https://example.com",
        method: "POST",
        headers: { "X-Test": "value" },
        userData: { key: "value" },
      });

      original.markFailed("Error");
      const cloned = original.clone();

      // Check values match
      expect(cloned.url).toBe(original.url);
      expect(cloned.method).toBe(original.method);
      expect(cloned.state).toBe(original.state);
      expect(cloned.errorMessages).toEqual(original.errorMessages);

      // Check independence
      cloned.headers["X-New"] = "new-value";
      expect(original.headers["X-New"]).toBeUndefined();

      cloned.errorMessages.push("New Error");
      expect(original.errorMessages).not.toContain("New Error");
    });
  });
});

describe("createRequests", () => {
  it("creates requests from URL strings", () => {
    const requests = createRequests([
      "https://example.com/page1",
      "https://example.com/page2",
    ]);

    expect(requests).toHaveLength(2);
    expect(requests[0]?.url).toBe("https://example.com/page1");
    expect(requests[1]?.url).toBe("https://example.com/page2");
  });

  it("creates requests from options objects", () => {
    const requests = createRequests([
      { url: "https://example.com/api", method: "POST" },
      { url: "https://example.com/data", method: "GET" },
    ]);

    expect(requests).toHaveLength(2);
    expect(requests[0]?.method).toBe("POST");
    expect(requests[1]?.method).toBe("GET");
  });

  it("applies default options", () => {
    const requests = createRequests(
      ["https://example.com/page1", "https://example.com/page2"],
      { priority: 5, maxRetries: 10 },
    );

    expect(requests[0]?.priority).toBe(5);
    expect(requests[0]?.maxRetries).toBe(10);
    expect(requests[1]?.priority).toBe(5);
    expect(requests[1]?.maxRetries).toBe(10);
  });

  it("allows overriding default options", () => {
    const requests = createRequests(
      [
        "https://example.com/normal",
        { url: "https://example.com/high-priority", priority: 100 },
      ],
      { priority: 5 },
    );

    expect(requests[0]?.priority).toBe(5);
    expect(requests[1]?.priority).toBe(100);
  });
});
