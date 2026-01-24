import { describe, expect, it } from "vitest";

import { ResponseData } from "./types";

describe("ResponseData", () => {
  const createResponse = (statusCode: number): ResponseData => {
    return new ResponseData({
      url: "https://example.com",
      statusCode,
      headers: { "content-type": ["text/html"] },
      body: "<html></html>",
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
  };

  describe("constructor", () => {
    it("creates response with all properties", () => {
      const timing = {
        startedAt: new Date("2024-01-01T00:00:00Z"),
        completedAt: new Date("2024-01-01T00:00:01Z"),
        durationMs: 1000,
      };

      const response = new ResponseData({
        url: "https://example.com/page",
        statusCode: 200,
        headers: {
          "content-type": ["text/html"],
          "cache-control": ["max-age=3600"],
        },
        body: "<html><body>Hello</body></html>",
        contentType: "text/html",
        isHtml: true,
        isJson: false,
        isXml: false,
        redirectChain: ["https://example.com", "https://example.com/page"],
        timing,
      });

      expect(response.url).toBe("https://example.com/page");
      expect(response.statusCode).toBe(200);
      expect(response.headers).toEqual({
        "content-type": ["text/html"],
        "cache-control": ["max-age=3600"],
      });
      expect(response.body).toBe("<html><body>Hello</body></html>");
      expect(response.contentType).toBe("text/html");
      expect(response.isHtml).toBe(true);
      expect(response.isJson).toBe(false);
      expect(response.isXml).toBe(false);
      expect(response.redirectChain).toEqual([
        "https://example.com",
        "https://example.com/page",
      ]);
      expect(response.timing).toEqual(timing);
    });
  });

  describe("isSuccess", () => {
    it("returns true for 200", () => {
      const response = createResponse(200);
      expect(response.isSuccess()).toBe(true);
    });

    it("returns true for 201", () => {
      const response = createResponse(201);
      expect(response.isSuccess()).toBe(true);
    });

    it("returns true for 204", () => {
      const response = createResponse(204);
      expect(response.isSuccess()).toBe(true);
    });

    it("returns true for 299", () => {
      const response = createResponse(299);
      expect(response.isSuccess()).toBe(true);
    });

    it("returns false for 199", () => {
      const response = createResponse(199);
      expect(response.isSuccess()).toBe(false);
    });

    it("returns false for 300", () => {
      const response = createResponse(300);
      expect(response.isSuccess()).toBe(false);
    });

    it("returns false for 400", () => {
      const response = createResponse(400);
      expect(response.isSuccess()).toBe(false);
    });

    it("returns false for 404", () => {
      const response = createResponse(404);
      expect(response.isSuccess()).toBe(false);
    });

    it("returns false for 500", () => {
      const response = createResponse(500);
      expect(response.isSuccess()).toBe(false);
    });
  });

  describe("shouldRetry", () => {
    it("returns true for 500", () => {
      const response = createResponse(500);
      expect(response.shouldRetry()).toBe(true);
    });

    it("returns true for 502", () => {
      const response = createResponse(502);
      expect(response.shouldRetry()).toBe(true);
    });

    it("returns true for 503", () => {
      const response = createResponse(503);
      expect(response.shouldRetry()).toBe(true);
    });

    it("returns true for 504", () => {
      const response = createResponse(504);
      expect(response.shouldRetry()).toBe(true);
    });

    it("returns true for 429 (Too Many Requests)", () => {
      const response = createResponse(429);
      expect(response.shouldRetry()).toBe(true);
    });

    it("returns true for 408 (Request Timeout)", () => {
      const response = createResponse(408);
      expect(response.shouldRetry()).toBe(true);
    });

    it("returns false for 200", () => {
      const response = createResponse(200);
      expect(response.shouldRetry()).toBe(false);
    });

    it("returns false for 400", () => {
      const response = createResponse(400);
      expect(response.shouldRetry()).toBe(false);
    });

    it("returns false for 401", () => {
      const response = createResponse(401);
      expect(response.shouldRetry()).toBe(false);
    });

    it("returns false for 403", () => {
      const response = createResponse(403);
      expect(response.shouldRetry()).toBe(false);
    });

    it("returns false for 404", () => {
      const response = createResponse(404);
      expect(response.shouldRetry()).toBe(false);
    });

    it("returns false for 499", () => {
      const response = createResponse(499);
      expect(response.shouldRetry()).toBe(false);
    });
  });
});
