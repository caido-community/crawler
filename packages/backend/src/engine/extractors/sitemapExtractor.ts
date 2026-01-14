/**
 * Sitemap Extractor - Parse sitemap.xml and sitemap index files
 */

import type {
  ExtractedLink,
  ExtractionResult,
  ResponseData,
  Sitemap,
  SitemapUrl,
} from "../types";

import { BaseExtractor, type ExtractorOptions } from "./baseExtractor";

// ============================================================================
// XML Patterns
// ============================================================================

const PATTERNS = {
  // Sitemap index
  sitemapIndex: /<sitemapindex[^>]*>([\s\S]*?)<\/sitemapindex>/i,
  sitemapLoc: /<sitemap[^>]*>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/gi,

  // URL set
  urlset: /<urlset[^>]*>([\s\S]*?)<\/urlset>/i,
  url: /<url[^>]*>([\s\S]*?)<\/url>/gi,
  loc: /<loc>([^<]+)<\/loc>/i,
  lastmod: /<lastmod>([^<]+)<\/lastmod>/i,
  changefreq: /<changefreq>([^<]+)<\/changefreq>/i,
  priority: /<priority>([^<]+)<\/priority>/i,

  // Common sitemap locations
  robotsSitemap: /Sitemap:\s*(.+)/gi,
};

// ============================================================================
// Sitemap Extractor Class
// ============================================================================

export class SitemapExtractor extends BaseExtractor {
  constructor(options: ExtractorOptions) {
    super(options);
  }

  canHandle(response: ResponseData): boolean {
    // Handle XML content
    if (response.isXml) {
      return true;
    }

    // Also handle URLs ending in sitemap.xml
    try {
      const url = new URL(response.url);
      return (
        url.pathname.endsWith("sitemap.xml") ||
        (url.pathname.includes("sitemap") && url.pathname.endsWith(".xml"))
      );
    } catch {
      return false;
    }
  }

  extract(response: ResponseData): ExtractionResult {
    const xml = response.body;
    const links: ExtractedLink[] = [];

    // Check if it's a sitemap index (contains sitemaps)
    if (this.isSitemapIndex(xml)) {
      const sitemapUrls = this.extractSitemapIndexUrls(xml);
      for (const url of sitemapUrls) {
        const normalized = this.normalizeUrl(url);
        if (normalized !== undefined) {
          links.push({ url: normalized, source: "sitemap" });
        }
      }
    }

    // Extract URLs from urlset
    const urls = this.extractSitemapUrls(xml);
    for (const sitemapUrl of urls) {
      const normalized = this.normalizeUrl(sitemapUrl.loc);
      if (normalized !== undefined) {
        links.push({ url: normalized, source: "sitemap" });
      }
    }

    return {
      links: this.deduplicateLinks(links),
      forms: [],
      emails: [],
      metadata: {},
    };
  }

  /**
   * Checks if the XML is a sitemap index
   */
  private isSitemapIndex(xml: string): boolean {
    return PATTERNS.sitemapIndex.test(xml);
  }

  /**
   * Extracts sitemap URLs from a sitemap index
   */
  private extractSitemapIndexUrls(xml: string): string[] {
    const urls: string[] = [];
    const regex = new RegExp(
      PATTERNS.sitemapLoc.source,
      PATTERNS.sitemapLoc.flags,
    );

    let match = regex.exec(xml);
    while (match !== null) {
      const loc = match[1];
      if (loc !== undefined) {
        urls.push(loc.trim());
      }
      match = regex.exec(xml);
    }

    return urls;
  }

  /**
   * Extracts URL entries from a sitemap
   */
  private extractSitemapUrls(xml: string): SitemapUrl[] {
    const urls: SitemapUrl[] = [];
    const urlRegex = new RegExp(PATTERNS.url.source, PATTERNS.url.flags);

    let match = urlRegex.exec(xml);
    while (match !== null) {
      const urlContent = match[1] ?? "";

      const locMatch = PATTERNS.loc.exec(urlContent);
      if (locMatch !== null && locMatch[1] !== undefined) {
        const sitemapUrl: SitemapUrl = {
          loc: locMatch[1].trim(),
        };

        // Extract optional fields
        const lastmodMatch = PATTERNS.lastmod.exec(urlContent);
        if (lastmodMatch !== null && lastmodMatch[1] !== undefined) {
          sitemapUrl.lastmod = lastmodMatch[1].trim();
        }

        const changefreqMatch = PATTERNS.changefreq.exec(urlContent);
        if (changefreqMatch !== null && changefreqMatch[1] !== undefined) {
          const freq = changefreqMatch[1].trim().toLowerCase();
          if (isValidChangefreq(freq)) {
            sitemapUrl.changefreq = freq;
          }
        }

        const priorityMatch = PATTERNS.priority.exec(urlContent);
        if (priorityMatch !== null && priorityMatch[1] !== undefined) {
          const priority = parseFloat(priorityMatch[1].trim());
          if (!isNaN(priority) && priority >= 0 && priority <= 1) {
            sitemapUrl.priority = priority;
          }
        }

        urls.push(sitemapUrl);
      }

      match = urlRegex.exec(xml);
    }

    return urls;
  }

  /**
   * Parses a complete sitemap into a Sitemap object
   */
  parseSitemap(xml: string): Sitemap {
    const sitemap: Sitemap = {
      urls: [],
      sitemaps: [],
    };

    // Check for nested sitemaps
    if (this.isSitemapIndex(xml)) {
      sitemap.sitemaps = this.extractSitemapIndexUrls(xml);
    }

    // Extract URLs
    sitemap.urls = this.extractSitemapUrls(xml);

    return sitemap;
  }

  /**
   * Generates common sitemap URLs to try
   */
  static getCommonSitemapUrls(baseUrl: string): string[] {
    try {
      const urlObj = new URL(baseUrl);
      const origin = urlObj.origin;

      return [
        `${origin}/sitemap.xml`,
        `${origin}/sitemap_index.xml`,
        `${origin}/sitemap/sitemap.xml`,
        `${origin}/sitemaps/sitemap.xml`,
        `${origin}/sitemap1.xml`,
        `${origin}/post-sitemap.xml`,
        `${origin}/page-sitemap.xml`,
        `${origin}/category-sitemap.xml`,
      ];
    } catch {
      return [];
    }
  }

  /**
   * Extracts sitemap URLs from robots.txt content
   */
  static extractSitemapsFromRobots(robotsTxt: string): string[] {
    const sitemaps: string[] = [];
    const regex = new RegExp(
      PATTERNS.robotsSitemap.source,
      PATTERNS.robotsSitemap.flags,
    );

    let match = regex.exec(robotsTxt);
    while (match !== null) {
      const url = match[1];
      if (url !== undefined) {
        sitemaps.push(url.trim());
      }
      match = regex.exec(robotsTxt);
    }

    return sitemaps;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

type ValidChangefreq =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

function isValidChangefreq(freq: string): freq is ValidChangefreq {
  return [
    "always",
    "hourly",
    "daily",
    "weekly",
    "monthly",
    "yearly",
    "never",
  ].includes(freq);
}
