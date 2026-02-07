import { describe, expect, it } from "vitest";

import { getSeedUrlsFromHistory } from "./httpHistory";

function createMockRequest(url: string, method: string) {
  return {
    getUrl: () => url,
    getMethod: () => method,
  };
}

function createMockConnection(
  items: Array<{ url: string; method: string }>,
  hasNextPage: boolean,
  endCursor: string | undefined,
) {
  return {
    items: items.map(({ url, method }) => ({
      request: createMockRequest(url, method),
    })),
    pageInfo: { hasNextPage, endCursor },
  };
}

describe("getSeedUrlsFromHistory", () => {
  it("returns empty array for empty host", async () => {
    const sdk = {
      requests: {
        query: () => ({}),
      },
    } as unknown as Parameters<typeof getSeedUrlsFromHistory>[0];

    const result = await getSeedUrlsFromHistory(sdk, "");
    expect(result).toEqual([]);

    const resultWhitespace = await getSeedUrlsFromHistory(sdk, "   ");
    expect(resultWhitespace).toEqual([]);
  });

  it("returns GET request URLs from single page", async () => {
    const connection = createMockConnection(
      [
        { url: "https://example.com/", method: "GET" },
        { url: "https://example.com/page", method: "GET" },
      ],
      false,
      undefined,
    );

    let capturedFilter: string | undefined;
    const sdk = {
      requests: {
        query: () => ({
          filter: (f: string) => {
            capturedFilter = f;
            return {
              first: () => ({
                ascending: () => ({
                  after: () => ({ execute: () => Promise.resolve(connection) }),
                  execute: () => Promise.resolve(connection),
                }),
              }),
            };
          },
        }),
      },
    } as unknown as Parameters<typeof getSeedUrlsFromHistory>[0];

    const result = await getSeedUrlsFromHistory(sdk, "example.com");

    expect(capturedFilter).toBe('req.host.eq:"example.com"');
    expect(result).toEqual([
      "https://example.com/",
      "https://example.com/page",
    ]);
  });

  it("skips non-GET requests", async () => {
    const connection = createMockConnection(
      [
        { url: "https://example.com/", method: "GET" },
        { url: "https://example.com/post", method: "POST" },
      ],
      false,
      undefined,
    );

    const sdk = {
      requests: {
        query: () => ({
          filter: () => ({
            first: () => ({
              ascending: () => ({
                execute: () => Promise.resolve(connection),
              }),
            }),
          }),
        }),
      },
    } as unknown as Parameters<typeof getSeedUrlsFromHistory>[0];

    const result = await getSeedUrlsFromHistory(sdk, "example.com");

    expect(result).toEqual(["https://example.com/"]);
  });

  it("deduplicates URLs", async () => {
    const connection = createMockConnection(
      [
        { url: "https://example.com/", method: "GET" },
        { url: "https://example.com/", method: "GET" },
      ],
      false,
      undefined,
    );

    const sdk = {
      requests: {
        query: () => ({
          filter: () => ({
            first: () => ({
              ascending: () => ({
                execute: () => Promise.resolve(connection),
              }),
            }),
          }),
        }),
      },
    } as unknown as Parameters<typeof getSeedUrlsFromHistory>[0];

    const result = await getSeedUrlsFromHistory(sdk, "example.com");

    expect(result).toEqual(["https://example.com/"]);
  });

  it("paginates when hasNextPage is true", async () => {
    const page1 = createMockConnection(
      [{ url: "https://example.com/a", method: "GET" }],
      true,
      "cursor1",
    );
    const page2 = createMockConnection(
      [{ url: "https://example.com/b", method: "GET" }],
      false,
      undefined,
    );

    const sdk = {
      requests: {
        query: () => ({
          filter: () => ({
            first: () => ({
              ascending: () => ({
                after: (_cursor: string) => ({
                  execute: () => Promise.resolve(page2),
                }),
                execute: () => Promise.resolve(page1),
              }),
            }),
          }),
        }),
      },
    } as unknown as Parameters<typeof getSeedUrlsFromHistory>[0];

    const result = await getSeedUrlsFromHistory(sdk, "example.com");

    expect(result).toEqual(["https://example.com/a", "https://example.com/b"]);
  });

  it("returns empty array when execute throws", async () => {
    const sdk = {
      requests: {
        query: () => ({
          filter: () => ({
            first: () => ({
              ascending: () => ({
                execute: () => Promise.reject(new Error("SDK error")),
              }),
            }),
          }),
        }),
      },
    } as unknown as Parameters<typeof getSeedUrlsFromHistory>[0];

    const result = await getSeedUrlsFromHistory(sdk, "example.com");

    expect(result).toEqual([]);
  });
});
