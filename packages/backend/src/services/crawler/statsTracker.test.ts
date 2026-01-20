/**
 * Tests for StatsTracker class
 */

import { beforeEach, describe, expect, it } from "vitest";

import { ResponseData } from "../../models";

import { StatsTracker } from "./statsTracker";

describe("StatsTracker", () => {
  let tracker: StatsTracker;

  beforeEach(() => {
    tracker = new StatsTracker();
  });

  describe("initial state", () => {
    it("starts with all counters at zero", () => {
      const stats = tracker.getStats();
      expect(stats.requestsFinished).toBe(0);
      expect(stats.requestsFailed).toBe(0);
      expect(stats.requestsRetried).toBe(0);
      expect(stats.requestsTotal).toBe(0);
    });

    it("starts with empty status code and error maps", () => {
      const stats = tracker.getStats();
      expect(stats.requestsWithStatusCode).toEqual({});
      expect(stats.errorsPerType).toEqual({});
    });

    it("starts with minResponseTimeMs as Infinity", () => {
      const stats = tracker.getStats();
      expect(stats.minResponseTimeMs).toBe(Infinity);
    });
  });

  describe("recordRequestQueued", () => {
    it("increments requestsTotal", () => {
      tracker.recordRequestQueued();
      tracker.recordRequestQueued();
      tracker.recordRequestQueued();
      expect(tracker.getStats().requestsTotal).toBe(3);
    });
  });

  describe("recordRequestFinished", () => {
    it("increments requestsFinished", () => {
      tracker.recordRequestFinished();
      tracker.recordRequestFinished();
      expect(tracker.getStats().requestsFinished).toBe(2);
    });
  });

  describe("recordRequestFailed", () => {
    it("increments requestsFailed", () => {
      tracker.recordRequestFailed();
      expect(tracker.getStats().requestsFailed).toBe(1);
    });
  });

  describe("recordRequestRetried", () => {
    it("increments requestsRetried", () => {
      tracker.recordRequestRetried();
      tracker.recordRequestRetried();
      expect(tracker.getStats().requestsRetried).toBe(2);
    });
  });

  describe("recordError", () => {
    it("counts errors by type", () => {
      tracker.recordError("TypeError");
      tracker.recordError("TypeError");
      tracker.recordError("NetworkError");

      const stats = tracker.getStats();
      expect(stats.errorsPerType["TypeError"]).toBe(2);
      expect(stats.errorsPerType["NetworkError"]).toBe(1);
    });
  });

  describe("recordResponseTiming", () => {
    it("updates timing statistics", () => {
      const response = new ResponseData({
        url: "https://example.com",
        statusCode: 200,
        headers: {},
        body: "",
        contentType: "text/html",
        isHtml: true,
        isJson: false,
        isXml: false,
        redirectChain: [],
        timing: {
          startedAt: new Date(),
          completedAt: new Date(),
          durationMs: 150,
        },
      });

      tracker.recordResponseTiming(response);
      const stats = tracker.getStats();

      expect(stats.totalResponseTimeMs).toBe(150);
      expect(stats.maxResponseTimeMs).toBe(150);
      expect(stats.minResponseTimeMs).toBe(150);
    });

    it("tracks max response time", () => {
      const createResponse = (duration: number) =>
        new ResponseData({
          url: "https://example.com",
          statusCode: 200,
          headers: {},
          body: "",
          contentType: "text/html",
          isHtml: true,
          isJson: false,
          isXml: false,
          redirectChain: [],
          timing: {
            startedAt: new Date(),
            completedAt: new Date(),
            durationMs: duration,
          },
        });

      tracker.recordResponseTiming(createResponse(100));
      tracker.recordResponseTiming(createResponse(300));
      tracker.recordResponseTiming(createResponse(50));

      expect(tracker.getStats().maxResponseTimeMs).toBe(300);
    });

    it("tracks min response time", () => {
      const createResponse = (duration: number) =>
        new ResponseData({
          url: "https://example.com",
          statusCode: 200,
          headers: {},
          body: "",
          contentType: "text/html",
          isHtml: true,
          isJson: false,
          isXml: false,
          redirectChain: [],
          timing: {
            startedAt: new Date(),
            completedAt: new Date(),
            durationMs: duration,
          },
        });

      tracker.recordResponseTiming(createResponse(100));
      tracker.recordResponseTiming(createResponse(300));
      tracker.recordResponseTiming(createResponse(50));

      expect(tracker.getStats().minResponseTimeMs).toBe(50);
    });

    it("counts status codes", () => {
      const createResponse = (statusCode: number) =>
        new ResponseData({
          url: "https://example.com",
          statusCode,
          headers: {},
          body: "",
          contentType: "text/html",
          isHtml: true,
          isJson: false,
          isXml: false,
          redirectChain: [],
          timing: {
            startedAt: new Date(),
            completedAt: new Date(),
            durationMs: 100,
          },
        });

      tracker.recordResponseTiming(createResponse(200));
      tracker.recordResponseTiming(createResponse(200));
      tracker.recordResponseTiming(createResponse(404));
      tracker.recordResponseTiming(createResponse(500));

      const stats = tracker.getStats();
      expect(stats.requestsWithStatusCode[200]).toBe(2);
      expect(stats.requestsWithStatusCode[404]).toBe(1);
      expect(stats.requestsWithStatusCode[500]).toBe(1);
    });
  });

  describe("setRuntimeMs", () => {
    it("sets crawlerRuntimeMs", () => {
      tracker.setRuntimeMs(5000);
      expect(tracker.getStats().crawlerRuntimeMs).toBe(5000);
    });

    it("calculates requestsPerMinute and requestsPerSecond", () => {
      // Simulate 30 requests finished in 60 seconds
      for (let i = 0; i < 30; i++) {
        tracker.recordRequestFinished();
      }
      tracker.setRuntimeMs(60000); // 60 seconds

      const stats = tracker.getStats();
      expect(stats.requestsPerMinute).toBe(30);
      expect(stats.requestsPerSecond).toBe(0.5);
    });
  });

  describe("reset", () => {
    it("resets all counters to initial state", () => {
      tracker.recordRequestQueued();
      tracker.recordRequestFinished();
      tracker.recordRequestFailed();
      tracker.recordError("Error");

      tracker.reset();
      const stats = tracker.getStats();

      expect(stats.requestsTotal).toBe(0);
      expect(stats.requestsFinished).toBe(0);
      expect(stats.requestsFailed).toBe(0);
      expect(stats.errorsPerType).toEqual({});
    });
  });

  describe("getStats", () => {
    it("returns a copy (not reference) of stats", () => {
      const stats1 = tracker.getStats();
      tracker.recordRequestQueued();
      const stats2 = tracker.getStats();

      expect(stats1.requestsTotal).toBe(0);
      expect(stats2.requestsTotal).toBe(1);
    });
  });
});
