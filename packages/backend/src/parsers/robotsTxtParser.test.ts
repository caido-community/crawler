import { beforeEach, describe, expect, it } from "vitest";

import { parseRobotsTxt, RobotsTxtParser } from "./robotsTxtParser";

describe("RobotsTxtParser", () => {
  describe("constructor", () => {
    it("uses default user agent when none provided", () => {
      const parser = new RobotsTxtParser();
      expect(parser.hasParsed()).toBe(false);
    });

    it("accepts custom user agent", () => {
      const parser = new RobotsTxtParser({ userAgent: "MyBot/1.0" });
      expect(parser.hasParsed()).toBe(false);
    });
  });

  describe("parse", () => {
    it("parses simple robots.txt", () => {
      const parser = new RobotsTxtParser();
      const result = parser.parse(`
        User-agent: *
        Disallow: /private/
        Allow: /private/public/
      `);

      expect(result.rules).toHaveLength(1);
      expect(result.rules[0]?.userAgent).toBe("*");
      expect(result.rules[0]?.disallow).toContain("/private/");
      expect(result.rules[0]?.allow).toContain("/private/public/");
    });

    it("parses multiple user agents", () => {
      const parser = new RobotsTxtParser();
      const result = parser.parse(`
        User-agent: Googlebot
        Disallow: /admin/

        User-agent: Bingbot
        Disallow: /api/

        User-agent: *
        Disallow: /private/
      `);

      expect(result.rules).toHaveLength(3);
    });

    it("parses multiple user agents for same rules", () => {
      const parser = new RobotsTxtParser();
      const result = parser.parse(`
        User-agent: Googlebot
        User-agent: Bingbot
        Disallow: /admin/
      `);

      expect(result.rules).toHaveLength(2);
      expect(
        result.rules.find((r) => r.userAgent === "googlebot"),
      ).toBeDefined();
      expect(result.rules.find((r) => r.userAgent === "bingbot")).toBeDefined();
    });

    it("parses sitemaps", () => {
      const parser = new RobotsTxtParser();
      const result = parser.parse(`
        User-agent: *
        Disallow:

        Sitemap: https://example.com/sitemap.xml
        Sitemap: https://example.com/sitemap2.xml
      `);

      expect(result.sitemaps).toHaveLength(2);
      expect(result.sitemaps).toContain("https://example.com/sitemap.xml");
      expect(result.sitemaps).toContain("https://example.com/sitemap2.xml");
    });

    it("parses crawl-delay", () => {
      const parser = new RobotsTxtParser();
      const result = parser.parse(`
        User-agent: *
        Crawl-delay: 10
        Disallow: /admin/
      `);

      expect(result.crawlDelay).toBe(10);
      expect(parser.getCrawlDelayMs()).toBe(10000);
    });

    it("ignores comments", () => {
      const parser = new RobotsTxtParser();
      const result = parser.parse(`
        # This is a comment
        User-agent: *  # Inline comment
        Disallow: /private/  # Private folder
      `);

      expect(result.rules).toHaveLength(1);
      expect(result.rules[0]?.disallow).toContain("/private/");
    });

    it("handles empty lines", () => {
      const parser = new RobotsTxtParser();
      const result = parser.parse(`
        User-agent: *



        Disallow: /admin/


        Allow: /admin/public/

      `);

      expect(result.rules).toHaveLength(1);
      expect(result.rules[0]?.disallow).toContain("/admin/");
      expect(result.rules[0]?.allow).toContain("/admin/public/");
    });

    it("handles case insensitive directives", () => {
      const parser = new RobotsTxtParser();
      const result = parser.parse(`
        USER-AGENT: *
        DISALLOW: /private/
        ALLOW: /private/public/
      `);

      expect(result.rules).toHaveLength(1);
    });

    it("normalizes patterns without leading slash", () => {
      const parser = new RobotsTxtParser();
      const result = parser.parse(`
        User-agent: *
        Disallow: admin/
      `);

      expect(result.rules[0]?.disallow).toContain("/admin/");
    });
  });

  describe("isAllowed", () => {
    it("allows all URLs when no robots.txt", () => {
      const parser = new RobotsTxtParser();
      // Not parsed yet
      expect(parser.isAllowed("https://example.com/admin")).toBe(true);
    });

    it("disallows matching paths", () => {
      const parser = new RobotsTxtParser();
      parser.parse(`
        User-agent: *
        Disallow: /private/
      `);

      expect(parser.isAllowed("https://example.com/private/page")).toBe(false);
      // Note: /private without trailing slash is NOT matched by /private/ rule
      expect(parser.isAllowed("https://example.com/private")).toBe(true);
      expect(parser.isAllowed("https://example.com/public")).toBe(true);
    });

    it("disallows paths without trailing slash", () => {
      const parser = new RobotsTxtParser();
      parser.parse(`
        User-agent: *
        Disallow: /private
      `);

      expect(parser.isAllowed("https://example.com/private")).toBe(false);
      expect(parser.isAllowed("https://example.com/private/page")).toBe(false);
      expect(parser.isAllowed("https://example.com/privatestuff")).toBe(false);
      expect(parser.isAllowed("https://example.com/public")).toBe(true);
    });

    it("allows matching paths with allow rule", () => {
      const parser = new RobotsTxtParser();
      parser.parse(`
        User-agent: *
        Disallow: /private/
        Allow: /private/public/
      `);

      expect(parser.isAllowed("https://example.com/private/secret")).toBe(
        false,
      );
      expect(parser.isAllowed("https://example.com/private/public/file")).toBe(
        true,
      );
    });

    it("more specific patterns win", () => {
      const parser = new RobotsTxtParser();
      parser.parse(`
        User-agent: *
        Disallow: /
        Allow: /public
      `);

      expect(parser.isAllowed("https://example.com/")).toBe(false);
      expect(parser.isAllowed("https://example.com/anything")).toBe(false);
      expect(parser.isAllowed("https://example.com/public")).toBe(true);
      expect(parser.isAllowed("https://example.com/public/page")).toBe(true);
    });

    it("matches wildcards in patterns", () => {
      const parser = new RobotsTxtParser();
      parser.parse(`
        User-agent: *
        Disallow: /*.pdf
      `);

      expect(parser.isAllowed("https://example.com/document.pdf")).toBe(false);
      expect(parser.isAllowed("https://example.com/dir/file.pdf")).toBe(false);
      expect(parser.isAllowed("https://example.com/document.html")).toBe(true);
    });

    it("matches end-of-URL with $", () => {
      const parser = new RobotsTxtParser();
      parser.parse(`
        User-agent: *
        Disallow: /*.pdf$
      `);

      expect(parser.isAllowed("https://example.com/file.pdf")).toBe(false);
      expect(parser.isAllowed("https://example.com/file.pdf?query=1")).toBe(
        true,
      );
    });

    it("uses specific user agent rules over wildcard", () => {
      const parser = new RobotsTxtParser({ userAgent: "Googlebot" });
      parser.parse(`
        User-agent: Googlebot
        Disallow: /google-private/

        User-agent: *
        Disallow: /private/
      `);

      expect(parser.isAllowed("https://example.com/google-private/")).toBe(
        false,
      );
      expect(parser.isAllowed("https://example.com/private/")).toBe(true); // Wildcard doesn't apply
    });

    it("handles query parameters in URL", () => {
      const parser = new RobotsTxtParser();
      parser.parse(`
        User-agent: *
        Disallow: /search?
      `);

      expect(parser.isAllowed("https://example.com/search")).toBe(true);
      expect(parser.isAllowed("https://example.com/search?q=test")).toBe(false);
    });

    it("handles plain path string", () => {
      const parser = new RobotsTxtParser();
      parser.parse(`
        User-agent: *
        Disallow: /private/
      `);

      expect(parser.isAllowed("/private/page")).toBe(false);
      expect(parser.isAllowed("/public/page")).toBe(true);
    });
  });

  describe("getSitemaps", () => {
    it("returns empty array when no sitemaps", () => {
      const parser = new RobotsTxtParser();
      parser.parse(`
        User-agent: *
        Disallow:
      `);

      expect(parser.getSitemaps()).toEqual([]);
    });

    it("returns all sitemaps", () => {
      const parser = new RobotsTxtParser();
      parser.parse(`
        Sitemap: https://example.com/sitemap1.xml
        Sitemap: https://example.com/sitemap2.xml

        User-agent: *
        Disallow:
      `);

      const sitemaps = parser.getSitemaps();
      expect(sitemaps).toHaveLength(2);
    });

    it("returns copy of sitemaps array", () => {
      const parser = new RobotsTxtParser();
      parser.parse(`Sitemap: https://example.com/sitemap.xml`);

      const sitemaps1 = parser.getSitemaps();
      const sitemaps2 = parser.getSitemaps();

      expect(sitemaps1).not.toBe(sitemaps2);
    });
  });

  describe("getCrawlDelayMs", () => {
    it("returns undefined when no crawl-delay", () => {
      const parser = new RobotsTxtParser();
      parser.parse(`
        User-agent: *
        Disallow:
      `);

      expect(parser.getCrawlDelayMs()).toBeUndefined();
    });

    it("converts seconds to milliseconds", () => {
      const parser = new RobotsTxtParser();
      parser.parse(`
        User-agent: *
        Crawl-delay: 5
        Disallow:
      `);

      expect(parser.getCrawlDelayMs()).toBe(5000);
    });

    it("handles decimal crawl-delay", () => {
      const parser = new RobotsTxtParser();
      parser.parse(`
        User-agent: *
        Crawl-delay: 0.5
        Disallow:
      `);

      expect(parser.getCrawlDelayMs()).toBe(500);
    });
  });

  describe("getRules", () => {
    it("returns copy of rules array", () => {
      const parser = new RobotsTxtParser();
      parser.parse(`
        User-agent: *
        Disallow: /private/
      `);

      const rules1 = parser.getRules();
      const rules2 = parser.getRules();

      expect(rules1).not.toBe(rules2);
      expect(rules1).toEqual(rules2);
    });
  });

  describe("setUserAgent", () => {
    it("changes user agent for rule matching", () => {
      const parser = new RobotsTxtParser({ userAgent: "*" });
      parser.parse(`
        User-agent: Googlebot
        Disallow: /google-only/

        User-agent: *
        Disallow: /private/
      `);

      // Initially uses wildcard
      expect(parser.isAllowed("https://example.com/google-only/")).toBe(true);
      expect(parser.isAllowed("https://example.com/private/")).toBe(false);

      // Change to Googlebot
      parser.setUserAgent("Googlebot");
      expect(parser.isAllowed("https://example.com/google-only/")).toBe(false);
      expect(parser.isAllowed("https://example.com/private/")).toBe(true);
    });
  });

  describe("reset", () => {
    it("clears all parsed data", () => {
      const parser = new RobotsTxtParser();
      parser.parse(`
        User-agent: *
        Disallow: /private/
        Crawl-delay: 10
        Sitemap: https://example.com/sitemap.xml
      `);

      expect(parser.hasParsed()).toBe(true);
      expect(parser.getRules().length).toBeGreaterThan(0);
      expect(parser.getSitemaps().length).toBeGreaterThan(0);
      expect(parser.getCrawlDelayMs()).toBeDefined();

      parser.reset();

      expect(parser.hasParsed()).toBe(false);
      expect(parser.getRules()).toEqual([]);
      expect(parser.getSitemaps()).toEqual([]);
      expect(parser.getCrawlDelayMs()).toBeUndefined();
    });
  });

  describe("getRobotsTxtUrl", () => {
    it("constructs robots.txt URL from page URL", () => {
      expect(RobotsTxtParser.getRobotsTxtUrl("https://example.com/page")).toBe(
        "https://example.com/robots.txt",
      );
    });

    it("handles URLs with ports", () => {
      expect(
        RobotsTxtParser.getRobotsTxtUrl("https://example.com:8080/page"),
      ).toBe("https://example.com:8080/robots.txt");
    });

    it("handles URLs with paths", () => {
      expect(
        RobotsTxtParser.getRobotsTxtUrl(
          "https://example.com/deep/path/page.html",
        ),
      ).toBe("https://example.com/robots.txt");
    });

    it("returns undefined for invalid URLs", () => {
      expect(RobotsTxtParser.getRobotsTxtUrl("not-a-url")).toBeUndefined();
    });
  });
});

describe("parseRobotsTxt", () => {
  it("creates parser and parses content", () => {
    const parser = parseRobotsTxt(`
      User-agent: *
      Disallow: /private/
    `);

    expect(parser.hasParsed()).toBe(true);
    expect(parser.isAllowed("/private/")).toBe(false);
  });

  it("accepts options", () => {
    const parser = parseRobotsTxt(
      `
        User-agent: Googlebot
        Disallow: /google-private/

        User-agent: *
        Disallow: /private/
      `,
      { userAgent: "Googlebot" },
    );

    expect(parser.isAllowed("/google-private/")).toBe(false);
    expect(parser.isAllowed("/private/")).toBe(true);
  });
});
