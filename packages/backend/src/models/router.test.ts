/**
 * Tests for Router class and URL utility functions
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CommonPatterns,
  isPageUrl,
  isResourceUrl,
  matchesAny,
  Router,
} from "./router";
import type { CrawlingContext } from "./types";

// Mock context factory
function createMockContext(url: string, label?: string): CrawlingContext {
  return {
    request: {
      url,
      label,
      id: "test-id",
      uniqueKey: url,
      method: "GET",
      depth: 0,
    },
    response: {
      url,
      statusCode: 200,
      headers: {},
      body: "",
    },
    enqueueLinks: vi.fn(),
    pushData: vi.fn(),
    log: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  } as unknown as CrawlingContext;
}

describe("Router", () => {
  let router: Router;

  beforeEach(() => {
    router = new Router();
  });

  describe("constructor", () => {
    it("creates router with no routes", () => {
      expect(router.routeCount()).toBe(0);
    });

    it("creates router with default handler", () => {
      const handler = vi.fn();
      router = new Router({ defaultHandler: handler });
      expect(router.getHandler("https://example.com")).toBe(handler);
    });
  });

  describe("addRoute", () => {
    it("adds a route with string pattern", () => {
      const handler = vi.fn();
      router.addRoute("https://example.com/*", handler);
      expect(router.routeCount()).toBe(1);
    });

    it("returns this for chaining", () => {
      const handler = vi.fn();
      const result = router.addRoute("*", handler);
      expect(result).toBe(router);
    });
  });

  describe("addRegexRoute", () => {
    it("adds a route with regex pattern", () => {
      const handler = vi.fn();
      router.addRegexRoute(/example\.com/, handler);
      expect(router.routeCount()).toBe(1);
    });
  });

  describe("addDefaultRoute", () => {
    it("sets default handler", async () => {
      const handler = vi.fn();
      router.addDefaultRoute(handler);

      await router.route(createMockContext("https://unknown.com"));
      expect(handler).toHaveBeenCalled();
    });
  });

  describe("route", () => {
    it("routes to matching string pattern", async () => {
      const handler = vi.fn();
      router.addRoute("https://example.com/**", handler);

      await router.route(createMockContext("https://example.com/page"));
      expect(handler).toHaveBeenCalled();
    });

    it("routes to matching regex pattern", async () => {
      const handler = vi.fn();
      router.addRegexRoute(/\/api\//, handler);

      await router.route(createMockContext("https://example.com/api/users"));
      expect(handler).toHaveBeenCalled();
    });

    it("routes by label first", async () => {
      const patternHandler = vi.fn();
      const labelHandler = vi.fn();

      router.addRoute("https://example.com/**", patternHandler, "pattern");
      router.addRoute("*", labelHandler, "my-label");

      await router.route(
        createMockContext("https://example.com/page", "my-label"),
      );

      expect(labelHandler).toHaveBeenCalled();
      expect(patternHandler).not.toHaveBeenCalled();
    });

    it("falls back to default handler", async () => {
      const defaultHandler = vi.fn();
      router.addDefaultRoute(defaultHandler);

      await router.route(createMockContext("https://unknown.com"));
      expect(defaultHandler).toHaveBeenCalled();
    });

    it("does nothing when no handler matches", async () => {
      await router.route(createMockContext("https://unknown.com"));
      // Should not throw
    });
  });

  describe("getHandler", () => {
    it("returns handler for matching URL", () => {
      const handler = vi.fn();
      router.addRoute("https://example.com/**", handler);

      expect(router.getHandler("https://example.com/page")).toBe(handler);
    });

    it("returns handler by label", () => {
      const handler = vi.fn();
      router.addRoute("*", handler, "my-label");

      expect(router.getHandler("https://any.com", "my-label")).toBe(handler);
    });

    it("returns undefined when no match", () => {
      expect(router.getHandler("https://unknown.com")).toBeUndefined();
    });

    it("returns default handler as fallback", () => {
      const handler = vi.fn();
      router.addDefaultRoute(handler);

      expect(router.getHandler("https://unknown.com")).toBe(handler);
    });
  });

  describe("glob pattern matching", () => {
    it("matches * for single path segment", async () => {
      const handler = vi.fn();
      router.addRoute("https://example.com/*/page", handler);

      await router.route(createMockContext("https://example.com/foo/page"));
      expect(handler).toHaveBeenCalled();
    });

    it("does not match * across slashes", async () => {
      const handler = vi.fn();
      router.addRoute("https://example.com/*/page", handler);

      await router.route(createMockContext("https://example.com/foo/bar/page"));
      expect(handler).not.toHaveBeenCalled();
    });

    it("matches ** for multiple path segments", async () => {
      const handler = vi.fn();
      router.addRoute("https://example.com/**/page", handler);

      await router.route(createMockContext("https://example.com/a/b/c/page"));
      expect(handler).toHaveBeenCalled();
    });

    it("matches ? for single character", async () => {
      const handler = vi.fn();
      router.addRoute("https://example.com/page?", handler);

      await router.route(createMockContext("https://example.com/page1"));
      expect(handler).toHaveBeenCalled();
    });
  });

  describe("removeRoute", () => {
    it("removes route by label", () => {
      router.addRoute("*", vi.fn(), "to-remove");
      router.addRoute("*", vi.fn(), "to-keep");

      const result = router.removeRoute("to-remove");
      expect(result).toBe(true);
      expect(router.routeCount()).toBe(1);
    });

    it("returns false for unknown label", () => {
      expect(router.removeRoute("unknown")).toBe(false);
    });
  });

  describe("clearRoutes", () => {
    it("removes all routes", () => {
      router.addRoute("*", vi.fn());
      router.addRoute("*", vi.fn());
      router.clearRoutes();
      expect(router.routeCount()).toBe(0);
    });
  });

  describe("getRoutes", () => {
    it("returns all registered routes", () => {
      router.addRoute("https://example.com/*", vi.fn(), "route1");
      router.addRegexRoute(/test/, vi.fn(), "route2");

      const routes = router.getRoutes();
      expect(routes).toHaveLength(2);
      expect(routes[0]?.label).toBe("route1");
      expect(routes[1]?.label).toBe("route2");
    });
  });

  describe("createDefault", () => {
    it("creates a new router instance", () => {
      const newRouter = Router.createDefault();
      expect(newRouter).toBeInstanceOf(Router);
    });
  });
});

describe("CommonPatterns", () => {
  describe("file type patterns", () => {
    it("matches HTML files", () => {
      expect(CommonPatterns.HTML.test("page.html")).toBe(true);
      expect(CommonPatterns.HTML.test("page.htm")).toBe(true);
    });

    it("matches image files", () => {
      expect(CommonPatterns.IMAGES.test("photo.jpg")).toBe(true);
      expect(CommonPatterns.IMAGES.test("logo.png")).toBe(true);
      expect(CommonPatterns.IMAGES.test("icon.svg")).toBe(true);
    });

    it("matches document files", () => {
      expect(CommonPatterns.PDF.test("doc.pdf")).toBe(true);
      expect(CommonPatterns.DOCUMENTS.test("file.docx")).toBe(true);
    });
  });

  describe("path patterns", () => {
    it("matches API paths", () => {
      expect(CommonPatterns.API.test("/api/users")).toBe(true);
      expect(CommonPatterns.GRAPHQL.test("/graphql")).toBe(true);
    });

    it("matches auth paths", () => {
      expect(CommonPatterns.LOGIN.test("/login")).toBe(true);
      expect(CommonPatterns.LOGIN.test("/signin")).toBe(true);
      expect(CommonPatterns.LOGOUT.test("/logout")).toBe(true);
    });
  });
});

describe("matchesAny", () => {
  it("returns true when URL matches any pattern", () => {
    const patterns = [CommonPatterns.HTML, CommonPatterns.PHP];
    expect(matchesAny("page.html", patterns)).toBe(true);
    expect(matchesAny("page.php", patterns)).toBe(true);
  });

  it("returns false when URL matches no patterns", () => {
    const patterns = [CommonPatterns.HTML, CommonPatterns.PHP];
    expect(matchesAny("page.js", patterns)).toBe(false);
  });
});

describe("isResourceUrl", () => {
  it("returns true for resource URLs", () => {
    expect(isResourceUrl("https://example.com/style.css")).toBe(true);
    expect(isResourceUrl("https://example.com/script.js")).toBe(true);
    expect(isResourceUrl("https://example.com/image.png")).toBe(true);
    expect(isResourceUrl("https://example.com/video.mp4")).toBe(true);
  });

  it("returns false for page URLs", () => {
    expect(isResourceUrl("https://example.com/page")).toBe(false);
    expect(isResourceUrl("https://example.com/page.html")).toBe(false);
  });
});

describe("isPageUrl", () => {
  it("returns true for page URLs", () => {
    expect(isPageUrl("https://example.com/page")).toBe(true);
    expect(isPageUrl("https://example.com/page/")).toBe(true);
    expect(isPageUrl("https://example.com/page.html")).toBe(true);
    expect(isPageUrl("https://example.com/page.php")).toBe(true);
  });

  it("returns false for resource URLs", () => {
    expect(isPageUrl("https://example.com/style.css")).toBe(false);
    expect(isPageUrl("https://example.com/image.png")).toBe(false);
  });
});
