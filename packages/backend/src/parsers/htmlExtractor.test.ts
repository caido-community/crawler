import { describe, expect, it } from "vitest";

import { ResponseData } from "../models/types";

import { HtmlExtractor } from "./htmlExtractor";

const createHtmlResponse = (
  body: string,
  url = "https://example.com",
): ResponseData => {
  return new ResponseData({
    url,
    statusCode: 200,
    headers: { "content-type": ["text/html"] },
    body,
    contentType: "text/html",
    isHtml: true,
    isJson: false,
    isXml: false,
    redirectChain: [],
    timing: {
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: 100,
    },
  });
};

describe("HtmlExtractor", () => {
  describe("canHandle", () => {
    it("returns true for HTML response", () => {
      const extractor = new HtmlExtractor({ baseUrl: "https://example.com" });
      const response = createHtmlResponse("<html></html>");
      expect(extractor.canHandle(response)).toBe(true);
    });

    it("returns false for non-HTML response", () => {
      const extractor = new HtmlExtractor({ baseUrl: "https://example.com" });
      const response = new ResponseData({
        url: "https://example.com/data.json",
        statusCode: 200,
        headers: { "content-type": ["application/json"] },
        body: "{}",
        contentType: "application/json",
        isHtml: false,
        isJson: true,
        isXml: false,
        redirectChain: [],
        timing: {
          startedAt: new Date(),
          completedAt: new Date(),
          durationMs: 100,
        },
      });
      expect(extractor.canHandle(response)).toBe(false);
    });
  });

  describe("extract anchors", () => {
    it("extracts anchor href", () => {
      const extractor = new HtmlExtractor({ baseUrl: "https://example.com" });
      const html = '<a href="/page">Link</a>';
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      expect(result.links).toContainEqual(
        expect.objectContaining({
          url: "https://example.com/page",
          source: "anchor",
        }),
      );
    });

    it("extracts anchor text", () => {
      const extractor = new HtmlExtractor({ baseUrl: "https://example.com" });
      const html = '<a href="/page">Click Here</a>';
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      expect(result.links).toContainEqual(
        expect.objectContaining({
          url: "https://example.com/page",
          source: "anchor",
          text: "Click Here",
        }),
      );
    });

    it("handles absolute URLs", () => {
      const extractor = new HtmlExtractor({ baseUrl: "https://example.com" });
      const html = '<a href="https://other.com/page">External</a>';
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      expect(result.links).toContainEqual(
        expect.objectContaining({
          url: "https://other.com/page",
          source: "anchor",
        }),
      );
    });

    it("handles protocol-relative URLs", () => {
      const extractor = new HtmlExtractor({ baseUrl: "https://example.com" });
      const html = '<a href="//cdn.example.com/page">CDN</a>';
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      expect(result.links).toContainEqual(
        expect.objectContaining({
          url: "https://cdn.example.com/page",
          source: "anchor",
        }),
      );
    });

    it("handles relative URLs", () => {
      const extractor = new HtmlExtractor({
        baseUrl: "https://example.com/dir/page.html",
      });
      const html = '<a href="other.html">Other</a>';
      const response = createHtmlResponse(
        html,
        "https://example.com/dir/page.html",
      );

      const result = extractor.extract(response);

      expect(result.links).toContainEqual(
        expect.objectContaining({
          url: "https://example.com/dir/other.html",
          source: "anchor",
        }),
      );
    });

    it("ignores javascript: links", () => {
      const extractor = new HtmlExtractor({ baseUrl: "https://example.com" });
      const html = '<a href="javascript:void(0)">JS Link</a>';
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      expect(
        result.links.filter((l) => l.url.includes("javascript")),
      ).toHaveLength(0);
    });

    it("ignores mailto: links", () => {
      const extractor = new HtmlExtractor({ baseUrl: "https://example.com" });
      const html = '<a href="mailto:test@example.com">Email</a>';
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      expect(result.links.filter((l) => l.url.includes("mailto"))).toHaveLength(
        0,
      );
    });

    it("ignores fragment-only links", () => {
      const extractor = new HtmlExtractor({ baseUrl: "https://example.com" });
      const html = '<a href="#section">Section</a>';
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      expect(result.links.filter((l) => l.url === "#section")).toHaveLength(0);
    });
  });

  describe("extract forms", () => {
    it("extracts form action", () => {
      const extractor = new HtmlExtractor({ baseUrl: "https://example.com" });
      const html = '<form action="/submit"></form>';
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      expect(result.links).toContainEqual(
        expect.objectContaining({
          url: "https://example.com/submit",
          source: "form",
        }),
      );
    });

    it("extracts form details", () => {
      const extractor = new HtmlExtractor({ baseUrl: "https://example.com" });
      const html = `
        <form action="/login" method="POST" id="login-form" name="loginForm">
          <input type="text" name="username" required>
          <input type="password" name="password">
          <input type="submit" value="Login">
        </form>
      `;
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      expect(result.forms).toHaveLength(1);
      expect(result.forms[0]).toEqual(
        expect.objectContaining({
          action: "https://example.com/login",
          method: "POST",
          id: "login-form",
          name: "loginForm",
        }),
      );
      expect(result.forms[0]?.inputs).toContainEqual(
        expect.objectContaining({
          name: "username",
          type: "text",
          required: true,
        }),
      );
      expect(result.forms[0]?.inputs).toContainEqual(
        expect.objectContaining({
          name: "password",
          type: "password",
          required: false,
        }),
      );
    });

    it("extracts select inputs with options", () => {
      const extractor = new HtmlExtractor({ baseUrl: "https://example.com" });
      const html = `
        <form action="/submit">
          <select name="country">
            <option value="us">United States</option>
            <option value="uk">United Kingdom</option>
            <option value="de">Germany</option>
          </select>
        </form>
      `;
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      const selectInput = result.forms[0]?.inputs.find(
        (i) => i.name === "country",
      );
      expect(selectInput).toBeDefined();
      expect(selectInput?.type).toBe("select");
      expect(selectInput?.options).toEqual(["us", "uk", "de"]);
    });

    it("extracts textarea inputs", () => {
      const extractor = new HtmlExtractor({ baseUrl: "https://example.com" });
      const html = `
        <form action="/submit">
          <textarea name="message" required></textarea>
        </form>
      `;
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      const textareaInput = result.forms[0]?.inputs.find(
        (i) => i.name === "message",
      );
      expect(textareaInput).toBeDefined();
      expect(textareaInput?.type).toBe("textarea");
      expect(textareaInput?.required).toBe(true);
    });
  });

  describe("extract scripts and links", () => {
    it("extracts script sources", () => {
      const extractor = new HtmlExtractor({
        baseUrl: "https://example.com",
        extractScripts: true,
      });
      const html = '<script src="/js/app.js"></script>';
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      expect(result.links).toContainEqual(
        expect.objectContaining({
          url: "https://example.com/js/app.js",
          source: "script",
        }),
      );
    });

    it("extracts link hrefs", () => {
      const extractor = new HtmlExtractor({ baseUrl: "https://example.com" });
      const html = '<link rel="stylesheet" href="/css/style.css">';
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      expect(result.links).toContainEqual(
        expect.objectContaining({
          url: "https://example.com/css/style.css",
          source: "link",
        }),
      );
    });
  });

  describe("extract images", () => {
    it("extracts image sources", () => {
      const extractor = new HtmlExtractor({ baseUrl: "https://example.com" });
      const html = '<img src="/images/logo.png">';
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      expect(result.links).toContainEqual(
        expect.objectContaining({
          url: "https://example.com/images/logo.png",
          source: "image",
        }),
      );
    });

    it("extracts srcset images", () => {
      const extractor = new HtmlExtractor({ baseUrl: "https://example.com" });
      const html = '<img srcset="/images/small.jpg 1x, /images/large.jpg 2x">';
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      expect(result.links).toContainEqual(
        expect.objectContaining({
          url: "https://example.com/images/small.jpg",
          source: "image",
        }),
      );
      expect(result.links).toContainEqual(
        expect.objectContaining({
          url: "https://example.com/images/large.jpg",
          source: "image",
        }),
      );
    });
  });

  describe("extract iframes", () => {
    it("extracts iframe sources", () => {
      const extractor = new HtmlExtractor({ baseUrl: "https://example.com" });
      const html = '<iframe src="/embed/video"></iframe>';
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      expect(result.links).toContainEqual(
        expect.objectContaining({
          url: "https://example.com/embed/video",
          source: "iframe",
        }),
      );
    });
  });

  describe("extract CSS URLs", () => {
    it("extracts URLs from style blocks", () => {
      const extractor = new HtmlExtractor({
        baseUrl: "https://example.com",
        extractStyleUrls: true,
      });
      const html = `
        <style>
          body { background: url('/images/bg.png'); }
        </style>
      `;
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      expect(result.links).toContainEqual(
        expect.objectContaining({
          url: "https://example.com/images/bg.png",
          source: "css",
        }),
      );
    });

    it("extracts @import URLs", () => {
      const extractor = new HtmlExtractor({
        baseUrl: "https://example.com",
        extractStyleUrls: true,
      });
      const html = `
        <style>
          @import '/css/base.css';
        </style>
      `;
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      expect(result.links).toContainEqual(
        expect.objectContaining({
          url: "https://example.com/css/base.css",
          source: "css",
        }),
      );
    });
  });

  describe("extract emails", () => {
    it("extracts email addresses", () => {
      const extractor = new HtmlExtractor({ baseUrl: "https://example.com" });
      const html =
        "<p>Contact us at info@example.com or support@example.com</p>";
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      expect(result.emails).toContain("info@example.com");
      expect(result.emails).toContain("support@example.com");
    });

    it("deduplicates emails", () => {
      const extractor = new HtmlExtractor({ baseUrl: "https://example.com" });
      const html =
        "<p>Email: test@example.com</p><p>Contact: test@example.com</p>";
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      expect(
        result.emails.filter((e) => e === "test@example.com"),
      ).toHaveLength(1);
    });
  });

  describe("extract metadata", () => {
    it("extracts page title", () => {
      const extractor = new HtmlExtractor({ baseUrl: "https://example.com" });
      const html = "<html><head><title>My Page Title</title></head></html>";
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      expect(result.metadata.title).toBe("My Page Title");
    });

    it("extracts meta description", () => {
      const extractor = new HtmlExtractor({ baseUrl: "https://example.com" });
      const html =
        '<meta name="description" content="This is the page description">';
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      expect(result.metadata.description).toBe("This is the page description");
    });

    it("extracts meta keywords", () => {
      const extractor = new HtmlExtractor({ baseUrl: "https://example.com" });
      const html = '<meta name="keywords" content="web, crawler, testing">';
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      expect(result.metadata.keywords).toEqual(["web", "crawler", "testing"]);
    });

    it("extracts robots meta", () => {
      const extractor = new HtmlExtractor({ baseUrl: "https://example.com" });
      const html = '<meta name="robots" content="noindex, nofollow">';
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      expect(result.metadata.robotsMeta).toBe("noindex, nofollow");
    });

    it("extracts canonical URL", () => {
      const extractor = new HtmlExtractor({ baseUrl: "https://example.com" });
      const html =
        '<link rel="canonical" href="https://example.com/canonical-page">';
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      expect(result.metadata.canonical).toBe(
        "https://example.com/canonical-page",
      );
    });

    it("extracts language", () => {
      const extractor = new HtmlExtractor({ baseUrl: "https://example.com" });
      const html = '<html lang="en-US"></html>';
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      expect(result.metadata.language).toBe("en-US");
    });
  });

  describe("base tag handling", () => {
    it("uses base tag for URL resolution", () => {
      const extractor = new HtmlExtractor({
        baseUrl: "https://example.com/page",
      });
      const html = `
        <base href="https://cdn.example.com/">
        <a href="page.html">Link</a>
      `;
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      expect(result.links).toContainEqual(
        expect.objectContaining({
          url: "https://cdn.example.com/page.html",
          source: "anchor",
        }),
      );
    });
  });

  describe("deduplication", () => {
    it("deduplicates links with same URL", () => {
      const extractor = new HtmlExtractor({ baseUrl: "https://example.com" });
      const html = `
        <a href="/page">Link 1</a>
        <a href="/page">Link 2</a>
        <a href="/page">Link 3</a>
      `;
      const response = createHtmlResponse(html);

      const result = extractor.extract(response);

      const pageLinks = result.links.filter(
        (l) => l.url === "https://example.com/page",
      );
      expect(pageLinks).toHaveLength(1);
    });
  });

  describe("static filter methods", () => {
    it("filterNavigableLinks returns only navigable sources", () => {
      const links = [
        { url: "https://example.com/page", source: "anchor" as const },
        { url: "https://example.com/submit", source: "form" as const },
        { url: "https://example.com/app.js", source: "script" as const },
        { url: "https://example.com/style.css", source: "link" as const },
        { url: "https://example.com/embed", source: "iframe" as const },
      ];

      const navigable = HtmlExtractor.filterNavigableLinks(links);

      expect(navigable).toHaveLength(3);
      expect(navigable.map((l) => l.source)).toContain("anchor");
      expect(navigable.map((l) => l.source)).toContain("form");
      expect(navigable.map((l) => l.source)).toContain("iframe");
    });

    it("filterResourceLinks returns only resource sources", () => {
      const links = [
        { url: "https://example.com/page", source: "anchor" as const },
        { url: "https://example.com/app.js", source: "script" as const },
        { url: "https://example.com/style.css", source: "link" as const },
        { url: "https://example.com/image.png", source: "image" as const },
        { url: "https://example.com/bg.png", source: "css" as const },
      ];

      const resources = HtmlExtractor.filterResourceLinks(links);

      expect(resources).toHaveLength(4);
      expect(resources.map((l) => l.source)).toContain("script");
      expect(resources.map((l) => l.source)).toContain("link");
      expect(resources.map((l) => l.source)).toContain("image");
      expect(resources.map((l) => l.source)).toContain("css");
    });
  });
});
