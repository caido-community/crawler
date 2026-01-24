/**
 * Session - Manages cookies and headers for a crawl session
 */

export type Cookie = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
};

export type SessionData = {
  id: string;
  cookies: Cookie[];
  headers: Record<string, string>;
  userData: Record<string, unknown>;
  createdAt: Date;
  lastUsedAt: Date;
  usageCount: number;
  maxUsageCount: number;
  isBlocked: boolean;
  errorScore: number;
};

let sessionCounter = 0;

/**
 * Generates a unique session ID
 */
function generateSessionId(): string {
  sessionCounter++;
  return `session-${Date.now()}-${sessionCounter}`;
}

export class Session implements SessionData {
  readonly id: string;
  cookies: Cookie[];
  headers: Record<string, string>;
  userData: Record<string, unknown>;
  readonly createdAt: Date;
  lastUsedAt: Date;
  usageCount: number;
  readonly maxUsageCount: number;
  isBlocked: boolean;
  errorScore: number;

  constructor(options: Partial<SessionData> = {}) {
    this.id = options.id ?? generateSessionId();
    this.cookies = options.cookies ?? [];
    this.headers = options.headers ?? {};
    this.userData = options.userData ?? {};
    this.createdAt = options.createdAt ?? new Date();
    this.lastUsedAt = options.lastUsedAt ?? new Date();
    this.usageCount = options.usageCount ?? 0;
    this.maxUsageCount = options.maxUsageCount ?? 50;
    this.isBlocked = options.isBlocked ?? false;
    this.errorScore = options.errorScore ?? 0;
  }

  /**
   * Marks the session as used
   */
  markUsed(): void {
    this.usageCount++;
    this.lastUsedAt = new Date();
  }

  /**
   * Checks if the session is usable
   */
  isUsable(): boolean {
    return !this.isBlocked && !this.isExpired() && !this.isMaxedOut();
  }

  /**
   * Checks if the session has been used too many times
   */
  isMaxedOut(): boolean {
    return this.usageCount >= this.maxUsageCount;
  }

  /**
   * Checks if the session is expired
   */
  isExpired(): boolean {
    // Check if any cookies are expired
    const now = new Date();
    for (const cookie of this.cookies) {
      if (cookie.expires !== undefined && cookie.expires < now) {
        return true;
      }
    }
    return false;
  }

  /**
   * Records an error for this session
   */
  recordError(weight: number = 1): void {
    this.errorScore += weight;
    // Block session if error score is too high
    if (this.errorScore >= 8) {
      this.isBlocked = true;
    }
  }

  /**
   * Records a success (reduces error score)
   */
  recordSuccess(weight: number = 0.5): void {
    this.errorScore = Math.max(0, this.errorScore - weight);
  }

  /**
   * Sets a cookie
   */
  setCookie(cookie: Cookie): void {
    // Remove existing cookie with same name and domain
    this.cookies = this.cookies.filter(
      (c) => !(c.name === cookie.name && c.domain === cookie.domain),
    );
    this.cookies.push(cookie);
  }

  /**
   * Gets a cookie by name
   */
  getCookie(name: string, domain?: string): Cookie | undefined {
    return this.cookies.find((c) => {
      if (c.name !== name) return false;
      if (domain !== undefined && c.domain !== domain) return false;
      return true;
    });
  }

  /**
   * Removes a cookie
   */
  removeCookie(name: string, domain?: string): void {
    this.cookies = this.cookies.filter((c) => {
      if (c.name !== name) return true;
      if (domain !== undefined && c.domain !== domain) return true;
      return false;
    });
  }

  /**
   * Clears all cookies
   */
  clearCookies(): void {
    this.cookies = [];
  }

  /**
   * Gets cookies as a header string
   */
  getCookieHeader(domain?: string): string {
    const now = new Date();
    const validCookies = this.cookies.filter((c) => {
      // Check expiration
      if (c.expires !== undefined && c.expires < now) {
        return false;
      }
      // Check domain match
      if (domain !== undefined && c.domain !== undefined) {
        if (!domain.endsWith(c.domain) && c.domain !== domain) {
          return false;
        }
      }
      return true;
    });

    return validCookies.map((c) => `${c.name}=${c.value}`).join("; ");
  }

  /**
   * Parses and sets cookies from a Set-Cookie header
   */
  setCookiesFromHeader(setCookieHeaders: string[], domain?: string): void {
    for (const header of setCookieHeaders) {
      const cookie = this.parseCookieHeader(header, domain);
      if (cookie !== undefined) {
        this.setCookie(cookie);
      }
    }
  }

  /**
   * Parses a Set-Cookie header into a Cookie object
   */
  private parseCookieHeader(
    header: string,
    defaultDomain?: string,
  ): Cookie | undefined {
    const parts = header.split(";").map((p) => p.trim());
    const firstPart = parts[0];
    if (firstPart === undefined) {
      return undefined;
    }

    const equalsIndex = firstPart.indexOf("=");
    if (equalsIndex < 0) {
      return undefined;
    }

    const name = firstPart.substring(0, equalsIndex).trim();
    const value = firstPart.substring(equalsIndex + 1).trim();

    if (name === "") {
      return undefined;
    }

    const cookie: Cookie = { name, value };

    // Parse attributes
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (part === undefined) continue;

      const attrEqualsIndex = part.indexOf("=");
      const attrName =
        attrEqualsIndex >= 0
          ? part.substring(0, attrEqualsIndex).trim().toLowerCase()
          : part.toLowerCase();
      const attrValue =
        attrEqualsIndex >= 0 ? part.substring(attrEqualsIndex + 1).trim() : "";

      switch (attrName) {
        case "domain":
          cookie.domain = attrValue.startsWith(".")
            ? attrValue.substring(1)
            : attrValue;
          break;
        case "path":
          cookie.path = attrValue;
          break;
        case "expires":
          try {
            cookie.expires = new Date(attrValue);
          } catch {
            // Ignore invalid dates
          }
          break;
        case "max-age": {
          const maxAge = parseInt(attrValue, 10);
          if (!isNaN(maxAge)) {
            cookie.expires = new Date(Date.now() + maxAge * 1000);
          }
          break;
        }
        case "httponly":
          cookie.httpOnly = true;
          break;
        case "secure":
          cookie.secure = true;
          break;
        case "samesite": {
          const sameSite = attrValue.toLowerCase();
          if (
            sameSite === "strict" ||
            sameSite === "lax" ||
            sameSite === "none"
          ) {
            cookie.sameSite = (sameSite.charAt(0).toUpperCase() +
              sameSite.slice(1)) as "Strict" | "Lax" | "None";
          }
          break;
        }
      }
    }

    // Set default domain if not specified
    if (cookie.domain === undefined && defaultDomain !== undefined) {
      cookie.domain = defaultDomain;
    }

    return cookie;
  }

  /**
   * Sets a header
   */
  setHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  /**
   * Gets a header
   */
  getHeader(name: string): string | undefined {
    return this.headers[name];
  }

  /**
   * Removes a header
   */
  removeHeader(name: string): void {
    delete this.headers[name];
  }

  /**
   * Gets all headers including cookies
   */
  getAllHeaders(domain?: string): Record<string, string> {
    const headers = { ...this.headers };
    const cookieHeader = this.getCookieHeader(domain);
    if (cookieHeader !== "") {
      headers["Cookie"] = cookieHeader;
    }
    return headers;
  }

  /**
   * Converts to plain object for serialization
   */
  toJSON(): SessionData {
    return {
      id: this.id,
      cookies: this.cookies,
      headers: this.headers,
      userData: this.userData,
      createdAt: this.createdAt,
      lastUsedAt: this.lastUsedAt,
      usageCount: this.usageCount,
      maxUsageCount: this.maxUsageCount,
      isBlocked: this.isBlocked,
      errorScore: this.errorScore,
    };
  }

  /**
   * Creates a Session from serialized data
   */
  static fromJSON(data: SessionData): Session {
    return new Session({
      ...data,
      createdAt: new Date(data.createdAt),
      lastUsedAt: new Date(data.lastUsedAt),
      cookies: data.cookies.map((c) => ({
        ...c,
        expires: c.expires ? new Date(c.expires) : undefined,
      })),
    });
  }
}
