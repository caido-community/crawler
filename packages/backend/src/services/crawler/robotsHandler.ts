/**
 * Handles robots.txt fetching and parsing.
 * Caches parsers per domain to avoid redundant fetches.
 */

import { RobotsTxtParser } from "../../parsers";
import { type HttpClient } from "../../repositories";

/**
 * Manages robots.txt parsing for multiple domains.
 * Uses promise-based deduplication to prevent concurrent fetches for the same domain.
 */
export class RobotsHandler {
  private parsers: Map<string, RobotsTxtParser> = new Map();
  private fetchPromises: Map<string, Promise<void>> = new Map();
  private httpClient: HttpClient;
  private userAgent: string;

  constructor(httpClient: HttpClient, userAgent: string) {
    this.httpClient = httpClient;
    this.userAgent = userAgent;
  }

  /**
   * Checks if a URL is allowed by the site's robots.txt.
   * Fetches and caches robots.txt on first check for each domain.
   *
   * @param url - The URL to check
   * @returns true if allowed, false if disallowed
   */
  async isAllowed(url: string): Promise<boolean> {
    try {
      const domain = this.getDomain(url);

      // Check if we already have a parser for this domain
      let parser = this.parsers.get(domain);
      if (parser !== undefined) {
        return parser.isAllowed(url);
      }

      // Check if we're already fetching for this domain
      const existingPromise = this.fetchPromises.get(domain);
      if (existingPromise !== undefined) {
        await existingPromise;
        parser = this.parsers.get(domain);
        return parser?.isAllowed(url) ?? true;
      }

      // Start fetching robots.txt
      const fetchPromise = this.fetchRobotsTxt(domain);
      this.fetchPromises.set(domain, fetchPromise);

      try {
        await fetchPromise;
      } finally {
        this.fetchPromises.delete(domain);
      }

      parser = this.parsers.get(domain);
      return parser?.isAllowed(url) ?? true;
    } catch {
      // On error, allow the URL
      return true;
    }
  }

  /**
   * Fetches and parses robots.txt for a domain.
   */
  private async fetchRobotsTxt(domain: string): Promise<void> {
    const robotsUrl = `https://${domain}/robots.txt`;
    const parser = new RobotsTxtParser({ userAgent: this.userAgent });

    try {
      const response = await this.httpClient.get(robotsUrl, {
        saveToHistory: false,
      });

      if (response.isSuccess()) {
        parser.parse(response.body);
      }
    } catch {
      // Ignore fetch errors - parser will allow all URLs
    }

    this.parsers.set(domain, parser);
  }

  /**
   * Gets sitemaps declared in robots.txt for a domain.
   */
  getSitemaps(domain: string): string[] {
    const parser = this.parsers.get(domain);
    return parser?.getSitemaps() ?? [];
  }

  /**
   * Clears all cached parsers.
   */
  reset(): void {
    this.parsers.clear();
    this.fetchPromises.clear();
  }

  /**
   * Extracts hostname from URL.
   */
  private getDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }
}
