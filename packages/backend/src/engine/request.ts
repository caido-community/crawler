/**
 * Request class for managing crawl requests
 */

import type {
  RequestData,
  RequestMethod,
  RequestOptions,
  RequestState,
} from "./types";

let requestCounter = 0;

/**
 * Generates a unique request ID
 */
function generateRequestId(): string {
  requestCounter++;
  return `req-${Date.now()}-${requestCounter}-${Math.random().toString(36).substring(2, 7)}`;
}

/**
 * Generates a unique key for deduplication based on URL and method
 */
function computeUniqueKey(url: string, method: RequestMethod): string {
  // Normalize the URL for comparison
  try {
    const urlObj = new URL(url);
    // Sort query parameters for consistent comparison
    const params = new URLSearchParams(urlObj.search);
    const sortedParams = new URLSearchParams([...params.entries()].sort());
    urlObj.search = sortedParams.toString();
    // Remove fragment
    urlObj.hash = "";
    return `${method}:${urlObj.href}`;
  } catch {
    return `${method}:${url}`;
  }
}

/**
 * Request class representing a single crawl request
 */
export class Request implements RequestData {
  readonly id: string;
  readonly url: string;
  readonly method: RequestMethod;
  readonly headers: Record<string, string>;
  readonly body?: string;
  readonly userData: Record<string, unknown>;
  readonly label?: string;
  readonly uniqueKey: string;
  readonly priority: number;
  readonly noRetry: boolean;
  readonly maxRetries: number;
  readonly createdAt: Date;

  // Mutable state
  retryCount: number;
  state: RequestState;
  errorMessages: string[];
  depth: number;
  parentRequestId?: string;
  processedAt?: Date;

  constructor(options: RequestOptions | string, parentRequest?: Request) {
    // Support simple URL string
    const opts: RequestOptions =
      typeof options === "string" ? { url: options } : options;

    this.id = generateRequestId();
    this.url = opts.url;
    this.method = opts.method ?? "GET";
    this.headers = { ...opts.headers };
    this.body = opts.body;
    this.userData = { ...opts.userData };
    this.label = opts.label;
    this.uniqueKey = opts.uniqueKey ?? computeUniqueKey(this.url, this.method);
    this.priority = opts.priority ?? 0;
    this.noRetry = opts.noRetry ?? false;
    this.maxRetries = opts.maxRetries ?? 3;
    this.createdAt = new Date();

    // Initialize mutable state
    this.retryCount = 0;
    this.state = "pending";
    this.errorMessages = [];

    // Inherit depth from parent or start at 0
    if (parentRequest !== undefined) {
      this.depth = parentRequest.depth + 1;
      this.parentRequestId = parentRequest.id;
    } else {
      this.depth = 0;
      this.parentRequestId = undefined;
    }
  }

  /**
   * Marks the request as currently being processed
   */
  markProcessing(): void {
    this.state = "processing";
  }

  /**
   * Marks the request as successfully completed
   */
  markCompleted(): void {
    this.state = "completed";
    this.processedAt = new Date();
  }

  /**
   * Marks the request as failed
   */
  markFailed(error: string): void {
    this.errorMessages.push(error);

    if (this.canRetry()) {
      this.state = "retrying";
      this.retryCount++;
    } else {
      this.state = "failed";
      this.processedAt = new Date();
    }
  }

  /**
   * Resets the request for retry
   */
  resetForRetry(): void {
    this.state = "pending";
  }

  /**
   * Checks if the request can be retried
   */
  canRetry(): boolean {
    if (this.noRetry) {
      return false;
    }
    return this.retryCount < this.maxRetries;
  }

  /**
   * Gets the number of remaining retries
   */
  getRemainingRetries(): number {
    return Math.max(0, this.maxRetries - this.retryCount);
  }

  /**
   * Calculates retry delay with exponential backoff
   */
  getRetryDelay(
    baseDelayMs: number = 1000,
    maxDelayMs: number = 30000,
  ): number {
    // Exponential backoff: baseDelay * 2^retryCount
    // With jitter to prevent thundering herd
    const exponentialDelay = baseDelayMs * Math.pow(2, this.retryCount);
    const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
    const delay = exponentialDelay + jitter;
    return Math.min(delay, maxDelayMs);
  }

  /**
   * Creates a child request (for discovered links)
   */
  createChildRequest(options: RequestOptions): Request {
    return new Request(options, this);
  }

  /**
   * Clones the request
   */
  clone(): Request {
    const cloned = new Request({
      url: this.url,
      method: this.method,
      headers: { ...this.headers },
      body: this.body,
      userData: { ...this.userData },
      label: this.label,
      uniqueKey: this.uniqueKey,
      priority: this.priority,
      maxRetries: this.maxRetries,
      noRetry: this.noRetry,
    });

    cloned.depth = this.depth;
    cloned.parentRequestId = this.parentRequestId;
    cloned.retryCount = this.retryCount;
    cloned.state = this.state;
    cloned.errorMessages = [...this.errorMessages];

    return cloned;
  }

  /**
   * Converts to a plain object for serialization
   */
  toJSON(): RequestData {
    return {
      id: this.id,
      url: this.url,
      method: this.method,
      headers: this.headers,
      body: this.body,
      userData: this.userData,
      label: this.label,
      uniqueKey: this.uniqueKey,
      priority: this.priority,
      retryCount: this.retryCount,
      maxRetries: this.maxRetries,
      noRetry: this.noRetry,
      state: this.state,
      errorMessages: this.errorMessages,
      depth: this.depth,
      parentRequestId: this.parentRequestId,
      createdAt: this.createdAt,
      processedAt: this.processedAt,
    };
  }

  /**
   * Creates a Request from serialized data
   */
  static fromJSON(data: RequestData): Request {
    const request = new Request({
      url: data.url,
      method: data.method,
      headers: data.headers,
      body: data.body,
      userData: data.userData,
      label: data.label,
      uniqueKey: data.uniqueKey,
      priority: data.priority,
      maxRetries: data.maxRetries,
      noRetry: data.noRetry,
    });

    // Restore mutable state
    (request as { id: string }).id = data.id;
    request.retryCount = data.retryCount;
    request.state = data.state;
    request.errorMessages = [...data.errorMessages];
    request.depth = data.depth;
    request.parentRequestId = data.parentRequestId;
    (request as { createdAt: Date }).createdAt = new Date(data.createdAt);
    request.processedAt = data.processedAt
      ? new Date(data.processedAt)
      : undefined;

    return request;
  }
}

/**
 * Batch creates requests from URLs
 */
export function createRequests(
  urls: (string | RequestOptions)[],
  defaultOptions?: Partial<RequestOptions>,
): Request[] {
  return urls.map((urlOrOptions) => {
    if (typeof urlOrOptions === "string") {
      return new Request({ url: urlOrOptions, ...defaultOptions });
    }
    return new Request({ ...defaultOptions, ...urlOrOptions });
  });
}
