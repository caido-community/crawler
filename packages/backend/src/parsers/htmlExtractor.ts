/**
 * HTML Extractor - Comprehensive HTML link and content extraction
 */

import type { RequestMethod, ResponseData } from "../models/types";

import { BaseExtractor, type ExtractorOptions } from "./baseExtractor";
import type {
  ExtractedForm,
  ExtractedLink,
  ExtractionResult,
  FormInput,
  PageMetadata,
  UrlSource,
} from "./types";

const PATTERNS = {
  // Standard HTML elements
  anchor: /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi,
  anchorWithText: /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([^<]*)</gi,
  form: /<form\s+[^>]*action\s*=\s*["']([^"']+)["'][^>]*>/gi,
  formFull: /<form\s+([^>]*)>([\s\S]*?)<\/form>/gi,
  script: /<script\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi,
  link: /<link\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi,
  img: /<img\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi,
  imgSrcset: /<img\s+[^>]*srcset\s*=\s*["']([^"']+)["'][^>]*>/gi,
  iframe: /<iframe\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi,
  video: /<video\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi,
  audio: /<audio\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi,
  source: /<source\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi,
  embed: /<embed\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi,
  object: /<object\s+[^>]*data\s*=\s*["']([^"']+)["'][^>]*>/gi,
  area: /<area\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi,
  base: /<base\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/i,

  // Meta and redirects
  metaRefresh:
    /<meta\s+[^>]*content\s*=\s*["'][^"']*url\s*=\s*([^"'\s>]+)["'][^>]*>/gi,
  metaCanonical:
    /<link\s+[^>]*rel\s*=\s*["']canonical["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi,

  // CSS and inline styles
  cssUrl: /url\s*\(\s*["']?([^"')]+)["']?\s*\)/gi,
  cssImport: /@import\s+["']([^"']+)["']/gi,
  styleBlock: /<style[^>]*>([\s\S]*?)<\/style>/gi,

  // JavaScript sources
  jsString: /["'](https?:\/\/[^"'\s]+)["']/g,
  jsEndpoint:
    /["'](\/?(?:api|v\d+|graphql|rest|ajax|data|json|xml|rss|feed)[^"']*?)["']/gi,

  // Data attributes
  dataUrl:
    /data-(?:url|src|href|link|image|background)\s*=\s*["']([^"']+)["']/gi,

  // Input elements
  inputElement: /<input\s+([^>]*)>/gi,
  selectElement: /<select\s+([^>]*)>([\s\S]*?)<\/select>/gi,
  textareaElement: /<textarea\s+([^>]*)>/gi,
  optionElement: /<option\s+[^>]*value\s*=\s*["']([^"']*)["'][^>]*>/gi,

  // Metadata
  title: /<title[^>]*>([^<]+)<\/title>/i,
  metaDescription:
    /<meta\s+[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/i,
  metaKeywords:
    /<meta\s+[^>]*name\s*=\s*["']keywords["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/i,
  metaRobots:
    /<meta\s+[^>]*name\s*=\s*["']robots["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/i,
  htmlLang: /<html\s+[^>]*lang\s*=\s*["']([^"']+)["'][^>]*>/i,
  ogUrl:
    /<meta\s+[^>]*property\s*=\s*["']og:url["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/i,

  // Email extraction
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
};

export interface HtmlExtractorOptions extends ExtractorOptions {
  extractScripts?: boolean;
  extractStyleUrls?: boolean;
  extractJsStrings?: boolean;
  extractDataUrls?: boolean;
}

export class HtmlExtractor extends BaseExtractor {
  private htmlOptions: HtmlExtractorOptions;

  constructor(options: HtmlExtractorOptions) {
    super(options);
    this.htmlOptions = {
      extractForms: true,
      extractEmails: true,
      extractMetadata: true,
      extractScripts: true,
      extractStyleUrls: true,
      extractJsStrings: false, // Off by default - can be noisy
      extractDataUrls: true,
      ...options,
    };
  }

  canHandle(response: ResponseData): boolean {
    return response.isHtml;
  }

  extract(response: ResponseData): ExtractionResult {
    const html = response.body;
    let baseUrl = this.options.baseUrl;

    // Check for <base> tag
    const baseMatch = PATTERNS.base.exec(html);
    if (baseMatch !== null && baseMatch[1] !== undefined) {
      const normalizedBase = this.normalizeUrl(baseMatch[1]);
      if (normalizedBase !== undefined) {
        baseUrl = normalizedBase;
      }
    }
    // Reset regex
    PATTERNS.base.lastIndex = 0;

    // Update base URL for normalization
    const originalBaseUrl = this.options.baseUrl;
    this.options.baseUrl = baseUrl;

    const links: ExtractedLink[] = [];

    // Extract navigable links
    links.push(...this.extractAnchors(html));
    links.push(...this.extractForms(html));
    links.push(...this.extractIframes(html));
    links.push(...this.extractMetaRefresh(html));
    links.push(...this.extractArea(html));

    // Extract resource links
    if (this.htmlOptions.extractScripts === true) {
      links.push(...this.extractScripts(html));
    }
    links.push(...this.extractLinks(html));
    links.push(...this.extractImages(html));
    links.push(...this.extractMedia(html));

    // Extract from CSS
    if (this.htmlOptions.extractStyleUrls === true) {
      links.push(...this.extractCssUrls(html));
    }

    // Extract from JavaScript strings
    if (this.htmlOptions.extractJsStrings === true) {
      links.push(...this.extractJsStrings(html));
    }

    // Extract data attributes
    if (this.htmlOptions.extractDataUrls === true) {
      links.push(...this.extractDataUrls(html));
    }

    // Extract forms
    const forms =
      this.htmlOptions.extractForms === true
        ? this.extractFormDetails(html)
        : [];

    // Extract emails
    const emails =
      this.htmlOptions.extractEmails === true ? this.extractEmails(html) : [];

    // Extract metadata
    const metadata =
      this.htmlOptions.extractMetadata === true
        ? this.extractMetadata(html)
        : {};

    // Restore original base URL
    this.options.baseUrl = originalBaseUrl;

    return {
      links: this.deduplicateLinks(links),
      forms,
      emails,
      metadata,
    };
  }

  private extractWithPattern(
    html: string,
    pattern: RegExp,
    source: UrlSource,
  ): ExtractedLink[] {
    const links: ExtractedLink[] = [];
    const regex = new RegExp(pattern.source, pattern.flags);

    let match = regex.exec(html);
    while (match !== null) {
      const url = match[1];
      if (url !== undefined) {
        const normalized = this.normalizeUrl(url);
        if (normalized !== undefined) {
          links.push({ url: normalized, source });
        }
      }
      match = regex.exec(html);
    }

    return links;
  }

  private extractAnchors(html: string): ExtractedLink[] {
    const links: ExtractedLink[] = [];
    const regex = new RegExp(
      PATTERNS.anchorWithText.source,
      PATTERNS.anchorWithText.flags,
    );

    let match = regex.exec(html);
    while (match !== null) {
      const url = match[1];
      const text = match[2];
      if (url !== undefined) {
        const normalized = this.normalizeUrl(url);
        if (normalized !== undefined) {
          links.push({
            url: normalized,
            source: "anchor",
            text: text?.trim(),
          });
        }
      }
      match = regex.exec(html);
    }

    return links;
  }

  private extractForms(html: string): ExtractedLink[] {
    return this.extractWithPattern(html, PATTERNS.form, "form");
  }

  private extractIframes(html: string): ExtractedLink[] {
    return this.extractWithPattern(html, PATTERNS.iframe, "iframe");
  }

  private extractMetaRefresh(html: string): ExtractedLink[] {
    return this.extractWithPattern(html, PATTERNS.metaRefresh, "meta");
  }

  private extractArea(html: string): ExtractedLink[] {
    return this.extractWithPattern(html, PATTERNS.area, "anchor");
  }

  private extractScripts(html: string): ExtractedLink[] {
    return this.extractWithPattern(html, PATTERNS.script, "script");
  }

  private extractLinks(html: string): ExtractedLink[] {
    return this.extractWithPattern(html, PATTERNS.link, "link");
  }

  private extractImages(html: string): ExtractedLink[] {
    const links = this.extractWithPattern(html, PATTERNS.img, "image");

    // Also extract from srcset
    const regex = new RegExp(
      PATTERNS.imgSrcset.source,
      PATTERNS.imgSrcset.flags,
    );
    let match = regex.exec(html);
    while (match !== null) {
      const srcset = match[1];
      if (srcset !== undefined) {
        // srcset format: "url1 1x, url2 2x" or "url1 100w, url2 200w"
        const urls = srcset.split(",").map((s) => s.trim().split(/\s+/)[0]);
        for (const url of urls) {
          if (url !== undefined) {
            const normalized = this.normalizeUrl(url);
            if (normalized !== undefined) {
              links.push({ url: normalized, source: "image" });
            }
          }
        }
      }
      match = regex.exec(html);
    }

    return links;
  }

  private extractMedia(html: string): ExtractedLink[] {
    const links: ExtractedLink[] = [];
    links.push(...this.extractWithPattern(html, PATTERNS.video, "link"));
    links.push(...this.extractWithPattern(html, PATTERNS.audio, "link"));
    links.push(...this.extractWithPattern(html, PATTERNS.source, "link"));
    links.push(...this.extractWithPattern(html, PATTERNS.embed, "link"));
    links.push(...this.extractWithPattern(html, PATTERNS.object, "link"));
    return links;
  }

  private extractCssUrls(html: string): ExtractedLink[] {
    const links: ExtractedLink[] = [];

    // Extract from <style> blocks
    const styleRegex = new RegExp(
      PATTERNS.styleBlock.source,
      PATTERNS.styleBlock.flags,
    );
    let styleMatch = styleRegex.exec(html);
    while (styleMatch !== null) {
      const styleContent = styleMatch[1];
      if (styleContent !== undefined) {
        links.push(...this.extractUrlsFromCss(styleContent));
      }
      styleMatch = styleRegex.exec(html);
    }

    // Extract from inline style attributes
    links.push(...this.extractWithPattern(html, PATTERNS.cssUrl, "css"));

    return links;
  }

  private extractUrlsFromCss(css: string): ExtractedLink[] {
    const links: ExtractedLink[] = [];

    // url() pattern
    const urlRegex = new RegExp(PATTERNS.cssUrl.source, PATTERNS.cssUrl.flags);
    let match = urlRegex.exec(css);
    while (match !== null) {
      const url = match[1];
      if (url !== undefined) {
        const normalized = this.normalizeUrl(url);
        if (normalized !== undefined) {
          links.push({ url: normalized, source: "css" });
        }
      }
      match = urlRegex.exec(css);
    }

    // @import pattern
    const importRegex = new RegExp(
      PATTERNS.cssImport.source,
      PATTERNS.cssImport.flags,
    );
    let importMatch = importRegex.exec(css);
    while (importMatch !== null) {
      const url = importMatch[1];
      if (url !== undefined) {
        const normalized = this.normalizeUrl(url);
        if (normalized !== undefined) {
          links.push({ url: normalized, source: "css" });
        }
      }
      importMatch = importRegex.exec(css);
    }

    return links;
  }

  private extractJsStrings(html: string): ExtractedLink[] {
    const links: ExtractedLink[] = [];

    // Extract full URLs from JS strings
    const urlRegex = new RegExp(
      PATTERNS.jsString.source,
      PATTERNS.jsString.flags,
    );
    let match = urlRegex.exec(html);
    while (match !== null) {
      const url = match[1];
      if (url !== undefined) {
        const normalized = this.normalizeUrl(url);
        if (normalized !== undefined) {
          links.push({ url: normalized, source: "javascript" });
        }
      }
      match = urlRegex.exec(html);
    }

    // Extract API endpoints
    const endpointRegex = new RegExp(
      PATTERNS.jsEndpoint.source,
      PATTERNS.jsEndpoint.flags,
    );
    let endpointMatch = endpointRegex.exec(html);
    while (endpointMatch !== null) {
      const url = endpointMatch[1];
      if (url !== undefined) {
        const normalized = this.normalizeUrl(url);
        if (normalized !== undefined) {
          links.push({ url: normalized, source: "javascript" });
        }
      }
      endpointMatch = endpointRegex.exec(html);
    }

    return links;
  }

  private extractDataUrls(html: string): ExtractedLink[] {
    return this.extractWithPattern(html, PATTERNS.dataUrl, "link");
  }

  private extractFormDetails(html: string): ExtractedForm[] {
    const forms: ExtractedForm[] = [];
    const formRegex = new RegExp(
      PATTERNS.formFull.source,
      PATTERNS.formFull.flags,
    );

    let match = formRegex.exec(html);
    while (match !== null) {
      const attributes = match[1] ?? "";
      const content = match[2] ?? "";

      const action = this.extractAttribute(attributes, "action") ?? "";
      const methodAttr = this.extractAttribute(attributes, "method") ?? "GET";
      const method = methodAttr.toUpperCase() as RequestMethod;
      const id = this.extractAttribute(attributes, "id");
      const name = this.extractAttribute(attributes, "name");

      const normalizedAction = this.normalizeUrl(action);

      if (normalizedAction !== undefined) {
        forms.push({
          action: normalizedAction,
          method,
          inputs: this.extractInputs(content),
          id,
          name,
        });
      }

      match = formRegex.exec(html);
    }

    return forms;
  }

  private extractInputs(formContent: string): FormInput[] {
    const inputs: FormInput[] = [];

    // Extract <input> elements
    const inputRegex = new RegExp(
      PATTERNS.inputElement.source,
      PATTERNS.inputElement.flags,
    );
    let match = inputRegex.exec(formContent);
    while (match !== null) {
      const attrs = match[1] ?? "";
      const name = this.extractAttribute(attrs, "name");
      if (name !== undefined) {
        inputs.push({
          name,
          type: this.extractAttribute(attrs, "type") ?? "text",
          value: this.extractAttribute(attrs, "value"),
          required: attrs.includes("required"),
        });
      }
      match = inputRegex.exec(formContent);
    }

    // Extract <select> elements
    const selectRegex = new RegExp(
      PATTERNS.selectElement.source,
      PATTERNS.selectElement.flags,
    );
    let selectMatch = selectRegex.exec(formContent);
    while (selectMatch !== null) {
      const attrs = selectMatch[1] ?? "";
      const content = selectMatch[2] ?? "";
      const name = this.extractAttribute(attrs, "name");
      if (name !== undefined) {
        const options = this.extractOptions(content);
        inputs.push({
          name,
          type: "select",
          value: options[0],
          required: attrs.includes("required"),
          options,
        });
      }
      selectMatch = selectRegex.exec(formContent);
    }

    // Extract <textarea> elements
    const textareaRegex = new RegExp(
      PATTERNS.textareaElement.source,
      PATTERNS.textareaElement.flags,
    );
    let textareaMatch = textareaRegex.exec(formContent);
    while (textareaMatch !== null) {
      const attrs = textareaMatch[1] ?? "";
      const name = this.extractAttribute(attrs, "name");
      if (name !== undefined) {
        inputs.push({
          name,
          type: "textarea",
          required: attrs.includes("required"),
        });
      }
      textareaMatch = textareaRegex.exec(formContent);
    }

    return inputs;
  }

  private extractOptions(selectContent: string): string[] {
    const options: string[] = [];
    const optionRegex = new RegExp(
      PATTERNS.optionElement.source,
      PATTERNS.optionElement.flags,
    );
    let match = optionRegex.exec(selectContent);
    while (match !== null) {
      const value = match[1];
      if (value !== undefined) {
        options.push(value);
      }
      match = optionRegex.exec(selectContent);
    }
    return options;
  }

  private extractAttribute(attrs: string, name: string): string | undefined {
    const regex = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i");
    const match = regex.exec(attrs);
    return match !== null ? match[1] : undefined;
  }

  private extractEmails(html: string): string[] {
    const emails: string[] = [];
    const regex = new RegExp(PATTERNS.email.source, PATTERNS.email.flags);
    let match = regex.exec(html);
    while (match !== null) {
      emails.push(match[0].toLowerCase());
      match = regex.exec(html);
    }
    return [...new Set(emails)];
  }

  private extractMetadata(html: string): PageMetadata {
    const metadata: PageMetadata = {};

    // Title
    const titleMatch = PATTERNS.title.exec(html);
    if (titleMatch !== null) {
      metadata.title = titleMatch[1]?.trim();
    }

    // Description
    const descMatch = PATTERNS.metaDescription.exec(html);
    if (descMatch !== null) {
      metadata.description = descMatch[1]?.trim();
    }

    // Keywords
    const keywordsMatch = PATTERNS.metaKeywords.exec(html);
    if (keywordsMatch !== null) {
      const keywordsStr = keywordsMatch[1] ?? "";
      metadata.keywords = keywordsStr.split(",").map((k) => k.trim());
    }

    // Robots
    const robotsMatch = PATTERNS.metaRobots.exec(html);
    if (robotsMatch !== null) {
      metadata.robotsMeta = robotsMatch[1]?.trim();
    }

    // Language
    const langMatch = PATTERNS.htmlLang.exec(html);
    if (langMatch !== null) {
      metadata.language = langMatch[1]?.trim();
    }

    // Canonical
    const canonicalMatch = PATTERNS.metaCanonical.exec(html);
    if (canonicalMatch !== null) {
      metadata.canonical = canonicalMatch[1]?.trim();
    }

    // OG URL as fallback
    if (metadata.canonical === undefined) {
      const ogMatch = PATTERNS.ogUrl.exec(html);
      if (ogMatch !== null) {
        metadata.canonical = ogMatch[1]?.trim();
      }
    }

    return metadata;
  }

  /**
   * Filters links to only navigable ones (pages, not resources)
   */
  static filterNavigableLinks(links: ExtractedLink[]): ExtractedLink[] {
    const navigableSources: UrlSource[] = ["anchor", "form", "iframe", "meta"];
    return links.filter((link) => navigableSources.includes(link.source));
  }

  /**
   * Filters links to only resource links (scripts, styles, images)
   */
  static filterResourceLinks(links: ExtractedLink[]): ExtractedLink[] {
    const resourceSources: UrlSource[] = ["script", "link", "image", "css"];
    return links.filter((link) => resourceSources.includes(link.source));
  }
}
