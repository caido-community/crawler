import { describe, expect, it } from "vitest";

import { matchesHttpqlFilter, urlToRequestLike } from "./httpqlFilter";

describe("urlToRequestLike", () => {
  it("parses URL into host, path, url, method", () => {
    const req = urlToRequestLike("https://admin.example.com/api/users", "GET");
    expect(req).toEqual({
      host: "admin.example.com",
      path: "/api/users",
      url: "https://admin.example.com/api/users",
      method: "GET",
    });
  });

  it("returns undefined for invalid URL", () => {
    expect(urlToRequestLike("not-a-url")).toBeUndefined();
  });
});

describe("matchesHttpqlFilter", () => {
  it("returns true for empty or undefined query", () => {
    expect(matchesHttpqlFilter("https://example.com/", undefined)).toBe(true);
    expect(matchesHttpqlFilter("https://example.com/", "")).toBe(true);
    expect(matchesHttpqlFilter("https://example.com/", "   ")).toBe(true);
  });

  it("req.host.eq matches exact host", () => {
    expect(
      matchesHttpqlFilter(
        "https://admin.airbnb.com/",
        'req.host.eq:"admin.airbnb.com"',
      ),
    ).toBe(true);
    expect(
      matchesHttpqlFilter(
        "https://www.airbnb.com/",
        'req.host.eq:"admin.airbnb.com"',
      ),
    ).toBe(false);
  });

  it("req.host.ne excludes host", () => {
    expect(
      matchesHttpqlFilter(
        "https://www.airbnb.com/",
        'req.host.ne:"admin.airbnb.com"',
      ),
    ).toBe(true);
    expect(
      matchesHttpqlFilter(
        "https://admin.airbnb.com/",
        'req.host.ne:"admin.airbnb.com"',
      ),
    ).toBe(false);
  });

  it("req.path.cont matches path containing substring", () => {
    expect(
      matchesHttpqlFilter(
        "https://example.com/api/users",
        'req.path.cont:"/api"',
      ),
    ).toBe(true);
    expect(
      matchesHttpqlFilter(
        "https://example.com/static/",
        'req.path.cont:"/api"',
      ),
    ).toBe(false);
  });

  it("AND combines clauses", () => {
    const query = 'req.host.ne:"admin.example.com" AND req.path.cont:"/api"';
    expect(matchesHttpqlFilter("https://www.example.com/api/foo", query)).toBe(
      true,
    );
    expect(
      matchesHttpqlFilter("https://admin.example.com/api/foo", query),
    ).toBe(false);
    expect(matchesHttpqlFilter("https://www.example.com/static/", query)).toBe(
      false,
    );
  });

  it("resp.* clauses are treated as true", () => {
    expect(
      matchesHttpqlFilter("https://example.com/", "resp.code.eq:200"),
    ).toBe(true);
  });
});
