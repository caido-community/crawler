/**
 * Base Extractor - Abstract base class for content extractors
 */

import type { ResponseData } from "../models/types";

import type { ExtractedLink, ExtractionResult } from "./types";

export interface ExtractorOptions {
  baseUrl: string;
  extractForms?: boolean;
  extractEmails?: boolean;
  extractMetadata?: boolean;
}

/**
 * Abstract base class for content extractors
 */
export abstract class BaseExtractor {
  protected options: ExtractorOptions;

  constructor(options: ExtractorOptions) {
    this.options = options;
  }

  /**
   * Main extraction method - must be implemented by subclasses
   */
  abstract extract(response: ResponseData): ExtractionResult;

  /**
   * Checks if this extractor can handle the given response
   */
  abstract canHandle(response: ResponseData): boolean;

  /**
   * Normalizes a URL relative to the base URL
   */
  protected normalizeUrl(url: string): string | undefined {
    const trimmedUrl = url.trim();

    if (trimmedUrl === "") {
      return undefined;
    }

    // Skip non-HTTP URLs
    if (
      trimmedUrl.startsWith("javascript:") ||
      trimmedUrl.startsWith("mailto:") ||
      trimmedUrl.startsWith("tel:") ||
      trimmedUrl.startsWith("data:") ||
      trimmedUrl.startsWith("blob:") ||
      trimmedUrl.startsWith("#")
    ) {
      return undefined;
    }

    try {
      let absoluteUrl: string;

      if (
        trimmedUrl.startsWith("http://") ||
        trimmedUrl.startsWith("https://")
      ) {
        absoluteUrl = trimmedUrl;
      } else if (trimmedUrl.startsWith("//")) {
        const baseUrlObj = new URL(this.options.baseUrl);
        absoluteUrl = `${baseUrlObj.protocol}${trimmedUrl}`;
      } else if (trimmedUrl.startsWith("/")) {
        const baseUrlObj = new URL(this.options.baseUrl);
        absoluteUrl = `${baseUrlObj.origin}${trimmedUrl}`;
      } else if (trimmedUrl.startsWith("?")) {
        const baseUrlObj = new URL(this.options.baseUrl);
        absoluteUrl = `${baseUrlObj.origin}${baseUrlObj.pathname}${trimmedUrl}`;
      } else {
        const baseUrlObj = new URL(this.options.baseUrl);
        const basePath = baseUrlObj.pathname.substring(
          0,
          baseUrlObj.pathname.lastIndexOf("/") + 1,
        );
        absoluteUrl = `${baseUrlObj.origin}${basePath}${trimmedUrl}`;
      }

      // Normalize and remove fragment
      const normalizedUrlObj = new URL(absoluteUrl);
      normalizedUrlObj.hash = "";

      return normalizedUrlObj.href;
    } catch {
      return undefined;
    }
  }

  /**
   * Creates an empty extraction result
   */
  protected createEmptyResult(): ExtractionResult {
    return {
      links: [],
      forms: [],
      emails: [],
      metadata: {},
    };
  }

  /**
   * Deduplicates links by URL
   */
  protected deduplicateLinks(links: ExtractedLink[]): ExtractedLink[] {
    const seen = new Set<string>();
    const unique: ExtractedLink[] = [];

    for (const link of links) {
      if (!seen.has(link.url)) {
        seen.add(link.url);
        unique.push(link);
      }
    }

    return unique;
  }
}

/**
 * Composite extractor that delegates to multiple extractors
 */
export class CompositeExtractor {
  private extractors: BaseExtractor[] = [];

  /**
   * Adds an extractor to the chain
   */
  addExtractor(extractor: BaseExtractor): void {
    this.extractors.push(extractor);
  }

  /**
   * Removes an extractor from the chain
   */
  removeExtractor(extractor: BaseExtractor): void {
    const index = this.extractors.indexOf(extractor);
    if (index >= 0) {
      this.extractors.splice(index, 1);
    }
  }

  /**
   * Extracts content using all applicable extractors
   */
  extract(response: ResponseData): ExtractionResult {
    const combinedResult: ExtractionResult = {
      links: [],
      forms: [],
      emails: [],
      metadata: {},
    };

    for (const extractor of this.extractors) {
      if (extractor.canHandle(response)) {
        const result = extractor.extract(response);

        // Merge links
        combinedResult.links.push(...result.links);

        // Merge forms
        combinedResult.forms.push(...result.forms);

        // Merge emails
        combinedResult.emails.push(...result.emails);

        // Merge metadata (later extractors override earlier)
        combinedResult.metadata = {
          ...combinedResult.metadata,
          ...result.metadata,
        };
      }
    }

    // Deduplicate
    combinedResult.links = this.deduplicateLinks(combinedResult.links);
    combinedResult.emails = [...new Set(combinedResult.emails)];

    return combinedResult;
  }

  private deduplicateLinks(links: ExtractedLink[]): ExtractedLink[] {
    const seen = new Set<string>();
    const unique: ExtractedLink[] = [];

    for (const link of links) {
      if (!seen.has(link.url)) {
        seen.add(link.url);
        unique.push(link);
      }
    }

    return unique;
  }
}
