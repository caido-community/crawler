import { RequestSpec } from "caido:utils";

import type { Request } from "../models/request";
import { ResponseData } from "../models/types";
import { requireSDK } from "../sdk";

export type HttpClientOptions = {
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
};

export type SendOptions = {
  saveToHistory?: boolean;
  timeouts?: {
    global?: number;
    connect?: number;
    response?: number;
  };
};

export class HttpClient {
  private options: HttpClientOptions;

  constructor(options: HttpClientOptions = {}) {
    this.options = {
      defaultHeaders: {},
      userAgent: "Caido-Crawler",
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

  async send(
    request: Request,
    options: SendOptions = {},
  ): Promise<ResponseData> {
    const sdk = requireSDK();
    const startedAt = new Date();

    const saveToHistory = options.saveToHistory ?? this.options.saveToHistory;

    const spec = new RequestSpec(request.url);

    if (request.method !== "GET") {
      spec.setMethod(request.method);
    }

    const headers = {
      ...this.options.defaultHeaders,
      ...request.headers,
    };

    if (
      headers["User-Agent"] === undefined &&
      this.options.userAgent !== undefined
    ) {
      headers["User-Agent"] = this.options.userAgent;
    }

    for (const [name, value] of Object.entries(headers)) {
      spec.setHeader(name, value);
    }

    if (request.body !== undefined) {
      spec.setBody(request.body);
    }

    const timeouts = {
      ...this.options.timeouts,
      ...options.timeouts,
    };

    const result = await sdk.requests.send(spec, {
      save: saveToHistory,
      timeouts: {
        global: timeouts.global ?? 30000,
        connect: timeouts.connect ?? 10000,
        response: timeouts.response ?? 15000,
      },
    });

    const completedAt = new Date();

    const response = result.response;
    const statusCode = response.getCode();
    const savedRequestId = result.request.getId();

    // Manually trigger sitemap entry creation (required because sdk.requests.send() bypasses HTTP pipeline)
    // The HTTP pipeline normally creates sitemap entries automatically, but plugin requests bypass it
    if (saveToHistory === true && savedRequestId !== undefined) {
      try {
        await sdk.graphql.execute<{
          createSitemapEntries: { error: unknown } | undefined;
        }>(
          `mutation CreateSitemapEntries($requestId: ID!) {
            createSitemapEntries(requestId: $requestId) {
              error {
                __typename
                ... on UnknownIdUserError {
                  code
                  id
                }
              }
            }
          }`,
          { requestId: savedRequestId },
        );
      } catch {
        // Silently fail
      }
    }

    const responseHeaders: Record<string, string[]> = {};

    const contentTypeHeader = response.getHeader("content-type");
    const contentType =
      contentTypeHeader !== undefined && contentTypeHeader[0] !== undefined
        ? contentTypeHeader[0]
        : "";

    const bodyBuffer = response.getBody();
    const body = bodyBuffer !== undefined ? bodyBuffer.toText() : "";

    const isHtml = contentType.toLowerCase().includes("text/html");
    const isJson =
      contentType.toLowerCase().includes("application/json") ||
      contentType.toLowerCase().includes("+json");
    const isXml =
      contentType.toLowerCase().includes("application/xml") ||
      contentType.toLowerCase().includes("text/xml") ||
      contentType.toLowerCase().includes("+xml");

    return new ResponseData({
      url: result.request.getUrl() ?? request.url,
      statusCode,
      headers: responseHeaders,
      body,
      contentType,
      isHtml,
      isJson,
      isXml,
      redirectChain: [],
      timing: {
        startedAt,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
      },
    });
  }

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

  isInScope(url: string): boolean {
    const sdk = requireSDK();
    try {
      const spec = new RequestSpec(url);
      return sdk.requests.inScope(spec);
    } catch {
      return false;
    }
  }

  setDefaultHeaders(headers: Record<string, string>): void {
    this.options.defaultHeaders = {
      ...this.options.defaultHeaders,
      ...headers,
    };
  }

  setUserAgent(userAgent: string): void {
    this.options.userAgent = userAgent;
  }

  getOptions(): HttpClientOptions {
    return { ...this.options };
  }
}

/**
 * @deprecated Use response.isSuccess() instead
 */
export function isSuccessResponse(response: ResponseData): boolean {
  return response.isSuccess();
}

/**
 * @deprecated Use response.shouldRetry() instead
 */
export function shouldRetryResponse(response: ResponseData): boolean {
  return response.shouldRetry();
}
