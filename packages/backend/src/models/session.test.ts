/**
 * Tests for Session class
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Session } from "./session";

describe("Session", () => {
  let session: Session;

  beforeEach(() => {
    session = new Session();
  });

  describe("constructor", () => {
    it("creates session with unique ID", () => {
      const session1 = new Session();
      const session2 = new Session();
      expect(session1.id).not.toBe(session2.id);
    });

    it("creates session with default values", () => {
      expect(session.cookies).toEqual([]);
      expect(session.headers).toEqual({});
      expect(session.userData).toEqual({});
      expect(session.usageCount).toBe(0);
      expect(session.isBlocked).toBe(false);
      expect(session.errorScore).toBe(0);
    });

    it("creates session with custom options", () => {
      const customSession = new Session({
        maxUsageCount: 100,
        headers: { "X-Custom": "value" },
      });
      expect(customSession.maxUsageCount).toBe(100);
      expect(customSession.headers["X-Custom"]).toBe("value");
    });
  });

  describe("markUsed", () => {
    it("increments usage count", () => {
      session.markUsed();
      expect(session.usageCount).toBe(1);
      session.markUsed();
      expect(session.usageCount).toBe(2);
    });

    it("updates lastUsedAt", () => {
      const before = session.lastUsedAt;
      // Small delay to ensure time difference
      session.markUsed();
      expect(session.lastUsedAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
    });
  });

  describe("isUsable", () => {
    it("returns true for new session", () => {
      expect(session.isUsable()).toBe(true);
    });

    it("returns false when blocked", () => {
      session.isBlocked = true;
      expect(session.isUsable()).toBe(false);
    });

    it("returns false when maxed out", () => {
      const limitedSession = new Session({ maxUsageCount: 2 });
      limitedSession.markUsed();
      limitedSession.markUsed();
      expect(limitedSession.isUsable()).toBe(false);
    });
  });

  describe("isMaxedOut", () => {
    it("returns false when under limit", () => {
      const limitedSession = new Session({ maxUsageCount: 10 });
      limitedSession.markUsed();
      expect(limitedSession.isMaxedOut()).toBe(false);
    });

    it("returns true when at limit", () => {
      const limitedSession = new Session({ maxUsageCount: 2 });
      limitedSession.markUsed();
      limitedSession.markUsed();
      expect(limitedSession.isMaxedOut()).toBe(true);
    });
  });

  describe("error tracking", () => {
    it("recordError increases error score", () => {
      session.recordError();
      expect(session.errorScore).toBe(1);
      session.recordError(2);
      expect(session.errorScore).toBe(3);
    });

    it("recordSuccess decreases error score", () => {
      session.recordError(2);
      session.recordSuccess(1);
      expect(session.errorScore).toBe(1);
    });

    it("error score does not go below 0", () => {
      session.recordSuccess(10);
      expect(session.errorScore).toBe(0);
    });
  });

  describe("cookie management", () => {
    describe("setCookie", () => {
      it("adds a new cookie", () => {
        session.setCookie({ name: "session", value: "abc123" });
        expect(session.cookies).toHaveLength(1);
        expect(session.cookies[0]?.name).toBe("session");
      });

      it("updates existing cookie", () => {
        session.setCookie({ name: "session", value: "old" });
        session.setCookie({ name: "session", value: "new" });
        expect(session.cookies).toHaveLength(1);
        expect(session.cookies[0]?.value).toBe("new");
      });
    });

    describe("getCookie", () => {
      it("returns cookie by name", () => {
        session.setCookie({ name: "session", value: "abc123" });
        const cookie = session.getCookie("session");
        expect(cookie?.value).toBe("abc123");
      });

      it("returns undefined for unknown cookie", () => {
        expect(session.getCookie("unknown")).toBeUndefined();
      });

      it("filters by domain", () => {
        session.setCookie({
          name: "session",
          value: "abc",
          domain: "example.com",
        });
        session.setCookie({
          name: "session",
          value: "xyz",
          domain: "other.com",
        });
        const cookie = session.getCookie("session", "example.com");
        expect(cookie?.value).toBe("abc");
      });
    });

    describe("removeCookie", () => {
      it("removes cookie by name", () => {
        session.setCookie({ name: "session", value: "abc" });
        session.removeCookie("session");
        expect(session.cookies).toHaveLength(0);
      });
    });

    describe("clearCookies", () => {
      it("removes all cookies", () => {
        session.setCookie({ name: "a", value: "1" });
        session.setCookie({ name: "b", value: "2" });
        session.clearCookies();
        expect(session.cookies).toHaveLength(0);
      });
    });

    describe("getCookieHeader", () => {
      it("formats cookies as header string", () => {
        session.setCookie({ name: "a", value: "1" });
        session.setCookie({ name: "b", value: "2" });
        const header = session.getCookieHeader();
        expect(header).toContain("a=1");
        expect(header).toContain("b=2");
      });

      it("filters by domain", () => {
        session.setCookie({ name: "a", value: "1", domain: "example.com" });
        session.setCookie({ name: "b", value: "2", domain: "other.com" });
        const header = session.getCookieHeader("example.com");
        expect(header).toContain("a=1");
        expect(header).not.toContain("b=2");
      });
    });

    describe("setCookiesFromHeader", () => {
      it("parses Set-Cookie headers", () => {
        session.setCookiesFromHeader([
          "session=abc123; Path=/; HttpOnly",
          "user=john; Domain=example.com",
        ]);
        expect(session.cookies).toHaveLength(2);
      });
    });
  });

  describe("header management", () => {
    describe("setHeader", () => {
      it("sets a header", () => {
        session.setHeader("Authorization", "Bearer token");
        expect(session.headers["Authorization"]).toBe("Bearer token");
      });
    });

    describe("getHeader", () => {
      it("returns header value", () => {
        session.setHeader("Authorization", "Bearer token");
        expect(session.getHeader("Authorization")).toBe("Bearer token");
      });

      it("returns undefined for unknown header", () => {
        expect(session.getHeader("Unknown")).toBeUndefined();
      });
    });

    describe("removeHeader", () => {
      it("removes a header", () => {
        session.setHeader("Authorization", "Bearer token");
        session.removeHeader("Authorization");
        expect(session.getHeader("Authorization")).toBeUndefined();
      });
    });

    describe("getAllHeaders", () => {
      it("includes custom headers and cookies", () => {
        session.setHeader("Authorization", "Bearer token");
        session.setCookie({ name: "session", value: "abc" });
        const headers = session.getAllHeaders();
        expect(headers["Authorization"]).toBe("Bearer token");
        expect(headers["Cookie"]).toBeDefined();
      });
    });
  });

  describe("serialization", () => {
    describe("toJSON", () => {
      it("converts session to JSON", () => {
        session.setHeader("Auth", "token");
        session.setCookie({ name: "session", value: "abc" });
        session.markUsed();

        const json = session.toJSON();
        expect(json.id).toBe(session.id);
        expect(json.headers["Auth"]).toBe("token");
        expect(json.cookies).toHaveLength(1);
        expect(json.usageCount).toBe(1);
      });
    });

    describe("fromJSON", () => {
      it("creates session from JSON", () => {
        const original = new Session();
        original.setHeader("Auth", "token");
        original.setCookie({ name: "session", value: "abc" });
        original.markUsed();

        const json = original.toJSON();
        const restored = Session.fromJSON(json);

        expect(restored.id).toBe(original.id);
        expect(restored.getHeader("Auth")).toBe("token");
        expect(restored.cookies).toHaveLength(1);
        expect(restored.usageCount).toBe(1);
      });
    });
  });
});
