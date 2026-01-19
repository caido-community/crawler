/**
 * Parser-specific types for content extraction
 */

import type { RequestMethod } from "../models/types";

export type UrlSource =
  | "anchor"
  | "form"
  | "script"
  | "link"
  | "image"
  | "iframe"
  | "css"
  | "meta"
  | "sitemap"
  | "robots"
  | "json"
  | "javascript";

export type ExtractedLink = {
  url: string;
  source: UrlSource;
  text?: string;
  attributes?: Record<string, string>;
};

export type ExtractionResult = {
  links: ExtractedLink[];
  forms: ExtractedForm[];
  emails: string[];
  metadata: PageMetadata;
};

export type ExtractedForm = {
  action: string;
  method: RequestMethod;
  inputs: FormInput[];
  id?: string;
  name?: string;
};

export type FormInput = {
  name: string;
  type: string;
  value?: string;
  required: boolean;
  options?: string[];
};

export type PageMetadata = {
  title?: string;
  description?: string;
  keywords?: string[];
  canonical?: string;
  language?: string;
  robotsMeta?: string;
};

export type SitemapUrl = {
  loc: string;
  lastmod?: string;
  changefreq?:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority?: number;
};

export type Sitemap = {
  urls: SitemapUrl[];
  sitemaps: string[];
};

export type RobotsTxt = {
  rules: RobotsRule[];
  sitemaps: string[];
  crawlDelay?: number;
};

export type RobotsRule = {
  userAgent: string;
  allow: string[];
  disallow: string[];
};
