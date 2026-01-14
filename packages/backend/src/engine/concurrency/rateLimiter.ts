/**
 * Rate Limiter - Controls request rate to avoid overwhelming targets
 * Implements token bucket algorithm with sliding window
 */

// ============================================================================
// Types
// ============================================================================

export interface RateLimiterOptions {
  maxRequestsPerSecond?: number;
  maxRequestsPerMinute?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  burstSize?: number;
}

// ============================================================================
// Rate Limiter Class
// ============================================================================

export class RateLimiter {
  private options: Required<RateLimiterOptions>;

  // Token bucket
  private tokens: number;
  private lastRefillTime: number;
  private tokensPerMs: number;

  // Sliding window for rate tracking
  private requestTimes: number[] = [];
  private windowSizeMs: number = 60000; // 1 minute

  constructor(options: RateLimiterOptions = {}) {
    this.options = {
      maxRequestsPerSecond: options.maxRequestsPerSecond ?? 10,
      maxRequestsPerMinute: options.maxRequestsPerMinute ?? 300,
      minDelayMs: options.minDelayMs ?? 100,
      maxDelayMs: options.maxDelayMs ?? 60000,
      burstSize: options.burstSize ?? 5,
    };

    // Initialize token bucket
    this.tokens = this.options.burstSize;
    this.lastRefillTime = Date.now();
    this.tokensPerMs = this.options.maxRequestsPerSecond / 1000;
  }

  /**
   * Acquires permission to make a request
   * Returns a promise that resolves when it's safe to proceed
   */
  async acquire(): Promise<void> {
    // Refill tokens
    this.refillTokens();

    // Check if we have tokens available
    if (this.tokens >= 1) {
      this.tokens -= 1;
      this.recordRequest();
      return;
    }

    // Calculate wait time
    const waitTime = this.calculateWaitTime();

    // Wait for tokens
    await this.delay(waitTime);

    // Refill and consume
    this.refillTokens();
    if (this.tokens >= 1) {
      this.tokens -= 1;
    }
    this.recordRequest();
  }

  /**
   * Checks if a request can be made immediately
   */
  canProceed(): boolean {
    this.refillTokens();
    return this.tokens >= 1 && !this.isOverMinuteLimit();
  }

  /**
   * Gets the wait time before next request can be made
   */
  getWaitTime(): number {
    this.refillTokens();

    if (this.tokens >= 1 && !this.isOverMinuteLimit()) {
      return 0;
    }

    return this.calculateWaitTime();
  }

  /**
   * Refills tokens based on elapsed time
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillTime;
    const newTokens = elapsed * this.tokensPerMs;

    this.tokens = Math.min(this.options.burstSize, this.tokens + newTokens);
    this.lastRefillTime = now;
  }

  /**
   * Records a request time for sliding window
   */
  private recordRequest(): void {
    const now = Date.now();
    this.requestTimes.push(now);

    // Clean up old requests outside the window
    const cutoff = now - this.windowSizeMs;
    while (
      this.requestTimes.length > 0 &&
      this.requestTimes[0] !== undefined &&
      this.requestTimes[0] < cutoff
    ) {
      this.requestTimes.shift();
    }
  }

  /**
   * Checks if we're over the per-minute limit
   */
  private isOverMinuteLimit(): boolean {
    return this.requestTimes.length >= this.options.maxRequestsPerMinute;
  }

  /**
   * Calculates the wait time needed
   */
  private calculateWaitTime(): number {
    const now = Date.now();

    // Time until next token
    const timeUntilToken =
      this.tokens < 1 ? (1 - this.tokens) / this.tokensPerMs : 0;

    // Time until oldest request exits the window (if over minute limit)
    let timeUntilWindowSlides = 0;
    if (this.isOverMinuteLimit() && this.requestTimes[0] !== undefined) {
      timeUntilWindowSlides = this.requestTimes[0] + this.windowSizeMs - now;
    }

    // Take the maximum wait time
    const waitTime = Math.max(timeUntilToken, timeUntilWindowSlides);

    // Clamp to min/max delay
    return Math.max(
      this.options.minDelayMs,
      Math.min(this.options.maxDelayMs, waitTime),
    );
  }

  /**
   * Delays for the specified milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Gets current rate statistics
   */
  getStats(): {
    requestsInLastSecond: number;
    requestsInLastMinute: number;
    availableTokens: number;
    isThrottled: boolean;
  } {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    const oneMinuteAgo = now - 60000;

    this.refillTokens();

    const requestsInLastSecond = this.requestTimes.filter(
      (t) => t >= oneSecondAgo,
    ).length;

    const requestsInLastMinute = this.requestTimes.filter(
      (t) => t >= oneMinuteAgo,
    ).length;

    return {
      requestsInLastSecond,
      requestsInLastMinute,
      availableTokens: Math.floor(this.tokens),
      isThrottled: !this.canProceed(),
    };
  }

  /**
   * Resets the rate limiter
   */
  reset(): void {
    this.tokens = this.options.burstSize;
    this.lastRefillTime = Date.now();
    this.requestTimes = [];
  }

  /**
   * Updates the rate limits
   */
  setLimits(options: Partial<RateLimiterOptions>): void {
    if (options.maxRequestsPerSecond !== undefined) {
      this.options.maxRequestsPerSecond = options.maxRequestsPerSecond;
      this.tokensPerMs = options.maxRequestsPerSecond / 1000;
    }
    if (options.maxRequestsPerMinute !== undefined) {
      this.options.maxRequestsPerMinute = options.maxRequestsPerMinute;
    }
    if (options.minDelayMs !== undefined) {
      this.options.minDelayMs = options.minDelayMs;
    }
    if (options.maxDelayMs !== undefined) {
      this.options.maxDelayMs = options.maxDelayMs;
    }
    if (options.burstSize !== undefined) {
      this.options.burstSize = options.burstSize;
      this.tokens = Math.min(this.tokens, options.burstSize);
    }
  }

  /**
   * Gets current options
   */
  getOptions(): Required<RateLimiterOptions> {
    return { ...this.options };
  }
}

// ============================================================================
// Per-Domain Rate Limiter
// ============================================================================

/**
 * Manages rate limiting per domain
 */
export class DomainRateLimiter {
  private limiters: Map<string, RateLimiter> = new Map();
  private defaultOptions: RateLimiterOptions;

  constructor(options: RateLimiterOptions = {}) {
    this.defaultOptions = options;
  }

  /**
   * Gets or creates a rate limiter for a domain
   */
  getLimiter(domain: string): RateLimiter {
    let limiter = this.limiters.get(domain);
    if (limiter === undefined) {
      limiter = new RateLimiter(this.defaultOptions);
      this.limiters.set(domain, limiter);
    }
    return limiter;
  }

  /**
   * Acquires permission for a domain
   */
  async acquire(domain: string): Promise<void> {
    const limiter = this.getLimiter(domain);
    await limiter.acquire();
  }

  /**
   * Checks if a domain request can proceed
   */
  canProceed(domain: string): boolean {
    const limiter = this.getLimiter(domain);
    return limiter.canProceed();
  }

  /**
   * Gets wait time for a domain
   */
  getWaitTime(domain: string): number {
    const limiter = this.getLimiter(domain);
    return limiter.getWaitTime();
  }

  /**
   * Sets custom limits for a specific domain
   */
  setDomainLimits(domain: string, options: Partial<RateLimiterOptions>): void {
    const limiter = this.getLimiter(domain);
    limiter.setLimits(options);
  }

  /**
   * Resets a specific domain's rate limiter
   */
  resetDomain(domain: string): void {
    this.limiters.delete(domain);
  }

  /**
   * Resets all rate limiters
   */
  resetAll(): void {
    this.limiters.clear();
  }

  /**
   * Gets stats for all domains
   */
  getAllStats(): Record<string, ReturnType<RateLimiter["getStats"]>> {
    const stats: Record<string, ReturnType<RateLimiter["getStats"]>> = {};
    for (const [domain, limiter] of this.limiters) {
      stats[domain] = limiter.getStats();
    }
    return stats;
  }

  /**
   * Gets the number of tracked domains
   */
  domainCount(): number {
    return this.limiters.size;
  }

  /**
   * Extracts domain from URL
   */
  static getDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return url;
    }
  }
}
