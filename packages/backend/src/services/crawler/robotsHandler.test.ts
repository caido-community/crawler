/**
 * Tests for RobotsHandler class
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResponseData } from "../../models";
import { type HttpClient } from "../../repositories";

import { RobotsHandler } from "./robotsHandler";

// Mock the HttpClient
vi.mock("../../repositories", () => ({
  HttpClient: vi.fn(),
}));

describe("RobotsHandler", () => {
  let handler: RobotsHandler;
  let mockHttpClient: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockHttpClient = {
      get: vi.fn(),
    };
    handler = new RobotsHandler(
      mockHttpClient as unknown as HttpClient,
      "TestBot",
    );
  });

  describe("isAllowed", () => {
    it("returns true for invalid URLs", async () => {
      const result = await handler.isAllowed("not-a-valid-url");
      expect(result).toBe(true);
    });

    it("returns true when robots.txt fetch fails", async () => {
      mockHttpClient.get.mockRejectedValueOnce(new Error("Network error"));

      const result = await handler.isAllowed("https://example.com/page");
      expect(result).toBe(true);
    });

    it("returns true when no robots.txt exists (non-200 response)", async () => {
      mockHttpClient.get.mockResolvedValueOnce(
        new ResponseData({
          url: "https://example.com/robots.txt",
          statusCode: 404,
          headers: {},
          body: "",
          contentType: "text/plain",
          isHtml: false,
          isJson: false,
          isXml: false,
          redirectChain: [],
          timing: {
            startedAt: new Date(),
            completedAt: new Date(),
            durationMs: 50,
          },
        }),
      );

      const result = await handler.isAllowed("https://example.com/page");
      expect(result).toBe(true);
    });

    it("fetches robots.txt and caches parser for domain", async () => {
      mockHttpClient.get.mockResolvedValueOnce(
        new ResponseData({
          url: "https://example.com/robots.txt",
          statusCode: 200,
          headers: {},
          body: "User-agent: *\nDisallow: /private/",
          contentType: "text/plain",
          isHtml: false,
          isJson: false,
          isXml: false,
          redirectChain: [],
          timing: {
            startedAt: new Date(),
            completedAt: new Date(),
            durationMs: 50,
          },
        }),
      );

      // First call fetches robots.txt
      await handler.isAllowed("https://example.com/page");

      // Second call should use cached parser
      await handler.isAllowed("https://example.com/other");

      // Should only fetch once
      expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
    });

    it("allows paths not in Disallow", async () => {
      mockHttpClient.get.mockResolvedValueOnce(
        new ResponseData({
          url: "https://example.com/robots.txt",
          statusCode: 200,
          headers: {},
          body: "User-agent: *\nDisallow: /private/",
          contentType: "text/plain",
          isHtml: false,
          isJson: false,
          isXml: false,
          redirectChain: [],
          timing: {
            startedAt: new Date(),
            completedAt: new Date(),
            durationMs: 50,
          },
        }),
      );

      const result = await handler.isAllowed("https://example.com/public/page");
      expect(result).toBe(true);
    });

    it("disallows paths in Disallow", async () => {
      mockHttpClient.get.mockResolvedValueOnce(
        new ResponseData({
          url: "https://example.com/robots.txt",
          statusCode: 200,
          headers: {},
          body: "User-agent: *\nDisallow: /private/",
          contentType: "text/plain",
          isHtml: false,
          isJson: false,
          isXml: false,
          redirectChain: [],
          timing: {
            startedAt: new Date(),
            completedAt: new Date(),
            durationMs: 50,
          },
        }),
      );

      const result = await handler.isAllowed(
        "https://example.com/private/secret",
      );
      expect(result).toBe(false);
    });

    it("handles concurrent requests for same domain", async () => {
      // Simulate slow response
      let resolvePromise: (value: ResponseData) => void;
      const slowPromise = new Promise<ResponseData>((resolve) => {
        resolvePromise = resolve;
      });

      mockHttpClient.get.mockReturnValueOnce(slowPromise);

      // Start two concurrent requests
      const promise1 = handler.isAllowed("https://example.com/page1");
      const promise2 = handler.isAllowed("https://example.com/page2");

      // Should have only made one fetch
      expect(mockHttpClient.get).toHaveBeenCalledTimes(1);

      // Resolve the robots.txt fetch
      resolvePromise!(
        new ResponseData({
          url: "https://example.com/robots.txt",
          statusCode: 200,
          headers: {},
          body: "User-agent: *\nAllow: /",
          contentType: "text/plain",
          isHtml: false,
          isJson: false,
          isXml: false,
          redirectChain: [],
          timing: {
            startedAt: new Date(),
            completedAt: new Date(),
            durationMs: 50,
          },
        }),
      );

      // Both promises should resolve
      const [result1, result2] = await Promise.all([promise1, promise2]);
      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });
  });

  describe("getSitemaps", () => {
    it("returns empty array for unknown domain", () => {
      expect(handler.getSitemaps("unknown.com")).toEqual([]);
    });

    it("returns sitemaps from parsed robots.txt", async () => {
      mockHttpClient.get.mockResolvedValueOnce(
        new ResponseData({
          url: "https://example.com/robots.txt",
          statusCode: 200,
          headers: {},
          body: "User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml",
          contentType: "text/plain",
          isHtml: false,
          isJson: false,
          isXml: false,
          redirectChain: [],
          timing: {
            startedAt: new Date(),
            completedAt: new Date(),
            durationMs: 50,
          },
        }),
      );

      await handler.isAllowed("https://example.com/page");
      const sitemaps = handler.getSitemaps("example.com");

      expect(sitemaps).toContain("https://example.com/sitemap.xml");
    });
  });

  describe("reset", () => {
    it("clears all cached parsers", async () => {
      mockHttpClient.get.mockResolvedValue(
        new ResponseData({
          url: "https://example.com/robots.txt",
          statusCode: 200,
          headers: {},
          body: "User-agent: *\nAllow: /",
          contentType: "text/plain",
          isHtml: false,
          isJson: false,
          isXml: false,
          redirectChain: [],
          timing: {
            startedAt: new Date(),
            completedAt: new Date(),
            durationMs: 50,
          },
        }),
      );

      await handler.isAllowed("https://example.com/page");
      expect(mockHttpClient.get).toHaveBeenCalledTimes(1);

      handler.reset();

      await handler.isAllowed("https://example.com/page");
      expect(mockHttpClient.get).toHaveBeenCalledTimes(2);
    });
  });
});
