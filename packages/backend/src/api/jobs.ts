import type { SDK } from "caido:plugin";
import type { CrawlJob, Result } from "shared";

import {
  generateJobId,
  getAllCrawlers,
  getCrawler,
  ManagedCrawler,
  registerCrawler,
  unregisterCrawler,
} from "../engine";
import { requireSDK } from "../sdk";
import { configStore } from "../stores/configStore";
import { jobsStore } from "../stores/jobsStore";

function getHost(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

export function startCrawl(_sdk: SDK, targetUrl: string): Result<CrawlJob> {
  const sdk = requireSDK();

  const host = getHost(targetUrl);
  if (host === undefined) {
    return { kind: "Error", error: "Invalid URL provided." };
  }

  const existingJob = jobsStore.getJobByHost(host);
  if (existingJob !== undefined) {
    return {
      kind: "Error",
      error: `A crawl job is already running for ${host}.`,
    };
  }

  const config = configStore.getConfig();
  const jobId = generateJobId();

  const crawler = new ManagedCrawler(jobId, targetUrl, config, {
    onProgress: (stats) => {
      jobsStore.updateJob(jobId, {
        crawledUrls: stats.crawledUrls,
        discoveredUrls: stats.discoveredUrls,
      });
      sdk.api.send("crawl:progress", {
        jobId,
        crawled: stats.crawledUrls,
        discovered: stats.discoveredUrls,
      });
    },
    onComplete: (stats) => {
      jobsStore.updateJob(jobId, {
        status: "completed",
        crawledUrls: stats.crawledUrls,
        discoveredUrls: stats.discoveredUrls,
        completedAt: new Date(),
      });
      sdk.api.send("crawl:completed", {
        jobId,
        totalUrls: stats.crawledUrls,
      });
      unregisterCrawler(jobId);
    },
    onError: (url, error) => {
      sdk.console.log(`[Crawler] Error crawling ${url}: ${error}`);
    },
  });

  registerCrawler(crawler);

  const job = crawler.getJob();
  jobsStore.addJob(job);
  sdk.api.send("job:created", job);
  sdk.api.send("crawl:started", { jobId, host });

  crawler.start().catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    jobsStore.updateJob(jobId, {
      status: "failed",
      completedAt: new Date(),
    });
    sdk.api.send("crawl:failed", { jobId, error: errorMessage });
    unregisterCrawler(jobId);
  });

  return { kind: "Ok", value: job };
}

export function stopCrawl(_sdk: SDK, jobId: string): Result<undefined> {
  const sdk = requireSDK();

  const crawler = getCrawler(jobId);
  if (crawler === undefined) {
    const job = jobsStore.getJob(jobId);
    if (job !== undefined) {
      jobsStore.updateJob(jobId, {
        status: "completed",
        completedAt: new Date(),
      });
      return { kind: "Ok", value: undefined };
    }
    return { kind: "Error", error: "Job not found." };
  }

  crawler.stop();
  jobsStore.updateJob(jobId, {
    status: "completed",
    completedAt: new Date(),
  });
  unregisterCrawler(jobId);

  sdk.api.send("crawl:completed", {
    jobId,
    totalUrls: crawler.getStats().crawledUrls,
  });

  return { kind: "Ok", value: undefined };
}

export function pauseCrawl(_sdk: SDK, jobId: string): Result<undefined> {
  const crawler = getCrawler(jobId);
  if (crawler === undefined) {
    return { kind: "Error", error: "Job not found or not running." };
  }

  crawler.pause();
  jobsStore.updateJob(jobId, { status: "paused" });

  return { kind: "Ok", value: undefined };
}

export function resumeCrawl(_sdk: SDK, jobId: string): Result<undefined> {
  const crawler = getCrawler(jobId);
  if (crawler === undefined) {
    return { kind: "Error", error: "Job not found or not running." };
  }

  crawler.resume();
  jobsStore.updateJob(jobId, { status: "running" });

  return { kind: "Ok", value: undefined };
}

export function getJobs(_sdk: SDK): Result<CrawlJob[]> {
  const storedJobs = jobsStore.getJobs();

  const updatedJobs = storedJobs.map((job) => {
    const crawler = getCrawler(job.id);
    if (crawler !== undefined) {
      return crawler.getJob();
    }
    return job;
  });

  return { kind: "Ok", value: updatedJobs };
}

export function getJob(_sdk: SDK, jobId: string): Result<CrawlJob> {
  const crawler = getCrawler(jobId);
  if (crawler !== undefined) {
    return { kind: "Ok", value: crawler.getJob() };
  }

  const job = jobsStore.getJob(jobId);
  if (job === undefined) {
    return { kind: "Error", error: "Job not found." };
  }

  return { kind: "Ok", value: job };
}

export function clearCompletedJobs(_sdk: SDK): Result<undefined> {
  const sdk = requireSDK();

  jobsStore.clearCompletedJobs();
  sdk.api.send("jobs:cleared");

  return { kind: "Ok", value: undefined };
}

export function clearAllJobs(_sdk: SDK): Result<undefined> {
  const sdk = requireSDK();

  const crawlers = getAllCrawlers();
  for (const crawler of crawlers) {
    crawler.stop();
    unregisterCrawler(crawler.getJobId());
  }

  jobsStore.clearAllJobs();
  sdk.api.send("jobs:cleared");

  return { kind: "Ok", value: undefined };
}

export function deleteJob(_sdk: SDK, jobId: string): Result<undefined> {
  const sdk = requireSDK();

  const crawler = getCrawler(jobId);
  if (crawler !== undefined) {
    crawler.stop();
    unregisterCrawler(jobId);
  }

  jobsStore.removeJob(jobId);
  sdk.api.send("job:deleted", jobId);

  return { kind: "Ok", value: undefined };
}
