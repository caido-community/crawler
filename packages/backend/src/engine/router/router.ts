/**
 * Router - Routes requests to handlers based on URL patterns
 */

import type { CrawlingContext, Route, RouteHandler } from "../types";

// ============================================================================
// Types
// ============================================================================

export interface RouterOptions {
  defaultHandler?: RouteHandler;
}

interface RegisteredRoute {
  pattern: string | RegExp;
  handler: RouteHandler;
  label?: string;
  priority: number;
}

// ============================================================================
// Router Class
// ============================================================================

export class Router {
  private routes: RegisteredRoute[] = [];
  private defaultHandler: RouteHandler | undefined;
  private routeCounter: number = 0;

  constructor(options: RouterOptions = {}) {
    this.defaultHandler = options.defaultHandler;
  }

  /**
   * Adds a route with a string pattern (glob-like matching)
   */
  addRoute(pattern: string, handler: RouteHandler, label?: string): this {
    this.routes.push({
      pattern,
      handler,
      label,
      priority: this.routeCounter++,
    });
    return this;
  }

  /**
   * Adds a route with a regex pattern
   */
  addRegexRoute(pattern: RegExp, handler: RouteHandler, label?: string): this {
    this.routes.push({
      pattern,
      handler,
      label,
      priority: this.routeCounter++,
    });
    return this;
  }

  /**
   * Adds a default handler for unmatched routes
   */
  addDefaultRoute(handler: RouteHandler): this {
    this.defaultHandler = handler;
    return this;
  }

  /**
   * Routes a context to the appropriate handler
   */
  async route(context: CrawlingContext): Promise<void> {
    const url = context.request.url;
    const label = context.request.label;

    // First, check for label match
    if (label !== undefined) {
      const labelRoute = this.routes.find((r) => r.label === label);
      if (labelRoute !== undefined) {
        await labelRoute.handler(context);
        return;
      }
    }

    // Then, check for pattern match
    for (const route of this.routes) {
      if (this.matchesPattern(url, route.pattern)) {
        await route.handler(context);
        return;
      }
    }

    // Fall back to default handler
    if (this.defaultHandler !== undefined) {
      await this.defaultHandler(context);
    }
  }

  /**
   * Gets the handler for a URL/label without executing it
   */
  getHandler(url: string, label?: string): RouteHandler | undefined {
    // First, check for label match
    if (label !== undefined) {
      const labelRoute = this.routes.find((r) => r.label === label);
      if (labelRoute !== undefined) {
        return labelRoute.handler;
      }
    }

    // Then, check for pattern match
    for (const route of this.routes) {
      if (this.matchesPattern(url, route.pattern)) {
        return route.handler;
      }
    }

    return this.defaultHandler;
  }

  /**
   * Checks if a URL matches a pattern
   */
  private matchesPattern(url: string, pattern: string | RegExp): boolean {
    if (pattern instanceof RegExp) {
      return pattern.test(url);
    }

    // Convert glob-like pattern to regex
    const regex = this.globToRegex(pattern);
    return regex.test(url);
  }

  /**
   * Converts a glob-like pattern to a regex
   * Supports:
   * - * for any characters (except /)
   * - ** for any characters (including /)
   * - ? for single character
   */
  private globToRegex(pattern: string): RegExp {
    let regexPattern = pattern
      // Escape special regex characters (except * and ?)
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      // Replace ** with a placeholder
      .replace(/\*\*/g, "<<<STARSTAR>>>")
      // Replace * with [^/]*
      .replace(/\*/g, "[^/]*")
      // Replace placeholder with .*
      .replace(/<<<STARSTAR>>>/g, ".*")
      // Replace ? with .
      .replace(/\?/g, ".");

    // Anchor the pattern
    if (!regexPattern.startsWith("^")) {
      regexPattern = "^" + regexPattern;
    }
    if (!regexPattern.endsWith("$")) {
      regexPattern = regexPattern + "$";
    }

    return new RegExp(regexPattern, "i");
  }

  /**
   * Removes a route by label
   */
  removeRoute(label: string): boolean {
    const index = this.routes.findIndex((r) => r.label === label);
    if (index >= 0) {
      this.routes.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Clears all routes
   */
  clearRoutes(): void {
    this.routes = [];
    this.routeCounter = 0;
  }

  /**
   * Gets all registered routes
   */
  getRoutes(): Route[] {
    return this.routes.map((r) => ({
      pattern: r.pattern,
      handler: r.handler,
      label: r.label,
    }));
  }

  /**
   * Gets the number of registered routes
   */
  routeCount(): number {
    return this.routes.length;
  }

  /**
   * Creates a new router with common patterns pre-configured
   */
  static createDefault(options: RouterOptions = {}): Router {
    return new Router(options);
  }
}

// ============================================================================
// Pattern Helpers
// ============================================================================

/**
 * Common URL patterns
 */
export const CommonPatterns = {
  // File types
  HTML: /\.html?$/i,
  PHP: /\.php$/i,
  ASP: /\.aspx?$/i,
  JSP: /\.jsp$/i,

  // Resources
  CSS: /\.css$/i,
  JS: /\.js$/i,
  JSON: /\.json$/i,
  XML: /\.xml$/i,

  // Images
  IMAGES: /\.(png|jpg|jpeg|gif|webp|svg|ico|bmp)$/i,

  // Documents
  PDF: /\.pdf$/i,
  DOCUMENTS: /\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/i,

  // Media
  VIDEO: /\.(mp4|webm|avi|mov|mkv)$/i,
  AUDIO: /\.(mp3|wav|ogg|flac|aac)$/i,

  // API endpoints
  API: /\/api\//i,
  GRAPHQL: /\/graphql/i,
  REST: /\/v\d+\//i,

  // Common paths
  LOGIN: /\/(login|signin|auth)/i,
  LOGOUT: /\/(logout|signout)/i,
  REGISTER: /\/(register|signup)/i,
  ADMIN: /\/(admin|dashboard)/i,

  // Sitemap and robots
  SITEMAP: /sitemap.*\.xml$/i,
  ROBOTS: /robots\.txt$/i,
};

/**
 * Checks if a URL matches any of the given patterns
 */
export function matchesAny(url: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(url));
}

/**
 * Checks if a URL is a resource (not a page)
 */
export function isResourceUrl(url: string): boolean {
  return matchesAny(url, [
    CommonPatterns.CSS,
    CommonPatterns.JS,
    CommonPatterns.IMAGES,
    CommonPatterns.VIDEO,
    CommonPatterns.AUDIO,
    CommonPatterns.DOCUMENTS,
  ]);
}

/**
 * Checks if a URL is likely a page
 */
export function isPageUrl(url: string): boolean {
  // No extension or HTML-like extension
  const path = new URL(url).pathname;
  const hasNoExtension = !path.includes(".") || path.endsWith("/");
  const hasPageExtension = matchesAny(url, [
    CommonPatterns.HTML,
    CommonPatterns.PHP,
    CommonPatterns.ASP,
    CommonPatterns.JSP,
  ]);

  return hasNoExtension || hasPageExtension;
}
