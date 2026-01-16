/**
 * HTTP Client - Wrapper around Caido SDK for making requests
 */

import { RequestSpec } from "caido:utils";

import type { Request } from "../models/request";
import type { ResponseData } from "../models/types";
import { requireSDK } from "../sdk";

// ============================================================================
// Types
// ============================================================================

export interface HttpClientOptions {
  defaultHeaders?: Record<string, string>;
  userAgent?: string;
  timeouts?: {
    global?: number;
    connect?: number;
    response?: number;
  };
  followRedirects?: boolean;
  maxRedirects?: number;
  saveToHistory?: boolean;
}

export interface SendOptions {
  saveToHistory?: boolean;
  timeouts?: {
    global?: number;
    connect?: number;
    response?: number;
  };
}

// ============================================================================
// HTTP Client Class
// ============================================================================

export class HttpClient {
  private options: HttpClientOptions;

  constructor(options: HttpClientOptions = {}) {
    this.options = {
      defaultHeaders: {},
      userAgent: "Caido Crawler",
      timeouts: {
        global: 30000,
        connect: 10000,
        response: 15000,
      },
      followRedirects: true,
      maxRedirects: 10,
      saveToHistory: true,
      ...options,
    };
  }

  /**
   * Sends a request and returns structured response data
   */
  async send(
    request: Request,
    options: SendOptions = {},
  ): Promise<ResponseData> {
    const sdk = requireSDK();
    const startedAt = new Date();

    // Build request spec
    const spec = new RequestSpec(request.url);

    // Set method
    if (request.method !== "GET") {
      spec.setMethod(request.method);
    }

    // Set headers (default + request-specific)
    const headers = {
      ...this.options.defaultHeaders,
      ...request.headers,
    };

    // Set User-Agent if not specified
    if (
      headers["User-Agent"] === undefined &&
      this.options.userAgent !== undefined
    ) {
      headers["User-Agent"] = this.options.userAgent;
    }

    for (const [name, value] of Object.entries(headers)) {
      spec.setHeader(name, value);
    }

    // Set body if present
    if (request.body !== undefined) {
      spec.setBody(request.body);
    }

    // Merge timeouts
    const timeouts = {
      ...this.options.timeouts,
      ...options.timeouts,
    };

    // Send request
    const result = await sdk.requests.send(spec, {
      save: options.saveToHistory ?? this.options.saveToHistory,
      timeouts: {
        global: timeouts.global ?? 30000,
        connect: timeouts.connect ?? 10000,
        response: timeouts.response ?? 15000,
      },
    });

    const completedAt = new Date();

    // Parse response
    const response = result.response;
    const statusCode = response.getCode();

    // Get headers as record
    // We use getHeader for specific headers since Caido SDK provides that API
    const responseHeaders: Record<string, string[]> = {};

    // Get content type
    const contentTypeHeader = response.getHeader("content-type");
    const contentType =
      contentTypeHeader !== undefined && contentTypeHeader[0] !== undefined
        ? contentTypeHeader[0]
        : "";

    // Get body
    const bodyBuffer = response.getBody();
    const body = bodyBuffer !== undefined ? bodyBuffer.toText() : "";

    // Determine content type flags
    const isHtml = contentType.toLowerCase().includes("text/html");
    const isJson =
      contentType.toLowerCase().includes("application/json") ||
      contentType.toLowerCase().includes("+json");
    const isXml =
      contentType.toLowerCase().includes("application/xml") ||
      contentType.toLowerCase().includes("text/xml") ||
      contentType.toLowerCase().includes("+xml");

    return {
      url: request.url,
      statusCode,
      headers: responseHeaders,
      body,
      contentType,
      isHtml,
      isJson,
      isXml,
      redirectChain: [], // TODO: Track redirects if SDK supports it
      timing: {
        startedAt,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
      },
    };
  }

  /**
   * Sends a simple GET request
   */
  async get(url: string, options: SendOptions = {}): Promise<ResponseData> {
    const request = {
      id: "",
      url,
      method: "GET" as const,
      headers: {},
      userData: {},
      uniqueKey: url,
      priority: 0,
      retryCount: 0,
      maxRetries: 0,
      noRetry: true,
      state: "pending" as const,
      errorMessages: [],
      depth: 0,
      createdAt: new Date(),
    };

    return this.send(request as unknown as Request, options);
  }

  /**
   * Checks if a URL is in Caido's scope
   */
  isInScope(url: string): boolean {
    const sdk = requireSDK();
    try {
      const spec = new RequestSpec(url);
      return sdk.requests.inScope(spec);
    } catch {
      return false;
    }
  }

  /**
   * Updates the default headers
   */
  setDefaultHeaders(headers: Record<string, string>): void {
    this.options.defaultHeaders = {
      ...this.options.defaultHeaders,
      ...headers,
    };
  }

  /**
   * Sets the user agent
   */
  setUserAgent(userAgent: string): void {
    this.options.userAgent = userAgent;
  }

  /**
   * Gets the current options
   */
  getOptions(): HttpClientOptions {
    return { ...this.options };
  }
}

// ============================================================================
// Response Helpers
// ============================================================================

/**
 * Checks if response indicates success
 */
export function isSuccessResponse(response: ResponseData): boolean {
  return response.statusCode >= 200 && response.statusCode < 300;
}

/**
 * Checks if response is a redirect
 */
export function isRedirectResponse(response: ResponseData): boolean {
  return response.statusCode >= 300 && response.statusCode < 400;
}

/**
 * Checks if response indicates client error
 */
export function isClientErrorResponse(response: ResponseData): boolean {
  return response.statusCode >= 400 && response.statusCode < 500;
}

/**
 * Checks if response indicates server error
 */
export function isServerErrorResponse(response: ResponseData): boolean {
  return response.statusCode >= 500;
}

/**
 * Checks if response should be retried
 */
export function shouldRetryResponse(response: ResponseData): boolean {
  // Retry on server errors and specific client errors
  return (
    response.statusCode >= 500 ||
    response.statusCode === 429 || // Too Many Requests
    response.statusCode === 408 // Request Timeout
  );
}

/**
 * Gets the redirect location from response headers
 */
export function getRedirectLocation(
  response: ResponseData,
): string | undefined {
  const location = response.headers["location"];
  if (location !== undefined && location[0] !== undefined) {
    return location[0];
  }
  return undefined;
}
