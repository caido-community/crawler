/**
 * Tests for linkProcessor module
 */

import { describe, expect, it } from "vitest";

import {
  filterLinksByStrategy,
  filterSameDomain,
  filterSameHostname,
  filterSameOrigin,
  getDomain,
  getHost,
  getRootDomain,
} from "./linkProcessor";
import type { ExtractedLink } from "./types";

describe("linkProcessor", () => {
  describe("getRootDomain", () => {
    it("returns hostname unchanged for two-part domains", () => {
      expect(getRootDomain("example.com")).toBe("example.com");
    });

    it("extracts root domain from subdomains", () => {
      expect(getRootDomain("sub.example.com")).toBe("example.com");
      expect(getRootDomain("a.b.c.example.com")).toBe("example.com");
    });

    it("handles single-part hostnames", () => {
      expect(getRootDomain("localhost")).toBe("localhost");
    });
  });

  describe("getDomain", () => {
    it("extracts hostname from valid URLs", () => {
      expect(getDomain("https://example.com/path")).toBe("example.com");
      expect(getDomain("http://sub.example.com:8080/")).toBe("sub.example.com");
    });

    it("returns original string for invalid URLs", () => {
      expect(getDomain("not-a-url")).toBe("not-a-url");
    });
  });

  describe("getHost", () => {
    it("extracts hostname from valid URLs", () => {
      expect(getHost("https://example.com/path")).toBe("example.com");
    });

    it("returns undefined for invalid URLs", () => {
      expect(getHost("not-a-url")).toBeUndefined();
    });
  });

  describe("filterSameDomain", () => {
    const links: ExtractedLink[] = [
      { url: "https://example.com/page1", source: "anchor" },
      { url: "https://sub.example.com/page2", source: "anchor" },
      { url: "https://other.com/page3", source: "anchor" },
    ];

    it("filters to same root domain", () => {
      const result = filterSameDomain(links, "https://example.com");
      expect(result).toHaveLength(2);
      expect(result.map((l) => l.url)).toContain("https://example.com/page1");
      expect(result.map((l) => l.url)).toContain(
        "https://sub.example.com/page2",
      );
    });

    it("excludes different domains", () => {
      const result = filterSameDomain(links, "https://example.com");
      expect(result.map((l) => l.url)).not.toContain("https://other.com/page3");
    });

    it("handles invalid URLs gracefully", () => {
      const badLinks: ExtractedLink[] = [
        { url: "not-a-url", source: "anchor" },
        { url: "https://example.com/valid", source: "anchor" },
      ];
      const result = filterSameDomain(badLinks, "https://example.com");
      expect(result).toHaveLength(1);
      expect(result[0]?.url).toBe("https://example.com/valid");
    });

    it("returns all links if base URL is invalid", () => {
      const result = filterSameDomain(links, "not-a-url");
      expect(result).toHaveLength(3);
    });
  });

  describe("filterSameHostname", () => {
    const links: ExtractedLink[] = [
      { url: "https://example.com/page1", source: "anchor" },
      { url: "https://sub.example.com/page2", source: "anchor" },
      { url: "https://example.com/page3", source: "anchor" },
    ];

    it("filters to exact hostname match", () => {
      const result = filterSameHostname(links, "https://example.com");
      expect(result).toHaveLength(2);
      expect(result.map((l) => l.url)).toContain("https://example.com/page1");
      expect(result.map((l) => l.url)).toContain("https://example.com/page3");
    });

    it("excludes subdomain URLs", () => {
      const result = filterSameHostname(links, "https://example.com");
      expect(result.map((l) => l.url)).not.toContain(
        "https://sub.example.com/page2",
      );
    });
  });

  describe("filterSameOrigin", () => {
    const links: ExtractedLink[] = [
      { url: "https://example.com/page1", source: "anchor" },
      { url: "http://example.com/page2", source: "anchor" },
      { url: "https://example.com:8080/page3", source: "anchor" },
      { url: "https://example.com/page4", source: "anchor" },
    ];

    it("filters to exact origin match (protocol + host + port)", () => {
      const result = filterSameOrigin(links, "https://example.com/test");
      expect(result).toHaveLength(2);
      expect(result.map((l) => l.url)).toContain("https://example.com/page1");
      expect(result.map((l) => l.url)).toContain("https://example.com/page4");
    });

    it("excludes different protocols", () => {
      const result = filterSameOrigin(links, "https://example.com");
      expect(result.map((l) => l.url)).not.toContain(
        "http://example.com/page2",
      );
    });

    it("excludes different ports", () => {
      const result = filterSameOrigin(links, "https://example.com");
      expect(result.map((l) => l.url)).not.toContain(
        "https://example.com:8080/page3",
      );
    });
  });

  describe("filterLinksByStrategy", () => {
    const links: ExtractedLink[] = [
      { url: "https://example.com/page1", source: "anchor" },
      { url: "https://sub.example.com/page2", source: "anchor" },
      { url: "https://other.com/page3", source: "anchor" },
    ];

    it("returns all links with 'all' strategy and sameDomainOnly=false", () => {
      const result = filterLinksByStrategy(
        links,
        "https://example.com",
        "all",
        false,
      );
      expect(result).toHaveLength(3);
    });

    it("filters to same domain with 'all' strategy and sameDomainOnly=true", () => {
      const result = filterLinksByStrategy(
        links,
        "https://example.com",
        "all",
        true,
      );
      expect(result).toHaveLength(2);
    });

    it("filters by same-domain strategy", () => {
      const result = filterLinksByStrategy(
        links,
        "https://example.com",
        "same-domain",
        false,
      );
      expect(result).toHaveLength(2);
    });

    it("filters by same-hostname strategy", () => {
      const result = filterLinksByStrategy(
        links,
        "https://example.com",
        "same-hostname",
        false,
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.url).toBe("https://example.com/page1");
    });

    it("filters by same-origin strategy", () => {
      const result = filterLinksByStrategy(
        links,
        "https://example.com",
        "same-origin",
        false,
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.url).toBe("https://example.com/page1");
    });

    it("handles undefined strategy like 'all'", () => {
      const result = filterLinksByStrategy(
        links,
        "https://example.com",
        undefined,
        false,
      );
      expect(result).toHaveLength(3);
    });
  });
});
