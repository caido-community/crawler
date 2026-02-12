import { configStore } from "../stores/configStore";
import { jobsStore } from "../stores/jobsStore";
import type { BackendSDK, InterceptedRequest } from "../types";

import { CrawlerService } from "./crawler";
import { matchesHttpqlFilter } from "./crawler/httpqlFilter";

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

    const url = this.buildUrl(request);

    const httpqlFilter = config.httpqlFilter?.trim();
    if (httpqlFilter !== undefined && httpqlFilter !== "") {
      if (!matchesHttpqlFilter(url, httpqlFilter)) {
        this.seenHosts.add(host);
        return;
      }
    }

    this.seenHosts.add(host);
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
          crawled: stats.crawledUrls,
          discovered: stats.discoveredUrls,
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
        const { job, jobId } = result.value;
        sdk.api.send("job:created", job);
        sdk.api.send("crawl:started", { jobId, host: job.host });
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
