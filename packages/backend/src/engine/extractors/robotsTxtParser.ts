/**
 * Robots.txt Parser - Parse and evaluate robots.txt rules
 */

import type { RobotsRule, RobotsTxt } from "../types";

// ============================================================================
// Types
// ============================================================================

export interface RobotsParserOptions {
  userAgent?: string;
}

// ============================================================================
// Robots.txt Parser Class
// ============================================================================

export class RobotsTxtParser {
  private rules: RobotsRule[] = [];
  private sitemaps: string[] = [];
  private crawlDelay: number | undefined;
  private userAgent: string;
  private isParsed: boolean = false;

  constructor(options: RobotsParserOptions = {}) {
    this.userAgent = options.userAgent ?? "*";
  }

  /**
   * Parses robots.txt content
   */
  parse(content: string): RobotsTxt {
    const lines = content.split(/\r?\n/);
    let currentUserAgents: string[] = [];
    let currentAllow: string[] = [];
    let currentDisallow: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();

      // Skip empty lines and comments
      if (line === "" || line.startsWith("#")) {
        continue;
      }

      // Remove inline comments
      const commentIndex = line.indexOf("#");
      const cleanLine =
        commentIndex >= 0 ? line.substring(0, commentIndex).trim() : line;

      if (cleanLine === "") {
        continue;
      }

      // Parse directive
      const colonIndex = cleanLine.indexOf(":");
      if (colonIndex < 0) {
        continue;
      }

      const directive = cleanLine.substring(0, colonIndex).trim().toLowerCase();
      const value = cleanLine.substring(colonIndex + 1).trim();

      switch (directive) {
        case "user-agent":
          // If we have accumulated rules, save them
          if (
            currentUserAgents.length > 0 &&
            (currentAllow.length > 0 || currentDisallow.length > 0)
          ) {
            for (const ua of currentUserAgents) {
              this.rules.push({
                userAgent: ua.toLowerCase(),
                allow: [...currentAllow],
                disallow: [...currentDisallow],
              });
            }
          }

          // Check if this is a new group or continuation
          if (currentAllow.length > 0 || currentDisallow.length > 0) {
            // New group
            currentUserAgents = [value];
            currentAllow = [];
            currentDisallow = [];
          } else {
            // Continuation of user-agent declarations
            currentUserAgents.push(value);
          }
          break;

        case "allow":
          if (value !== "") {
            currentAllow.push(this.normalizePattern(value));
          }
          break;

        case "disallow":
          if (value !== "") {
            currentDisallow.push(this.normalizePattern(value));
          }
          break;

        case "sitemap":
          if (value !== "") {
            this.sitemaps.push(value);
          }
          break;

        case "crawl-delay": {
          const delay = parseFloat(value);
          if (!isNaN(delay) && delay >= 0) {
            // Only set crawl delay for matching user agent
            if (this.matchesUserAgent(currentUserAgents)) {
              this.crawlDelay = delay;
            }
          }
          break;
        }
      }
    }

    // Save final rule group
    if (
      currentUserAgents.length > 0 &&
      (currentAllow.length > 0 || currentDisallow.length > 0)
    ) {
      for (const ua of currentUserAgents) {
        this.rules.push({
          userAgent: ua.toLowerCase(),
          allow: [...currentAllow],
          disallow: [...currentDisallow],
        });
      }
    }

    this.isParsed = true;

    return {
      rules: this.rules,
      sitemaps: this.sitemaps,
      crawlDelay: this.crawlDelay,
    };
  }

  /**
   * Normalizes a pattern for matching
   */
  private normalizePattern(pattern: string): string {
    // Remove leading/trailing whitespace
    let normalized = pattern.trim();

    // Ensure pattern starts with /
    if (!normalized.startsWith("/") && !normalized.startsWith("*")) {
      normalized = "/" + normalized;
    }

    return normalized;
  }

  /**
   * Checks if current user agents match our user agent
   */
  private matchesUserAgent(userAgents: string[]): boolean {
    for (const ua of userAgents) {
      if (
        ua === "*" ||
        this.userAgent.toLowerCase().includes(ua.toLowerCase())
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks if a URL path is allowed
   */
  isAllowed(url: string): boolean {
    if (!this.isParsed) {
      return true; // If no robots.txt, everything is allowed
    }

    // Get path from URL
    let path: string;
    try {
      const urlObj = new URL(url);
      path = urlObj.pathname + urlObj.search;
    } catch {
      path = url;
    }

    // Find applicable rules
    const applicableRules = this.getApplicableRules();

    if (applicableRules.length === 0) {
      return true; // No rules for this user agent
    }

    // Check rules - more specific patterns win
    let result = true;
    let longestMatch = -1;

    for (const rule of applicableRules) {
      // Check disallow rules
      for (const pattern of rule.disallow) {
        if (this.pathMatches(path, pattern)) {
          const matchLength = this.getPatternSpecificity(pattern);
          if (matchLength > longestMatch) {
            longestMatch = matchLength;
            result = false;
          }
        }
      }

      // Check allow rules (can override disallow)
      for (const pattern of rule.allow) {
        if (this.pathMatches(path, pattern)) {
          const matchLength = this.getPatternSpecificity(pattern);
          if (matchLength > longestMatch) {
            longestMatch = matchLength;
            result = true;
          }
        }
      }
    }

    return result;
  }

  /**
   * Gets rules applicable to our user agent
   */
  private getApplicableRules(): RobotsRule[] {
    const ua = this.userAgent.toLowerCase();

    // First, look for specific user agent rules
    const specificRules = this.rules.filter(
      (rule) =>
        rule.userAgent !== "*" && ua.includes(rule.userAgent.toLowerCase()),
    );

    if (specificRules.length > 0) {
      return specificRules;
    }

    // Fall back to wildcard rules
    return this.rules.filter((rule) => rule.userAgent === "*");
  }

  /**
   * Checks if a path matches a pattern
   */
  private pathMatches(path: string, pattern: string): boolean {
    // Empty pattern matches everything
    if (pattern === "" || pattern === "/") {
      return true;
    }

    // Convert pattern to regex
    let regexPattern = pattern
      // Escape special regex characters (except * and $)
      .replace(/[.+?^{}()|[\]\\]/g, "\\$&")
      // * matches any sequence of characters
      .replace(/\*/g, ".*");

    // $ at end means exact match
    if (regexPattern.endsWith("$")) {
      regexPattern = regexPattern.slice(0, -1) + "$";
    } else {
      // Otherwise, pattern should match prefix
      regexPattern = "^" + regexPattern;
    }

    try {
      const regex = new RegExp(regexPattern, "i");
      return regex.test(path);
    } catch {
      // If regex is invalid, do simple prefix match
      return path.startsWith(pattern.replace(/\*/g, ""));
    }
  }

  /**
   * Gets the specificity of a pattern (for rule precedence)
   */
  private getPatternSpecificity(pattern: string): number {
    // Remove wildcards and count remaining characters
    return pattern.replace(/\*/g, "").length;
  }

  /**
   * Gets the crawl delay in milliseconds
   */
  getCrawlDelayMs(): number | undefined {
    if (this.crawlDelay === undefined) {
      return undefined;
    }
    return this.crawlDelay * 1000;
  }

  /**
   * Gets the list of sitemaps
   */
  getSitemaps(): string[] {
    return [...this.sitemaps];
  }

  /**
   * Gets all rules
   */
  getRules(): RobotsRule[] {
    return [...this.rules];
  }

  /**
   * Sets the user agent for rule matching
   */
  setUserAgent(userAgent: string): void {
    this.userAgent = userAgent;
  }

  /**
   * Checks if robots.txt has been parsed
   */
  hasParsed(): boolean {
    return this.isParsed;
  }

  /**
   * Resets the parser
   */
  reset(): void {
    this.rules = [];
    this.sitemaps = [];
    this.crawlDelay = undefined;
    this.isParsed = false;
  }

  /**
   * Gets the robots.txt URL for a given URL
   */
  static getRobotsTxtUrl(url: string): string | undefined {
    try {
      const urlObj = new URL(url);
      return `${urlObj.origin}/robots.txt`;
    } catch {
      return undefined;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a parser and parses content in one step
 */
export function parseRobotsTxt(
  content: string,
  options?: RobotsParserOptions,
): RobotsTxtParser {
  const parser = new RobotsTxtParser(options);
  parser.parse(content);
  return parser;
}
