import { configStore } from "../stores/configStore";
import { jobsStore } from "../stores/jobsStore";
import type { BackendSDK, InterceptedRequest } from "../types";

// jobsStore is still used for checking existing jobs, but updates are handled by CrawlerService

import { CrawlerService } from "./crawler";

class AutoCrawlServiceClass {
  private seenHosts: Set<string> = new Set();

  init(sdk: BackendSDK): void {
    sdk.events.onInterceptResponse((_, request) => {
      this.handleResponse(request, sdk);
    });
  }

  private handleResponse(request: InterceptedRequest, sdk: BackendSDK): void {
    const config = configStore.getConfig();

    if (!config.enabled) {
      return;
    }

    const host = request.getHost();

    if (this.seenHosts.has(host)) {
      return;
    }

    if (this.isStaticResource(request.getPath())) {
      return;
    }

    if (config.crawlInScopeOnly) {
      const inScope = sdk.requests.inScope(request);
      if (!inScope) {
        return;
      }
    }

    const existingJob = jobsStore.getJobByHost(host);
    if (existingJob !== undefined) {
      this.seenHosts.add(host);
      return;
    }

    this.seenHosts.add(host);

    const url = this.buildUrl(request);
    this.startCrawl(url, sdk);
  }

  private buildUrl(request: InterceptedRequest): string {
    const host = request.getHost();
    const port = request.getPort();
    const isTls = request.getTls();

    const protocol = isTls ? "https" : "http";
    const defaultPort = isTls ? 443 : 80;

    if (port === defaultPort) {
      return `${protocol}://${host}`;
    }

    return `${protocol}://${host}:${port}`;
  }

  private startCrawl(url: string, sdk: BackendSDK): void {
    CrawlerService.start(url, {
      onProgress: (stats, jobId) => {
        sdk.api.send("crawl:progress", {
          jobId,
          crawledUrls: stats.crawledUrls,
          discoveredUrls: stats.discoveredUrls,
        });
      },
      onComplete: (stats, jobId) => {
        sdk.api.send("crawl:completed", {
          jobId,
          totalUrls: stats.crawledUrls,
        });
      },
    }).then((result) => {
      if (result.kind === "Ok") {
        sdk.api.send("crawl:started", {
          jobId: result.value.jobId,
          host: result.value.job.host,
          targetUrl: result.value.job.targetUrl,
        });
      }
    });
  }

  private isStaticResource(path: string): boolean {
    const staticExtensions = [
      ".js",
      ".css",
      ".map",
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".svg",
      ".ico",
      ".woff",
      ".woff2",
      ".ttf",
      ".eot",
      ".webp",
      ".mp4",
      ".webm",
      ".mp3",
      ".wav",
      ".pdf",
    ];

    return staticExtensions.some((ext) => path.toLowerCase().endsWith(ext));
  }

  clearSeenHosts(): void {
    this.seenHosts.clear();
  }

  getSeenHosts(): string[] {
    return Array.from(this.seenHosts);
  }

  hasSeenHost(host: string): boolean {
    return this.seenHosts.has(host);
  }

  addSeenHost(host: string): void {
    this.seenHosts.add(host);
  }
}

export const AutoCrawlService = new AutoCrawlServiceClass();
