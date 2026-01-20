/**
 * Link filtering and processing utilities.
 * Handles filtering links by domain, hostname, origin, and depth.
 */

import type { ExtractedLink, LinkStrategy } from "./types";

/**
 * Extracts the root domain from a hostname.
 * Example: "sub.example.com" → "example.com"
 */
export function getRootDomain(hostname: string): string {
  const parts = hostname.split(".");
  if (parts.length <= 2) {
    return hostname;
  }
  return parts.slice(-2).join(".");
}

/**
 * Filters links to only those matching the same root domain as the base URL.
 */
export function filterSameDomain(
  links: ExtractedLink[],
  baseUrl: string,
): ExtractedLink[] {
  try {
    const baseUrlObj = new URL(baseUrl);
    const baseDomain = getRootDomain(baseUrlObj.hostname);

    return links.filter((link) => {
      try {
        const linkUrl = new URL(link.url);
        const linkDomain = getRootDomain(linkUrl.hostname);
        return baseDomain === linkDomain;
      } catch {
        return false;
      }
    });
  } catch {
    return links;
  }
}

/**
 * Filters links to only those matching the same hostname as the base URL.
 */
export function filterSameHostname(
  links: ExtractedLink[],
  baseUrl: string,
): ExtractedLink[] {
  try {
    const baseUrlObj = new URL(baseUrl);

    return links.filter((link) => {
      try {
        const linkUrl = new URL(link.url);
        return linkUrl.hostname === baseUrlObj.hostname;
      } catch {
        return false;
      }
    });
  } catch {
    return links;
  }
}

/**
 * Filters links to only those matching the same origin as the base URL.
 */
export function filterSameOrigin(
  links: ExtractedLink[],
  baseUrl: string,
): ExtractedLink[] {
  try {
    const baseUrlObj = new URL(baseUrl);

    return links.filter((link) => {
      try {
        const linkUrl = new URL(link.url);
        return linkUrl.origin === baseUrlObj.origin;
      } catch {
        return false;
      }
    });
  } catch {
    return links;
  }
}

/**
 * Filters links based on the specified strategy.
 *
 * @param links - Array of extracted links to filter
 * @param baseUrl - The URL to compare against
 * @param strategy - Filtering strategy to apply
 * @param sameDomainOnly - If true and strategy is "all", filters to same domain
 */
export function filterLinksByStrategy(
  links: ExtractedLink[],
  baseUrl: string,
  strategy: LinkStrategy | undefined,
  sameDomainOnly: boolean,
): ExtractedLink[] {
  if (strategy === undefined || strategy === "all") {
    if (sameDomainOnly) {
      return filterSameDomain(links, baseUrl);
    }
    return links;
  }

  switch (strategy) {
    case "same-domain":
      return filterSameDomain(links, baseUrl);

    case "same-hostname":
      return filterSameHostname(links, baseUrl);

    case "same-origin":
      return filterSameOrigin(links, baseUrl);

    default:
      return links;
  }
}

/**
 * Extracts the hostname from a URL.
 * Returns the original string if parsing fails.
 */
export function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Extracts the hostname from a URL, returning undefined on failure.
 */
export function getHost(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}
